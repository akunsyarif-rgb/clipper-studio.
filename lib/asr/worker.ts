// Web Worker: runs Whisper (Transformers.js + onnxruntime-web, WebAssembly) off the main thread.
// The model is downloaded once from the Hugging Face Hub (free, no key) and kept in the browser cache.
/// <reference lib="webworker" />
import type { RawChunk } from "../transcript";

export type AsrRequest = { audio: Float32Array; model: string; language: string };
export type AsrMessage =
  | { type: "progress"; loaded: number; total: number; file: string }
  | { type: "ready" }
  | { type: "result"; granularity: "word" | "segment"; chunks: RawChunk[] }
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
    if (env.backends.onnx.wasm) { env.backends.onnx.wasm.wasmPaths = "/ort-asr/"; env.backends.onnx.wasm.numThreads = 1; }
    if (!loaded || loaded.model !== model) {
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
    post({ type: "ready" });
    const opts = { language, task: "transcribe", chunk_length_s: 30, stride_length_s: 5 };
    try {
      const out = await loaded.pipe(audio, { ...opts, return_timestamps: "word" });
      post({ type: "result", granularity: "word", chunks: (Array.isArray(out) ? out[0] : out).chunks });
    } catch (wordErr) {
      // Not every model export carries the alignment heads needed for word timestamps: fall back to segments.
      if (!/alignment|cross.?attention|timestamp/i.test(String((wordErr as Error)?.message ?? wordErr))) throw wordErr;
      const out = await loaded.pipe(audio, { ...opts, return_timestamps: true });
      post({ type: "result", granularity: "segment", chunks: (Array.isArray(out) ? out[0] : out).chunks });
    }
  } catch (err) {
    post({ type: "error", detail: err instanceof Error ? err.message : String(err) });
  }
};
