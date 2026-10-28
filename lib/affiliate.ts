// Affiliate mode: a script written by the AI only from the product facts the creator typed in, and a claim guard that
// checks any script (the AI's or the creator's own) against those facts. Pure: the app supplies the AI transport.
//
// The guard is a deterministic checklist, not a legal opinion: it flags wording that platforms and consumer rules commonly
// object to (health cures, "best/number 1", guarantees, invented prices, promos, scarcity, testimonials, comparisons,
// certificates) unless the creator's own product data says the same thing. It never blocks anything; it points at the
// sentence and says why, so the creator decides.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";

export type PlatformId = "tiktok" | "shopee" | "tokopedia" | "lazada" | "other";
export const PLATFORMS: { id: PlatformId; label: string; cta: string }[] = [
  { id: "tiktok", label: "TikTok Shop", cta: "Cek keranjang kuning" },
  { id: "shopee", label: "Shopee", cta: "Cek link di profil" },
  { id: "tokopedia", label: "Tokopedia", cta: "Cek link di profil" },
  { id: "lazada", label: "Lazada", cta: "Cek link di profil" },
  { id: "other", label: "Lainnya", cta: "Cek link di profil" },
];
export type Tone = "santai" | "tegas" | "edukatif";
export const TONES: { id: Tone; label: string }[] = [
  { id: "santai", label: "Santai, seperti cerita ke teman" },
  { id: "tegas", label: "Tegas dan cepat" },
  { id: "edukatif", label: "Edukatif, menjelaskan" },
];

export type AffiliateBrief = {
  product: string;
  price: string;
  promo: string;
  platform: PlatformId;
  /** One real benefit or fact per entry (1–8). These are the only claims the script may make. */
  benefits: string[];
  audience: string;
  tone: Tone;
};

export const EMPTY_BRIEF: AffiliateBrief = { product: "", price: "", promo: "", platform: "tiktok", benefits: [], audience: "", tone: "santai" };
export const MAX_BENEFITS = 8;

/** The benefit box (one per line, bullets allowed) as a list. */
export function parseBenefits(text: string): string[] {
  return text.split(/\n+/).map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, MAX_BENEFITS);
}

/** What is missing or too long, in Indonesian, or null when the brief can be used. */
export function validateBrief(b: AffiliateBrief): string | null {
  if (b.product.trim().length < 2) return "Isi nama produk.";
  if (b.product.length > 80) return "Nama produk terlalu panjang (maks. 80 huruf).";
  if (b.benefits.length === 0) return "Isi minimal satu manfaat atau fakta nyata tentang produk (satu per baris).";
  if (b.benefits.some(x => x.length > 120)) return "Satu manfaat terlalu panjang (maks. 120 huruf). Pecah jadi dua baris.";
  if (b.price.length > 40 || b.promo.length > 80 || b.audience.length > 80) return "Harga, promo, atau target penonton terlalu panjang.";
  return null;
}

const platformOf = (id: PlatformId) => PLATFORMS.find(p => p.id === id) ?? PLATFORMS[0];

export function affiliatePrompt(b: AffiliateBrief, feedback?: string): string {
  const platform = platformOf(b.platform);
  const tone = TONES.find(t => t.id === b.tone)?.label ?? "";
  const facts = {
    produk: b.product.trim(),
    ...(b.price.trim() ? { harga: b.price.trim() } : {}),
    ...(b.promo.trim() ? { promo: b.promo.trim() } : {}),
    platform: platform.label,
    ...(b.audience.trim() ? { target_penonton: b.audience.trim() } : {}),
    manfaat_dan_fakta: b.benefits,
  };
  return [
    "Kamu penulis naskah video pendek vertikal (TikTok/Reels) untuk konten affiliate, dalam bahasa Indonesia. Tulis naskah HANYA dari DATA PRODUK di bawah.",
    "",
    "Aturan keras:",
    "1. Jangan menambah fakta, angka, harga, promo, bahan, sertifikat, testimoni, atau perbandingan yang tidak ada di data. Jika data kurang, tulis lebih sedikit kalimat; jangan mengarang.",
    "2. Jangan klaim kesehatan, kecantikan, atau penyembuhan; jangan \"terbaik/nomor 1/paling\"; jangan \"dijamin/pasti/100%\"; jangan stok atau waktu terbatas kecuali tertulis di data.",
    "3. Struktur: kalimat 1 = hook (maks. 12 kata, memancing, memakai satu masalah atau manfaat nyata dari data) -> masalah penonton -> 2 sampai 3 manfaat (satu per kalimat, dari data) -> harga/promo (hanya bila ada di data) -> ajakan sesuai platform (mis. \"" + platform.cta + "\").",
    `4. 6 sampai 10 kalimat, satu kalimat per baris, maks. 110 karakter, bahasa lisan. Gaya: ${tone}. Boleh menandai satu kata kunci per kalimat dengan *tanda bintang*.`,
    "5. Beri juga judul pendek (maks. 40 karakter) tanpa klaim.",
    feedback?.trim() ? `\nMasukan pembuat video tentang naskah sebelumnya (utamakan, tanpa melanggar aturan di atas): "${feedback.replace(/\s+/g, " ").trim().slice(0, 300)}"` : "",
    "",
    "Balas hanya JSON: {\"title\":\"...\",\"lines\":[\"kalimat 1\",\"kalimat 2\"]}.",
    "",
    "DATA PRODUK (JSON):",
    JSON.stringify(facts),
  ].filter(l => l !== "").join("\n");
}

export type AffiliateScript = { title: string; lines: string[] };

const cleanLine = (s: unknown) => String(s ?? "").replace(/\*\*/g, "").replace(/^\s*(?:[-•·]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim().slice(0, 200);

export function parseAffiliate(response: unknown): AffiliateScript {
  const json = answerJson(response) as { title?: unknown; lines?: unknown; script?: unknown } | unknown[] | null;
  const raw = Array.isArray(json) ? json : (json as { lines?: unknown } | null)?.lines;
  const list = Array.isArray(raw) ? raw : typeof (json as { script?: unknown } | null)?.script === "string" ? String((json as { script: string }).script).split(/\n+/) : null;
  if (!list) throw new GeminiError("format", "Jawaban AI tidak berisi naskah. Coba lagi.");
  const lines = list.map(cleanLine).filter(Boolean).slice(0, 14);
  if (lines.length < 2) throw new GeminiError("format", "AI tidak memberi naskah yang bisa dipakai (terlalu pendek). Coba lagi.");
  const title = Array.isArray(json) ? "" : cleanLine((json as { title?: unknown } | null)?.title).slice(0, 60);
  return { title, lines };
}

/** Writes the script with the creator's own AI key. Only the product facts typed in are sent. */
export async function writeAffiliateScript(b: AffiliateBrief, o: CleanupOptions, feedback?: string): Promise<AffiliateScript> {
  const problem = validateBrief(b);
  if (problem) throw new GeminiError("format", problem);
  const schema = { type: "OBJECT", properties: { title: { type: "STRING" }, lines: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title", "lines"] };
  return ask(o, [{ text: affiliatePrompt(b, feedback) }], schema, parseAffiliate);
}

// ---- the claim guard -----------------------------------------------------------------------------------------------

export type ClaimKind = "kesehatan" | "superlatif" | "jaminan" | "terbatas" | "bukti" | "perbandingan" | "izin" | "promo" | "angka";
export type ClaimFinding = { line: number; text: string; match: string; kind: ClaimKind; reason: string };

type Rule = { kind: ClaimKind; re: RegExp; reason: string; /** The creator's own data cannot clear it (health claims need real approval, not a typed sentence). */ always?: boolean };

const RULES: Rule[] = [
  { kind: "kesehatan", always: true, reason: "Klaim kesehatan/kecantikan seperti ini dilarang tanpa izin edar dan bukti (BPOM, aturan platform).",
    re: /\b(menyembuhkan|sembuh|mengobati|obat|terapi|anti\s*kanker|menghilangkan\s+(?:penyakit|kanker|diabetes|jerawat|flek|keriput|uban|ketombe|lemak|selulit|bekas)|memutihkan|pemutih|pelangsing|melangsingkan|menurunkan\s+berat\s+badan|turun\s+\d+\s*kg|detoks|detox|kolesterol|tekanan\s+darah|asam\s+urat|hipertensi|diabetes|kanker)\b/giu },
  { kind: "superlatif", reason: "Klaim \"terbaik/nomor 1/paling\" tidak bisa dibuktikan.",
    re: /\b(nomor\s*(?:1|satu)|no\.?\s*1|terbaik|paling\s+(?:murah|bagus|ampuh|laris|aman|awet|worth\s+it)|termurah|terlaris|satu-satunya|tiada\s+tanding|juara)\b/giu },
  { kind: "jaminan", reason: "Janji/jaminan hasil tidak boleh dibuat kecuali ada di data produk.",
    re: /(?:\b(?:seratus\s+persen|dijamin|garansi|uang\s+kembali|money\s*back|bisa\s+retur|pasti|tanpa\s+efek\s+samping|aman\s+untuk\s+semua|permanen|selamanya|tuntas|ampuh)\b|\b100\s*%)/giu },
  { kind: "terbatas", reason: "Stok atau waktu terbatas harus benar; ini tidak ada di data Anda.",
    re: /\b(stok\s+(?:terbatas|tinggal|menipis)|tinggal\s+\d+|hanya\s+hari\s+ini|hari\s+ini\s+saja|promo\s+(?:berakhir|hampir\s+habis)|segera\s+habis|sebelum\s+kehabisan|kehabisan|flash\s*sale|limited)\b/giu },
  { kind: "bukti", reason: "Bukti sosial atau rekomendasi ahli tidak ada di data Anda dan tidak bisa diverifikasi.",
    re: /\b(?:(?:ribuan|jutaan|ratusan)\s+(?:orang|pelanggan|pembeli|customer|reviewer)|sudah\s+terjual|terjual\s+(?:ribuan|jutaan|\d+)|viral|banyak\s+(?:yang\s+)?(?:suka|beli|puas|membuktikan)|rating\s+\d|bintang\s+(?:5|lima)|review\s+(?:positif|bagus)|testimoni|terbukti|teruji|diakui|(?:direkomendasikan|rekomendasi)\s+(?:dokter|ahli)|kata\s+(?:dokter|ahli|para\s+ahli))\b/giu },
  { kind: "perbandingan", reason: "Membandingkan dengan merek lain tidak ada di data Anda.",
    re: /\b(lebih\s+(?:baik|bagus|murah|ampuh|awet)\s+(?:dari|daripada|dibanding)|dibanding(?:kan)?\s+(?:merek|produk|brand)\s+lain|tidak\s+ada\s+yang\s+(?:menandingi|mengalahkan)|mengalahkan)\b/giu },
  { kind: "izin", reason: "Sertifikat/izin disebut tetapi tidak ada di data Anda. Sebut hanya bila benar dan ada buktinya.",
    re: /\b(bpom|halal|sni|izin\s+edar|bersertifikat|tersertifikasi|lulus\s+uji|klinis|dermatologis|telah\s+diuji)\b/giu },
  { kind: "promo", reason: "Promo/bonus disebut tetapi tidak ada di data Anda.",
    re: /\b(diskon|potongan\s+harga|cashback|gratis\s+ongkir|bonus|hadiah|giveaway|voucher|gratis)\b/giu },
];

/** A number as written in Indonesian ("89.000", "4,5", "89 ribu", "1,5 juta") as a plain value. */
export function numberValue(digits: string, unit?: string): number {
  const t = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(digits) ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(",", ".");
  let n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  const u = (unit ?? "").toLowerCase();
  if (/^(ribu|rb|k)$/.test(u)) n *= 1_000;
  else if (/^(juta|jt)$/.test(u)) n *= 1_000_000;
  return Math.round(n * 1000) / 1000;
}

const NUMBER = /(\d[\d.,]*\d|\d)(?:\s*(ribu|rb|juta|jt|k)\b)?(\s*%|\s*(?:persen|kg|gram|hari|minggu|bulan)\b)?/giu;

function numbersIn(text: string): { raw: string; value: number; unit: boolean }[] {
  const out: { raw: string; value: number; unit: boolean }[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const value = numberValue(m[1], m[2]);
    if (Number.isNaN(value)) continue;
    out.push({ raw: m[0].trim(), value, unit: !!m[3] || !!m[2] || /\brp\.?\s*$/i.test(text.slice(Math.max(0, (m.index ?? 0) - 4), m.index ?? 0)) });
  }
  return out;
}

const factsText = (b: AffiliateBrief) => [b.product, b.price, b.promo, b.audience, ...b.benefits].join(" \n ").toLowerCase().replace(/\s+/g, " ");

/**
 * Checks script lines against the product facts. A phrase is cleared when the creator's own data contains it (their
 * responsibility), except health claims. Numbers are cleared when the same value appears in the data; small plain counts
 * ("3 alasan") are ignored unless they carry a unit such as %, kg, hari or Rp.
 */
export function checkClaims(lines: string[], brief: AffiliateBrief): ClaimFinding[] {
  const facts = factsText(brief);
  const factValues = new Set(numbersIn(facts).map(n => n.value));
  const out: ClaimFinding[] = [];
  const seen = new Set<string>();
  const add = (f: ClaimFinding) => { const k = `${f.line}|${f.match.toLowerCase()}`; if (!seen.has(k)) { seen.add(k); out.push(f); } };
  lines.forEach((raw, line) => {
    const text = raw.replace(/\*/g, "").replace(/\s+/g, " ").trim();
    if (!text) return;
    for (const rule of RULES) {
      for (const m of text.matchAll(rule.re)) {
        const match = m[0];
        if (!rule.always && facts.includes(match.toLowerCase().replace(/\s+/g, " "))) continue;
        add({ line, text, match, kind: rule.kind, reason: rule.reason });
      }
    }
    for (const n of numbersIn(text)) {
      if (factValues.has(n.value)) continue;
      if (Number.isInteger(n.value) && n.value >= 1 && n.value <= 10 && !n.unit) continue;
      add({ line, text, match: n.raw, kind: "angka", reason: `Angka "${n.raw}" tidak ada di data produk yang Anda isi. Tulis di Harga/Promo/Manfaat bila benar.` });
    }
  });
  return out.sort((a, b) => a.line - b.line);
}

export const DISCLOSURE_NOTE = "Banyak platform (mis. TikTok) meminta konten promosi atau afiliasi ditandai sebagai iklan/konten berbayar saat Anda mengunggah. Periksa aturan platform Anda.";

// ---- product photo -------------------------------------------------------------------------------------------------

/** Words of the product's name that identify it in a sentence (4+ letters). */
export function productWords(product: string): string[] {
  return [...new Set(product.toLowerCase().normalize("NFKD").split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4))];
}

/** Indexes of the scenes that name the product (any word of its name), plus the last scene, where the buying prompt sits. */
export function scenesForProductPhoto(texts: string[], product: string): number[] {
  const words = productWords(product);
  const hit = new Set<number>();
  texts.forEach((t, i) => { const low = t.toLowerCase(); if (words.some(w => low.includes(w))) hit.add(i); });
  if (texts.length > 0) hit.add(texts.length - 1);
  return [...hit].sort((a, b) => a - b);
}

/** The script without line `index`. */
export function removeLine(script: string, index: number): string {
  return script.replace(/\r/g, "").split("\n").filter((_, i) => i !== index).join("\n");
}
