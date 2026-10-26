// Main-thread client for the Whisper worker. Browser-only.
import { transcriptFromSegments, transcriptFromWords, type LanguageId, type Transcript } from "../transcript";
import type { AsrMessage } from "./worker";

/** Multilingual Whisper models (Indonesian supported), 8-bit quantised. Sizes are approximate download sizes. */
export const MODELS = [
  { id: "Xenova/whisper-base", label: "Akurat (base, ±80 MB)", note: "Disarankan untuk bahasa Indonesia" },
  { id: "Xenova/whisper-tiny", label: "Cepat (tiny, ±40 MB)", note: "Lebih cepat dan ringan, kurang akurat" },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];

export class TranscribeCancelled extends Error {
  constructor() { super("Transkripsi dibatalkan."); }
}

export type AsrEvents = { onDownload: (loaded: number, total: number) => void; onRunning: () => void };
export type AsrHandle = { result: Promise<Transcript>; cancel: () => void };

export function transcribe(audio: Float32Array, model: ModelId, language: LanguageId, seconds: number, events: AsrEvents): AsrHandle {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  let rejectNow: (e: Error) => void = () => undefined;
  const result = new Promise<Transcript>((resolve, reject) => {
    rejectNow = reject;
    worker.onmessage = (e: MessageEvent<AsrMessage>) => {
      const m = e.data;
      if (m.type === "progress") events.onDownload(m.loaded, m.total);
      else if (m.type === "ready") events.onRunning();
      else if (m.type === "result") {
        const lang = language === "indonesian" ? "id" : "en";
        const t = m.granularity === "word" ? transcriptFromWords(m.chunks, seconds, lang) : transcriptFromSegments(m.chunks, seconds, lang);
        worker.terminate();
        if (t.segments.length) resolve(t); else reject(new Error("no speech: tidak ada ucapan terdeteksi"));
      } else { worker.terminate(); reject(new Error(m.detail)); }
    };
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message || "worker error")); };
    // Transfer a copy-free buffer: the audio is not needed on this side afterwards.
    worker.postMessage({ audio, model, language }, [audio.buffer]);
  });
  return { result, cancel: () => { worker.terminate(); rejectNow(new TranscribeCancelled()); } };
}
