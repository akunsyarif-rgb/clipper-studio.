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
/** What the video is: it changes what a good clip is. For comedy a clip must be a whole joke a new viewer understands. */
export type Genre = "umum" | "komedi";
export const GENRES: { id: Genre; label: string; hint: string }[] = [
  { id: "umum", label: "Umum", hint: "bagian paling menarik dari video apa saja" },
  { id: "komedi", label: "Komedi / hiburan", hint: "lelucon utuh: pembuka, punchline, reaksi, dan bisa dipahami tanpa menonton bagian lain" },
];

export type Judgement = {
  /** 1-10: how well a viewer who has not seen the rest of the video understands the clip and gets what is good in it. */
  score: number;
  /** What such a viewer takes from the clip (what is funny or interesting), in one sentence. */
  understood: string;
  /** What they would be missing, or "" when nothing. */
  missing: string;
  /** Lines before the clip / after it that would make it understandable (0 = none). */
  extendStart: number;
  extendEnd: number;
};

export type Moment = {
  startIndex: number; endIndex: number; /** Seconds in the transcript's own time. */ start: number; end: number; title: string; reason: string;
  /** The start was moved earlier by this many lines because the chosen line only continues an earlier thought. */ reachedBack?: number;
  /** The reading test of a viewer who has not seen the rest of the video (absent when it could not be done). */
  judged?: Judgement & { extendedStart: number; extendedEnd: number };
};

/** A suggested clip as the creator sees and adjusts it. */
export type Item = {
  start: number; end: number; title: string; reason: string; checked: boolean;
  /** Said to the creator under the clip, e.g. that the start was moved earlier. */ note?: string;
  /** The reading test of a viewer who has not seen the rest: score 1-10, what they take from the clip, what they would miss. */
  score?: number; understood?: string; missing?: string;
};

/** A suggestion as a list item: ticked by default only when a new viewer can follow it; what the reading test found is carried along. */
export function itemOf(m: Moment, tick: boolean): Item {
  const notes: string[] = [];
  if (m.reachedBack) notes.push(`Awal dimundurkan ${m.reachedBack} kalimat karena kalimat pilihan AI hanya melanjutkan kalimat sebelumnya.`);
  const j = m.judged;
  if (j && (j.extendedStart || j.extendedEnd)) notes.push(`Ditambah ${[j.extendedStart ? `${j.extendedStart} kalimat di awal` : "", j.extendedEnd ? `${j.extendedEnd} kalimat di akhir` : ""].filter(Boolean).join(" dan ")} agar penonton yang belum melihat bagian lain bisa paham.`);
  if (notes.length) notes.push('Bila kurang pas, geser lagi di "Sesuaikan waktu".');
  return {
    start: m.start, end: m.end, title: m.title, reason: m.reason, checked: tick && (!j || j.score >= WEAK_SCORE),
    ...(notes.length ? { note: notes.join(" ") } : {}),
    ...(j ? { score: j.score, understood: j.understood, missing: j.missing } : {}),
  };
}

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

export function momentsPrompt(lines: Line[], language: string, limits: MomentLimits = DEFAULT_LIMITS, genre: Genre = "umum"): string {
  const comedy = genre === "komedi";
  return [
    `Kamu editor video pendek (TikTok, Reels, Shorts). Berikut transkrip sebuah video (${langName(language)}), tiap baris bernomor dan punya detik mulai dan selesai.`,
    `Pilih 3 sampai ${limits.count} potongan terbaik untuk dijadikan klip pendek.`,
    "Aturan:",
    `- tiap potongan berdiri sendiri: ada pembuka dan penutup yang utuh, tidak dimulai atau diakhiri di tengah gagasan;`,
    "- baris awal harus kalimat yang memperkenalkan topik atau pernyataan utama, bukan lanjutan: jangan mulai dari kalimat yang diawali kata sambung (jadi, nah, lalu, tapi, dan, karena itu) atau yang merujuk ke kalimat sebelumnya; mulailah dari kalimat sebelumnya yang memuat pokok bahasannya;",
    `- panjang ${limits.min} sampai ${limits.max} detik (lebih pendek lebih baik bila pesannya sudah utuh);`,
    comedy
      ? "- pilih lelucon atau momen lucu yang UTUH: premis/setup yang cukup agar penonton baru paham siapa, di mana, dan apa situasinya, lalu punchline, lalu reaksi atau tawa sesudahnya; jangan berhenti sebelum reaksinya selesai;"
      : "- pilih yang paling menarik: pernyataan yang mengejutkan, cerita, angka atau fakta kuat, tips yang bisa langsung dipakai, atau ajakan yang jelas;",
    ...(comedy ? [
      "- penonton yang belum pernah melihat bagian lain video harus paham dan ikut masuk: sertakan baris pengenalan tokoh atau situasi bila lelucon bergantung padanya;",
      "- jangan memilih lelucon yang bergantung pada kejadian di bagian lain (\"tadi\", \"yang itu\", \"seperti sebelumnya\", lanjutan cerita) kecuali penjelasannya ikut masuk di potongan;",
      "- lebih baik satu lelucon utuh yang rapi daripada potongan panjang yang bertele-tele; beri beberapa kandidat lebih banyak dari yang perlu agar bisa disaring;",
    ] : []),
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

// ---- the reading test: does a viewer who has not seen the rest understand this clip? ------------------------------------------

/** How many lines of context the reader sees on each side of a candidate, and the most a clip may be extended by. */
export const CONTEXT_BEFORE = 4;
export const CONTEXT_AFTER = 2;
export const MAX_EXTEND_START = 4;
export const MAX_EXTEND_END = 3;
/** A clip scoring below this is shown as lacking context and is not ticked. */
export const WEAK_SCORE = 6;
/** A clip scoring below this (after extending) is dropped when there are enough others. */
export const DROP_SCORE = 4;

export function judgePrompt(lines: Line[], moments: Moment[], language: string, genre: Genre): string {
  const text = (a: number, b: number) => lines.slice(Math.max(0, a), Math.min(lines.length, b)).map(l => l.text.replace(/\s+/g, " ").trim());
  const items = moments.map((m, i) => ({ i, sebelum: text(m.startIndex - CONTEXT_BEFORE, m.startIndex), klip: text(m.startIndex, m.endIndex + 1), sesudah: text(m.endIndex + 1, m.endIndex + 1 + CONTEXT_AFTER) }));
  return [
    `Kamu penonton pertama yang menilai calon klip video pendek (${langName(language)}). Kamu BELUM melihat bagian video yang lain.`,
    "Untuk tiap calon klip kamu diberi: baris SEBELUM klip (tidak ikut diputar, hanya konteks), baris KLIP (yang diputar), dan baris SESUDAH (tidak ikut).",
    "Baca hanya baris KLIP seolah itu seluruh videonya, lalu nilai:",
    genre === "komedi"
      ? "- score 1-10: apakah penonton baru paham situasinya, mengerti di mana lucunya, dan merasakan punchline serta reaksinya? 10 = paham dan ikut tertawa tanpa konteks lain; 5 = tahu ada yang lucu tapi tidak tahu kenapa; 1 = tidak paham sama sekali;"
      : "- score 1-10: apakah penonton baru paham apa yang dibicarakan dan mendapat hal menarik darinya tanpa konteks lain? 10 = utuh dan jelas; 5 = tertangkap sebagian; 1 = tidak paham;",
    "- understood: satu kalimat, apa yang ditangkap penonton baru dari klip itu (apa yang lucu atau menarik);",
    "- missing: konteks yang kurang bagi penonton baru (siapa tokohnya, situasi apa, apa yang dirujuk); kosongkan jika tidak ada;",
    `- extendStart: berapa baris dari SEBELUM yang perlu dimasukkan agar klip bisa dipahami (0 sampai ${MAX_EXTEND_START}; 0 jika sudah cukup); jangan menambah bila tidak perlu;`,
    `- extendEnd: berapa baris dari SESUDAH yang perlu dimasukkan agar reaksi atau penutup selesai (0 sampai ${MAX_EXTEND_END}).`,
    "Jujurlah: nilai rendah jika klip bergantung pada bagian lain. Jangan membuat konteks yang tidak ada di baris.",
    "Balas hanya JSON: {\"judgements\": [{\"i\": nomor, \"score\": 1-10, \"understood\": \"...\", \"missing\": \"...\", \"extendStart\": 0, \"extendEnd\": 0}]}.",
    "",
    "Calon klip (JSON):",
    JSON.stringify(items),
  ].join("\n");
}

const JUDGE_SCHEMA = { type: "OBJECT", properties: { judgements: { type: "ARRAY", items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, score: { type: "INTEGER" }, understood: { type: "STRING" }, missing: { type: "STRING" }, extendStart: { type: "INTEGER" }, extendEnd: { type: "INTEGER" } }, required: ["i", "score", "understood", "missing", "extendStart", "extendEnd"] } } }, required: ["judgements"] };

const clampInt = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };

/** Reads the reading test: one judgement per candidate (by number); candidates the answer skips stay unjudged. */
export function parseJudgements(response: unknown, count: number): (Judgement | undefined)[] {
  const parsed = answerJson(response);
  const list = Array.isArray(parsed) ? parsed : (parsed as { judgements?: unknown } | null)?.judgements;
  if (!Array.isArray(list)) throw new GeminiError("format", "Jawaban tidak berisi penilaian klip. Coba lagi.");
  const out: (Judgement | undefined)[] = Array.from({ length: count }, () => undefined);
  for (const j of list as { i?: unknown; score?: unknown; understood?: unknown; missing?: unknown; extendStart?: unknown; extendEnd?: unknown }[]) {
    if (!Number.isInteger(j?.i) || (j.i as number) < 0 || (j.i as number) >= count || !Number.isFinite(Number(j.score))) continue;
    out[j.i as number] = { score: clampInt(j.score, 1, 10), understood: tidy(j.understood, 200), missing: tidy(j.missing, 200), extendStart: clampInt(j.extendStart, 0, MAX_EXTEND_START), extendEnd: clampInt(j.extendEnd, 0, MAX_EXTEND_END) };
  }
  return out;
}

/**
 * Applies the reading test: a clip that needs more context is extended by the lines the reader asked for (never into the
 * clip before it or the one after, and never past the length limit), clips that stay incomprehensible are dropped when there
 * are enough others, and the best `limits.count` are kept in time order. Unjudged clips are kept as they are.
 */
export function applyJudgements(moments: Moment[], judgements: (Judgement | undefined)[], lines: Line[], limits: MomentLimits): Moment[] {
  let prevEnd = -1; // the last line taken by the clip before (after its own extension)
  const out: Moment[] = moments.map((m, k) => {
    const j = judgements[k];
    if (!j) { prevEnd = m.endIndex; return m; }
    const floor = Math.max(prevEnd + 1, k > 0 ? moments[k - 1].endIndex + 1 : 0);
    const ceil = k + 1 < moments.length ? moments[k + 1].startIndex - 1 : lines.length - 1;
    let s = Math.max(floor, m.startIndex - j.extendStart), e = Math.min(ceil, m.endIndex + j.extendEnd);
    const span = () => lines[e].end - startWithLeadIn(lines, s);
    // Too long: give back the end first (the reaction), then the start, one line at a time, down to the original clip.
    while (span() > limits.max && e > m.endIndex) e--;
    while (span() > limits.max && s < m.startIndex) s++;
    if (span() > limits.max) { s = m.startIndex; e = m.endIndex; }
    const changed = s !== m.startIndex || e !== m.endIndex;
    prevEnd = e;
    return { ...m, startIndex: s, endIndex: e, start: changed ? startWithLeadIn(lines, s) : m.start, end: lines[e].end, judged: { ...j, extendedStart: m.startIndex - s, extendedEnd: e - m.endIndex } };
  });
  // The reader's score is for the clip as sent; after extending it is assumed to have improved what was missing, so only clips that
  // were very weak AND could not be extended are dropped.
  const strong = out.filter(m => !m.judged || m.judged.score >= DROP_SCORE || m.judged.extendedStart + m.judged.extendedEnd > 0);
  const pool = strong.length >= Math.min(3, out.length) ? strong : out;
  const rank = (m: Moment) => (m.judged ? m.judged.score + Math.min(2, m.judged.extendedStart + m.judged.extendedEnd) * 0.2 : 6);
  const best = [...pool].sort((a, b) => rank(b) - rank(a)).slice(0, limits.count);
  return best.sort((a, b) => a.start - b.start);
}

export type SuggestOptions = { genre?: Genre; /** Run the reading test (one more request; skipped quietly if it fails). Default true. */ judge?: boolean };

/** Asks for the best moments of a transcript. An empty list means the model found none worth cutting. */
export async function suggestMoments(lines: Line[], o: CleanupOptions, limits: MomentLimits = DEFAULT_LIMITS, opts: SuggestOptions = {}): Promise<Moment[]> {
  if (lines.length === 0) return [];
  const genre = opts.genre ?? "umum", judge = opts.judge !== false;
  // With the reading test more candidates are asked for, so the ones a new viewer cannot follow can be dropped.
  const asked: MomentLimits = judge ? { ...limits, count: Math.min(12, limits.count + 3) } : limits;
  const moments = await ask(o, [{ text: momentsPrompt(lines, o.language, asked, genre) }], MOMENTS_SCHEMA, json => parseMoments(json, lines, asked));
  if (!judge || moments.length === 0) return moments.slice(0, limits.count);
  try {
    const judgements = await ask(o, [{ text: judgePrompt(lines, moments, o.language, genre) }], JUDGE_SCHEMA, json => parseJudgements(json, moments.length));
    return applyJudgements(moments, judgements, lines, limits);
  } catch (e) {
    // The test is an extra: if it cannot be done the suggestions still stand (only a cancel stops everything).
    if (e instanceof GeminiError && e.message === "Dibatalkan.") throw e;
    return moments.slice(0, limits.count);
  }
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
