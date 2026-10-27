// The YouTube side of the clipper: captions in (from the owner's server, or pasted by the creator), shaped into a transcript
// that the AI can pick clips from. Only text and times; the video itself is never fetched.
import { cloud } from "./cloud";
import { spreadWords, type Segment, type Transcript } from "./transcript";

export type CaptionLine = { start: number; end: number; text: string };

export type YoutubeErrorKind = "signin" | "blocked" | "nocaptions" | "unavailable" | "badurl" | "network" | "server";
export class YoutubeError extends Error {
  constructor(readonly kind: YoutubeErrorKind, message: string) { super(message); }
}

/** Why the server could not read the captions, in words that point to the way out (pasting the transcript). */
export function explainYoutube(code: string, status: number): YoutubeError {
  if (/NOT_SIGNED_IN/.test(code)) return new YoutubeError("signin", "Sesi masuk berakhir. Masuk lagi.");
  if (/BAD_URL/.test(code)) return new YoutubeError("badurl", "Link YouTube tidak dikenali. Contoh: https://youtu.be/xxxxxxxxxxx");
  if (/NO_CAPTIONS/.test(code)) return new YoutubeError("nocaptions", "Video ini tidak punya teks (caption) yang bisa dibaca. Tempel transkripnya jika ada, atau analisis file videonya langsung dengan AI.");
  if (/UNPLAYABLE/.test(code)) return new YoutubeError("unavailable", "Video tidak tersedia (privat, dihapus, atau dibatasi).");
  if (/BLOCKED|UNREACHABLE/.test(code) || status === 502 || status === 504) return new YoutubeError("blocked", "YouTube tidak mau memberikan teksnya ke server (ini sering terjadi). Tempel transkripnya di bawah: di YouTube buka ⋯ → Tampilkan transkrip, salin, lalu tempel.");
  return new YoutubeError("server", "Gagal mengambil teks dari YouTube. Tempel transkripnya di bawah.");
}

export type YoutubeCaptions = { videoId: string; title: string; seconds: number; language: string; auto: boolean; lines: CaptionLine[] };

/** Asks the owner's server for a video's captions. Needs a signed-in account. */
export async function fetchYoutubeCaptions(url: string, lang: string, signal?: AbortSignal): Promise<YoutubeCaptions> {
  if (!cloud.user()) throw new YoutubeError("signin", "Masuk ke akun dulu untuk mengambil teks otomatis, atau tempel transkripnya di bawah.");
  let res: Response | null;
  try { res = await cloud.fn("youtube", { action: "captions", url, lang }, { signal, timeoutMs: 60_000 }); }
  catch { throw new YoutubeError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res) throw new YoutubeError("signin", "Sesi masuk berakhir. Masuk lagi.");
  let json: unknown = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw explainYoutube((json as { error?: { status?: string } } | null)?.error?.status ?? "", res.status);
  const j = json as Partial<YoutubeCaptions> | null;
  if (!j || !Array.isArray(j.lines) || j.lines.length === 0) throw explainYoutube("NO_CAPTIONS", 404);
  return { videoId: String(j.videoId ?? ""), title: String(j.title ?? ""), seconds: Number(j.seconds) || j.lines[j.lines.length - 1].end, language: String(j.language ?? lang), auto: !!j.auto, lines: j.lines };
}

// ---- a transcript pasted from YouTube (or an SRT/VTT file's text) ---------------------------------------------------

const clock = (s: string): number => s.split(":").map(Number).reduce((t, n) => t * 60 + n, 0);
const TIME = /(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?/;

/**
 * Reads a transcript copied from YouTube ("0:00", then its text, then "0:03", …, or "0:00 text" on one line) or SRT/VTT text
 * ("00:00:01,000 --> 00:00:03,000"). Lines before the first time (headings, "Search transcript") are ignored.
 */
export function parsePastedTranscript(raw: string): CaptionLine[] {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return [];
  const out: CaptionLine[] = [];
  if (/-->/.test(text)) {
    const re = new RegExp(`(${TIME.source})\\s*-->\\s*(${TIME.source})[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*\\n|$)`, "g");
    for (const m of text.matchAll(re)) {
      const body = m[3].split("\n").filter(l => !/^\d+$/.test(l.trim())).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (body) out.push({ start: clock(m[1].replace(",", ".")), end: clock(m[2].replace(",", ".")), text: body });
    }
    return out;
  }
  const alone = new RegExp(`^(${TIME.source})$`), inline = new RegExp(`^(${TIME.source})\\s+(\\S.*)$`);
  let cur: { start: number; parts: string[] } | null = null;
  const close = (end: number) => {
    if (cur) { const t = cur.parts.join(" ").replace(/\s+/g, " ").trim(); if (t) out.push({ start: cur.start, end: Math.max(end, cur.start + 0.5), text: t }); }
  };
  for (const line of text.split("\n").map(l => l.trim()).filter(Boolean)) {
    const a = alone.exec(line), i = inline.exec(line);
    if (a || i) { const start = clock((a ? a[1] : i![1]).replace(",", ".")); close(start); cur = { start, parts: i ? [i[2]] : [] }; }
    else if (cur) cur.parts.push(line);
  }
  const last = cur as { start: number } | null;
  close(last ? last.start + 4 : 0);
  // A line's end is where the next one starts (YouTube's pasted text has no durations).
  return out.map((l, k) => ({ ...l, end: out[k + 1] ? Math.max(out[k + 1].start, l.start + 0.5) : l.end }));
}

/** Joins the short caption lines (often 2–4 s) into sentence-sized ones of about `min`–`max` seconds, never across a long gap. */
export function mergeCaptionLines(lines: CaptionLine[], min = 8, max = 16): CaptionLine[] {
  const out: CaptionLine[] = [];
  let cur: CaptionLine | null = null;
  for (const l of lines) {
    if (cur && (l.start - cur.end > 1.5 || cur.end - cur.start >= min || l.end - cur.start > max)) { out.push(cur); cur = null; }
    cur = cur ? { start: cur.start, end: Math.max(cur.end, l.end), text: `${cur.text} ${l.text}` } : { ...l };
  }
  if (cur) out.push(cur);
  return out;
}

/** Caption lines as a transcript (segment level), so the same clip tools work on it. */
export function captionsToTranscript(lines: CaptionLine[], seconds: number, language: string): Transcript {
  const merged = mergeCaptionLines(lines);
  const segments: Segment[] = merged.map(l => ({ start: l.start, end: l.end, text: l.text, words: spreadWords(l.text, l.start, l.end) }));
  const duration = Math.max(seconds, segments.at(-1)?.end ?? 0);
  return { language, granularity: "segment", duration, segments };
}

/** Does a file of this length plausibly match a video of that length? A little slack for intros and trimming. */
export function lengthsMatch(fileSeconds: number, videoSeconds: number): boolean {
  if (!(fileSeconds > 0) || !(videoSeconds > 0)) return true;
  return Math.abs(fileSeconds - videoSeconds) <= Math.max(15, videoSeconds * 0.1);
}
