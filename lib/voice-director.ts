/**
 * Deterministic, local narration direction for short-form scripts (Indonesian first; English from punctuation and structure only).
 *
 * WHAT ACTUALLY CHANGES THE AUDIO with the current Supertonic adapter (see AUDIBLE below):
 *   - `pace`        -> the synthesis speed (the duration predictor divides by it);
 *   - `pauseAfter`  -> extra silence between scenes, added by lib/tts/narration.ts.
 * Everything else (emotion, delivery, intonation, emphasis) is EDITORIAL GUIDANCE for the creator: the model has no control for
 * it, and the app must never claim it can be heard. Rules read whole words and phrases (never substrings), look at negation
 * and at the sentence's own shape (a question is a question by its mark or its opening word, not by a word somewhere inside),
 * score every emotion and reconcile the result so the fields never contradict each other.
 */
export type VoiceEmotion = "warm" | "curious" | "serious" | "suspense" | "joyful" | "reflective" | "neutral";
export type VoiceDelivery = "conversational" | "storytelling" | "explanatory" | "emphatic" | "gentle";
export type VoicePace = "slow" | "normal" | "fast";
export type VoiceIntonation = "rising" | "falling" | "suspense" | "steady";
export type VoiceConfidence = "low" | "medium" | "high";
export type VoiceLang = "id" | "en";
/** Silence added AFTER the scene's own lead and tail (a scene already carries 0.5 s of silence around its speech), in seconds. */
export type PauseAfter = 0 | 0.25 | 0.5 | 0.8;
export const PAUSE_CHOICES: PauseAfter[] = [0, 0.25, 0.5, 0.8];

export type VoiceDirection = {
  emotion: VoiceEmotion;
  delivery: VoiceDelivery;
  pace: VoicePace;
  intonation: VoiceIntonation;
  pauseAfter: PauseAfter;
  emphasis: string[];
  confidence: VoiceConfidence;
  reason: string;
  sourceText: string;
};

/**
 * Which fields change the sound.
 *  - pace, pauseAfter: applied for certain (speed divides the predicted duration exactly: duration x speed stayed 5.98 s from 0.81x
 *    to 1.32x in a measurement; the pause is silence added by lib/tts/narration.ts).
 *  - intonation: "partial". The model reads a final "?" as a question: with it the pitch at the end of the sentence was higher than
 *    with a period in 8 of 9 line/voice pairs (voices 1, 6 and 9 of the model, three lines; F0 measured, not listened to). So rising and
 *    falling are applied through that mark (see spokenForDirection); "steady" and "suspense" have no control and stay guidance.
 *  - emotion, delivery, emphasis: no control exists in the engine; guidance only.
 */
export const AUDIBLE: Record<"pace" | "pauseAfter" | "emotion" | "delivery" | "intonation" | "emphasis", boolean | "partial"> = {
  pace: true, pauseAfter: true, emotion: false, delivery: false, intonation: "partial", emphasis: false,
};

// ---- reading the sentence ---------------------------------------------------------------------------------------------------

/** Words, numbers (with separators and %), and amounts written with a currency prefix ("Rp50.000", "Rp 1,5"). */
const TOKEN = /[Rr][Pp]\.?\s?\d+(?:[.,]\d+)*|\p{L}[\p{L}\p{N}'’-]*|\d+(?:[.,]\d+)*%?/gu;
const tokens = (s: string) => s.match(TOKEN) ?? [];
const lower = (s: string) => s.toLocaleLowerCase("id");
/** Whole-word / whole-phrase test on a padded token string, so "hidup" never matches "menghidupkan". */
const hasAny = (padded: string, phrases: readonly string[]) => phrases.filter(p => padded.includes(` ${p} `)).length;

const NEGATORS = new Set(["tidak", "tak", "bukan", "belum", "jangan", "tanpa", "kurang", "nggak", "gak", "enggak", "ga", "never", "not", "no"]);
const OPENERS = new Set(["dan", "lalu", "jadi", "terus", "nah", "eh", "oke", "ok", "tapi", "kok", "sih", "tetapi", "namun", "so", "and", "but", "well"]);
const WH = new Set(["apa", "apakah", "siapa", "siapakah", "mengapa", "kenapa", "bagaimana", "gimana", "kapan", "berapa", "mana", "dimana"]);
/** Question words made with -kah (pernahkah, tahukah, bisakah...), minus ordinary words that merely end that way. */
const NOT_KAH = new Set(["berkah", "sedekah", "musibah", "sumbangsih"]);
const isKah = (w: string) => /^\p{L}{3,}kah$/u.test(w) && !NOT_KAH.has(w);

const LEX = {
  invite: ["bayangkan", "coba", "pikirkan", "tebak", "penasaran"],
  reveal: ["ternyata", "faktanya", "rupanya", "siapa sangka", "mengejutkan", "tanpa disangka", "kenyataannya", "rahasianya", "tiba-tiba"],
  serious: ["sayangnya", "risiko", "bahaya", "berbahaya", "masalah", "konsekuensi", "ancaman", "krisis", "waspada", "hati-hati", "gagal", "rugi", "kerugian", "peringatan", "mematikan", "darurat", "korban"],
  contrast: ["namun", "tetapi", "sayangnya", "akan tetapi"],
  joyful: ["berhasil", "hebat", "bahagia", "senang", "menyenangkan", "selamat", "luar biasa", "keren", "seru", "asyik", "mantap", "gembira", "bangga", "sukses", "wow", "yeay", "hore", "kabar baik"],
  reflective: ["bersyukur", "syukur", "makna", "hidup", "kehidupan", "renungkan", "merenung", "ingatlah", "pelajaran", "perjalanan", "kenangan", "rindu", "sabar", "ikhlas", "pada akhirnya", "semoga"],
  warm: ["halo", "hai", "terima kasih", "teman-teman", "sahabat", "yuk", "ayo", "semangat", "selamat datang", "kita semua", "bersama"],
} as const;

const EN_STOP = new Set("the and for with that this are was were have has you your from they their what when will just about into than then them been being would could should there here also very more most some such only over under again".split(" "));
const STOP = new Set(("yang dan di ke dari untuk dengan pada adalah ini itu atau tetapi namun karena jika maka akan sudah belum bisa dapat tidak iya aku kamu kita saya anda mereka dia para oleh sebagai dalam juga hanya lebih sangat paling " +
  "membuat menjadi melakukan banyak semua orang hari saat ketika sebuah suatu setiap agar supaya sehingga bahwa lalu kemudian setelah sebelum antara tentang seperti yaitu yakni dll dsb sama lain lainnya begitu sekali masih sedang telah pernah ingin harus perlu mau jadi ada hal cara").split(" "));
const INTENSIFIER = new Set(["sangat", "banget", "paling", "selalu", "benar-benar", "satu-satunya", "sekali", "bahkan", "hanya", "cuma", "always", "only", "really"]);

type Shape = {
  tokens: string[]; padded: string; question: boolean; markedQuestion: boolean; exclaim: boolean; ellipsis: boolean;
  colon: boolean; open: boolean; quoted: boolean; longSentence: boolean; commas: number; digits: number;
};

const TRAIL = /[\s"'”’)\]]+$/u;

function shapeOf(sourceText: string, lang: VoiceLang): Shape {
  const trimmed = sourceText.replace(TRAIL, "");
  const toks = tokens(sourceText);
  const words = toks.map(lower);
  const first = words.find(w => !OPENERS.has(w)) ?? "";
  const second = words[words.indexOf(first) + 1] ?? "";
  const markedQuestion = /\?$/.test(trimmed);
  const finished = /[.!…]$/.test(trimmed); // the author closed it as a statement: respect that
  // An interrogative OPENING word or -kah word makes a question even without the mark; the same word inside a statement does not.
  const opensQuestion = lang === "id" && !finished && (WH.has(first) || (first === "di" && second === "mana") || isKah(first)) && toks.length <= 22;
  return {
    tokens: toks, padded: ` ${words.join(" ")} `, markedQuestion, question: markedQuestion || opensQuestion,
    exclaim: /!$/.test(trimmed), ellipsis: /(\.{3}|…)$/.test(trimmed), colon: /[:;]$/.test(trimmed), open: /,$/.test(trimmed),
    quoted: /["“”].{3,}["“”]/.test(sourceText), longSentence: toks.length >= 22, commas: (sourceText.match(/,/g) ?? []).length,
    digits: toks.filter(t => /\d/.test(t)).length,
  };
}

/** Lexicon hits; a positive word that a negator right before it turns around ("tidak berhasil") is counted apart. */
function hits(s: Shape, phrases: readonly string[], opts: { skipNegated?: boolean } = {}): { n: number; negated: number } {
  let n = 0, negated = 0;
  for (const p of phrases) {
    const at = s.padded.indexOf(` ${p} `);
    if (at < 0) continue;
    const before = s.padded.slice(0, at).trim().split(" ").slice(-2);
    if (opts.skipNegated && before.some(w => NEGATORS.has(w))) negated++;
    else n++;
  }
  return { n, negated };
}

// ---- emphasis -------------------------------------------------------------------------------------------------------------

/** Up to two words worth stressing: figures and amounts, names, what an intensifier or a negation points at, and the closing content word. */
export function emphasisWords(sourceText: string, lang: VoiceLang = "id"): string[] {
  const found = [...sourceText.matchAll(TOKEN)].map(m => ({ word: m[0], at: m.index ?? 0 }));
  const stop = lang === "en" ? EN_STOP : STOP;
  const scored: { word: string; score: number; order: number }[] = [];
  found.forEach(({ word, at }, i) => {
    const w = lower(word);
    if (stop.has(w) || OPENERS.has(w) || NEGATORS.has(w) || INTENSIFIER.has(w)) return;
    const isNumber = /\d/.test(word);
    if (!isNumber && w.length < 4) return;
    let score = 0.1 * Math.min(w.length, 10);
    if (isNumber) score += 3;
    const before = sourceText.slice(0, at).trimEnd();
    if (/^\p{Lu}/u.test(word) && i > 0 && before && !/[.!?…"“]$/.test(before)) score += 2.5; // a name inside the sentence
    const prev = lower(found[i - 1]?.word ?? "");
    if (INTENSIFIER.has(prev) || NEGATORS.has(prev)) score += 2; // "sangat PENTING", "tidak PERNAH"
    if (found.slice(i + 1).every(t => stop.has(lower(t.word)) || t.word.length < 4)) score += 1.5; // the closing content word
    scored.push({ word, score, order: i });
  });
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .filter(c => !seen.has(lower(c.word)) && !!seen.add(lower(c.word)))
    .slice(0, 2).sort((a, b) => a.order - b.order).map(c => c.word);
}

/** What the creator typed for emphasis, cleaned: words that really occur in the sentence, at most 4, each at most 24 characters. */
export function parseEmphasis(input: string, sourceText: string): { words: string[]; ignored: string[] } {
  const inText = ` ${tokens(sourceText).map(lower).join(" ")} `;
  const words: string[] = [], ignored: string[] = [];
  for (const part of input.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean)) {
    const w = part.slice(0, 24);
    if (words.some(x => lower(x) === lower(w))) continue;
    if (inText.includes(` ${lower(w)} `)) { if (words.length < 4) words.push(w); } else ignored.push(w);
  }
  return { words, ignored };
}

// ---- the analysis ---------------------------------------------------------------------------------------------------------

export type SegmentPosition = "only" | "first" | "middle" | "last";

export function analyzeVoiceSegment(raw: string, opts: { lang?: VoiceLang; position?: SegmentPosition } = {}): VoiceDirection {
  const lang = opts.lang ?? "id";
  const position = opts.position ?? "middle";
  const sourceText = raw.trim();
  const s = shapeOf(sourceText, lang);
  const n = s.tokens.length;
  const id = lang === "id";

  const invite = id ? hasAny(s.padded, LEX.invite) : 0;
  const reveal = id ? hasAny(s.padded, LEX.reveal) : 0;
  const serious = id ? hits(s, LEX.serious) : { n: 0, negated: 0 };
  const contrast = id ? hasAny(s.padded, LEX.contrast) : 0;
  const joy = id ? hits(s, LEX.joyful, { skipNegated: true }) : { n: 0, negated: 0 };
  const reflect = id ? hits(s, LEX.reflective) : { n: 0, negated: 0 };
  const warmth = id ? hits(s, LEX.warm) : { n: 0, negated: 0 };
  const greeting = id && (position === "first" || position === "only") && hasAny(s.padded, ["halo", "hai", "selamat datang", "selamat pagi", "selamat siang", "selamat malam"]) > 0;
  const closing = id && (position === "last" || position === "only") && hasAny(s.padded, ["terima kasih", "semoga", "sampai jumpa"]) > 0;
  const numeric = n > 0 && s.digits / n >= 0.4;

  const score: Record<VoiceEmotion, number> = { warm: 0.5, curious: 0, serious: 0, suspense: 0, joyful: 0, reflective: 0, neutral: 0 };
  if (s.question) score.curious += 3;
  if (invite) score.curious += 1.5 * Math.min(2, invite);
  if (reveal) score.suspense += 3 + (s.ellipsis ? 1 : 0);
  score.serious += Math.min(3, 1.5 * serious.n) + (contrast ? 1 : 0) + Math.min(1.5, joy.negated);
  score.joyful += Math.min(3, 1.5 * joy.n) + (joy.n && s.exclaim ? 1 : 0);
  score.reflective += Math.min(3, 1.5 * reflect.n) + (reflect.n && s.ellipsis ? 0.5 : 0);
  score.warm += Math.min(3, 1.5 * warmth.n) + (greeting || closing ? 1.5 : 0);
  if (numeric || n <= 2) score.neutral += 2;

  const order: VoiceEmotion[] = ["suspense", "curious", "serious", "joyful", "reflective", "warm", "neutral"]; // ties go to the earlier
  const ranked = order.map(e => ({ e, v: score[e] })).sort((a, b) => b.v - a.v);
  const top = ranked[0], second = ranked[1];
  const emotion: VoiceEmotion = top.v >= 1.5 || top.e === "neutral" ? top.e : "warm";
  const margin = top.v - second.v;
  let confidence: VoiceConfidence = emotion === "warm" && top.v < 1.5 ? "low" : top.v >= 3 && margin >= 2 ? "high" : top.v >= 1.5 ? "medium" : "low";
  if (emotion !== "warm" && margin < 1 && second.v >= 1.5) confidence = "low"; // two signals pull apart

  // Delivery: the shape of the sentence first, then its feeling.
  let delivery: VoiceDelivery;
  if (s.exclaim && !s.question) delivery = "emphatic";
  else if (s.quoted) delivery = "conversational";
  else if (s.longSentence || (s.commas >= 3 && n >= 16)) delivery = "explanatory";
  else if (emotion === "curious" || emotion === "suspense") delivery = "storytelling";
  else if (emotion === "reflective") delivery = "gentle";
  else delivery = "conversational";

  // Intonation from how the sentence ends.
  let intonation: VoiceIntonation;
  if (s.question) intonation = "rising";
  else if (s.ellipsis || (reveal && !s.exclaim)) intonation = "suspense";
  else if (s.open || s.colon) intonation = "steady";
  else if (/[.!]$/.test(sourceText.replace(TRAIL, ""))) intonation = "falling";
  else intonation = position === "last" || position === "only" ? "falling" : "steady";

  // Pace.
  let pace: VoicePace = "normal";
  if (emotion === "reflective" || emotion === "suspense" || (emotion === "serious" && n >= 10) || s.ellipsis || s.digits >= 3) pace = "slow";
  else if (n <= 8 && (emotion === "joyful" || delivery === "emphatic") && s.exclaim && !numeric) pace = "fast";

  // Reconcile: the fields must not contradict each other.
  if ((emotion === "reflective" || emotion === "serious" || emotion === "suspense") && pace === "fast") pace = "normal";
  if (s.question && delivery === "emphatic") delivery = "storytelling";

  // Extra pause beyond the 0.5 s every scene already has: room to think after a question, to take in a reveal.
  let pauseAfter: PauseAfter = 0;
  if (reveal && (s.ellipsis || s.colon)) pauseAfter = 0.8;
  else if (reveal || s.ellipsis) pauseAfter = 0.5;
  else if (s.question || s.colon || (emotion === "reflective" && n >= 8)) pauseAfter = 0.25;
  if (position === "last" || position === "only") pauseAfter = 0; // silence after the last line only lengthens the video

  const why: string[] = [];
  if (s.question) why.push(s.markedQuestion ? "kalimat tanya (tanda ?)" : "diawali kata tanya");
  if (invite && !s.question) why.push("mengajak penonton membayangkan atau menebak");
  if (reveal) why.push("kata pengungkapan");
  if (serious.n) why.push("kata berisiko atau peringatan");
  if (contrast && !serious.n) why.push("kalimat kontras");
  if (joy.n) why.push("kata bernada positif");
  if (joy.negated) why.push("kata positif yang dinegasikan");
  if (reflect.n) why.push("tema refleksi");
  if (greeting || closing) why.push(greeting ? "salam pembuka" : "ucapan penutup");
  if (numeric) why.push("dominan angka");
  if (s.ellipsis) why.push("diakhiri titik-titik");
  const conflict = emotion !== "warm" && margin < 2 && second.v >= 1.5 ? ` Ada sinyal lain (${second.e}); periksa.` : "";
  const reason = (why.length ? `Terbaca: ${why.join(", ")}.` : "Kalimat informatif biasa; penyampaian hangat dan natural.") + conflict
    + (lang === "en" ? " Bahasa Inggris: arahan hanya dari tanda baca dan bentuk kalimat." : "");

  return { emotion, delivery, pace, intonation, pauseAfter, emphasis: emphasisWords(sourceText, lang), confidence, reason, sourceText };
}

export function positionOf(index: number, count: number): SegmentPosition {
  return count <= 1 ? "only" : index === 0 ? "first" : index === count - 1 ? "last" : "middle";
}

export function analyzeVoiceScript(segments: string[], lang: VoiceLang = "id"): VoiceDirection[] {
  return segments.map((text, i) => analyzeVoiceSegment(text, { lang, position: positionOf(i, segments.length) }));
}

// ---- overrides that follow the sentence, not its position ------------------------------------------------------------------

export type DirectionOverride = Partial<Pick<VoiceDirection, "emotion" | "delivery" | "pace" | "intonation" | "pauseAfter" | "emphasis">>;
export type DirectionOverrides = Record<string, DirectionOverride>;

/** A key per segment made of its text and which occurrence of that text it is: it survives inserting, removing or moving other sentences. */
export function segmentKeys(texts: string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map(t => { const k = lower(t.replace(/\s+/g, " ").trim()); const nth = (seen.get(k) ?? 0) + 1; seen.set(k, nth); return `${k}#${nth}`; });
}

/** The automatic directions with the creator's changes laid over them. Only known fields are read from an override. */
export function applyOverrides(auto: VoiceDirection[], keys: string[], overrides: DirectionOverrides): VoiceDirection[] {
  return auto.map((d, i) => {
    const o = overrides[keys[i]];
    if (!o) return d;
    return {
      ...d,
      ...(o.emotion ? { emotion: o.emotion } : {}), ...(o.delivery ? { delivery: o.delivery } : {}), ...(o.pace ? { pace: o.pace } : {}),
      ...(o.intonation ? { intonation: o.intonation } : {}), ...(o.pauseAfter !== undefined ? { pauseAfter: o.pauseAfter } : {}), ...(o.emphasis ? { emphasis: o.emphasis } : {}),
    };
  });
}

/** What changes the audio of a segment: a generated narration stays valid exactly while this is unchanged. */
export const audibleKey = (d: VoiceDirection) => `${d.pace}|${d.pauseAfter}|${d.intonation === "rising" ? "?" : "."}`;

/**
 * The text sent to the voice engine for a segment. The only direction that reaches the text is rising versus not rising, through
 * the final punctuation the engine reads (see AUDIBLE): a rising sentence ends in "?", any other sentence does not end in "?".
 * Nothing else is rewritten, and the captions on screen are never touched.
 */
export function spokenForDirection(spoken: string, direction: Pick<VoiceDirection, "intonation">): string {
  const m = spoken.match(/^([\s\S]*?)([\s"'”’)\]]*)$/);
  const body = (m?.[1] ?? spoken).replace(/\s+$/, ""), tail = m?.[2] ?? "";
  if (!body) return spoken;
  if (direction.intonation === "rising") return /\?$/.test(body) ? spoken : `${body.replace(/[.!…,;:]+$/, "")}?${tail}`;
  return /\?$/.test(body) ? `${body.replace(/\?+$/, "")}.${tail}` : spoken;
}

/**
 * Identity of a generated narration: it stays valid exactly while the sentences (with their [jeda] pauses), language, voice, base
 * speed and every segment's audible direction (pace, pause) are unchanged. Emotion, delivery, intonation and emphasis are
 * deliberately NOT part of it: changing them cannot change the audio, so it must not make a good narration look out of date.
 * Intonation is part of it only as rising or not (the final mark the engine reads).
 */
export function narrationKey(script: { texts: string[]; pauses: number[] }, lang: string, voice: number, baseSpeed: number, directions: VoiceDirection[]): string {
  return JSON.stringify([script, lang, voice, baseSpeed, directions.map(audibleKey)]);
}

// ---- synthesis controls ---------------------------------------------------------------------------------------------------

export function paceToSpeed(pace: VoicePace, baseSpeed: number): number {
  const factor: Record<VoicePace, number> = { slow: 0.9, normal: 1, fast: 1.1 };
  return Math.max(0.75, Math.min(1.35, Math.round(baseSpeed * factor[pace] * 100) / 100));
}

/** Extra silence for a scene: the longer of the script's own [jeda] tag and the direction's pause, never both added. */
export function scenePause(tagPause: number, direction: VoiceDirection | undefined): number {
  return Math.max(tagPause, direction?.pauseAfter ?? 0);
}

export const VOICE_EMOTION_LABELS: Record<VoiceEmotion, string> = {
  warm: "Hangat", curious: "Penasaran", serious: "Serius", suspense: "Membangun kejutan",
  joyful: "Ceria", reflective: "Reflektif", neutral: "Netral",
};
export const VOICE_DELIVERY_LABELS: Record<VoiceDelivery, string> = {
  conversational: "Percakapan", storytelling: "Bercerita", explanatory: "Menjelaskan",
  emphatic: "Tegas / penekanan", gentle: "Lembut",
};
export const VOICE_PACE_LABELS: Record<VoicePace, string> = { slow: "Pelan", normal: "Normal", fast: "Cepat" };
export const VOICE_INTONATION_LABELS: Record<VoiceIntonation, string> = { rising: "Naik (pertanyaan)", falling: "Turun (pernyataan)", suspense: "Tertahan (pengungkapan)", steady: "Datar / stabil" };
export const PAUSE_LABELS: Record<string, string> = { "0": "Tanpa jeda tambahan", "0.25": "+0,25 detik", "0.5": "+0,5 detik", "0.8": "+0,8 detik" };
