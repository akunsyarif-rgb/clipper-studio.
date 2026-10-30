// Browser-only loader for the self-hosted Supertonic 3 model (public/supertonic) on onnxruntime-web (WASM).
// Model files are cached with the Cache Storage API, so the ~145 MB download happens once per device.
import { MODEL_FILES, parseIndexer, parseVoiceBank, Supertonic, type OrtModule, type TtsConfig } from "./supertonic";

export const MODEL_BASE = "/supertonic/";
const CACHE = "clipper-supertonic-3-v1";

/** File sizes for download progress (bytes). */
const SIZES: Record<string, number> = {
  "duration_predictor.onnx": 3700147, "text_encoder.onnx": 36416150, "vector_estimator.onnx": 78400833, "vocoder.onnx": 25991073,
  "tts.json": 8253, "unicode_indexer.bin": 262144, "voice.bin": 517168,
};
export const MODEL_BYTES = Object.values(SIZES).reduce((a, b) => a + b, 0);

/** Voice styles in voice.bin order; gender measured from synthesized pitch (F0 ≈ 170–245 Hz vs 90–150 Hz). */
export const VOICES = [
  { id: 0, label: "Female Adult · 1" }, { id: 1, label: "Female Adult · 2" }, { id: 2, label: "Female Adult · 3" }, { id: 3, label: "Female Adult · 4" }, { id: 4, label: "Female Adult · 5" },
  { id: 5, label: "Male Adult · 1" }, { id: 6, label: "Male Adult · 2" }, { id: 7, label: "Male Adult · 3" }, { id: 8, label: "Male Adult · 4" }, { id: 9, label: "Male Adult · 5" },
];

type Manifest = { files: Record<string, { size: number; sha256: string; parts: string[] }> };

async function openCache(): Promise<Cache | null> {
  try { return typeof caches !== "undefined" ? await caches.open(CACHE) : null; } catch { return null; }
}

/** Fetches one static file, from Cache Storage when present, reporting bytes as they arrive. */
async function fetchPart(cache: Cache | null, url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) { const buf = new Uint8Array(await hit.arrayBuffer()); onBytes(buf.byteLength); return buf; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh model suara (${url.split("/").pop()}: HTTP ${res.status}).`);
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); loaded += value.byteLength; onBytes(loaded);
    }
  } else {
    chunks.push(new Uint8Array(await res.arrayBuffer())); loaded = chunks[0].byteLength; onBytes(loaded);
  }
  const buf = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  // Storage can be full or unavailable (private mode); the app still works without the cache.
  await cache?.put(url, new Response(buf.slice(), { headers: { "Content-Type": "application/octet-stream" } })).catch(() => undefined);
  return buf;
}

/** Downloads a model file published as ≤16 MB parts (see scripts/copy-tts-assets.mjs) and joins them. */
async function fetchAsset(cache: Cache | null, manifest: Manifest, name: string, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const info = manifest.files[name];
  if (!info) throw new Error(`Model suara tidak lengkap (${name}).`);
  const out = new Uint8Array(info.size);
  let offset = 0;
  for (const part of info.parts) {
    const base = offset;
    const buf = await fetchPart(cache, MODEL_BASE + part, n => onBytes(base + n));
    out.set(buf, offset);
    offset += buf.byteLength;
  }
  if (offset !== info.size) throw new Error(`Model suara rusak (${name}). Muat ulang halaman lalu coba lagi.`);
  return out.buffer;
}

let engine: Promise<Supertonic> | null = null;

export function loadVoiceEngine(onProgress: (loaded: number, total: number) => void): Promise<Supertonic> {
  if (engine) return engine;
  engine = (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = "/ort/";
    // Multi-threading needs cross-origin isolation, which this site does not enable.
    ort.env.wasm.numThreads = 1;
    const cache = await openCache();
    const manifestRes = await fetch(MODEL_BASE + "manifest.json", { cache: "no-cache" });
    if (!manifestRes.ok) throw new Error(`Gagal mengunduh model suara (manifest: HTTP ${manifestRes.status}).`);
    const manifest = (await manifestRes.json()) as Manifest;
    const loaded: Record<string, number> = {};
    const report = (name: string) => (n: number) => { loaded[name] = n; onProgress(Object.values(loaded).reduce((a, b) => a + b, 0), MODEL_BYTES); };
    const sessions = [];
    for (const f of MODEL_FILES) {
      const buf = await fetchAsset(cache, manifest, f, report(f));
      sessions.push(await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ["wasm"], graphOptimizationLevel: "all" }));
    }
    const [cfgBuf, indexerBuf, voiceBuf] = await Promise.all(["tts.json", "unicode_indexer.bin", "voice.bin"].map(f => fetchAsset(cache, manifest, f, report(f))));
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
