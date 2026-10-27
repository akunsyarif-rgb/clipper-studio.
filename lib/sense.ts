// Sentence-level sense for the visual detector: which words in a sentence must NOT trigger an icon (a word used in
// another meaning), which generic words need support from the surrounding script, and when a "like", "save" or
// "follow" is really a call to action. Pure and deterministic; tokens are already lower-cased (see wordKey).

/**
 * Generic words that name a concept only loosely ("move", "see", "day"). They trigger an icon only when the same
 * concept is already a topic of the neighbouring scenes, or when no other concept competes for the sentence.
 */
export const WEAK_WORDS = new Set([
  "move", "hard", "break", "date", "play", "drive", "mind", "note", "work", "job", "ask", "find", "look", "view", "free", "fast", "quick",
  "rise", "drop", "fair", "law", "fix", "tool", "chat", "day", "hour", "today", "see", "watch", "hear", "main",
  "lihat", "cari", "hari", "jalan",
]);

const SAVED_THINGS = new Set(["money", "time", "cash", "energy", "space", "effort", "lives", "life", "data", "battery", "cost", "costs"]);
const SUBJECTS = new Set(["i", "we", "you", "they", "he", "she", "people", "everyone", "who", "viewers", "fans", "users", "kids", "nobody", "anyone", "someone"]);
const AUXILIARY = new Set(["would", "will", "do", "does", "did", "dont", "don't", "didn't", "doesn't", "not", "never", "really", "also", "always", "still", "just", "might", "may", "could", "should", "can", "also", "all", "both", "kinda", "sorta"]);
// "looks like", "just like", "like a ...": a comparison or a filler word, never the verb.
const COMPARING = new Set(["looks", "look", "looked", "looking", "feels", "feel", "felt", "sounds", "sound", "seems", "seem", "tastes", "smells", "something", "nothing", "anything", "much", "more", "less", "exactly", "same", "alike", "unlike", "act", "acts", "acting", "works", "behave", "behaves"]);

/**
 * Indices of tokens that must be ignored as concept triggers because of how they are used here.
 * "like" counts only as the verb ("I like it", "you'll like this", "would like to", "don't like"); after "looks",
 * "feels", "just" or "such", before "a/the", or on its own as a filler ("so, like,") it is a comparison.
 */
export function ambiguousMask(tokens: string[]): Set<number> {
  const masked = new Set<number>();
  tokens.forEach((t, i) => {
    // "save money / time / energy" is about thrift or effort, not about bookmarking something.
    if ((t === "save" || t === "saves" || t === "saved") && SAVED_THINGS.has(tokens[i + 1] ?? "")) { masked.add(i); return; }
    if (t !== "like" && t !== "likes" && t !== "liked") return;
    const prev = tokens[i - 1] ?? "", prev2 = tokens[i - 2] ?? "", next = tokens[i + 1] ?? "";
    const verb = SUBJECTS.has(prev) || prev.endsWith("'ll") || prev.endsWith("'d") || prev === "ll"
      || ((AUXILIARY.has(prev)) && (SUBJECTS.has(prev2) || prev2.endsWith("'ll") || AUXILIARY.has(prev2) || prev2 === "" ))
      || next === "to" || t !== "like";
    const comparing = COMPARING.has(prev) || (prev === "just" && !SUBJECTS.has(prev2)) || ["a", "an", "the", "that", "how", "when", "what", "whatever", "so"].includes(next) && !SUBJECTS.has(prev);
    if (!verb || comparing) masked.add(i);
  });
  return masked;
}

/** Whether a call-to-action word, in its sentence, really asks the viewer to do something. */
export function isCallToAction(word: string, before: string, after: string): boolean {
  const w = word.toLowerCase();
  const b = before.toLowerCase(), a = after.toLowerCase();
  const end = /^\s*[!.,?]*\s*$/;
  switch (w) {
    case "like":
      return /(hit|smash|drop|leave|give|press|tap|click|please|forget to|remember to|and|&)\s+((a|the|that|this|your)\s+)?$/.test(b)
        || /^\s*(and|&|,)\s*(subscribe|share|comment|follow|save)/.test(a) || /^\s+(this|the)\s+(video|post|reel|clip|short)/.test(a) || /^\s+button/.test(a)
        || /(subscribe|share|comment|follow|save)\s*(,|and|&)\s*$/.test(b);
    case "save":
      return /^\s+(this|it|the)?\s*(video|post|reel|clip|short|for later)/.test(a) || /^\s+for later/.test(a) || /^\s+(this|it)\s*[!.,]*\s*$/.test(a);
    case "try":
      return /^\s+(it\s+|this\s+|that\s+)?(now|today|out|for free|free)\b/.test(a) || /^\s+(our|the app|it)\b/.test(a) && !/^\s+(it\s+)?to\b/.test(a);
    case "coba":
      return /^\s+(sekarang|gratis|hari ini|dulu)\b/.test(a);
    case "follow":
    case "ikuti":
      return /^\s*(me|us|for|and|dan|on|@|our|my|kami|aku|saya|akun|channel|saluran|untuk|buat|ya|dong|di)\b/.test(a) || /^\s+the\s+(channel|page|account)/.test(a) || end.test(a);
    case "comment":
      return /(leave|drop|write|post|add)\s+(a\s+)?$/.test(b) || /^\s*(below|down|your|and|dan|with|on)\b/.test(a) || end.test(a);
    case "komentar":
      return /(tulis|tinggalkan|beri|kasih|di|isi)\s+$/.test(b) || /^\s+(di bawah|ya|dong)\b/.test(a);
    case "share":
      return /^\s*(this|it|with|to|and|dan|ke|ini|your)\b/.test(a) || /^\s+the\s+(video|post|reel)/.test(a) || end.test(a) || /(please|do|and)\s+$/.test(b);
    case "order":
      return /^\s+(now|today|yours|here)\b/.test(a) || /(please|and)\s+$/.test(b);
    case "visit":
      return /^\s+(us|our|the\s+(link|website|site)|link|my|www|http)/.test(a);
    case "simpan":
      return /^\s+(video|postingan|ini|reel)\b/.test(a);
    case "daftar":
      return /^\s+(sekarang|gratis|di|lewat|via|ke|untuk)\b/.test(a) || end.test(a);
    default:
      return true;
  }
}
