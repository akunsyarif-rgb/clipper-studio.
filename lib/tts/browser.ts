// Browser-only loader for the self-hosted Supertonic 3 model (public/supertonic) on onnxruntime-web (WASM).
// Model files are cached with the Cache Storage API, so the ~145 MB download happens once per device.
import { MODEL_FILES, parseIndexer, parseVoiceBank, Supertonic, type OrtModule, type TtsConfig } from "./supertonic";

export const MODEL_BASE = "/supertonic/";
const CACHE = "clipper-supertonic-3-v1";

/** Approximate sizes for download progress (bytes). */
const SIZES: Record<string, number> = {
  "duration_predictor.onnx": 3700147, "text_encoder.onnx": 36416150, "vector_estimator.onnx": 78400833, "vocoder.onnx": 25991073,
  "tts.json": 8253, "unicode_indexer.bin": 262144, "voice.bin": 517168,
};
export const MODEL_BYTES = Object.values(SIZES).reduce((a, b) => a + b, 0);

/** Voice styles in voice.bin order; gender measured from synthesized pitch (F0 ≈ 170–245 Hz vs 90–150 Hz). */
export const VOICES = [
  { id: 0, label: "Wanita 1" }, { id: 1, label: "Wanita 2" }, { id: 2, label: "Wanita 3" }, { id: 3, label: "Wanita 4" }, { id: 4, label: "Wanita 5" },
  { id: 5, label: "Pria 1" }, { id: 6, label: "Pria 2" }, { id: 7, label: "Pria 3" }, { id: 8, label: "Pria 4" }, { id: 9, label: "Pria 5" },
];

async function fetchAsset(name: string, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const url = MODEL_BASE + name;
  let cache: Cache | null = null;
  try { cache = typeof caches !== "undefined" ? await caches.open(CACHE) : null; } catch { cache = null; }
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) { const buf = await hit.arrayBuffer(); onBytes(buf.byteLength); return buf; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh model suara (${name}: HTTP ${res.status}).`);
  let buf: ArrayBuffer;
  if (res.body) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onBytes(loaded);
    }
    const all = new Uint8Array(loaded);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.byteLength; }
    buf = all.buffer;
  } else {
    buf = await res.arrayBuffer();
    onBytes(buf.byteLength);
  }
  // Storage can be full or unavailable (private mode); the app still works without the cache.
  await cache?.put(url, new Response(buf.slice(0), { headers: { "Content-Type": "application/octet-stream" } })).catch(() => undefined);
  return buf;
}

let engine: Promise<Supertonic> | null = null;

export function loadVoiceEngine(onProgress: (loaded: number, total: number) => void): Promise<Supertonic> {
  if (engine) return engine;
  engine = (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = "/ort/";
    // Multi-threading needs cross-origin isolation, which this site does not enable.
    ort.env.wasm.numThreads = 1;
    const loaded: Record<string, number> = {};
    const report = (name: string) => (n: number) => { loaded[name] = n; onProgress(Object.values(loaded).reduce((a, b) => a + b, 0), MODEL_BYTES); };
    const sessions = [];
    for (const f of MODEL_FILES) {
      const buf = await fetchAsset(f, report(f));
      sessions.push(await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ["wasm"], graphOptimizationLevel: "all" }));
    }
    const [cfgBuf, indexerBuf, voiceBuf] = await Promise.all(["tts.json", "unicode_indexer.bin", "voice.bin"].map(f => fetchAsset(f, report(f))));
    const cfg = JSON.parse(new TextDecoder().decode(cfgBuf)) as TtsConfig;
    const [durationPredictor, textEncoder, vectorEstimator, vocoder] = sessions;
    return new Supertonic(ort as unknown as OrtModule, { durationPredictor, textEncoder, vectorEstimator, vocoder }, cfg, parseIndexer(indexerBuf), parseVoiceBank(voiceBuf));
  })();
  // Allow a retry after a failed download.
  engine.catch(() => { engine = null; });
  return engine;
}

export function explainVoiceError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/HTTP|fetch|network|Load failed/i.test(msg)) return "Model suara gagal diunduh. Periksa koneksi internet lalu coba lagi.";
  if (/memory|allocation|RangeError|OOM/i.test(msg)) return "Memori perangkat tidak cukup untuk model suara. Tutup tab/aplikasi lain lalu coba lagi.";
  if (/karakter/i.test(msg)) return msg;
  return `Suara otomatis gagal dibuat: ${msg}`;
}
