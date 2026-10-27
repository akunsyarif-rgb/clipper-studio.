// Main-thread client for the Whisper worker. Browser-only.
import { TRANSCRIBE_SAMPLE_RATE, transcriptFromSegments, transcriptFromWords, type AsrTimings, type LanguageId, type Transcript } from "../transcript";
import type { AsrMessage } from "./worker";

/** Multilingual Whisper models (Indonesian supported), 8-bit quantised. Sizes are approximate download sizes. */
export const MODELS = [
  { id: "Xenova/whisper-small", label: "Paling akurat (small, ±250 MB)", note: "Terbaik untuk bahasa Indonesia; lebih lambat dan butuh memori besar" },
  { id: "Xenova/whisper-base", label: "Akurat (base, ±80 MB)", note: "Disarankan untuk bahasa Indonesia" },
  { id: "Xenova/whisper-tiny", label: "Cepat (tiny, ±40 MB)", note: "Lebih cepat dan ringan, kurang akurat" },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];

export class TranscribeCancelled extends Error {
  constructor() { super("Transkripsi dibatalkan."); }
}

export type AsrEvents = {
  onDownload: (loaded: number, total: number) => void;
  onRunning: (info: { loadSeconds: number; reused: boolean }) => void;
  /** `done` of `total` seconds of speech are transcribed. */
  onChunk?: (done: number, total: number) => void;
};
export type AsrHandle = { result: Promise<{ transcript: Transcript; timings: AsrTimings }>; cancel: () => void };

/** The worker (and the model inside it) stays ready this long after a transcription, so a second one starts at once. */
export const ASR_IDLE_MS = 120_000;

// One worker is shared by consecutive transcriptions: loading the model is the slowest step on small devices.
let shared: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Stops the worker and frees the model's memory (leaving the page, before a render, after idling, on error or cancel). */
export function releaseAsr() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  shared?.terminate();
  shared = null;
}

export function transcribe(audio: Float32Array, model: ModelId, language: LanguageId, seconds: number, events: AsrEvents): AsrHandle {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const worker = shared ?? (shared = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
  let rejectNow: (e: Error) => void = () => undefined;
  let info = { loadSeconds: 0, reused: false };
  const audioSeconds = audio.length / TRANSCRIBE_SAMPLE_RATE;
  const fail = (e: Error, reject: (e: Error) => void) => { if (shared === worker) releaseAsr(); else worker.terminate(); reject(e); };
  const result = new Promise<{ transcript: Transcript; timings: AsrTimings }>((resolve, reject) => {
    rejectNow = reject;
    worker.onmessage = (e: MessageEvent<AsrMessage>) => {
      const m = e.data;
      if (m.type === "progress") events.onDownload(m.loaded, m.total);
      else if (m.type === "ready") { info = { loadSeconds: m.loadSeconds, reused: m.reused }; events.onRunning(info); }
      else if (m.type === "chunk") events.onChunk?.(m.done, m.total);
      else if (m.type === "result") {
        const lang = language === "indonesian" ? "id" : "en";
        const t = m.granularity === "word" ? transcriptFromWords(m.chunks, seconds, lang) : transcriptFromSegments(m.chunks, seconds, lang);
        // Keep the worker (and model) for the next transcription, but not forever: it holds a lot of memory.
        worker.onmessage = null;
        idleTimer = setTimeout(releaseAsr, ASR_IDLE_MS);
        if (t.segments.length) resolve({ transcript: t, timings: { ...info, inferSeconds: m.inferSeconds, audioSeconds, speechSeconds: m.speechSeconds } });
        else reject(new Error("no speech: tidak ada ucapan terdeteksi"));
      } else fail(new Error(m.detail), reject);
    };
    worker.onerror = e => fail(new Error(`Worker gagal: ${e.message || "tanpa pesan"} (${e.filename || "?"}:${e.lineno || 0})`), reject);
    worker.onmessageerror = () => fail(new Error("Worker gagal: pesan tidak dapat dibaca"), reject);
    // Transfer a copy-free buffer: the audio is not needed on this side afterwards.
    worker.postMessage({ audio, model, language }, [audio.buffer]);
  });
  // Stopping means ending the worker: an inference in progress cannot be interrupted any other way.
  return { result, cancel: () => { if (shared === worker) releaseAsr(); else worker.terminate(); rejectNow(new TranscribeCancelled()); } };
}
