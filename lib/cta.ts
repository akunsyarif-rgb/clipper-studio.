// The closing call to action (CTA) of a clip: a short line burned into the last seconds of every Clipper export, written from
// what the video is about. Always available without an account or a key: a rule-based suggestion reads the transcript, hook and
// title and picks a line that fits the kind of content. The AI can write a better one on request (suggestion only; the creator
// can edit it). Pure (no DOM) so it is unit-tested; the picture itself is drawn by lib/cta-canvas.ts.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";
import { SAFE } from "./layout";
import type { TextMeasure } from "./watermark";

export type CtaSettings = {
  /** On by default: every Clipper export ends with a CTA unless the creator switches it off. */
  enabled: boolean;
  /** The creator's own line; empty = written automatically from each clip's content. */
  text: string;
};
export const DEFAULT_CTA: CtaSettings = { enabled: true, text: "" };
export const CTA_MAX_CHARS = 60;
/** A clip shorter than this ends without a CTA: it would cover most of the clip. */
export const CTA_MIN_CLIP_SECONDS = 3;

// Control characters, zero-width marks and line/paragraph separators (escapes keep the source plain ASCII).
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028\\u2029]", "g");

/** The line as it will be drawn: no control characters or line breaks, spaces collapsed, at most CTA_MAX_CHARS. */
export function cleanCtaText(raw: string): string {
  return String(raw ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, CTA_MAX_CHARS).trim();
}

export function normalizeCta(v: unknown): CtaSettings {
  const o = typeof v === "object" && v !== null ? v as Record<string, unknown> : {};
  return { enabled: o.enabled !== false, text: typeof o.text === "string" ? cleanCtaText(o.text) : "" };
}

const KEY = "clipper:cta:v1";
type ReadStore = Pick<Storage, "getItem">;
type WriteStore = Pick<Storage, "setItem">;
const local = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } };
/** Remembered on this device: "always" should still hold after a refresh. */
export function loadCta(storage: ReadStore | null = local()): CtaSettings {
  try { const raw = storage?.getItem(KEY); return raw ? normalizeCta(JSON.parse(raw)) : { ...DEFAULT_CTA }; } catch { return { ...DEFAULT_CTA }; }
}
export function saveCta(c: CtaSettings, storage: WriteStore | null = local()) {
  try { storage?.setItem(KEY, JSON.stringify(normalizeCta(c))); } catch { /* storage blocked: kept for this page only */ }
}

// ---- the rule-based suggestion ---------------------------------------------------------------------------------------------

export type CtaKind = "tips" | "story" | "product" | "inspire" | "facts" | "general";
type Lang = "id" | "en";

const ID_WORDS = new Set("yang dan di ini itu untuk dengan tidak aku kamu kita dia ada sudah akan bisa nggak gak banget jadi kalau karena atau dari ke pada saya anda mereka juga lagi aja".split(" "));
const EN_WORDS = new Set("the and is to of you this that it for with are was have not but they what your can will just so we".split(" "));

/** Indonesian unless the text is clearly English. */
export function detectLanguage(text: string): Lang {
  let id = 0, en = 0;
  for (const w of text.toLowerCase().match(/[a-z']+/g) ?? []) { if (ID_WORDS.has(w)) id++; if (EN_WORDS.has(w)) en++; }
  return en > id * 1.5 && en >= 3 ? "en" : "id";
}

const RULES: { kind: Exclude<CtaKind, "general">; words: string[] }[] = [
  { kind: "tips", words: ["cara", "tips", "tip", "trik", "langkah", "rahasia", "tutorial", "panduan", "belajar", "resep", "bahan", "how to", "step", "trick", "guide", "learn", "recipe", "hack"] },
  { kind: "product", words: ["review", "produk", "harga", "beli", "diskon", "promo", "shopee", "tokopedia", "kualitas", "murah", "garansi", "checkout", "product", "price", "buy", "discount", "sale", "worth it"] },
  { kind: "story", words: ["lucu", "ngakak", "kocak", "komedi", "prank", "kejadian", "cerita", "pengalaman", "waktu itu", "dulu", "tiba-tiba", "ternyata", "funny", "story", "happened", "joke", "hilarious"] },
  { kind: "inspire", words: ["motivasi", "sabar", "sukses", "bersyukur", "nasihat", "inspirasi", "doa", "iman", "ikhlas", "semangat", "mimpi", "gagal", "bangkit", "motivation", "inspire", "dream", "grateful", "believe"] },
  { kind: "facts", words: ["fakta", "tahukah", "penelitian", "data", "berita", "sejarah", "ilmuwan", "studi", "terbukti", "persen", "fact", "research", "study", "history", "science", "proven"] },
];

const LINES: Record<Lang, Record<CtaKind, string[]>> = {
  id: {
    tips: ["Simpan video ini biar nggak lupa", "Simpan dulu, praktikkan nanti", "Coba sekarang, lalu simpan tipsnya"],
    story: ["Follow untuk cerita berikutnya", "Mau lanjutannya? Follow dulu", "Tag temanmu yang begini"],
    product: ["Cek link di bio sebelum kehabisan", "Detail dan harga ada di bio", "Tanya di komentar, kami jawab"],
    inspire: ["Bagikan ke yang membutuhkan", "Simpan sebagai pengingat", "Kirim ke orang yang kamu sayang"],
    facts: ["Follow untuk fakta menarik lainnya", "Bagikan biar mereka juga tahu", "Menurutmu bagaimana? Tulis di komentar"],
    general: ["Follow untuk konten seru lainnya", "Suka videonya? Follow untuk yang berikutnya", "Tulis pendapatmu di komentar"],
  },
  en: {
    tips: ["Save this so you don't forget", "Save it now, try it later", "Try it today, then save the tips"],
    story: ["Follow for the next story", "Want part two? Follow now", "Tag a friend who's like this"],
    product: ["Check the link in bio before it sells out", "Details and price in bio", "Ask in the comments"],
    inspire: ["Share it with someone who needs it", "Save this as a reminder", "Send it to someone you care about"],
    facts: ["Follow for more facts like this", "Share it so they know too", "What do you think? Tell us below"],
    general: ["Follow for more videos like this", "Liked it? Follow for the next one", "Share your thoughts in the comments"],
  },
};

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };

/**
 * A CTA that fits what the clip is about, from the words of its transcript, hook and title. Deterministic: the same content
 * always gives the same line. Never empty: content that matches nothing gets a general line.
 */
export function suggestCta(content: { text?: string; title?: string; hook?: string }): { text: string; kind: CtaKind; language: Lang } {
  const all = [content.title, content.hook, content.text].filter(Boolean).join(" ").toLowerCase();
  const language = detectLanguage(all);
  const padded = " " + all.replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ") + " ";
  let best: CtaKind = "general", bestScore = 0;
  for (const r of RULES) {
    const score = r.words.reduce((s, w) => s + (padded.split(` ${w}`).length - 1), 0);
    if (score > bestScore) { best = r.kind; bestScore = score; }
  }
  const lines = LINES[language][best];
  return { text: lines[hash(all) % lines.length], kind: best, language };
}

/** The line to burn in: the creator's own when there is one, else the suggestion for this clip's content. */
export function resolveCta(settings: CtaSettings, content: { text?: string; title?: string; hook?: string }): string | null {
  if (!settings.enabled) return null;
  return cleanCtaText(settings.text) || suggestCta(content).text;
}

// ---- when it shows and where it sits ---------------------------------------------------------------------------------------

export type CtaTiming = { seconds: number; start: number; fade: number };
/** The CTA fills the last quarter of the clip (2 to 4 seconds) and fades in; none for a very short clip. */
export function ctaTiming(clipSeconds: number): CtaTiming | null {
  if (!Number.isFinite(clipSeconds) || clipSeconds < CTA_MIN_CLIP_SECONDS) return null;
  const seconds = Math.min(4, Math.max(2, clipSeconds * 0.25));
  return { seconds, start: Math.round((clipSeconds - seconds) * 1000) / 1000, fade: 0.4 };
}

export type CtaBox = { x: number; y: number; width: number; height: number; fontSize: number; lineHeight: number; lines: string[]; padX: number; padY: number; radius: number };

/**
 * A rounded label with the text in at most two lines, centred above the platform's own description area (9:16) or above a 8 %
 * bottom margin (other shapes), and above a watermark that sits at the bottom (`clearBottom` = space it takes).
 */
export function ctaBox(rawText: string, frame: { width: number; height: number }, measure: TextMeasure, clearBottom = 0): CtaBox {
  const text = cleanCtaText(rawText);
  const portrait = frame.height / frame.width > 1.5;
  const scale = frame.width / 1080;
  const maxTextWidth = frame.width * 0.84 - 2 * frame.width * 0.04;
  let fontSize = Math.max(18, frame.width * 0.05);
  const per100 = (s: string) => Math.max(1, measure(s)) / 100;
  const widthAt = (s: string, size: number) => per100(s) * size;

  // Greedy wrap into at most two lines; shrink the text until the longest line fits.
  const wrap = (size: number): string[] => {
    if (widthAt(text, size) <= maxTextWidth) return [text];
    const words = text.split(" ");
    let best: string[] = [text], bestWidest = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const widest = Math.max(widthAt(a, size), widthAt(b, size));
      if (widest < bestWidest) { best = [a, b]; bestWidest = widest; }
    }
    return best;
  };
  let lines = wrap(fontSize);
  for (let guard = 0; guard < 40 && Math.max(...lines.map(l => widthAt(l, fontSize))) > maxTextWidth && fontSize > 12; guard++) { fontSize *= 0.94; lines = wrap(fontSize); }
  fontSize = Math.round(fontSize * 10) / 10;

  const lineHeight = Math.ceil(fontSize * 1.25);
  const padX = Math.ceil(fontSize * 0.85), padY = Math.ceil(fontSize * 0.55);
  const width = Math.ceil(Math.max(...lines.map(l => widthAt(l, fontSize))) + padX * 2);
  const height = lineHeight * lines.length + padY * 2;
  const bottomClear = Math.max(portrait ? (SAFE.bottom + 30) * scale : frame.height * 0.08, clearBottom);
  return {
    x: Math.floor((frame.width - width) / 2),
    y: Math.max(0, Math.floor(frame.height - bottomClear - height)),
    width, height, fontSize, lineHeight, lines, padX, padY, radius: Math.round(Math.min(height / 2, fontSize * 0.9)),
  };
}

// ---- the AI's version (on request) ------------------------------------------------------------------------------------------

const LANG_NAME = { id: "Indonesia", en: "Inggris" } as const;

export function ctaPrompt(text: string, language: Lang): string {
  return [
    `Kamu penulis teks untuk video pendek (TikTok, Reels, Shorts). Tulis SATU ajakan bertindak (CTA) penutup dalam bahasa ${LANG_NAME[language]} untuk klip berikut.`,
    "Aturan:",
    "- maksimal 8 kata dan 55 karakter, kalimat perintah atau ajakan yang ramah;",
    "- sesuai topik klip, supaya penonton tahu apa yang diperoleh jika mengikuti (mis. tips berikutnya, bagian lanjutan);",
    "- jangan menjanjikan sesuatu yang tidak ada (harga, hadiah, angka, nama, tautan);",
    "- tanpa tagar, tanpa emoji, tanpa tanda kutip.",
    "Balas hanya JSON: {\"cta\": \"...\"}.",
    "",
    "Isi klip:",
    text.replace(/\s+/g, " ").trim().slice(0, 4000),
  ].join("\n");
}

export function parseCta(response: unknown): string {
  const p = answerJson(response) as { cta?: unknown } | null;
  const text = cleanCtaText(String(p?.cta ?? "").replace(/#\S+/g, "").replace(/\p{Extended_Pictographic}/gu, "")).replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (!text) throw new GeminiError("format", "Jawaban tidak berisi teks ajakan. Coba lagi.");
  return text;
}

const CTA_SCHEMA = { type: "OBJECT", properties: { cta: { type: "STRING" } }, required: ["cta"] };

/** One CTA written by the AI from the clip's text (only the text is sent). The creator reviews it before it is used. */
export async function writeCta(text: string, o: CleanupOptions): Promise<string> {
  if (!text.trim()) throw new GeminiError("format", "Tidak ada teks isi video untuk dibuatkan ajakan.");
  const language = o.language === "en" ? "en" : "id";
  return ask(o, [{ text: ctaPrompt(text, language) }], CTA_SCHEMA, parseCta);
}
