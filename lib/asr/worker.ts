// Web Worker: runs Whisper (Transformers.js + onnxruntime-web, WebAssembly) off the main thread.
// The model is downloaded once from the Hugging Face Hub (free, no key) and kept in the browser cache.
/// <reference lib="webworker" />
import type { RawChunk } from "../transcript";
import { transcribeSpeech, type Pipe } from "./run";

export type AsrRequest = { audio: Float32Array; model: string; language: string };
export type AsrMessage =
  | { type: "progress"; loaded: number; total: number; file: string }
  | { type: "ready"; loadSeconds: number; reused: boolean }
  /** `done` of `total` seconds of speech are transcribed. */
  | { type: "chunk"; done: number; total: number }
  | { type: "result"; granularity: "word" | "segment"; chunks: RawChunk[]; inferSeconds: number; speechSeconds: number }
  | { type: "error"; detail: string };

const post = (m: AsrMessage) => (self as unknown as Worker).postMessage(m);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loaded: { model: string; pipe: any } | null = null;

self.onmessage = async (e: MessageEvent<AsrRequest>) => {
  try {
    const { audio, model, language } = e.data;
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    // Self-hosted WebAssembly runtime (copied to public/ort-asr at build time); no SharedArrayBuffer, so a single thread.
    // Same variant choice as Transformers.js: the plain build on Safari < 26 without WebGPU, the asyncify build elsewhere.
    if (env.backends.onnx.wasm) {
      const safari = /Version\/(\d+)[\d.]*.*Safari/.exec(self.navigator.userAgent);
      const suffix = safari && Number(safari[1]) < 26 && !("gpu" in self.navigator) ? "" : ".asyncify";
      env.backends.onnx.wasm.wasmPaths = { mjs: `/ort-asr/ort-wasm-simd-threaded${suffix}.mjs`, wasm: `/ort-asr/ort-wasm-simd-threaded${suffix}.wasm` };
      env.backends.onnx.wasm.numThreads = 1;
    }
    const loadStart = performance.now();
    const reused = !!loaded && loaded.model === model;
    if (loaded && loaded.model !== model) {
      // A different model replaces the old one; free its memory first (matters on small devices).
      try { await loaded.pipe.dispose?.(); } catch { /* best effort */ }
      loaded = null;
    }
    if (!loaded) {
      const files = new Map<string, { loaded: number; total: number }>();
      const pipe = await pipeline("automatic-speech-recognition", model, {
        device: "wasm",
        dtype: "q8",
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status !== "progress" || !p.file) return;
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
          let l = 0, t = 0;
          files.forEach(f => { l += f.loaded; t += f.total; });
          post({ type: "progress", loaded: l, total: t, file: p.file });
        },
      });
      loaded = { model, pipe };
    }
    post({ type: "ready", loadSeconds: (performance.now() - loadStart) / 1000, reused });
    const pipe = loaded.pipe;
    const inferStart = performance.now();
    // Only the spoken parts go to the model, one window at a time (see run.ts); silence and noise are skipped.
    const run = await transcribeSpeech(pipe as Pipe, audio, language, (done, total) => post({ type: "chunk", done, total }));
    post({ type: "result", granularity: run.granularity, chunks: run.chunks, inferSeconds: (performance.now() - inferStart) / 1000, speechSeconds: run.speechSeconds });
  } catch (err) {
    post({ type: "error", detail: err instanceof Error ? `${err.name}: ${err.message}\n${(err.stack ?? "").split("\n").slice(0, 4).join("\n")}` : String(err) });
  }
};
