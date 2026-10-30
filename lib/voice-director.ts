/**
 * Deterministic, local-first narration direction for Indonesian short-form scripts.
 * Only pace and post-segment silence are synthesis controls in the current Supertonic adapter.
 * Emotion, delivery, intonation and emphasis are editorial guidance, not guaranteed acoustic effects.
 */
export type VoiceEmotion = "warm" | "curious" | "serious" | "suspense" | "joyful" | "reflective" | "neutral";
export type VoiceDelivery = "conversational" | "storytelling" | "explanatory" | "emphatic" | "gentle";
export type VoicePace = "slow" | "normal" | "fast";
export type VoiceConfidence = "low" | "medium" | "high";

export type VoiceDirection = {
  emotion: VoiceEmotion;
  delivery: VoiceDelivery;
  pace: VoicePace;
  pauseAfter: 0 | 0.25 | 0.5 | 0.8;
  emphasis: string[];
  confidence: VoiceConfidence;
  reason: string;
  sourceText: string;
};

const STOP = new Set("yang dan di ke dari untuk dengan pada adalah ini itu atau tetapi namun karena jika maka akan sudah belum bisa dapat tidak iya aku kamu kita saya anda mereka dia para oleh sebagai dalam juga hanya lebih sangat paling".split(" "));
const has = (s: string, words: string[]) => words.some(w => s.includes(w));

function emphasisWords(text: string): string[] {
  const words = text.toLocaleLowerCase("id").match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  const seen = new Set<string>();
  return words.filter(w => !STOP.has(w) && !seen.has(w) && !!seen.add(w)).slice(0, 2);
}

export function analyzeVoiceSegment(raw: string): VoiceDirection {
  const sourceText = raw.trim();
  const text = sourceText.toLocaleLowerCase("id");
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const question = /\?/.test(sourceText) || has(text, ["pernahkah", "tahukah", "mengapa", "bagaimana", "kenapa", "apa yang"]);
  const curious = question || has(text, ["bayangkan", "coba pikirkan", "penasaran"]);
  const reveal = has(text, ["ternyata", "faktanya", "rupanya", "siapa sangka", "yang mengejutkan"]);
  const serious = has(text, ["namun", "tetapi", "sayangnya", "risiko", "bahaya", "masalah", "konsekuensi"]);
  const joyful = has(text, ["berhasil", "hebat", "bahagia", "menyenangkan", "selamat", "luar biasa"]);
  const reflective = has(text, ["bersyukur", "makna", "hidup", "renungkan", "ingatlah", "pelajaran"]);
  let emotion: VoiceEmotion = "warm";
  let reason = "Kalimat informatif; gunakan penyampaian hangat dan natural.";
  let confidence: VoiceConfidence = "low";
  if (curious) { emotion = "curious"; reason = "Bentuk pertanyaan atau ajakan membayangkan mengundang rasa ingin tahu."; confidence = "high"; }
  else if (reveal) { emotion = "suspense"; reason = "Kata pengungkapan memberi ruang untuk jeda dan kejutan."; confidence = "high"; }
  else if (serious) { emotion = "serious"; reason = "Kontras atau kata berisiko membutuhkan penyampaian lebih tenang dan tegas."; confidence = "medium"; }
  else if (joyful) { emotion = "joyful"; reason = "Kata bernada positif mendukung energi yang lebih cerah."; confidence = "medium"; }
  else if (reflective) { emotion = "reflective"; reason = "Tema refleksi cocok dibawakan dengan tempo lebih tenang."; confidence = "medium"; }

  const delivery: VoiceDelivery = /!/.test(sourceText) ? "emphatic"
    : curious || reveal ? "storytelling"
    : words.length > 16 ? "explanatory"
    : reflective ? "gentle" : "conversational";
  const pace: VoicePace = reflective || (serious && words.length > 12) ? "slow"
    : words.length <= 6 && /!/.test(sourceText) ? "fast" : "normal";
  const pauseAfter: VoiceDirection["pauseAfter"] = reveal ? 0.8
    : /[?;!]\s*$/.test(sourceText) ? 0.5
    : /[.]\s*$/.test(sourceText) ? 0.25 : 0;
  return { emotion, delivery, pace, pauseAfter, emphasis: emphasisWords(sourceText), confidence, reason, sourceText };
}

export function analyzeVoiceScript(segments: string[]): VoiceDirection[] {
  return segments.map(analyzeVoiceSegment);
}

export function paceToSpeed(pace: VoicePace, baseSpeed: number): number {
  const factor: Record<VoicePace, number> = { slow: 0.9, normal: 1, fast: 1.1 };
  return Math.max(0.75, Math.min(1.35, Math.round(baseSpeed * factor[pace] * 100) / 100));
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
