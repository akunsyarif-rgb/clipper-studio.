// AI proxy for Clipper Studio. The owner's key lives in public.user_secrets, which no client can read; this function
// (service role) is the only reader. It answers only to a signed-in user, and only for that user's own key. The key
// belongs either to Google's Gemini API or to an OpenAI-format router (such as Flatkey) at a base address the owner chose.
// Pure on purpose (environment and fetch are passed in) so it is unit-tested from the app's test suite.

export type Env = { url: string; serviceKey: string };
type Provider = "google" | "openai";
type Row = { gemini_key: string | null; gemini_model: string | null; provider: Provider | null; base_url: string | null };

const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-flash-latest";\nconst OPENROUTER = "https://openrouter.ai/api/v1";\nconst OPENROUTER_FREE = "openrouter/free";\nconst defaultModel = (provider: Provider, baseUrl: string | null) => provider === "google" ? DEFAULT_MODEL : baseUrl === OPENROUTER ? OPENROUTER_FREE : "";
const MAX_BODY_BYTES = 24 * 1024 * 1024;
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const fail = (status: number, code: string, message: string) => reply(status, { error: { status: code, message } });

/** Google model names go into an address, so they stay strict; a router may use names like "google/gemini-x" or "gemini-x:free". */
const validModel = (m: unknown, provider: Provider): m is string =>
  typeof m === "string" && (provider === "openai" ? /^[A-Za-z0-9._:/-]{1,100}$/ : /^[A-Za-z0-9._-]{1,80}$/).test(m);

/**
 * The router's base address, or null if it is not an acceptable one. The server calls this address, so it must be a
 * public https host: no credentials, no query, no IP addresses, no local or internal names.
 */
export function cleanBaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.port) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
  return (u.origin + u.pathname).replace(/\/+$/, "");
}

const providerOf = (v: unknown): Provider => (v === "openai" ? "openai" : "google");

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Gunakan POST.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail(413, "TOO_LARGE", "Permintaan terlalu besar.");

  // Who is calling: ask the auth service about the token we were given.
  const authorization = req.headers.get("authorization") ?? "";
  let uid = "";
  try {
    const who = await fetchImpl(`${env.url}/auth/v1/user`, { headers: { apikey: env.serviceKey, authorization } });
    if (who.ok) uid = ((await who.json()) as { id?: string }).id ?? "";
  } catch { return fail(502, "AUTH_UNREACHABLE", "Layanan login tidak terjangkau."); }
  if (!uid) return fail(401, "NOT_SIGNED_IN", "Masuk dulu.");

  let msg: { action?: string; apiKey?: unknown; model?: unknown; body?: unknown; provider?: unknown; baseUrl?: unknown };
  try { msg = await req.json(); } catch { return fail(400, "BAD_REQUEST", "Permintaan tidak terbaca."); }

  const db = (path: string, init: RequestInit = {}) => fetchImpl(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.serviceKey, authorization: `Bearer ${env.serviceKey}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
  const load = async (): Promise<Row | null> => {
    const res = await db(`user_secrets?user_id=eq.${uid}&select=gemini_key,gemini_model,provider,base_url`);
    if (!res.ok) return null;
    return ((await res.json()) as Row[])[0] ?? { gemini_key: null, gemini_model: null, provider: null, base_url: null };
  };

  try {
    if (msg.action === "status") {
      const row = await load();
      if (!row) return fail(500, "DB_ERROR", "Penyimpanan kunci bermasalah.");
      const provider = providerOf(row.provider);
      return reply(200, { hasKey: !!row.gemini_key, provider, baseUrl: row.base_url, model: row.gemini_model || defaultModel(provider, row.base_url) });
    }

    if (msg.action === "save-key") {
      const key = typeof msg.apiKey === "string" ? msg.apiKey.trim() : "";
      if (key.length < 8 || /\s/.test(key)) return fail(400, "BAD_KEY", "Kunci tidak valid.");
      const provider = providerOf(msg.provider);
      const baseUrl = provider === "openai" ? cleanBaseUrl(msg.baseUrl) : null;
      if (provider === "openai" && !baseUrl) return fail(400, "BAD_BASE_URL", "Alamat dasar harus alamat https publik, mis. https://router.flatkey.ai/v1.");
      if (provider === "google" && key.length < 20) return fail(400, "BAD_KEY", "Kunci tidak valid.");
      const model = validModel(msg.model, provider) ? msg.model : defaultModel(provider, baseUrl);
      const res = await db("user_secrets?on_conflict=user_id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: uid, gemini_key: key, gemini_model: model, provider, base_url: baseUrl }),
      });
      if (!res.ok) return fail(500, "DB_ERROR", "Kunci gagal disimpan.");
      return reply(200, { ok: true, provider, baseUrl, model });
    }

    if (msg.action === "set-model") {
      const row = await load();
      if (!row) return fail(500, "DB_ERROR", "Penyimpanan kunci bermasalah.");
      if (!validModel(msg.model, providerOf(row.provider))) return fail(400, "BAD_MODEL", "Nama model tidak valid.");
      const res = await db(`user_secrets?user_id=eq.${uid}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ gemini_model: msg.model }) });
      if (!res.ok) return fail(500, "DB_ERROR", "Model gagal disimpan.");
      return reply(200, { ok: true, model: msg.model });
    }

    if (msg.action === "list-models") {
      // The models this key may use. A key that is only being tried (not saved yet) can be passed in, with its provider; it is not stored.
      const typed = typeof msg.apiKey === "string" ? msg.apiKey.trim() : "";
      const row = typed ? null : await load();
      if (!typed && !row) return fail(500, "DB_ERROR", "Penyimpanan kunci bermasalah.");
      const key = typed || row?.gemini_key || "";
      const provider = typed ? providerOf(msg.provider) : providerOf(row?.provider);
      if (!key) return fail(400, "NO_KEY", "Belum ada kunci di akun Anda.");
      const base = provider === "openai" ? (typed ? cleanBaseUrl(msg.baseUrl) : cleanBaseUrl(row?.base_url)) : null;
      if (provider === "openai" && !base) return fail(400, "BAD_BASE_URL", "Alamat dasar harus alamat https publik, mis. https://router.flatkey.ai/v1.");
      let upstream: Response;
      try {
        upstream = provider === "openai"
          ? await fetchImpl(`${base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) })
          : await fetchImpl(`${GOOGLE}?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(30_000) });
      } catch { return fail(504, "UPSTREAM_UNREACHABLE", "Layanan AI tidak terjangkau dari server."); }
      return new Response(await upstream.text(), { status: upstream.status, headers: { ...CORS, "content-type": "application/json" } });
    }

    if (msg.action === "forget") {
      const res = await db(`user_secrets?user_id=eq.${uid}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
      if (!res.ok) return fail(500, "DB_ERROR", "Kunci gagal dihapus.");
      return reply(200, { ok: true });
    }

    if (msg.action === "generate") {
      if (!msg.body || typeof msg.body !== "object" || Array.isArray(msg.body)) return fail(400, "BAD_REQUEST", "Isi permintaan tidak valid.");
      const row = await load();
      if (!row) return fail(500, "DB_ERROR", "Penyimpanan kunci bermasalah.");
      if (!row.gemini_key) return fail(400, "NO_KEY", "Belum ada kunci di akun Anda.");
      const provider = providerOf(row.provider);
      const model = validModel(msg.model, provider) ? msg.model : row.gemini_model || defaultModel(provider, row.base_url);
      if (!model) return fail(400, "NO_MODEL", "Pilih model dulu.");
      let upstream: Response;
      try {
        if (provider === "openai") {
          const base = cleanBaseUrl(row.base_url);
          if (!base) return fail(400, "BAD_BASE_URL", "Alamat dasar tidak valid. Simpan ulang kuncinya.");
          upstream = await fetchImpl(`${base}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${row.gemini_key}` },
            body: JSON.stringify({ ...(msg.body as object), model }),
            signal: AbortSignal.timeout(110_000),
          });
        } else {
          upstream = await fetchImpl(`${GOOGLE}/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": row.gemini_key },
            body: JSON.stringify(msg.body),
            signal: AbortSignal.timeout(110_000),
          });
        }
      } catch { return fail(504, "UPSTREAM_UNREACHABLE", "Layanan AI tidak terjangkau dari server."); }
      // The service's answer and status pass through as they are, so the app explains them the same way as a direct call.
      const text = await upstream.text();
      if (!upstream.ok) console.error("ai upstream", provider, upstream.status, model, text.slice(0, 300)); // the answer, never the key
      return new Response(text, { status: upstream.status, headers: { ...CORS, "content-type": "application/json" } });
    }
  } catch { return fail(500, "SERVER_ERROR", "Kesalahan di server."); }

  return fail(400, "UNKNOWN_ACTION", "Perintah tidak dikenal.");
}
