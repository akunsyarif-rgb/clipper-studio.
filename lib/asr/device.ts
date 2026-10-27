// Which speech model suits this device, and what to do after a run that took the tab down. Pure, so it can be tested.

export type ModelName = "Xenova/whisper-small" | "Xenova/whisper-base" | "Xenova/whisper-tiny";

/** iPhone, iPad and iPadOS (which reports a Mac user agent but has a touch screen): Safari closes tabs that use too much memory. */
export function isTouchDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod|Android/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

/** The heavy model is the default only where memory is plentiful. */
export function defaultModelFor(userAgent: string, maxTouchPoints: number): ModelName {
  return isTouchDevice(userAgent, maxTouchPoints) ? "Xenova/whisper-base" : "Xenova/whisper-small";
}

/** One step lighter than `model` (the lightest stays). */
export function lighterModel(model: string): ModelName {
  return /small/i.test(model) ? "Xenova/whisper-base" : "Xenova/whisper-tiny";
}

/** A transcription is marked as running before it starts and cleared when it ends; finding the mark again means the page died in between. */
export const ASR_RUN_KEY = "clipper:asr-run";

export function parseRunMark(raw: string | null): { model: string; at: number } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return typeof v === "object" && v !== null && typeof (v as { model?: unknown }).model === "string" && typeof (v as { at?: unknown }).at === "number"
      ? { model: (v as { model: string }).model, at: (v as { at: number }).at } : null;
  } catch { return null; }
}
