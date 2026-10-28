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

/** The error names a shortage of memory (WebAssembly could not allocate), as opposed to a network or format problem. */
export function isMemoryError(detail: string): boolean {
  return /out of memory|RangeError|allocation|OOM|memory access out of bounds|no available backend/i.test(detail);
}

/**
 * The ONNX runtime build for this device. Speech runs on the CPU (WebAssembly) backend only, so the plain build is
 * used everywhere: the asyncify build exists for WebGPU, is larger, and needs more memory to even start, which is what
 * made Safari on iPad fail with "no available backend found / Out of memory".
 */
export function ortWasmPaths(): { mjs: string; wasm: string } {
  return { mjs: "/ort-asr/ort-wasm-simd-threaded.mjs", wasm: "/ort-asr/ort-wasm-simd-threaded.wasm" };
}

/** ONNX session options that trade a little speed for much less memory on the WebAssembly backend. */
export const LOW_MEMORY_SESSION = { enableCpuMemArena: false, enableMemPattern: false, graphOptimizationLevel: "basic", executionMode: "sequential" } as const;

/** The model to retry with after `model` ran out of memory, or null when it already is the lightest. */
export function memoryFallback(model: string): ModelName | null {
  return /tiny/i.test(model) ? null : lighterModel(model);
}
