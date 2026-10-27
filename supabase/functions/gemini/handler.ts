// Gemini proxy for Clipper Studio. The owner's key lives in public.user_secrets, which no client can read; this
// function (service role) is the only reader. It answers only to a signed-in user, and only for that user's own key.
// Pure on purpose (environment and fetch are passed in) so it is unit-tested from the app's test suite.

export type Env = { url: string; serviceKey: string };

const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_BODY_BYTES = 24 * 1024 * 1024;
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const fail = (status: number, code: string, message: string) => reply(status, { error: { status: code, message } });

const validModel = (m: unknown): m is string => typeof m === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(m);

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

  let msg: { action?: string; apiKey?: unknown; model?: unknown; body?: unknown };
  try { msg = await req.json(); } catch { return fail(400, "BAD_REQUEST", "Permintaan tidak terbaca."); }

  const db = (path: string, init: RequestInit = {}) => fetchImpl(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.serviceKey, authorization: `Bearer ${env.serviceKey}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
  const load = async (): Promise<{ gemini_key: string | null; gemini_model: string | null } | null> => {
    const res = await db(`user_secrets?user_id=eq.${uid}&select=gemini_key,gemini_model`);
    if (!res.ok) return null;
    return ((await res.json()) as { gemini_key: string | null; gemini_model: string | null }[])[0] ?? { gemini_key: null, gemini_model: null };
  };

  try {
    if (msg.action === "status") {
      const row = await load();
      if (!row) return fail(500, "DB_ERROR", "Penyimpanan kunci bermasalah.");
      return reply(200, { hasKey: !!row.gemini_key, model: row.gemini_model || DEFAULT_MODEL });
    }

    if (msg.action === "save-key") {
      const key = typeof msg.apiKey === "string" ? msg.apiKey.trim() : "";
      if (key.length < 20 || /\s/.test(key)) return fail(400, "BAD_KEY", "Kunci tidak valid.");
      const model = validModel(msg.model) ? msg.model : DEFAULT_MODEL;
      const res = await db("user_secrets?on_conflict=user_id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: uid, gemini_key: key, gemini_model: model }),
      });
      if (!res.ok) return fail(500, "DB_ERROR", "Kunci gagal disimpan.");
      return reply(200, { ok: true, model });
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
      if (!row.gemini_key) return fail(400, "NO_KEY", "Belum ada kunci Gemini di akun Anda.");
      const model = validModel(msg.model) ? msg.model : row.gemini_model || DEFAULT_MODEL;
      let google: Response;
      try {
        google = await fetchImpl(`${GOOGLE}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": row.gemini_key },
          body: JSON.stringify(msg.body),
          signal: AbortSignal.timeout(110_000),
        });
      } catch { return fail(504, "UPSTREAM_UNREACHABLE", "Gemini tidak terjangkau dari server."); }
      // Google's answer and status pass through as they are, so the app explains them the same way as a direct call.
      return new Response(await google.text(), { status: google.status, headers: { ...CORS, "content-type": "application/json" } });
    }
  } catch { return fail(500, "SERVER_ERROR", "Kesalahan di server."); }

  return fail(400, "UNKNOWN_ACTION", "Perintah tidak dikenal.");
}
