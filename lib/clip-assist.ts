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
export type Moment = { startIndex: number; endIndex: number; /** Seconds in the transcript's own time. */ start: number; end: number; title: string; reason: string };

const langName = (language: string) => (language === "en" ? "bahasa Inggris" : "bahasa Indonesia");
const tidy = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function momentsPrompt(lines: Line[], language: string, limits: MomentLimits = DEFAULT_LIMITS): string {
  return [
    `Kamu editor video pendek (TikTok, Reels, Shorts). Berikut transkrip sebuah video (${langName(language)}), tiap baris bernomor dan punya detik mulai dan selesai.`,
    `Pilih 3 sampai ${limits.count} potongan terbaik untuk dijadikan klip pendek.`,
    "Aturan:",
    `- tiap potongan berdiri sendiri: ada pembuka dan penutup yang utuh, tidak dimulai atau diakhiri di tengah gagasan;`,
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
  const out: Moment[] = [];
  for (const m of list as { start?: unknown; end?: unknown; title?: unknown; reason?: unknown }[]) {
    if (!Number.isInteger(m?.start) || !Number.isInteger(m?.end)) continue;
    const s = m.start as number;
    let e = m.end as number;
    if (s < 0 || e >= lines.length || s > e) continue;
    while (e > s && lines[e].end - lines[s].start > limits.max) e--;
    const start = lines[s].start, end = lines[e].end;
    if (end - start < limits.min || end - start > limits.max) continue;
    out.push({ startIndex: s, endIndex: e, start, end, title: tidy(m.title, 80) || `Momen ${out.length + 1}`, reason: tidy(m.reason, 140) });
  }
  out.sort((a, b) => a.start - b.start);
  const kept: Moment[] = [];
  for (const m of out) if (!kept.length || m.start >= kept[kept.length - 1].end) kept.push(m);
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
