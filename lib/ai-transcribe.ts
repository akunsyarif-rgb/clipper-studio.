// Transcribing a long video by letting an AI service listen to its audio (instead of the on-device speech model, which
// would take far too long for a long video on a tablet). The audio is cut into a few minutes at a time, each part is sent
// with its own request, and the lines that come back are placed on the video's timeline. Timing is the AI's own, so it is
// good enough to find and cut moments, but not as exact as word timing from the on-device model.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";
import { spreadWords, type Segment, type Transcript } from "./transcript";

/**
 * Each request carries this much audio (about 0.5 MB as 32 kbps MP3). Two minutes, not four: the answer (every line with its
 * times) is written out one token at a time, so a part twice as long takes twice as long to come back, and a slow model on a
 * four-minute part ran past the time limit of a request even for short videos.
 */
export const CHUNK_SECONDS = 120;
/** How long one part may take: just above the 110 s the server's own call to the AI service is allowed. */
export const CHUNK_TIMEOUT_MS = 130_000;
/** A last piece shorter than this is folded into the one before it. */
const MIN_LAST_CHUNK = 20;
/** Requests in flight at once. */
export const PARALLEL = 2;

export type Chunk = { index: number; start: number; duration: number };

/** Splits [0, duration) into parts of CHUNK_SECONDS; a tiny remainder joins the previous part. */
export function planChunks(duration: number, size = CHUNK_SECONDS): Chunk[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const out: Chunk[] = [];
  for (let start = 0; start < duration; start += size) out.push({ index: out.length, start, duration: Math.min(size, duration - start) });
  if (out.length > 1 && out[out.length - 1].duration < MIN_LAST_CHUNK) {
    const last = out.pop()!;
    out[out.length - 1].duration += last.duration;
  }
  return out;
}

const langName = (language: string) => (language === "en" ? "bahasa Inggris" : "bahasa Indonesia");

export function transcribePrompt(language: string, seconds: number): string {
  return [
    `Terlampir audio ${Math.round(seconds)} detik dari sebuah video (${langName(language)}). Tuliskan ucapannya persis seperti yang diucapkan.`,
    "Aturan:",
    "- pecah menjadi baris pendek: satu kalimat atau satu gagasan per baris, kira-kira 3 sampai 12 detik;",
    "- start dan end adalah detik (angka desimal) terhadap awal audio ini, bukan terhadap video penuh; urut dan tidak tumpang tindih;",
    "- tulis nama merek, istilah, angka, dan tanda baca dengan benar; pertahankan gaya bicara (bahasa gaul tetap gaul);",
    "- lewati musik, tepuk tangan, dan bagian tanpa ucapan; bila tidak ada ucapan sama sekali, kembalikan daftar kosong;",
    "- jangan mengarang kata yang tidak diucapkan.",
    "Balas hanya JSON: {\"lines\": [{\"start\": 0.0, \"end\": 4.2, \"text\": \"...\"}]}.",
  ].join("\n");
}

/** "83.5", 83.5, "1:23.5" or "01:01:23" as seconds; NaN if it is none of those. */
export function toSeconds(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v !== "string") return NaN;
  const parts = v.trim().replace(",", ".").split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return NaN;
  return parts.map(Number).reduce((total, n) => total * 60 + n, 0);
}

export type TimedLine = { start: number; end: number; text: string };

/**
 * Reads the lines of one part. Times are clamped to the part, kept in order and never overlapping. If the service gave
 * no usable times at all, the lines are spread over the part by text length instead (still in the right order).
 */
export function parseTimedLines(response: unknown, seconds: number): TimedLine[] {
  const parsed = answerJson(response);
  const list = Array.isArray(parsed) ? parsed : (parsed as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(list)) throw new GeminiError("format", "Jawaban tidak berisi daftar baris. Coba lagi.");
  const raw = (list as { start?: unknown; end?: unknown; text?: unknown }[])
    .map(l => ({ start: toSeconds(l?.start), end: toSeconds(l?.end), text: String(l?.text ?? "").replace(/\s+/g, " ").trim() }))
    .filter(l => l.text.length > 0);
  if (raw.length === 0) return [];
  const timed = raw.filter(l => Number.isFinite(l.start)).length;
  if (timed < raw.length / 2 || raw.every(l => !(l.start > 0) && !(l.end > 0))) return spreadByLength(raw.map(l => l.text), seconds);
  const out: TimedLine[] = [];
  let cursor = 0;
  raw.sort((a, b) => (Number.isFinite(a.start) ? a.start : cursor) - (Number.isFinite(b.start) ? b.start : cursor));
  for (const l of raw) {
    const start = Math.min(Math.max(Number.isFinite(l.start) ? l.start : cursor, cursor), seconds);
    const end = Math.min(Math.max(Number.isFinite(l.end) ? l.end : start + Math.max(1.5, l.text.length * 0.07), start + 0.3), seconds);
    if (end - start < 0.2) continue;
    out.push({ start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000, text: l.text });
    cursor = end;
  }
  return out;
}

function spreadByLength(texts: string[], seconds: number): TimedLine[] {
  const total = texts.reduce((n, t) => n + t.length, 0) || 1;
  let at = 0;
  return texts.map(text => {
    const start = at;
    at += (seconds * text.length) / total;
    return { start: Math.round(start * 1000) / 1000, end: Math.round(at * 1000) / 1000, text };
  });
}

const LINES_SCHEMA = { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "OBJECT", properties: { start: { type: "NUMBER" }, end: { type: "NUMBER" }, text: { type: "STRING" } }, required: ["start", "end", "text"] } } }, required: ["lines"] };

/** One part: listens to its audio and returns the lines, with times relative to the part. */
export function transcribeChunk(audio: { mimeType: string; data: string }, seconds: number, o: CleanupOptions): Promise<TimedLine[]> {
  return ask(o, [{ inlineData: { mimeType: audio.mimeType, data: audio.data } }, { text: transcribePrompt(o.language, seconds) }], LINES_SCHEMA, json => parseTimedLines(json, seconds));
}

export const toBase64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export type LongOptions = {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** Parts already done (kept by the caller for this video): they are not cut or sent again, so a retry continues where it stopped. */
  done?: Map<string, TimedLine[]>;
};
const keyOf = (c: Chunk) => `${c.start}:${c.duration}`;

/**
 * Transcribes a whole video. `cut` produces the audio parts one after another (the video engine does one thing at a time);
 * requests overlap so listening and cutting go on together. Fails as a whole, naming the part, if one part cannot be done.
 */
export async function transcribeLong(
  duration: number,
  cut: (chunks: Chunk[], onChunk: (index: number, mp3: Uint8Array) => Promise<void>) => Promise<void>,
  o: CleanupOptions,
  opts: LongOptions = {},
): Promise<Transcript> {
  const chunks = planChunks(duration);
  if (chunks.length === 0) throw new GeminiError("format", "Durasi video tidak terbaca.");
  const results: TimedLine[][] = Array.from({ length: chunks.length }, () => []);
  const inflight = new Set<Promise<void>>();
  let done = 0, failure: Error | null = null;
  // Parts finished by an earlier try are used as they are; only the rest are cut and sent.
  const todo: Chunk[] = [];
  for (const c of chunks) {
    const kept = opts.done?.get(keyOf(c));
    if (kept) { results[c.index] = kept.map(l => ({ ...l, start: l.start + c.start, end: l.end + c.start })); done++; } else todo.push(c);
  }
  opts.onProgress?.(done, chunks.length);
  const request = { ...o, signal: opts.signal ?? o.signal, timeoutMs: o.timeoutMs ?? CHUNK_TIMEOUT_MS };

  if (todo.length) await cut(todo, async (n, mp3) => {
    if (failure) throw failure;
    if (opts.signal?.aborted) throw new GeminiError("timeout", "Dibatalkan.");
    const chunk = todo[n];
    const audio = { mimeType: "audio/mpeg", data: toBase64(mp3) };
    // One part that is too slow gets one more try (a slow moment of the service is common); other errors are not retried here.
    const attempt = () => transcribeChunk(audio, chunk.duration, request).catch(e => {
      if (e instanceof GeminiError && e.kind === "timeout" && !opts.signal?.aborted && !o.signal?.aborted && e.message !== "Dibatalkan.") return transcribeChunk(audio, chunk.duration, request);
      throw e;
    });
    const job = attempt()
      .then(lines => { opts.done?.set(keyOf(chunk), lines); results[chunk.index] = lines.map(l => ({ ...l, start: l.start + chunk.start, end: l.end + chunk.start })); opts.onProgress?.(++done, chunks.length); })
      .catch(e => { failure ??= e instanceof GeminiError ? new GeminiError(e.kind, `Bagian ${chunk.index + 1} dari ${chunks.length}: ${e.message}`) : (e as Error); })
      .finally(() => { inflight.delete(job); });
    inflight.add(job);
    if (inflight.size >= PARALLEL) await Promise.race(inflight);
  });
  await Promise.all(inflight);
  if (failure) throw failure;

  const segments: Segment[] = results.flat().map(l => ({ start: l.start, end: l.end, text: l.text, words: spreadWords(l.text, l.start, l.end) }));
  if (segments.length === 0) throw new GeminiError("format", "Tidak ada ucapan yang terdeteksi di video ini.");
  return { language: o.language === "en" ? "english" : "indonesian", granularity: "segment", duration, segments };
}
