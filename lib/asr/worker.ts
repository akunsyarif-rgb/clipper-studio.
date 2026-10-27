// Web Worker: runs Whisper (Transformers.js + onnxruntime-web, WebAssembly) off the main thread.
// The model is downloaded once from the Hugging Face Hub (free, no key) and kept in the browser cache.
/// <reference lib="webworker" />
import { ASR_CHUNK_SECONDS, ASR_STRIDE_SECONDS, asrChunkCount, type RawChunk } from "../transcript";

export type AsrRequest = { audio: Float32Array; model: string; language: string };
export type AsrMessage =
  | { type: "progress"; loaded: number; total: number; file: string }
  | { type: "ready"; loadSeconds: number; reused: boolean }
  /** `done` of `total` audio windows are finished. */
  | { type: "chunk"; done: number; total: number }
  | { type: "result"; granularity: "word" | "segment"; chunks: RawChunk[]; inferSeconds: number }
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
    // generate() calls streamer.end() once per audio window, which gives real progress for a long recording.
    const total = asrChunkCount(audio.length);
    const options = (extra: object) => {
      let done = 0;
      post({ type: "chunk", done, total });
      return { language, task: "transcribe", chunk_length_s: ASR_CHUNK_SECONDS, stride_length_s: ASR_STRIDE_SECONDS, ...extra, streamer: { put() { /* tokens are not shown */ }, end() { done++; post({ type: "chunk", done: Math.min(done, total), total }); } } };
    };
    const inferStart = performance.now();
    try {
      const out = await loaded.pipe(audio, options({ return_timestamps: "word" }));
      post({ type: "result", granularity: "word", chunks: (Array.isArray(out) ? out[0] : out).chunks, inferSeconds: (performance.now() - inferStart) / 1000 });
    } catch (wordErr) {
      // Not every model export carries the alignment heads needed for word timestamps: fall back to segments.
      if (!/alignment|cross.?attention|timestamp/i.test(String((wordErr as Error)?.message ?? wordErr))) throw wordErr;
      const out = await loaded.pipe(audio, options({ return_timestamps: true }));
      post({ type: "result", granularity: "segment", chunks: (Array.isArray(out) ? out[0] : out).chunks, inferSeconds: (performance.now() - inferStart) / 1000 });
    }
  } catch (err) {
    post({ type: "error", detail: err instanceof Error ? `${err.name}: ${err.message}\n${(err.stack ?? "").split("\n").slice(0, 4).join("\n")}` : String(err) });
  }
};
