// Pure transcript logic shared by the UI, the motion studio and unit tests. No browser APIs here.
// Times are seconds relative to the start of the transcribed range (the audio that was fed to the engine).
import { MAX_SCENE_CHARS, MAX_SECONDS, MIN_SCENE_SECONDS } from "./script";

/** Transcription is limited to the same 3 minutes as the motion studio. */
export const MAX_TRANSCRIBE_SECONDS = MAX_SECONDS;
export const TRANSCRIBE_SAMPLE_RATE = 16000;
/** Segments are cut at a pause this long, at sentence ends, or when they grow past the limits below. */
const PAUSE_SECONDS = 0.6;
const SEGMENT_MAX_SECONDS = 10;
/** Shorter segments are merged into a neighbour: the motion studio never shows a scene under 1.2 s. */
const SEGMENT_MIN_SECONDS = 1.2;
const FALLBACK_WORD_SECONDS = 0.3;

export type Word = { text: string; start: number; end: number };
export type Segment = { start: number; end: number; text: string; words: Word[] };
export type Transcript = {
  language: string;
  /** "word" when the engine returned word timestamps; "segment" when words were spread evenly inside each segment. */
  granularity: "word" | "segment";
  duration: number;
  segments: Segment[];
};

/** A chunk as returned by the Whisper pipeline with `return_timestamps`. */
export type RawChunk = { text: string; timestamp: [number | null, number | null] | (number | null)[] };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const splitWords = (s: string) => clean(s).split(" ").filter(Boolean);

/**
 * Turns raw Whisper word chunks into monotonic words: missing ends are filled from the next start,
 * overlaps are removed, and everything is clamped to the audio duration. Chunks without text are dropped.
 */
export function parseWords(chunks: RawChunk[], duration: number): Word[] {
  const items = chunks
    .map(c => ({ text: clean(c.text ?? ""), start: c.timestamp?.[0], end: c.timestamp?.[1] }))
    .filter(c => c.text && !/^[\[(].*[\])]$/.test(c.text));
  const out: Word[] = [];
  let cursor = 0;
  items.forEach((c, i) => {
    let start = typeof c.start === "number" && Number.isFinite(c.start) ? c.start : cursor;
    start = Math.min(Math.max(start, cursor), duration);
    const next = items[i + 1]?.start;
    let end = typeof c.end === "number" && Number.isFinite(c.end) ? c.end : typeof next === "number" && Number.isFinite(next) ? next : start + FALLBACK_WORD_SECONDS;
    end = Math.min(Math.max(end, start), duration);
    out.push({ text: c.text, start: round3(start), end: round3(end) });
    cursor = end;
  });
  return out;
}

/** Whisper marks a word token with a leading space; chunks without one continue the previous word ("ber" + "main"). */
export function mergeSubwords(chunks: RawChunk[]): RawChunk[] {
  const out: { text: string; timestamp: (number | null)[] }[] = [];
  for (const c of chunks) {
    const startsWord = /^\s/.test(c.text) || out.length === 0;
    const last = out[out.length - 1];
    if (startsWord || !last) out.push({ text: c.text, timestamp: [c.timestamp[0] ?? null, c.timestamp[1] ?? null] });
    else { last.text += c.text; last.timestamp[1] = c.timestamp[1] ?? last.timestamp[1]; }
  }
  return out;
}

function makeSegment(words: Word[]): Segment {
  return { start: words[0].start, end: words[words.length - 1].end, text: words.map(w => w.text).join(" "), words };
}

/** Groups words into caption/scene sized segments: pause, sentence end, or size limit starts a new one. */
export function groupSegments(words: Word[]): Segment[] {
  const groups: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const chars = cur.map(x => x.text).join(" ").length + 1 + w.text.length;
      const endsSentence = /[.!?…]["'”’)]*$/.test(prev.text);
      if (w.start - prev.end >= PAUSE_SECONDS || endsSentence || chars > MAX_SCENE_CHARS || w.end - cur[0].start > SEGMENT_MAX_SECONDS) { groups.push(cur); cur = []; }
    }
    cur.push(w);
  }
  if (cur.length) groups.push(cur);
  // Merge too-short groups into the previous one (or the next one for the first) when the size limits allow.
  const merged: Word[][] = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    const short = g[g.length - 1].end - g[0].start < SEGMENT_MIN_SECONDS;
    const joined = prev ? [...prev, ...g] : null;
    if (prev && joined && short && joined.map(x => x.text).join(" ").length <= MAX_SCENE_CHARS) merged[merged.length - 1] = joined;
    else merged.push(g);
  }
  if (merged.length > 1 && merged[0][merged[0].length - 1].end - merged[0][0].start < SEGMENT_MIN_SECONDS) {
    const joined = [...merged[0], ...merged[1]];
    if (joined.map(x => x.text).join(" ").length <= MAX_SCENE_CHARS) merged.splice(0, 2, joined);
  }
  return merged.map(makeSegment);
}

/** Spreads the words of `text` over [start, end] in proportion to their length. Used for segment-only timestamps and edits. */
export function spreadWords(text: string, start: number, end: number): Word[] {
  const list = splitWords(text);
  if (list.length === 0) return [];
  const total = list.reduce((a, w) => a + w.length + 1, 0);
  let t = start;
  return list.map(w => {
    const next = t + ((end - start) * (w.length + 1)) / total;
    const word = { text: w, start: round3(t), end: round3(next) };
    t = next;
    return word;
  });
}

export function transcriptFromWords(chunks: RawChunk[], duration: number, language: string): Transcript {
  const words = parseWords(mergeSubwords(chunks), duration);
  return { language, granularity: "word", duration, segments: groupSegments(words) };
}

/** Fallback when the engine only returns segment timestamps. */
export function transcriptFromSegments(chunks: RawChunk[], duration: number, language: string): Transcript {
  const segments: Segment[] = [];
  let cursor = 0;
  chunks.forEach((c, i) => {
    const text = clean(c.text ?? "");
    if (!text) return;
    const s = typeof c.timestamp?.[0] === "number" ? c.timestamp[0] : cursor;
    const next = chunks[i + 1]?.timestamp?.[0];
    const e = typeof c.timestamp?.[1] === "number" ? c.timestamp[1] : typeof next === "number" ? next : duration;
    const start = Math.min(Math.max(s, cursor), duration);
    const end = Math.min(Math.max(e, start), duration);
    segments.push({ start: round3(start), end: round3(end), text, words: spreadWords(text, start, end) });
    cursor = end;
  });
  return { language, granularity: "segment", duration, segments };
}

/**
 * Replaces the text of one segment. Word timings are kept when the word count is unchanged,
 * otherwise the new words are spread over the segment's time span. An empty text removes the segment.
 */
export function editSegment(t: Transcript, index: number, text: string): Transcript {
  const seg = t.segments[index];
  if (!seg) return t;
  const list = splitWords(text);
  if (list.length === 0) return { ...t, segments: t.segments.filter((_, i) => i !== index) };
  const words = list.length === seg.words.length ? seg.words.map((w, i) => ({ ...w, text: list[i] })) : spreadWords(text, seg.start, seg.end);
  const segments = t.segments.map((s, i) => (i === index ? { ...s, text: list.join(" "), words } : s));
  return { ...t, segments };
}

export function transcriptText(t: Transcript): string {
  return t.segments.map(s => s.text).join("\n");
}

export function allWords(t: Transcript): Word[] {
  return t.segments.flatMap(s => s.words);
}

/** Moves every word by `offset` seconds (caption nudge). Words never start before 0 or overlap their neighbour. */
export function shiftWords(words: Word[], offset: number): Word[] {
  let cursor = 0;
  return words.map(w => {
    const start = Math.max(cursor, w.start + offset, 0);
    const end = Math.max(start, w.end + offset);
    cursor = start;
    return { text: w.text, start: round3(start), end: round3(end) };
  });
}

/** Segment and word shown at time `at` (seconds in transcript time), or null in a silent gap. */
export function activeAt(t: Transcript, at: number): { segment: number; word: number } | null {
  const si = t.segments.findIndex(s => at >= s.start && at < s.end);
  if (si < 0) return null;
  const words = t.segments[si].words;
  let wi = 0;
  for (let i = 0; i < words.length; i++) if (at >= words[i].start) wi = i;
  return { segment: si, word: wi };
}

export function formatSrtTime(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
}

export function toSrt(t: Transcript): string {
  return t.segments.map((s, i) => `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text}\n`).join("\n");
}

export type SceneTimings = {
  seconds: number[];
  wordStarts: number[][];
  /** Frame (from the scene's first frame) at which each word ends. */
  wordEnds: number[][];
  /** Scenes shorter than the studio's minimum scene length: they would be stretched and push later captions late. */
  tooShort: number;
};

/**
 * Maps the lines of a motion script onto transcript timing. `texts` are the scene texts (splitScript output);
 * they only match when their words are exactly the transcript words, so an edited script returns null and the
 * studio falls back to its normal timing. Scene lengths are derived from cumulative frame positions, so rounding
 * never accumulates drift against the original audio. `wordStarts` are frames from each scene's first frame.
 */
export function sceneTimings(texts: string[], words: Word[], fps: number, totalSeconds?: number): SceneTimings | null {
  const split = texts.map(t => t.replace(/\*/g, "").split(/\s+/).filter(Boolean));
  const count = split.reduce((a, w) => a + w.length, 0);
  if (texts.length === 0 || count !== words.length) return null;
  if (split.some(w => w.length === 0)) return null;
  let at = 0;
  const first: number[] = [];
  for (const w of split) { first.push(at); at += w.length; }
  const starts = first.map(i => Math.round(words[i].start * fps));
  const endFrame = Math.round((totalSeconds ?? words[words.length - 1].end) * fps);
  // The first scene starts at frame 0 so leading silence stays part of it and the video still lines up with the audio.
  starts[0] = 0;
  const bounds = [...starts, Math.max(endFrame, starts[starts.length - 1] + 1)];
  const seconds = texts.map((_, i) => (bounds[i + 1] - bounds[i]) / fps);
  if (seconds.some(s => s <= 0)) return null;
  const rel = (sec: number, i: number) => Math.max(0, Math.round(sec * fps) - bounds[i]);
  const wordStarts = split.map((w, i) => w.map((_, j) => rel(words[first[i] + j].start, i)));
  const wordEnds = split.map((w, i) => w.map((_, j) => Math.max(wordStarts[i][j], rel(words[first[i] + j].end, i))));
  const tooShort = seconds.filter(x => x < MIN_SCENE_SECONDS - 1e-6).length;
  return { seconds, wordStarts, wordEnds, tooShort };
}

/** Handoff from the clipper to the motion studio (sessionStorage, same tab session, nothing leaves the device). */
export const HANDOFF_KEY = "clipper:transcript:v1";

export function serializeHandoff(t: Transcript, source: string): string {
  return JSON.stringify({ v: 1, source, transcript: t });
}

export function parseHandoff(raw: string | null): { source: string; transcript: Transcript } | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (d?.v !== 1 || !Array.isArray(d.transcript?.segments)) return null;
    const t = d.transcript as Transcript;
    if (!Number.isFinite(t.duration) || t.duration <= 0 || t.duration > MAX_TRANSCRIBE_SECONDS + 1) return null;
    const ok = t.segments.length > 0 && t.segments.every(s =>
      typeof s.text === "string" && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start
      && Array.isArray(s.words) && s.words.every(w => typeof w.text === "string" && Number.isFinite(w.start) && Number.isFinite(w.end)));
    return ok ? { source: String(d.source ?? ""), transcript: t } : null;
  } catch { return null; }
}

export const LANGUAGES = [
  { id: "indonesian", label: "Indonesia" },
  { id: "english", label: "Inggris" },
] as const;
export type LanguageId = (typeof LANGUAGES)[number]["id"];

export function validateTranscribeRange(duration: number): string | null {
  if (!Number.isFinite(duration) || duration <= 0) return "Pilih bagian video yang valid terlebih dahulu.";
  if (duration > MAX_TRANSCRIBE_SECONDS) return `Transkrip otomatis dibatasi ${MAX_TRANSCRIBE_SECONDS / 60} menit. Pilih bagian yang lebih pendek (sekarang ${Math.round(duration)} detik).`;
  return null;
}

/** Human-readable explanation of common transcription failures. */
export function explainTranscribeError(detail: string): string {
  if (/no audio|tidak punya audio|empty audio/i.test(detail)) return "Video ini tidak memiliki suara yang bisa ditranskripsi. Pilih video atau bagian lain yang ada ucapannya.";
  if (/memory|OOM|allocation|RangeError|Out of bounds/i.test(detail)) return "Memori browser tidak cukup untuk model ucapan. Tutup tab lain, pilih bagian lebih pendek, atau pakai model Cepat.";
  if (/fetch|network|Failed to load|NetworkError|load failed|Could not locate|unable to get|huggingface/i.test(detail)) return "Model ucapan gagal diunduh. Periksa koneksi internet lalu coba lagi (model hanya diunduh sekali, lalu disimpan di perangkat).";
  if (/webassembly|wasm|worker/i.test(detail)) return "Browser ini tidak dapat menjalankan mesin transkripsi (WebAssembly/Worker). Perbarui Safari/Chrome lalu coba lagi.";
  if (/Invalid data|moov atom|Decoder|does not contain any stream|codec/i.test(detail)) return "Audio video tidak dapat dibaca. Coba ekspor ulang video sebagai MP4 (H.264/AAC).";
  return "Transkripsi gagal. Coba lagi, pilih bagian lebih pendek, atau pakai model Cepat.";
}
