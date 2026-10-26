// Turns digits into words before text-to-speech: the model reads "1.300" as "satu 300" and "17.000" as
// "17 ... 000". Only the spoken text changes; the screen keeps the digits. Indonesian and English.
import type { TtsLang } from "./supertonic";

const ID_UNITS = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
const EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function idUnder1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h === 1) parts.push("seratus"); else if (h > 1) parts.push(`${ID_UNITS[h]} ratus`);
  if (r === 10) parts.push("sepuluh");
  else if (r === 11) parts.push("sebelas");
  else if (r > 11 && r < 20) parts.push(`${ID_UNITS[r - 10]} belas`);
  else if (r >= 20) { parts.push(`${ID_UNITS[Math.floor(r / 10)]} puluh`); if (r % 10) parts.push(ID_UNITS[r % 10]); }
  else if (r > 0) parts.push(ID_UNITS[r]);
  return parts.join(" ");
}

function enUnder1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${EN_UNITS[h]} hundred`);
  if (r < 20 && r > 0) parts.push(EN_UNITS[r]);
  else if (r >= 20) parts.push(EN_TENS[Math.floor(r / 10)] + (r % 10 ? ` ${EN_UNITS[r % 10]}` : ""));
  return parts.join(" ");
}

const ID_SCALES: [number, string][] = [[1e12, "triliun"], [1e9, "miliar"], [1e6, "juta"], [1e3, "ribu"]];
const EN_SCALES: [number, string][] = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];

/** Whole number to words. Supports up to 999 trillion; larger values are read digit by digit. */
export function intToWords(n: number, lang: TtsLang): string {
  if (!Number.isInteger(n) || n < 0) throw new Error("intToWords expects a non-negative integer");
  if (n >= 1e15) return String(n).split("").map(d => (lang === "id" ? ID_UNITS : EN_UNITS)[Number(d)]).join(" ");
  if (n === 0) return lang === "id" ? ID_UNITS[0] : EN_UNITS[0];
  let rest = n;
  const parts: string[] = [];
  for (const [size, name] of lang === "id" ? ID_SCALES : EN_SCALES) {
    const g = Math.floor(rest / size);
    if (!g) continue;
    rest -= g * size;
    // Indonesian says "seribu", not "satu ribu"; every other scale keeps "satu" ("satu juta").
    parts.push(lang === "id" && size === 1e3 && g === 1 ? "seribu" : `${lang === "id" ? idUnder1000(g) : enUnder1000(g)} ${name}`);
  }
  if (rest) parts.push(lang === "id" ? idUnder1000(rest) : enUnder1000(rest));
  return parts.join(" ");
}

function digitsToWords(digits: string, lang: TtsLang): string {
  return digits.split("").map(d => (lang === "id" ? ID_UNITS : EN_UNITS)[Number(d)]).join(" ");
}

type Parsed = { integer: string; fraction: string };

/**
 * Splits a numeric token into integer and fraction digits. Indonesian groups thousands with "." and uses ","
 * for decimals; English is the opposite.
 *  - Both marks present: the last one is the decimal mark ("1.234,5" id, "1,234.5" en).
 *  - Only the language's decimal mark: a decimal ("4,5" id, "3.5" en); repeated marks are read as groups.
 *  - Only the language's group mark: groups of exactly three digits are thousands ("17.000", "1.234.567" id;
 *    "1,300" en). Anything else is a decimal ("3.5" written in Indonesian), and "0.5" is always a decimal.
 */
export function parseNumberToken(raw: string, lang: TtsLang): Parsed {
  const group = lang === "id" ? "." : ",";
  const dec = lang === "id" ? "," : ".";
  const hasGroup = raw.includes(group), hasDec = raw.includes(dec);
  const split = (s: string, mark: string): Parsed => { const i = s.lastIndexOf(mark); return { integer: s.slice(0, i), fraction: s.slice(i + 1) }; };
  let out: Parsed;
  if (hasGroup && hasDec) {
    const p = split(raw, dec);
    out = { integer: p.integer.split(group).join(""), fraction: p.fraction };
  } else if (hasDec) {
    out = raw.split(dec).length === 2 ? split(raw, dec) : { integer: raw.split(dec).join(""), fraction: "" };
  } else if (hasGroup) {
    const parts = raw.split(group);
    const grouped = parts[0] !== "0" && parts[0].length <= 3 && parts.slice(1).every(x => x.length === 3);
    out = grouped || parts.length > 2 ? { integer: parts.join(""), fraction: "" } : { integer: parts[0], fraction: parts[1] };
  } else out = { integer: raw, fraction: "" };
  return { integer: out.integer || "0", fraction: out.fraction };
}

function numberWords(raw: string, lang: TtsLang): string {
  const { integer, fraction } = parseNumberToken(raw, lang);
  // Leading zeros without separators ("007", phone numbers) and very long digit runs are read digit by digit.
  if ((integer.length > 1 && integer.startsWith("0")) || integer.length > 15) return digitsToWords(integer + fraction, lang);
  let out = intToWords(Number(integer), lang);
  if (fraction) out += ` ${lang === "id" ? "koma" : "point"} ${digitsToWords(fraction, lang)}`;
  return out;
}

const UNIT_WORDS: Record<string, { id: string; en: string }> = {
  "%": { id: "persen", en: "percent" }, persen: { id: "persen", en: "percent" }, percent: { id: "persen", en: "percent" },
  x: { id: "kali", en: "times" }, "×": { id: "kali", en: "times" },
  jt: { id: "juta", en: "million" }, rb: { id: "ribu", en: "thousand" }, k: { id: "ribu", en: "thousand" },
};

/**
 * Replaces digits in text with the words a speaker would say. Handles grouped numbers ("17.000"), decimals,
 * percent, multipliers ("3x"), money ("Rp 50.000", "$1,200"), k/rb/jt suffixes, ranges ("2020-2024") and years.
 */
export function spokenText(text: string, lang: TtsLang): string {
  let t = text;
  // "2020-2024" and "10 - 20" read as ranges.
  t = t.replace(/(\d)\s*[–—-]\s*(?=\d)/g, `$1 ${lang === "id" ? "sampai" : "to"} `);
  const money = /(?<![\p{L}\d])(rp\.?|idr|\$|usd|€|eur)\s?(\d[\d.,]*\d|\d)(?:\s?(jt|juta|rb|ribu|k|million|thousand|billion|miliar)\b)?/giu;
  t = t.replace(money, (_m, cur: string, num: string, scale?: string) => {
    const c = cur.toLowerCase().replace(".", "");
    const words = numberWords(num, lang) + (scale ? ` ${scaleWord(scale, lang)}` : "");
    if (c === "rp" || c === "idr") return `${words} rupiah`;
    if (c === "€" || c === "eur") return `${words} ${lang === "id" ? "euro" : "euros"}`;
    return `${words} ${lang === "id" ? "dolar" : Number(parseNumberToken(num, lang).integer) === 1 && !scale ? "dollar" : "dollars"}`;
  });
  const plain = /(?<![\p{L}\d])(\d[\d.,]*\d|\d)(?:\s?(%|persen\b|percent\b|x\b|×|jt\b|rb\b|k\b))?(?![\p{L}\d])/giu;
  t = t.replace(plain, (_m, num: string, unit?: string) => {
    const base = numberWords(num, lang);
    if (!unit) return base;
    const u = UNIT_WORDS[unit.toLowerCase()];
    return u ? `${base} ${u[lang]}` : base;
  });
  return t;
}

function scaleWord(scale: string, lang: TtsLang): string {
  const k = scale.toLowerCase();
  const map: Record<string, [string, string]> = {
    jt: ["juta", "million"], juta: ["juta", "million"], million: ["juta", "million"],
    rb: ["ribu", "thousand"], ribu: ["ribu", "thousand"], k: ["ribu", "thousand"], thousand: ["ribu", "thousand"],
    billion: ["miliar", "billion"], miliar: ["miliar", "billion"],
  };
  return (map[k] ?? [scale, scale])[lang === "id" ? 0 : 1];
}
