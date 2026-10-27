// Reads the captions of a YouTube video (text and times only; never the video) for the clipper's AI clip suggestions.
// This goes through YouTube's unofficial player endpoint, which YouTube may change or refuse to servers at any time, so
// every failure is reported with a code the app can explain, and the app always offers pasting the transcript instead.
// Answers only to a signed-in user. Pure (environment and fetch passed in) so it is unit-tested from the app's suite.

export type Env = { url: string; serviceKey: string };

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const fail = (status: number, code: string, message: string) => reply(status, { error: { status: code, message } });

const CLIENT = { name: "ANDROID", version: "20.10.38" };
const UA = `com.google.android.youtube/${CLIENT.version} (Linux; U; Android 14) gzip`;
const MAX_LINES = 6000;

/** The 11-character id from a YouTube link (watch, youtu.be, shorts, embed, live) or a bare id; null otherwise. */
export function videoIdFrom(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let u: URL;
  try { u = new URL(text); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id = "";
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
    else { const m = /^\/(shorts|embed|live)\/([^/]+)/.exec(u.pathname); id = m ? m[2] : ""; }
  }
  return /^[\w-]{11}$/.test(id) ? id : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Decodes HTML entities, twice, because captions are often escaped twice ("&amp;#39;"). */
export function decodeEntities(s: string): string {
  const once = (t: string) => t.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : (ENTITIES[String(name).toLowerCase()] ?? m));
  return once(once(s));
}

export type CaptionLine = { start: number; end: number; text: string };

/** Reads YouTube's caption XML in both of its shapes: <text start dur> in seconds and <p t d> in milliseconds. */
export function parseCaptionXml(xml: string): CaptionLine[] {
  const out: CaptionLine[] = [];
  const clean = (inner: string) => decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  for (const m of xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const start = Number(/\bstart="([\d.]+)"/.exec(m[1])?.[1]);
    const dur = Number(/\bdur="([\d.]+)"/.exec(m[1])?.[1] ?? 0);
    const text = clean(m[2]);
    if (Number.isFinite(start) && text) out.push({ start, end: start + (dur > 0 ? dur : 2), text });
  }
  if (out.length === 0) {
    for (const m of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
      const t = Number(/\bt="(\d+)"/.exec(m[1])?.[1]);
      const d = Number(/\bd="(\d+)"/.exec(m[1])?.[1] ?? 0);
      const text = clean(m[2]);
      if (Number.isFinite(t) && text) out.push({ start: t / 1000, end: (t + (d > 0 ? d : 2000)) / 1000, text });
    }
  }
  return out.slice(0, MAX_LINES).map(l => ({ start: Math.round(l.start * 1000) / 1000, end: Math.round(l.end * 1000) / 1000, text: l.text }));
}

type Track = { baseUrl?: string; languageCode?: string; kind?: string };
/** A human-made track in the wanted language, else an automatic one in it, else the first track. */
export function pickTrack(tracks: Track[], lang: string): Track | null {
  const usable = tracks.filter(t => typeof t?.baseUrl === "string");
  const same = usable.filter(t => (t.languageCode ?? "").toLowerCase().startsWith(lang.toLowerCase()));
  return same.find(t => t.kind !== "asr") ?? same[0] ?? usable.find(t => t.kind !== "asr") ?? usable[0] ?? null;
}

const trustedCaptionUrl = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "www.youtube.com" || u.hostname.endsWith(".youtube.com")) ? u.toString().replace(/&fmt=[^&]*/, "") : null;
  } catch { return null; }
};

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Gunakan POST.");

  let uid = "";
  try {
    const who = await fetchImpl(`${env.url}/auth/v1/user`, { headers: { apikey: env.serviceKey, authorization: req.headers.get("authorization") ?? "" } });
    if (who.ok) uid = ((await who.json()) as { id?: string }).id ?? "";
  } catch { return fail(502, "AUTH_UNREACHABLE", "Layanan login tidak terjangkau."); }
  if (!uid) return fail(401, "NOT_SIGNED_IN", "Masuk dulu.");

  let msg: { action?: string; url?: unknown; lang?: unknown };
  try { msg = await req.json(); } catch { return fail(400, "BAD_REQUEST", "Permintaan tidak terbaca."); }
  if (msg.action !== "captions") return fail(400, "UNKNOWN_ACTION", "Perintah tidak dikenal.");

  const id = videoIdFrom(msg.url);
  if (!id) return fail(400, "BAD_URL", "Link YouTube tidak dikenali.");
  const lang = typeof msg.lang === "string" && /^[a-z]{2,3}(-[A-Za-z]+)?$/.test(msg.lang) ? msg.lang : "id";

  let player: {
    playabilityStatus?: { status?: string; reason?: string };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } };
    videoDetails?: { title?: string; lengthSeconds?: string };
  };
  try {
    const res = await fetchImpl("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA, "x-youtube-client-name": "3", "x-youtube-client-version": CLIENT.version },
      body: JSON.stringify({ context: { client: { clientName: CLIENT.name, clientVersion: CLIENT.version, androidSdkVersion: 34, hl: lang, gl: "ID" } }, videoId: id, contentCheckOk: true, racyCheckOk: true }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return fail(502, "BLOCKED", "YouTube menolak permintaan dari server.");
    player = await res.json();
  } catch { return fail(504, "UNREACHABLE", "YouTube tidak terjangkau dari server."); }

  const status = player.playabilityStatus?.status;
  if (status && status !== "OK") {
    if (status === "LOGIN_REQUIRED") return fail(502, "BLOCKED", "YouTube meminta verifikasi (sering terjadi untuk permintaan dari server) atau video ini dibatasi umur/privat.");
    return fail(404, "UNPLAYABLE", player.playabilityStatus?.reason || "Video tidak tersedia.");
  }
  const track = pickTrack(player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [], lang);
  if (!track) return fail(404, "NO_CAPTIONS", "Video ini tidak punya teks (caption).");
  const captionUrl = trustedCaptionUrl(track.baseUrl!);
  if (!captionUrl) return fail(502, "BLOCKED", "Alamat teks dari YouTube tidak valid.");

  let lines: CaptionLine[];
  try {
    const res = await fetchImpl(captionUrl, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return fail(502, "BLOCKED", "YouTube menolak memberikan teksnya.");
    lines = parseCaptionXml(await res.text());
  } catch { return fail(504, "UNREACHABLE", "YouTube tidak terjangkau dari server."); }
  if (lines.length === 0) return fail(404, "NO_CAPTIONS", "Teks video ini kosong atau tidak terbaca.");

  const seconds = Number(player.videoDetails?.lengthSeconds);
  return reply(200, {
    videoId: id,
    title: player.videoDetails?.title ?? "",
    seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : lines[lines.length - 1].end,
    language: track.languageCode ?? lang,
    auto: track.kind === "asr",
    lines,
  });
}
