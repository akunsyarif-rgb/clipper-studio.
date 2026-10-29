// AI help for the clipper, all suggestions only (the creator reviews and decides): the best moments to cut out of a
// transcript, and a title, description and hashtags for a clip. Built on the same request path as the transcript clean-up.
import { MAX_CLIP_SECONDS } from "./clip";
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";

export const MOMENT_MIN_SECONDS = 8;
/** Short-form platforms favour short clips; a suggestion longer than this is trimmed at a line boundary. */
export const MOMENT_MAX_SECONDS = Math.min(90, MAX_CLIP_SECONDS);
export const MAX_MOMENTS = 6;

/** How long a suggested moment may be and how many to ask for. The defaults suit a short transcript; a long video asks for more and longer ones. */
export type MomentLimits = { min: number; max: number; count: number };
export const DEFAULT_LIMITS: MomentLimits = { min: MOMENT_MIN_SECONDS, max: MOMENT_MAX_SECONDS, count: MAX_MOMENTS };
/** Limits for picking clips out of a whole long video: at most 3 minutes each (what the motion studio accepts). */
export function limitsForVideo(durationSeconds: number): MomentLimits {
  return { min: 20, max: 180, count: Math.min(10, Math.max(3, Math.round(durationSeconds / 120))) };
}

export type Line = { start: number; end: number; text: string };
export type Moment = { startIndex: number; endIndex: number; /** Seconds in the transcript's own time. */ start: number; end: number; title: string; reason: string; /** The start was moved earlier by this many lines because the chosen line only continues an earlier thought. */ reachedBack?: number };

/** A suggested clip as the creator sees and adjusts it. */
export type Item = { start: number; end: number; title: string; reason: string; checked: boolean; /** Said to the creator under the clip, e.g. that the start was moved earlier. */ note?: string };

/** A little air before the first word, so a clip does not open on a cut-off syllable (never reaching into the line before). */
export const LEAD_IN_SECONDS = 0.3;
/** How many lines a start may be moved back when it only continues an earlier thought. */
export const MAX_REACH_BACK = 2;

// Openers that depend on what was said just before: "jadi ...", "nah ...", "but ...". The text is lower-cased and stripped of punctuation first.
const CONTINUATION = /^(?:jadi|nah|lalu|terus|kemudian|makanya|maka|karena itu|oleh karena itu|karena|tapi|tetapi|namun|dan|atau|soalnya|sebab|berarti|selain itu|selanjutnya|sedangkan|padahal|and|but|so|then|because|also|which|that's why|thats why|anyway|however)(?:\s|$)/u;
export const continuesEarlier = (text: string) => CONTINUATION.test(text.toLowerCase().replace(/^[^\p{L}\p{N}]+/u, "").replace(/[,.!?;:]/g, " ").replace(/\s+/g, " ").trim());

/** Start time of line `i` with the lead-in, but never earlier than the end of the line before it. */
export function startWithLeadIn(lines: Line[], i: number): number {
  const gap = lines[i].start - (i > 0 ? lines[i - 1].end : 0);
  return Math.round((lines[i].start - Math.max(0, Math.min(LEAD_IN_SECONDS, gap))) * 1000) / 1000;
}

/** The nearest line boundary after (dir 1) or before (dir -1) `time`, for stepping a clip's start or end one sentence at a time. */
export function stepToLine(lines: Line[], time: number, edge: "start" | "end", dir: 1 | -1): number | null {
  const marks = lines.map((l, i) => (edge === "start" ? startWithLeadIn(lines, i) : l.end)).sort((a, b) => a - b);
  const eps = 0.05;
  if (dir === 1) return marks.find(t => t > time + eps) ?? null;
  for (let i = marks.length - 1; i >= 0; i--) if (marks[i] < time - eps) return marks[i];
  return null;
}

/** What is said at the start (or end) of a clip: the line that begins at or after the start, or ends at or before the end, shortened. */
export function lineTextAt(lines: Line[], time: number, edge: "start" | "end", max = 70): string {
  const hit = edge === "start" ? lines.find(l => l.end > time + 0.05) : [...lines].reverse().find(l => l.start < time - 0.05);
  const text = (hit?.text ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

const langName = (language: string) => (language === "en" ? "bahasa Inggris" : "bahasa Indonesia");
const tidy = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function momentsPrompt(lines: Line[], language: string, limits: MomentLimits = DEFAULT_LIMITS): string {
  return [
    `Kamu editor video pendek (TikTok, Reels, Shorts). Berikut transkrip sebuah video (${langName(language)}), tiap baris bernomor dan punya detik mulai dan selesai.`,
    `Pilih 3 sampai ${limits.count} potongan terbaik untuk dijadikan klip pendek.`,
    "Aturan:",
    `- tiap potongan berdiri sendiri: ada pembuka dan penutup yang utuh, tidak dimulai atau diakhiri di tengah gagasan;`,
    "- baris awal harus kalimat yang memperkenalkan topik atau pernyataan utama, bukan lanjutan: jangan mulai dari kalimat yang diawali kata sambung (jadi, nah, lalu, tapi, dan, karena itu) atau yang merujuk ke kalimat sebelumnya; mulailah dari kalimat sebelumnya yang memuat pokok bahasannya;",
    `- panjang ${limits.min} sampai ${limits.max} detik (lebih pendek lebih baik bila pesannya sudah utuh);`,
    "- pilih yang paling menarik: pernyataan yang mengejutkan, cerita, angka atau fakta kuat, tips yang bisa langsung dipakai, atau ajakan yang jelas;",
    "- potongan tidak boleh tumpang tindih; jangan memilih basa-basi atau pengulangan;",
    "- bila transkrip terlalu pendek atau tidak ada yang menarik, kembalikan lebih sedikit potongan (boleh kosong).",
    "Balas hanya JSON: {\"moments\": [{\"start\": nomor_baris_awal, \"end\": nomor_baris_akhir, \"title\": \"maksimal 8 kata\", \"reason\": \"maksimal 15 kata, mengapa menarik\"}]}. start dan end adalah nomor baris (inklusif).",
    "",
    "Masukan (JSON):",
    JSON.stringify(lines.map((l, i) => ({ i, start: Math.round(l.start * 10) / 10, end: Math.round(l.end * 10) / 10, text: l.text }))),
  ].join("\n");
}

/** Reads the suggestions: valid line numbers only, trimmed to the length limit, no overlaps, in time order. */
export function parseMoments(response: unknown, lines: Line[], limits: MomentLimits = DEFAULT_LIMITS): Moment[] {
  const parsed = answerJson(response);
  const list = Array.isArray(parsed) ? parsed : (parsed as { moments?: unknown } | null)?.moments;
  if (!Array.isArray(list)) throw new GeminiError("format", "Jawaban tidak berisi daftar momen. Coba lagi.");
  const picks: { s: number; e: number; title: string; reason: string }[] = [];
  for (const m of list as { start?: unknown; end?: unknown; title?: unknown; reason?: unknown }[]) {
    if (!Number.isInteger(m?.start) || !Number.isInteger(m?.end)) continue;
    const s = m.start as number, e = m.end as number;
    if (s < 0 || e >= lines.length || s > e) continue;
    picks.push({ s, e, title: tidy(m.title, 80), reason: tidy(m.reason, 140) });
  }
  picks.sort((a, b) => a.s - b.s);
  const kept: Moment[] = [];
  for (const p of picks) {
    const floor = kept.length ? kept[kept.length - 1].endIndex + 1 : 0;
    if (p.s < floor) continue; // overlaps the clip before it
    let s = p.s, back = 0;
    while (back < MAX_REACH_BACK && s > floor && continuesEarlier(lines[s].text)) { s--; back++; }
    let e = p.e;
    const start = () => startWithLeadIn(lines, s);
    while (e > s && lines[e].end - start() > limits.max) e--;
    const from = start(), end = lines[e].end;
    if (end - from < limits.min || end - from > limits.max) continue;
    kept.push({ startIndex: s, endIndex: e, start: from, end, title: p.title || `Momen ${kept.length + 1}`, reason: p.reason, ...(back ? { reachedBack: back } : {}) });
  }
  return kept.slice(0, limits.count);
}

const MOMENTS_SCHEMA = { type: "OBJECT", properties: { moments: { type: "ARRAY", items: { type: "OBJECT", properties: { start: { type: "INTEGER" }, end: { type: "INTEGER" }, title: { type: "STRING" }, reason: { type: "STRING" } }, required: ["start", "end", "title", "reason"] } } }, required: ["moments"] };

/** Asks for the best moments of a transcript. An empty list means the model found none worth cutting. */
export async function suggestMoments(lines: Line[], o: CleanupOptions, limits: MomentLimits = DEFAULT_LIMITS): Promise<Moment[]> {
  if (lines.length === 0) return [];
  return ask(o, [{ text: momentsPrompt(lines, o.language, limits) }], MOMENTS_SCHEMA, json => parseMoments(json, lines, limits));
}

// ---- title, description, hashtags -----------------------------------------------------------------------------------

export type Copy = { title: string; description: string; hashtags: string[] };
const MAX_COPY_CHARS = 6000;

export function copyPrompt(text: string, language: string): string {
  return [
    `Kamu penulis teks untuk video pendek (TikTok, Reels, Shorts). Berikut ucapan dalam sebuah klip (${langName(language)}). Tulis dalam ${langName(language)}:`,
    "- title: judul menarik, jelas, maksimal 60 karakter, tanpa janji yang tidak ada di klip;",
    "- description: 1 sampai 2 kalimat, maksimal 200 karakter;",
    "- hashtags: 5 sampai 8 tagar relevan, tanpa spasi, tanpa tanda baca selain #.",
    "Hanya gunakan isi klip; jangan mengarang fakta, angka, atau nama.",
    "Balas hanya JSON: {\"title\": \"...\", \"description\": \"...\", \"hashtags\": [\"#...\"]}.",
    "",
    "Isi klip:",
    text.replace(/\s+/g, " ").trim().slice(0, MAX_COPY_CHARS),
  ].join("\n");
}

export function parseCopy(response: unknown): Copy {
  const p = answerJson(response) as { title?: unknown; description?: unknown; hashtags?: unknown } | null;
  const title = tidy(p?.title, 100);
  if (!title || !Array.isArray(p?.hashtags)) throw new GeminiError("format", "Jawaban tidak berisi judul dan tagar. Coba lagi.");
  const tags = [...new Set((p!.hashtags as unknown[]).map(t => String(t ?? "").replace(/[^\p{L}\p{N}_]+/gu, "")).filter(Boolean).map(t => `#${t}`))].slice(0, 10);
  return { title, description: tidy(p?.description, 400), hashtags: tags };
}

const COPY_SCHEMA = { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" }, hashtags: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title", "description", "hashtags"] };

export async function writeCopy(text: string, o: CleanupOptions): Promise<Copy> {
  if (!text.trim()) throw new GeminiError("format", "Tidak ada teks untuk dibuatkan judul.");
  return ask(o, [{ text: copyPrompt(text, o.language) }], COPY_SCHEMA, parseCopy);
}

const MIN_SECONDS = 5;
const MAX_SECONDS = 180;

/** Moves a clip's start or end by a few seconds, keeping it between 5 s and 3 min and inside the video. */
export function nudged<T extends Item>(m: T, edge: "start" | "end", delta: number, duration: number): T {
  if (edge === "start") return { ...m, start: Math.min(Math.max(m.start + delta, Math.max(0, m.end - MAX_SECONDS)), m.end - MIN_SECONDS) };
  return { ...m, end: Math.max(Math.min(m.end + delta, duration, m.start + MAX_SECONDS), m.start + MIN_SECONDS) };
}

/** Moves the start or end to the next sentence boundary earlier (-1) or later (1). Unchanged when there is none or the limits would be broken. */
export function stepped<T extends Item>(m: T, edge: "start" | "end", dir: 1 | -1, lines: Line[], duration: number): T {
  const at = edge === "start" ? m.start : m.end;
  const to = stepToLine(lines, at, edge, dir);
  if (to === null) return m;
  return { ...nudged(m, edge, to - at, duration), note: undefined };
}
