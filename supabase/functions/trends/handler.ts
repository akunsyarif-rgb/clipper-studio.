// Trend radar for Clipper Studio: real, public engagement signals to start a video from, with no AI involved.
// Keyless sources: Wikipedia's most-read pages (7-day surge) and Hacker News. Optional: the YouTube Data API, with the owner's
// own key kept in public.user_youtube_api (closed to every client; only this function, with the service role, reads it).
// Items are ranked by log(engagement) x freshness, normalised per source, and the same story across sources is merged.
// Idea and ranking borrowed from the owner's ai-music-video-director trend radar (itself after mvanhorn/last30days-skill, MIT).
// Answers only to a signed-in user. Pure (environment and fetch passed in) so it is unit-tested from the app's suite.

export type Env = { url: string; serviceKey: string };
export type Source = "youtube" | "wikipedia" | "hn";
export type Signal = { source: Source; title: string; url: string; engLabel: string; ts: number; score: number; also: Source[] };
export type SourceStatus = { source: Source; ok: boolean; n?: number; note?: string };
type Raw = { source: Source; title: string; url: string; eng: number; engLabel: string; ts: number; momentum?: number };

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const fail = (status: number, code: string, message: string) => reply(status, { error: { status: code, message } });

const TIMEOUT_MS = 9000;
const UA = "ClipperStudio/1.0 (trend radar for a personal video tool)";
const WEIGHT: Record<Source, number> = { youtube: 1, wikipedia: 0.8, hn: 0.7 };
const STOP = new Set("the and for with from that this you your are was how why what who new video official music lyrics yang dan di ke dari untuk dengan ini itu pada adalah atau".split(" "));
const LINK_HOSTS = /(^|\.)(youtube\.com|wikipedia\.org|ycombinator\.com)$/;

/** An https link to one of the three sources, or "" - signals are shown as links, so nothing else is passed on. */
export function safeLink(raw: unknown): string {
  try { const u = new URL(String(raw)); return u.protocol === "https:" && !u.username && !u.password && LINK_HOSTS.test(u.hostname) ? u.toString() : ""; } catch { return ""; }
}

export const fmtN = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " jt" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(".", ",") + " rb" : String(Math.round(n));
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function tokens(t: string): Set<string> {
  return new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let i = 0; for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i || 1);
}

/** Scores every item (log engagement x freshness, relative to the best of its own source), merges the same story across sources, keeps 20. */
export function rank(items: Raw[], now = Date.now()): Signal[] {
  const raw = new Map<Raw, number>(), maxBy: Partial<Record<Source, number>> = {};
  for (const it of items) {
    const age = it.ts ? Math.max(0, (now - it.ts) / 864e5) : 15;
    const r = Math.log10(1 + it.eng) * Math.exp(-age / 12) * (it.source === "wikipedia" ? Math.min(1.3, Math.pow(it.momentum || 1, 0.3)) : 1);
    raw.set(it, r); maxBy[it.source] = Math.max(maxBy[it.source] ?? 0, r);
  }
  const scored = items.map(it => ({ it, score: ((raw.get(it) ?? 0) / (maxBy[it.source] || 1)) * WEIGHT[it.source] })).sort((a, b) => b.score - a.score);
  const clusters: { tk: Set<string>; sig: Signal }[] = [];
  for (const { it, score } of scored) {
    const tk = tokens(it.title);
    const c = clusters.find(x => tk.size >= 2 && jaccard(tk, x.tk) >= 0.5);
    if (c) {
      if (it.source !== c.sig.source && !c.sig.also.includes(it.source)) { c.sig.also.push(it.source); c.sig.score += 0.15; }
    } else clusters.push({ tk, sig: { source: it.source, title: it.title, url: it.url, engLabel: it.engLabel, ts: it.ts, score, also: [] } });
  }
  return clusters.map(c => ({ ...c.sig, score: Math.round(c.sig.score * 100) / 100 })).sort((a, b) => b.score - a.score).slice(0, 20);
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

type WikiArticle = { article?: string; views?: number };
async function wikipedia(fetchImpl: typeof fetch, lang: "id" | "en", now: number): Promise<Raw[]> {
  // Newest first; the data lags about a day.
  const days = Array.from({ length: 7 }, (_, i) => new Date(now - (i + 2) * 864e5));
  const settled = await Promise.allSettled(days.map(d =>
    getJson(fetchImpl, `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`)));
  if (!settled.some(r => r.status === "fulfilled")) throw new Error("semua permintaan gagal");
  const skip = /^(Halaman_Utama|Main_Page|Khusus:|Special:|Istimewa:|Wikipedia:|Pengguna:|User:|Berkas:|File:|Portal:|Bantuan:|Help:|Kategori:|Category:|Talk:|-)/i;
  const map = new Map<string, number[]>();
  settled.forEach((r, di) => {
    if (r.status !== "fulfilled") return;
    const articles = ((r.value as { items?: { articles?: WikiArticle[] }[] }).items?.[0]?.articles) ?? [];
    for (const a of articles) {
      if (!a.article || skip.test(a.article)) continue;
      const e = map.get(a.article) ?? new Array(7).fill(0);
      e[di] = Number(a.views) || 0; map.set(a.article, e);
    }
  });
  const out: Raw[] = [];
  for (const [title, d] of map) {
    const total = d.reduce((a, b) => a + b, 0), late = (d[0] + d[1] + d[2]) / 3, early = (d[3] + d[4] + d[5] + d[6]) / 4;
    const url = safeLink(`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`);
    if (url) out.push({ source: "wikipedia", title: clean(title.replace(/_/g, " "), 120), url, eng: total, engLabel: `${fmtN(total)} tayangan dalam 7 hari`, ts: days[0].getTime(), momentum: (late + 1) / (early + 1) });
  }
  return out.sort((a, b) => b.eng * Math.pow(b.momentum ?? 1, 0.5) - a.eng * Math.pow(a.momentum ?? 1, 0.5)).slice(0, 14);
}

type HnHit = { title?: string; objectID?: string; points?: number; num_comments?: number; created_at_i?: number };
async function hn(fetchImpl: typeof fetch, q: string, now: number): Promise<Raw[]> {
  const since = Math.floor(now / 1000) - 30 * 86400;
  const url = q ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=20` : "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=15";
  const d = (await getJson(fetchImpl, url)) as { hits?: HnHit[] };
  return (d.hits ?? []).filter(h => h.title && h.objectID).map(h => ({
    source: "hn" as const, title: clean(h.title, 140), url: safeLink(`https://news.ycombinator.com/item?id=${encodeURIComponent(String(h.objectID))}`),
    eng: (h.points || 0) + 2 * (h.num_comments || 0), engLabel: `${h.points || 0} poin, ${h.num_comments || 0} komentar`, ts: (h.created_at_i || 0) * 1000,
  })).filter(r => r.url);
}

export class YoutubeError extends Error { constructor(readonly code: "KEY_REJECTED" | "QUOTA" | "OTHER", message: string) { super(message); } }

type YtVideo = { id?: string; snippet?: { title?: string; channelTitle?: string; publishedAt?: string }; statistics?: { viewCount?: string } };
async function ytJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": UA, accept: "application/json" } });
  if (res.ok) return res.json();
  let reason = "";
  try { reason = String(((await res.json()) as { error?: { errors?: { reason?: string }[] } }).error?.errors?.[0]?.reason ?? ""); } catch { /* not JSON */ }
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || res.status === 429) throw new YoutubeError("QUOTA", "kuota harian YouTube habis");
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new YoutubeError("KEY_REJECTED", "YouTube menolak kunci ini");
  throw new YoutubeError("OTHER", "HTTP " + res.status);
}

/** Most-viewed public videos of the last 30 days for `q`, or the current most-popular chart without one. Never puts the key in a message. */
export async function youtube(fetchImpl: typeof fetch, key: string, q: string, region: "ID" | "US", now: number): Promise<Raw[]> {
  const lang = region === "ID" ? "id" : "en";
  let ids = "";
  if (q) {
    const after = new Date(now - 30 * 864e5).toISOString();
    const s = (await ytJson(fetchImpl, `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=15&q=${encodeURIComponent(q)}&publishedAfter=${encodeURIComponent(after)}&regionCode=${region}&relevanceLanguage=${lang}&key=${encodeURIComponent(key)}`)) as { items?: { id?: { videoId?: string } }[] };
    ids = (s.items ?? []).map(i => i.id?.videoId).filter((x): x is string => !!x && /^[\w-]{11}$/.test(x)).join(",");
    if (!ids) return [];
  }
  const url = ids
    ? `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${encodeURIComponent(key)}`
    : `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}&maxResults=15&key=${encodeURIComponent(key)}`;
  const v = (await ytJson(fetchImpl, url)) as { items?: YtVideo[] };
  return (v.items ?? []).filter(i => i.id && /^[\w-]{11}$/.test(i.id) && i.snippet?.title).map(i => {
    const views = Number(i.statistics?.viewCount) || 0;
    return { source: "youtube" as const, title: clean(i.snippet!.title, 140), url: safeLink(`https://www.youtube.com/watch?v=${i.id}`), eng: views, engLabel: `${fmtN(views)} tayangan, ${clean(i.snippet!.channelTitle, 60)}`, ts: Date.parse(i.snippet!.publishedAt ?? "") || 0 };
  }).filter(r => r.url);
}

const validKey = (k: string) => /^[\w-]{20,200}$/.test(k);

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Gunakan POST.");

  const authorization = req.headers.get("authorization") ?? "";
  let uid = "";
  try {
    const who = await fetchImpl(`${env.url}/auth/v1/user`, { headers: { apikey: env.serviceKey, authorization } });
    if (who.ok) uid = ((await who.json()) as { id?: string }).id ?? "";
  } catch { return fail(502, "AUTH_UNREACHABLE", "Layanan login tidak terjangkau."); }
  if (!uid) return fail(401, "NOT_SIGNED_IN", "Masuk dulu.");

  let msg: { action?: string; apiKey?: unknown; q?: unknown; region?: unknown };
  try { msg = await req.json(); } catch { return fail(400, "BAD_REQUEST", "Permintaan tidak terbaca."); }

  const db = (path: string, init: RequestInit = {}) => fetchImpl(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.serviceKey, authorization: `Bearer ${env.serviceKey}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
  /** undefined = the lookup itself failed; null = no key saved. */
  const loadKey = async (): Promise<string | null | undefined> => {
    const res = await db(`user_youtube_api?user_id=eq.${uid}&select=api_key`);
    if (!res.ok) return undefined;
    return ((await res.json()) as { api_key: string | null }[])[0]?.api_key ?? null;
  };

  try {
    if (msg.action === "status") {
      const key = await loadKey();
      if (key === undefined) return fail(500, "DB_ERROR", "Penyimpanan kunci bermasalah.");
      return reply(200, { hasKey: !!key });
    }

    if (msg.action === "save-key") {
      const key = typeof msg.apiKey === "string" ? msg.apiKey.trim() : "";
      if (!validKey(key)) return fail(400, "BAD_KEY", "Kunci YouTube tidak valid. Tempel seluruh kunci (tanpa spasi).");
      // Checked once (1 quota unit), so a wrong key is caught now and not in the middle of a scan.
      try { await youtube(fetchImpl, key, "", "ID", now); }
      catch (e) {
        if (e instanceof YoutubeError && e.code === "KEY_REJECTED") return fail(400, "KEY_REJECTED", "YouTube menolak kunci ini. Periksa kuncinya di Google Cloud dan pastikan YouTube Data API v3 aktif.");
        if (!(e instanceof YoutubeError && e.code === "QUOTA")) return fail(504, "UPSTREAM_UNREACHABLE", "YouTube tidak terjangkau dari server.");
        // A quota that is used up today still means the key itself is valid.
      }
      const res = await db("user_youtube_api?on_conflict=user_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, api_key: key }) });
      if (!res.ok) return fail(500, "DB_ERROR", "Kunci gagal disimpan.");
      return reply(200, { ok: true });
    }

    if (msg.action === "forget") {
      const res = await db(`user_youtube_api?user_id=eq.${uid}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
      if (!res.ok) return fail(500, "DB_ERROR", "Kunci gagal dihapus.");
      return reply(200, { ok: true });
    }

    if (msg.action === "scan") {
      const q = clean(msg.q, 80);
      const region: "ID" | "US" = msg.region === "US" ? "US" : "ID";
      const key = await loadKey();
      if (key === undefined) return fail(500, "DB_ERROR", "Penyimpanan kunci bermasalah.");
      const jobs: [Source, () => Promise<Raw[]>][] = [["wikipedia", () => wikipedia(fetchImpl, region === "ID" ? "id" : "en", now)], ["hn", () => hn(fetchImpl, q, now)]];
      if (key) jobs.push(["youtube", () => youtube(fetchImpl, key, q, region, now)]);
      const settled = await Promise.allSettled(jobs.map(([, f]) => f()));
      const status: SourceStatus[] = [], items: Raw[] = [];
      settled.forEach((r, i) => {
        const source = jobs[i][0];
        if (r.status === "fulfilled") { status.push({ source, ok: true, n: r.value.length }); items.push(...r.value); }
        else status.push({ source, ok: false, note: r.reason instanceof YoutubeError ? r.reason.message : r.reason instanceof Error && /timeout|abort/i.test(r.reason.message) ? "timeout" : "gagal" });
      });
      if (!key) status.push({ source: "youtube", ok: false, note: "kunci YouTube belum disimpan" });
      return reply(200, { at: now, q, region, status, items: rank(items, now) });
    }
  } catch { return fail(500, "SERVER_ERROR", "Kesalahan di server."); }

  return fail(400, "UNKNOWN_ACTION", "Perintah tidak dikenal.");
}
