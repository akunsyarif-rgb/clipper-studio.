// Tiny text helpers shared by the visual detectors (kept apart so they can import each other without a cycle).

/** Removes the *emphasis* markers for display and speech. */
export function stripMarks(text: string): string {
  return text.replace(/\*([^*]+)\*/g, "$1").replace(/\*/g, "");
}

/** Lower-cased word without accents or surrounding punctuation, for keyword and emphasis matching. */
export const wordKey = (w: string) => w.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
