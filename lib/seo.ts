// SEO and distribution pack: from a finished script the AI writes the platform's own text (hook, caption, hashtags, title...),
// and this module checks it against each platform's rules before it is shown. Pure: the model call is lib/gemini.ts ask().
// The AI knows no live trends: the creator's own "tren / musim" text is the only trend input, and the prompt says so.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";

export type SeoPlatform = "tiktok" | "instagram" | "youtube" | "x" | "linkedin";
export const SEO_PLATFORMS: { id: SeoPlatform; label: string }[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram Reels" },
  { id: "youtube", label: "YouTube Shorts" },
  { id: "x", label: "X (Twitter)" },
  { id: "linkedin", label: "LinkedIn" },
];

type FieldKind = "text" | "list" | "hashtags";
type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  /** What the model is asked for in this field. */
  ask: string;
  /** Longest allowed text, in characters. */
  maxChars?: number;
  /** Allowed word count of a text. */
  words?: [number, number];
  /** Allowed number of list items or hashtags. */
  items?: [number, number];
};

type PlatformSpec = { label: string; brief: string[]; fields: FieldSpec[] };

const SPECS: Record<SeoPlatform, PlatformSpec> = {
  tiktok: {
    label: "TikTok",
    brief: ["Hook teks layar detik 0-3 harus pendek dan memuat kata kunci utama.", "Caption berfungsi sebagai SEO pencarian TikTok: masalah + solusi + pemicu pencarian, kata kunci alami (bukan dijejalkan).", "Hashtag: 1 niche besar, 2 topik spesifik, 1 niche/lokal, 1 tren relevan. Jangan pakai #fyp atau sejenisnya."],
    fields: [
      { key: "hookText", label: "Hook teks layar (detik 0-3)", kind: "text", ask: "teks layar pendek, memuat kata kunci utama", maxChars: 60 },
      { key: "voiceoverHook", label: "Hook voice-over", kind: "text", ask: "kalimat pembuka lisan yang cocok dengan teks layar", maxChars: 160 },
      { key: "caption", label: "Caption (SEO)", kind: "text", ask: "caption informatif 100-150 kata", words: [100, 150] },
      { key: "hashtags", label: "Hashtag (maks. 5)", kind: "hashtags", ask: "maksimal 5 hashtag sesuai rumus", items: [3, 5] },
      { key: "thumbnailText", label: "Teks thumbnail", kind: "text", ask: "teks thumbnail singkat", maxChars: 40 },
      { key: "searchTopics", label: "Topik terkait untuk bilah pencarian", kind: "list", ask: "3-5 frasa pencarian yang mungkin diketik penonton", items: [3, 5] },
    ],
  },
  instagram: {
    label: "Instagram Reels",
    brief: ["Hook teks dan audio awal memuat kata kunci visual dan verbal yang sama.", "Caption seperti micro-blog: dua baris awal menggoda klik 'more' (jangan terpotong), isi berpoin, ditutup CTA yang memicu Simpan (Save) dan Bagikan (Share).", "Tepat 3 topik untuk fitur 'Add Topics', alt text deskriptif, 3-5 tagar niche/komunitas."],
    fields: [
      { key: "hookText", label: "Hook teks layar", kind: "text", ask: "kata kunci visual awal", maxChars: 60 },
      { key: "audioMatch", label: "Hook audio (cocok dengan teks)", kind: "text", ask: "kalimat verbal awal yang cocok dengan teks layar", maxChars: 160 },
      { key: "caption", label: "Caption (micro-blog)", kind: "text", ask: "caption panjang: 2 baris awal menggoda, isi berpoin, CTA Simpan dan Bagikan", words: [60, 260] },
      { key: "topics", label: "Add Topics (3)", kind: "list", ask: "tepat 3 topik relevan", items: [3, 3] },
      { key: "altText", label: "Alt text", kind: "text", ask: "deskripsi teknis visual untuk sistem Instagram", maxChars: 400 },
      { key: "hashtags", label: "Tagar (3-5)", kind: "hashtags", ask: "3-5 tagar spesifik komunitas/niche", items: [3, 5] },
    ],
  },
  youtube: {
    label: "YouTube Shorts",
    brief: ["Judul kurang dari 50 karakter, rumus CTR tinggi yang sesuai maksud pencarian.", "Deskripsi 100-200 kata: dua baris awal kaya kata kunci, ringkasan isi, lalu tag penelusuran.", "Komentar sematan (pin comment) pemicu diskusi dan retensi."],
    fields: [
      { key: "title", label: "Judul (<50 karakter)", kind: "text", ask: "judul video, kurang dari 50 karakter", maxChars: 49 },
      { key: "description", label: "Deskripsi", kind: "text", ask: "deskripsi 100-200 kata", words: [100, 200] },
      { key: "thumbnailText", label: "Teks thumbnail", kind: "text", ask: "teks thumbnail singkat", maxChars: 40 },
      { key: "pinComment", label: "Pin comment", kind: "text", ask: "komentar pertama pemicu diskusi", maxChars: 300 },
    ],
  },
  x: {
    label: "X (Twitter)",
    brief: ["Hook tweet kuat yang memancing kutipan (quote) atau balasan.", "Alt text untuk media. Paling banyak 1-2 kata kunci atau tagar yang sedang tren."],
    fields: [
      { key: "hookTweet", label: "Hook tweet", kind: "text", ask: "tweet pembuka, maksimal 280 karakter", maxChars: 280 },
      { key: "altText", label: "Alt text media", kind: "text", ask: "deskripsi media untuk pembaca layar", maxChars: 400 },
      { key: "keywords", label: "Kata kunci / tagar (maks. 2)", kind: "hashtags", ask: "1-2 kata kunci atau tagar", items: [1, 2] },
    ],
  },
  linkedin: {
    label: "LinkedIn",
    brief: ["Hook dua baris (orang harus mengklik untuk membuka selengkapnya).", "Isi memakai struktur wawasan profesional: Masalah, Wawasan, Langkah yang bisa dilakukan.", "Tepat 3 tagar industri."],
    fields: [
      { key: "hook", label: "Hook (2 baris)", kind: "text", ask: "dua baris pembuka", maxChars: 220 },
      { key: "body", label: "Isi (Masalah - Wawasan - Langkah)", kind: "text", ask: "isi post dengan struktur Masalah, Wawasan, Langkah nyata", words: [60, 300] },
      { key: "hashtags", label: "Tagar industri (3)", kind: "hashtags", ask: "tepat 3 tagar industri", items: [3, 3] },
    ],
  },
};

/** Tags that only add noise: never kept, on any platform. */
const BANNED_TAGS = new Set(["fyp", "foryou", "foryoupage", "fy", "xyzbca", "fypシ", "fypage"]);

export type SeoInput = {
  topic: string;
  /** The script (what is said in the video). */
  transcript: string;
  platform: SeoPlatform;
  audience: string;
  /** Trends or season the creator names; the model has no live trend data of its own. */
  trends: string;
};

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
export const TRANSCRIPT_LIMIT = 6000;

export function seoPrompt(i: SeoInput): string {
  const spec = SPECS[i.platform];
  const keys = spec.fields.map(f => `    "${f.key}": ${f.kind === "text" ? "\"...\"" : "[\"...\"]"}`);
  return [
    "PERAN: Kamu mesin SEO dan distribusi konten untuk media sosial. Analisis skrip video berikut lalu tulis paket optimasi untuk SATU platform.",
    "",
    "DATA MASUKAN:",
    `- Niche/Topik: ${clip(i.topic, 160) || "(tidak diisi; simpulkan dari skrip)"}`,
    `- Target platform: ${spec.label}`,
    `- Target audiens dan lokasi: ${clip(i.audience, 200) || "(tidak diisi; anggap pemirsa umum Indonesia)"}`,
    `- Konteks/tren terkini (dari pengguna): ${clip(i.trends, 300) || "(tidak diisi)"}`,
    `- Ringkasan video / transkrip:\n"""\n${i.transcript.replace(/"""/g, '"').trim().slice(0, TRANSCRIPT_LIMIT)}\n"""`,
    "",
    `PANDUAN ${spec.label.toUpperCase()}:`,
    ...spec.brief.map(b => `- ${b}`),
    "",
    "ATURAN KEJUJURAN:",
    "- Pakai hanya fakta yang ada di skrip. Jangan mengarang angka, klaim, testimoni, nama, atau hasil.",
    "- Kamu tidak punya data tren waktu nyata. Untuk unsur tren, pakai HANYA teks 'Konteks/tren' dari pengguna; bila kosong, gunakan topik evergreen dan jangan menyebut sesuatu 'sedang viral'.",
    "- Hindari janji hasil berlebihan (terutama kesehatan, keuangan, dan penghasilan). Tulis dalam bahasa yang sama dengan skrip.",
    "",
    "FORMAT: balas hanya JSON dengan bentuk:",
    "{",
    ...spec.fields.map((f, n) => `${keys[n]},${"  // " + f.ask}`),
    "    \"seoReadinessScore\": 1-100,",
    "    \"quickFix\": \"satu catatan perbaikan cepat jika retensi berpotensi turun\"",
    "}",
    "Nilai seoReadinessScore harus jujur: kurangi bila kata kunci utama tidak muncul di hook, caption terlalu umum, atau skrip lemah di 3 detik pertama.",
  ].join("\n");
}

export type SeoCard = { key: string; label: string; kind: FieldKind; value: string | string[] };
export type SeoCheck = { ok: boolean; message: string };
export type SeoResult = {
  platform: SeoPlatform;
  cards: SeoCard[];
  /** What the platform rules checked here allow: failed checks lower the score. */
  checks: SeoCheck[];
  /** The model's own score and the score shown (lowered by failed rule checks). */
  modelScore: number;
  score: number;
  quickFix: string;
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const cleanText = (v: unknown, max = 4000): string => (typeof v === "string" ? v : "")
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** "#Nama Baik!" → "#NamaBaik"; null when nothing usable is left or the tag is one of the noise tags. */
export function normalizeTag(raw: string): string | null {
  const core = raw.replace(/^#+/, "").normalize("NFKC").replace(/[^\p{L}\p{N}_]/gu, "");
  if (!core || core.length > 40 || /^\d+$/.test(core)) return null;
  if (BANNED_TAGS.has(core.toLowerCase())) return null;
  return "#" + core;
}

function tagsOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,]+/) : [];
  const seen = new Set<string>(), out: string[] = [];
  for (const item of list) {
    const tag = typeof item === "string" ? normalizeTag(item) : null;
    if (tag && !seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); out.push(tag); }
  }
  return out;
}

/**
 * Reads the model's answer for `platform`: cleans every field, enforces the hard limits that can be enforced without changing
 * meaning (tags are normalised, noise tags and extra tags are dropped), and records a check for every rule so the creator sees
 * what holds and what does not. Text is never silently cut: a too-long title is reported, not truncated.
 */
export function parseSeo(response: unknown, platform: SeoPlatform): SeoResult {
  const json = answerJson(response);
  const obj = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : null;
  if (!obj) throw new GeminiError("format", "Jawaban AI tidak berisi paket SEO. Coba lagi.");
  const spec = SPECS[platform];
  const cards: SeoCard[] = [], checks: SeoCheck[] = [];
  let filled = 0;
  for (const f of spec.fields) {
    let value: string | string[];
    if (f.kind === "text") {
      const t = cleanText(obj[f.key]);
      value = t;
      if (t) filled++;
      checks.push({ ok: t.length > 0, message: `${f.label}: ${t ? "terisi" : "kosong"}` });
      if (t && f.maxChars !== undefined) checks.push({ ok: t.length <= f.maxChars, message: `${f.label}: ${t.length} karakter (batas ${f.maxChars})` });
      if (t && f.words) { const n = words(t); checks.push({ ok: n >= f.words[0] && n <= f.words[1], message: `${f.label}: ${n} kata (seharusnya ${f.words[0]}-${f.words[1]})` }); }
    } else if (f.kind === "hashtags") {
      let tags = tagsOf(obj[f.key]);
      const max = f.items?.[1] ?? 5;
      const dropped = tags.length - Math.min(tags.length, max);
      tags = tags.slice(0, max);
      value = tags;
      if (tags.length) filled++;
      const [lo, hi] = f.items ?? [1, max];
      checks.push({ ok: tags.length >= lo && tags.length <= hi, message: `${f.label}: ${tags.length} tagar (seharusnya ${lo === hi ? lo : `${lo}-${hi}`})${dropped > 0 ? `; ${dropped} kelebihan dibuang` : ""}` });
    } else {
      const raw = Array.isArray(obj[f.key]) ? obj[f.key] as unknown[] : typeof obj[f.key] === "string" ? String(obj[f.key]).split(/\n|;/) : [];
      const list = raw.map(x => cleanText(x, 120)).filter(Boolean).slice(0, f.items?.[1] ?? 5);
      value = list;
      if (list.length) filled++;
      const [lo, hi] = f.items ?? [1, 5];
      checks.push({ ok: list.length >= lo && list.length <= hi, message: `${f.label}: ${list.length} butir (seharusnya ${lo === hi ? lo : `${lo}-${hi}`})` });
    }
    cards.push({ key: f.key, label: f.label, kind: f.kind, value });
  }
  if (filled === 0) throw new GeminiError("format", "AI tidak memberi paket SEO yang bisa dipakai. Coba lagi.");

  // Platform rules that need the text itself.
  const text = (key: string) => { const c = cards.find(x => x.key === key); return typeof c?.value === "string" ? c.value : ""; };
  if (platform === "instagram") {
    const first = text("caption").split("\n").find(l => l.trim()) ?? "";
    if (first) checks.push({ ok: first.length <= 125, message: `Caption: baris pertama ${first.length} karakter (agar tidak terpotong sebelum 'more', maks. 125)` });
    const cap = text("caption").toLowerCase();
    if (cap) checks.push({ ok: /(simpan|save)/.test(cap) && /(bagikan|share|kirim)/.test(cap), message: "Caption: CTA memicu Simpan dan Bagikan" });
  }
  if (platform === "linkedin") {
    const hook = text("hook");
    if (hook) checks.push({ ok: hook.split("\n").filter(l => l.trim()).length <= 2, message: "Hook: dua baris" });
  }
  if (platform === "x") {
    const t = text("hookTweet");
    if (t) checks.push({ ok: t.length <= 280, message: `Tweet: ${t.length}/280 karakter` });
  }

  const failed = checks.filter(c => !c.ok).length;
  const rawScore = Number(obj.seoReadinessScore);
  const modelScore = Number.isFinite(rawScore) ? Math.min(100, Math.max(1, Math.round(rawScore))) : 60;
  const score = Math.max(1, Math.min(modelScore, 100 - failed * 8));
  const quickFix = cleanText(obj.quickFix, 400) || (failed ? checks.find(c => !c.ok)!.message : "Tidak ada catatan perbaikan dari AI.");
  return { platform, cards, checks, modelScore, score, quickFix };
}

/** All cards as plain text, ready to paste or save. */
export function seoToText(r: SeoResult): string {
  const body = r.cards.map(c => `${c.label}\n${Array.isArray(c.value) ? c.value.join(c.kind === "hashtags" ? " " : "\n") : c.value}`);
  return [`${SPECS[r.platform].label}: paket SEO`, ...body, `Skor kesiapan SEO: ${r.score}/100`, `Perbaikan cepat: ${r.quickFix}`].join("\n\n");
}

/** The same as a JSON document (one key per element). */
export function seoToJson(r: SeoResult): string {
  const out: Record<string, unknown> = { platform: r.platform };
  for (const c of r.cards) out[c.key] = c.value;
  out.seoReadinessScore = r.score;
  out.quickFix = r.quickFix;
  return JSON.stringify(out, null, 2);
}

/** Why the pack cannot be made yet, or null. */
export function seoProblem(i: Pick<SeoInput, "transcript" | "platform">): string | null {
  if (!SEO_PLATFORMS.some(p => p.id === i.platform)) return "Pilih platform tujuan.";
  if (i.transcript.replace(/\s+/g, " ").trim().length < 20) return "Tulis naskah video dulu (minimal satu atau dua kalimat) agar AI punya bahan.";
  return null;
}

const schemaFor = (platform: SeoPlatform) => ({
  type: "OBJECT",
  properties: {
    ...Object.fromEntries(SPECS[platform].fields.map(f => [f.key, f.kind === "text" ? { type: "STRING" } : { type: "ARRAY", items: { type: "STRING" } }])),
    seoReadinessScore: { type: "INTEGER" },
    quickFix: { type: "STRING" },
  },
  required: [...SPECS[platform].fields.map(f => f.key), "seoReadinessScore", "quickFix"],
});

export async function makeSeoPack(input: SeoInput, o: CleanupOptions): Promise<SeoResult> {
  const problem = seoProblem(input);
  if (problem) throw new GeminiError("format", problem);
  return ask(o, [{ text: seoPrompt(input) }], schemaFor(input.platform), json => parseSeo(json, input.platform));
}

export const SEO_FIELD_KEYS = (platform: SeoPlatform) => SPECS[platform].fields.map(f => f.key);
