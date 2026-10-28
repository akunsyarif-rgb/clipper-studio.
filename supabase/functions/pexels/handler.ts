// Stock-photo search for Clipper Studio, through Pexels' API. The owner's Pexels key lives in public.user_pexels, which no
// client can read; this function (service role) is the only reader. It answers only to a signed-in user, with that user's
// own key. Photos come back as small, checked records (only images.pexels.com addresses), and the chosen photo's bytes are
// fetched here, so the browser never needs the key and does not depend on Pexels allowing cross-origin requests.
// Pure on purpose (environment and fetch are passed in) so it is unit-tested from the app's test suite.

export type Env = { url: string; serviceKey: string };
export type Photo = { id: number; alt: string; photographer: string; photographerUrl: string; pexelsUrl: string; thumb: string; image: string; fallback: string };

const API = "https://api.pexels.com/v1/search";
const IMAGE_HOST = "images.pexels.com";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const fail = (status: number, code: string, message: string) => reply(status, { error: { status: code, message } });

/** A Pexels image address, or null: https, images.pexels.com, a /photos/ path, no credentials or port. */
export function cleanImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== IMAGE_HOST || u.username || u.password || u.port || !u.pathname.startsWith("/photos/")) return null;
  return u.toString();
}

/** The photo cropped to the video's own 1080×1920 and compressed, so the download is small and needs no further resizing. */
export function croppedUrl(original: string): string | null {
  const clean = cleanImageUrl(original);
  if (!clean) return null;
  const u = new URL(clean);
  u.search = "auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920";
  return u.toString();
}

type RawPhoto = { id?: unknown; alt?: unknown; url?: unknown; photographer?: unknown; photographer_url?: unknown; src?: Record<string, unknown> };
const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const pageUrl = (v: unknown, host: RegExp): string => { try { const u = new URL(String(v)); return u.protocol === "https:" && host.test(u.hostname) ? u.toString() : ""; } catch { return ""; } };

/** Keeps only photos with every address checked; anything odd is dropped rather than passed on. */
export function readPhotos(json: unknown): Photo[] {
  const list = (json as { photos?: unknown } | null)?.photos;
  if (!Array.isArray(list)) return [];
  const out: Photo[] = [];
  for (const p of list as RawPhoto[]) {
    if (typeof p?.id !== "number") continue;
    const thumb = cleanImageUrl(p.src?.medium), fallback = cleanImageUrl(p.src?.portrait);
    const image = croppedUrl(String(p.src?.original ?? "")) ?? fallback;
    if (!thumb || !image || !fallback) continue;
    out.push({
      id: p.id, alt: text(p.alt, 120), photographer: text(p.photographer, 80) || "Fotografer",
      photographerUrl: pageUrl(p.photographer_url, /(^|\.)pexels\.com$/), pexelsUrl: pageUrl(p.url, /(^|\.)pexels\.com$/),
      thumb, image, fallback,
    });
  }
  return out;
}

const validKey = (k: string) => /^[\w-]{20,200}$/.test(k);

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Gunakan POST.");

  const authorization = req.headers.get("authorization") ?? "";
  let uid = "";
  try {
    const who = await fetchImpl(`${env.url}/auth/v1/user`, { headers: { apikey: env.serviceKey, authorization } });
    if (who.ok) uid = ((await who.json()) as { id?: string }).id ?? "";
  } catch { return fail(502, "AUTH_UNREACHABLE", "Layanan login tidak terjangkau."); }
  if (!uid) return fail(401, "NOT_SIGNED_IN", "Masuk dulu.");

  let msg: { action?: string; apiKey?: unknown; query?: unknown; perPage?: unknown; page?: unknown; url?: unknown };
  try { msg = await req.json(); } catch { return fail(400, "BAD_REQUEST", "Permintaan tidak terbaca."); }

  const db = (path: string, init: RequestInit = {}) => fetchImpl(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.serviceKey, authorization: `Bearer ${env.serviceKey}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
  /** undefined = the lookup itself failed; null = no key saved. */
  const loadKey = async (): Promise<string | null | undefined> => {
    const res = await db(`user_pexels?user_id=eq.${uid}&select=api_key`);
    if (!res.ok) return undefined;
    return ((await res.json()) as { api_key: string | null }[])[0]?.api_key ?? null;
  };
  const search = (key: string, query: string, perPage: number, page: number) =>
    fetchImpl(`${API}?${new URLSearchParams({ query, orientation: "portrait", size: "medium", per_page: String(perPage), page: String(page) })}`, { headers: { authorization: key }, signal: AbortSignal.timeout(25_000) });

  try {
    if (msg.action === "status") {
      const key = await loadKey();
      if (key === undefined) return fail(500, "DB_ERROR", "Penyimpanan kunci bermasalah.");
      return reply(200, { hasKey: !!key });
    }

    if (msg.action === "save-key") {
      const key = typeof msg.apiKey === "string" ? msg.apiKey.trim() : "";
      if (!validKey(key)) return fail(400, "BAD_KEY", "Kunci Pexels tidak valid. Tempel seluruh kunci (tanpa spasi).");
      // Checked once with a one-photo search, so a wrong key is caught now and not in the middle of a video.
      let check: Response;
      try { check = await search(key, "nature", 1, 1); } catch { return fail(504, "UPSTREAM_UNREACHABLE", "Pexels tidak terjangkau dari server."); }
      if (check.status === 401 || check.status === 403) return fail(400, "KEY_REJECTED", "Pexels menolak kunci ini. Periksa kuncinya di pexels.com/api.");
      const res = await db("user_pexels?on_conflict=user_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, api_key: key }) });
      if (!res.ok) return fail(500, "DB_ERROR", "Kunci gagal disimpan.");
      return reply(200, { ok: true });
    }

    if (msg.action === "forget") {
      const res = await db(`user_pexels?user_id=eq.${uid}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
      if (!res.ok) return fail(500, "DB_ERROR", "Kunci gagal dihapus.");
      return reply(200, { ok: true });
    }

    if (msg.action === "search") {
      const query = text(msg.query, 100);
      if (query.length < 2) return fail(400, "BAD_QUERY", "Kata kunci terlalu pendek.");
      const perPage = Math.min(12, Math.max(1, Math.round(Number(msg.perPage) || 6)));
      const page = Math.min(5, Math.max(1, Math.round(Number(msg.page) || 1)));
      const key = await loadKey();
      if (key === undefined) return fail(500, "DB_ERROR", "Penyimpanan kunci bermasalah.");
      if (!key) return fail(400, "NO_KEY", "Belum ada kunci Pexels di akun Anda.");
      let upstream: Response;
      try { upstream = await search(key, query, perPage, page); } catch { return fail(504, "UPSTREAM_UNREACHABLE", "Pexels tidak terjangkau dari server."); }
      if (upstream.status === 401 || upstream.status === 403) return fail(400, "KEY_REJECTED", "Pexels menolak kunci Anda. Simpan kunci yang baru.");
      if (upstream.status === 429) return fail(429, "RATE_LIMIT", "Batas pencarian Pexels tercapai (200 per jam). Coba lagi nanti.");
      if (!upstream.ok) return fail(502, "UPSTREAM_ERROR", "Pexels sedang bermasalah. Coba lagi.");
      const remaining = Number(upstream.headers.get("x-ratelimit-remaining"));
      return reply(200, { photos: readPhotos(await upstream.json().catch(() => null)), remaining: Number.isFinite(remaining) && upstream.headers.has("x-ratelimit-remaining") ? remaining : null });
    }

    if (msg.action === "image") {
      // The bytes of a chosen photo. Only Pexels' image host is fetched, and no key is sent to it.
      const url = cleanImageUrl(msg.url);
      if (!url) return fail(400, "BAD_URL", "Alamat gambar tidak valid.");
      let upstream: Response;
      try { upstream = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), redirect: "error" }); } catch { return fail(504, "UPSTREAM_UNREACHABLE", "Gambar tidak terjangkau dari server."); }
      if (!upstream.ok) return fail(502, "IMAGE_FAILED", "Gambar gagal diambil.");
      const type = upstream.headers.get("content-type") ?? "";
      if (!/^image\/(jpeg|png|webp)/.test(type)) return fail(502, "IMAGE_FAILED", "Jawaban bukan gambar.");
      const bytes = await upstream.arrayBuffer();
      if (bytes.byteLength > MAX_IMAGE_BYTES) return fail(413, "TOO_LARGE", "Gambar terlalu besar.");
      return new Response(bytes, { status: 200, headers: { ...CORS, "content-type": type.split(";")[0] } });
    }
  } catch { return fail(500, "SERVER_ERROR", "Kesalahan di server."); }

  return fail(400, "UNKNOWN_ACTION", "Perintah tidak dikenal.");
}
