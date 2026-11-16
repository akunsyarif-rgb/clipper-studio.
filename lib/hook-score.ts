// Score of a spoken opening line ("hook"): five properties, 0-100 each, and a verdict that is 60% the mean and 40% the weakest one.
// The weakest-link weighting is deliberate: a hook with four strong properties and one dead one leaks at the dead one, and an
// average hides that. Pure and local: no AI, no network, nothing is sent anywhere.
//
// Structure and weights follow `hookscore.py` of the "youtube-agent-skill" pack (MIT, (c) 2026 Jake Schincariol, see
// docs/THIRD_PARTY_NOTICES.md). The word lists and the formula patterns are written again for Indonesian; they are NOT the
// English ones.
//
// WHAT THIS CAN AND CANNOT SAY. It is a heuristic, not a predictor. The original was measured on 74 English short-form hooks and
// separated deliberately bad hooks from real ones, but barely separated one creator's hits from the same creator's misses. This
// Indonesian version has not been calibrated against real results at all. A low score is a reason to look again; a high score is
// never a promise. The screen says so next to every score.

export type HookKey = "spesifik" | "menyapa" | "taruhan" | "penasaran" | "ringkas";
export type HookBand = "kuat" | "cukup" | "lemah";
export type HookScore = {
  text: string;
  words: number;
  properties: { key: HookKey; label: string; value: number }[];
  /** 60% of the mean of the five, 40% of the weakest. */
  verdict: number;
  band: HookBand;
  weakest: HookKey;
  /** What to change first: the fix for the weakest property. */
  fix: string;
  /** The opening formula the words match best (a hint about the shape, not a verdict), or null for a summary-like line. */
  formula: { id: string; name: string; hits: number } | null;
};

export const HOOK_LABEL: Record<HookKey, string> = { spesifik: "Spesifik", menyapa: "Menyapa penonton", taruhan: "Taruhan", penasaran: "Rasa penasaran", ringkas: "Ringkas" };
export const HOOK_FIX: Record<HookKey, string> = {
  spesifik: "ganti satu kata sifat dengan angka, nama, atau tanggal",
  menyapa: "sebut “kamu” dalam enam kata pertama",
  taruhan: "sebut apa yang hilang bila penonton terus melakukannya dengan cara sekarang",
  penasaran: "buang separuh kalimat yang sudah menjawab dirinya sendiri",
  ringkas: "9 sampai 24 kata: bacakan keras-keras dan berhenti saat napas habis",
};
export const BAND_LABEL: Record<HookBand, string> = { kuat: "Kuat", cukup: "Cukup", lemah: "Lemah" };

/** Words that sell without saying anything. */
const VAGUE = /\b(luar biasa|gila|dahsyat|rahasia|terbaik|ultimate|ajaib|keren|mantap|wow|fantastis|spektakuler|revolusioner|menakjubkan|menggemparkan|epik|sempurna|super)\b/giu;
/** Greetings, channel talk and softeners: they spend the first seconds without promising anything. */
const FILLER = /\b(pokoknya|jadi|nah|halo|hai|hi|guys|teman-teman|selamat datang|hari ini|video ini|subscribe|channel|sih|deh|kan|yuk|oke|baik)\b/giu;
/** A number, an amount of money or a length of time. */
const CONCRETE = /(?:rp\.?\s?)?\d[\d.,]*(?:\s?(?:%|persen|rb|ribu|jt|juta|miliar|x|kali|detik|menit|jam|hari|minggu|bulan|tahun))?/giu;
const STAKE = /\b(rugi|merugikan|buang|membuang|terbuang|boros|memboroskan|berhenti|gagal|bangkrut|hilang|kehilangan|risiko|bahaya|berbahaya|sebelum|jangan|stop|tidak pernah|takkan|mati|habis|sia-sia|menyesal|salah|kesalahan|telat|terlambat|mahal|denda|biaya)\b/giu;
const CURIOSITY = /\b(kenapa|mengapa|bagaimana|gimana|apa|apakah|siapa|mana|sampai|hingga|sebelum|tapi|namun|ternyata|sebenarnya|alasan|kecuali|hampir|tidak ada yang|nggak ada yang|rahasia|bukan|diam-diam)\b/giu;
/** A line that answers itself has no gap left to be curious about. */
const CLOSING = /\b(karena|sehingga|artinya|yang berarti)\b/iu;
const ADDRESS_WORDS = /\b(kamu|kau|engkau|anda|kalian|dirimu)\b/giu;
/** "gajimu", "hidupmu": the possessive -mu. A few ordinary words end in -mu and are not addressing anyone. */
const NOT_MU = new Set(["tamu", "ramu", "kemu", "ilmu", "jamu", "kamu", "semu", "lamu", "temu", "bermu"]);

const lower = (t: string) => t.toLowerCase();
/** Word count, as a person would count them aloud. */
export const wordCount = (t: string): number => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’%$.,-]*/gu) ?? []).length;
const count = (t: string, re: RegExp) => (t.match(re) ?? []).length;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const tokens = (t: string) => lower(t).match(/[\p{L}\p{N}'’-]+/gu) ?? [];
const hasMu = (w: string) => w.length >= 4 && w.endsWith("mu") && !NOT_MU.has(w.replace(/-/g, ""));

function specificity(t: string): number {
  if (wordCount(t) === 0) return 0;
  const nums = count(t, CONCRETE), vague = count(t, VAGUE), filler = count(t, FILLER);
  // Capitalised words that do not open a sentence read as named things (a brand, a place, a person).
  const names = t.split(/\s+/).reduce((n, w, i, all) => n + (i > 0 && /^\p{Lu}[\p{L}]*/u.test(w) && !/[.!?]$/.test(all[i - 1]) && w.length > 1 && w !== w.toUpperCase() ? 1 : 0), 0);
  return clamp(34 + nums * 22 - vague * 16 - filler * 5 + Math.min(18, 6 * names));
}

function address(t: string): number {
  const toks = tokens(t);
  const n = count(t, ADDRESS_WORDS) + toks.filter(hasMu).length;
  const early = toks.slice(0, 6).some(w => /^(kamu|kau|engkau|anda|kalian|dirimu)$/.test(w) || hasMu(w));
  return clamp(26 + n * 20 + (early ? 30 : 0));
}

function stakes(t: string): number {
  return clamp(22 + count(t, STAKE) * 26 + (count(t, CONCRETE) > 0 ? 14 : 0));
}

function curiosity(t: string): number {
  return clamp(24 + count(t, CURIOSITY) * 17 + (t.trim().endsWith("?") ? 18 : 0) + (CLOSING.test(t) ? -18 : 0));
}

function brevity(t: string): number {
  const n = wordCount(t);
  if (n === 0) return 0;
  // 9 to 24 words is the band a spoken hook lands in at about 150 words a minute inside ten seconds.
  if (n >= 9 && n <= 24) return 100;
  if (n < 9) return Math.max(30, 100 - (9 - n) * 11);
  return Math.max(10, 100 - (n - 24) * 7);
}

const PROPS: { key: HookKey; fn: (t: string) => number }[] = [
  { key: "spesifik", fn: specificity }, { key: "menyapa", fn: address }, { key: "taruhan", fn: stakes },
  { key: "penasaran", fn: curiosity }, { key: "ringkas", fn: brevity },
];

/** The opening shapes that work in Indonesian short videos. A match is a hint about the shape, never a promise about the result. */
const FORMULAS: { id: string; name: string; match: RegExp[] }[] = [
  { id: "statistik", name: "Statistik", match: [/\b\d+([.,]\d+)?\s?(%|persen)/iu, /\b\d+ (dari|dalam) \d+\b/iu, /\b\d{1,3}([.,]\d{3})+\b/u] },
  { id: "kesalahan", name: "Kesalahan", match: [/\b(kesalahan|salah|keliru)\b/iu, /\bjangan\b/iu] },
  { id: "kontra", name: "Pandangan berlawanan", match: [/\b(semua orang|kebanyakan orang|orang bilang|katanya)\b/iu, /\b(ternyata sebaliknya|mitos|bohong|tidak benar)\b/iu] },
  { id: "pengungkapan", name: "Pengungkapan", match: [/\b(ternyata|akhirnya|inilah|ini dia|terungkap|rahasia)\b/iu] },
  { id: "superlatif", name: "Superlatif", match: [/\b(terbesar|terbaik|terburuk|termurah|termahal|nomor satu)\b/iu, /\bpaling\b/iu] },
  { id: "waktu", name: "Hitungan waktu", match: [/\b(dalam|hanya|cuma|selama)\s+\d+\s+(detik|menit|jam|hari|minggu|bulan)\b/iu] },
  { id: "saya-coba", name: "Saya coba sendiri", match: [/\b(saya|aku|gue)\s+(coba|mencoba|tes|menguji)\b/iu] },
  { id: "pertanyaan", name: "Pertanyaan", match: [/\?\s*$/u, /^\s*(kenapa|mengapa|bagaimana|gimana|apakah|siapa|apa)\b/iu] },
  { id: "sebelum-sesudah", name: "Sebelum dan sesudah", match: [/\bsebelum\b.*\bsesudah\b/iu, /\b(dulu|sebelumnya)\b.*\b(sekarang|kini)\b/iu] },
  { id: "peringatan", name: "Peringatan", match: [/\b(hati-hati|awas|bahaya|jangan sampai|stop)\b/iu] },
  { id: "daftar", name: "Daftar", match: [/\b\d+\s+(cara|tips|hal|langkah|alasan|kebiasaan|aplikasi|trik)\b/iu] },
  { id: "perbandingan", name: "Perbandingan", match: [/\b(vs|versus|dibanding|dibandingkan|lebih baik dari)\b/iu] },
  { id: "tenggat", name: "Tenggat", match: [/\b(sebelum|sampai|hingga)\s+(besok|akhir|bulan depan|\d+\s+(hari|jam))\b/iu] },
  { id: "sapaan-langsung", name: "Sapaan langsung", match: [/^\s*(kamu|anda|kalian)\b/iu] },
];

function classify(t: string): HookScore["formula"] {
  let best: HookScore["formula"] = null;
  for (const f of FORMULAS) {
    const hits = f.match.filter(re => re.test(t)).length;
    if (hits > (best?.hits ?? 0)) best = { id: f.id, name: f.name, hits };
  }
  return best;
}

export const bandOf = (verdict: number): HookBand => (verdict >= 72 ? "kuat" : verdict >= 55 ? "cukup" : "lemah");

export function scoreHook(raw: string): HookScore {
  const text = raw.replace(/\s+/g, " ").trim();
  const properties = PROPS.map(p => ({ key: p.key, label: HOOK_LABEL[p.key], value: p.fn(text) }));
  const values = properties.map(p => p.value);
  const verdict = Math.round(0.6 * (values.reduce((a, b) => a + b, 0) / values.length) + 0.4 * Math.min(...values));
  const weakest = properties.reduce((lo, p) => (p.value < lo.value ? p : lo), properties[0]).key;
  return { text, words: wordCount(text), properties, verdict, band: bandOf(verdict), weakest, fix: HOOK_FIX[weakest], formula: classify(text) };
}

/** The script's opening line as it will be said: the first non-empty line, without emphasis marks or [jeda] tags. */
export function hookLineOf(script: string): string {
  for (const line of script.split(/\r?\n/)) {
    const t = line.replace(/[[(]\s*(?:jeda|pause)[^\])]*[\])]/giu, "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
    if (t) return t;
  }
  return "";
}

/** Ranks several options, best first (ties keep their order). */
export const rankHooks = (options: string[]): HookScore[] => options.map(scoreHook).map((h, i) => ({ h, i })).sort((a, b) => b.h.verdict - a.h.verdict || a.i - b.i).map(x => x.h);

/** A line is worth scoring from three words on; below that there is nothing to judge. */
export const hookScorable = (text: string): boolean => wordCount(text) >= 3;
