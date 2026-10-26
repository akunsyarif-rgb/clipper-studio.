// Supertonic 3 text-to-speech pipeline (duration predictor → text encoder → flow-matching vector
// estimator → vocoder). Ported from Supertone's web helper (MIT, github.com/supertone-inc/supertonic,
// web/helper.js) and adapted to the sherpa-onnx packaging of Supertonic 3 (binary voice styles and
// unicode indexer). Runtime-agnostic: pass in onnxruntime-web (browser) or the same package in Node tests.
// Model weights: Supertone Inc., OpenRAIL-M (see public/supertonic/LICENSE).

export type TtsLang = "id" | "en";

export const TTS_LANGS: { id: TtsLang; label: string }[] = [
  { id: "id", label: "Indonesia" },
  { id: "en", label: "English" },
];

/** Minimal slice of the onnxruntime-web API used here, so tests and the browser share this module. */
export interface OrtTensor { data: unknown; dims: readonly number[] }
export interface OrtSession { run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>> }
export interface OrtModule { Tensor: new (type: "int64" | "float32", data: BigInt64Array | Float32Array, dims: number[]) => OrtTensor }

export type TtsConfig = { ae: { sample_rate: number; base_chunk_size: number }; ttl: { latent_dim: number; chunk_compress_factor: number } };

export type VoiceBank = { count: number; ttlDims: [number, number]; dpDims: [number, number]; ttl: Float32Array; dp: Float32Array };

export type Sessions = { durationPredictor: OrtSession; textEncoder: OrtSession; vectorEstimator: OrtSession; vocoder: OrtSession };

export const MODEL_FILES = ["duration_predictor.onnx", "text_encoder.onnx", "vector_estimator.onnx", "vocoder.onnx"] as const;

/** sherpa-onnx voice.bin: 6 × int64 header ([n, 50, 256], [n, 8, 16]) then all style_ttl, then all style_dp. */
export function parseVoiceBank(buf: ArrayBuffer): VoiceBank {
  const head = new BigInt64Array(buf.slice(0, 48));
  const [n, t1, t2, n2, d1, d2] = Array.from(head, Number);
  if (n !== n2 || n <= 0 || t1 <= 0 || t2 <= 0 || d1 <= 0 || d2 <= 0) throw new Error("voice.bin tidak valid.");
  const ttlLen = n * t1 * t2, dpLen = n * d1 * d2;
  if (buf.byteLength !== 48 + (ttlLen + dpLen) * 4) throw new Error("Ukuran voice.bin tidak sesuai.");
  return { count: n, ttlDims: [t1, t2], dpDims: [d1, d2], ttl: new Float32Array(buf, 48, ttlLen), dp: new Float32Array(buf, 48 + ttlLen * 4, dpLen) };
}

/** sherpa-onnx unicode_indexer.bin: int32 token id per UTF-16 code unit (−1 = unsupported). */
export function parseIndexer(buf: ArrayBuffer): Int32Array {
  if (buf.byteLength % 4 !== 0) throw new Error("unicode_indexer.bin tidak valid.");
  return new Int32Array(buf);
}

const EMOJI = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
const REPLACEMENTS: [string, string][] = [
  ["–", "-"], ["‑", "-"], ["—", "-"], ["_", " "], ["“", '"'], ["”", '"'], ["‘", "'"], ["’", "'"],
  ["´", "'"], ["`", "'"], ["[", " "], ["]", " "], ["|", " "], ["/", " "], ["#", " "], ["→", " "], ["←", " "],
];

/** Text normalisation from the reference helper, plus the language tag the multilingual model expects. */
export function preprocess(text: string, lang: TtsLang): string {
  let t = text.normalize("NFKD").replace(EMOJI, "");
  for (const [a, b] of REPLACEMENTS) t = t.split(a).join(b);
  t = t.replace(/[♥☆♡©\\]/g, "");
  t = t.split("@").join(lang === "id" ? " di " : " at ");
  t = t.replace(/ ([,.!?;:'])/g, "$1");
  t = t.replace(/"{2,}/g, '"').replace(/'{2,}/g, "'");
  t = t.replace(/\s+/g, " ").trim();
  if (!/[.!?;:,'")\]}…]$/.test(t)) t += ".";
  return `<${lang}>${t}</${lang}>`;
}

/** Maps text to token ids, dropping characters the model has no token for. */
export function textToIds(text: string, indexer: Int32Array): number[] {
  const ids: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const id = code < indexer.length ? indexer[code] : -1;
    if (id >= 0) ids.push(id);
  }
  return ids;
}

/** Deterministic standard-normal noise (mulberry32 + Box–Muller) so the same text gives the same audio. */
export function gaussian(seed: number) {
  let t = seed >>> 0;
  const uni = () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(Math.max(1e-4, uni()))) * Math.cos(2 * Math.PI * uni());
}

export type SynthOptions = { steps?: number; speed?: number; seed?: number; onStep?: (step: number, total: number) => void | Promise<void> };

export class Supertonic {
  readonly sampleRate: number;
  constructor(
    private readonly ort: OrtModule,
    private readonly sessions: Sessions,
    private readonly cfg: TtsConfig,
    private readonly indexer: Int32Array,
    readonly voices: VoiceBank,
  ) {
    this.sampleRate = cfg.ae.sample_rate;
  }

  private style(voice: number) {
    const { ttlDims: [a, b], dpDims: [c, d] } = this.voices;
    const v = Math.max(0, Math.min(this.voices.count - 1, Math.floor(voice)));
    return {
      ttl: new this.ort.Tensor("float32", this.voices.ttl.slice(v * a * b, (v + 1) * a * b), [1, a, b]),
      dp: new this.ort.Tensor("float32", this.voices.dp.slice(v * c * d, (v + 1) * c * d), [1, c, d]),
    };
  }

  /** Synthesises one utterance (keep it to a sentence or two) and returns mono samples. */
  async synthesize(text: string, lang: TtsLang, voice: number, opts: SynthOptions = {}): Promise<Float32Array> {
    const steps = opts.steps ?? 8, speed = opts.speed ?? 1.05;
    const prepared = preprocess(text, lang);
    if (!/[\p{L}\p{N}]/u.test(prepared.slice(lang.length + 2, -(lang.length + 3)))) throw new Error("Teks tidak berisi karakter yang bisa diucapkan.");
    const ids = textToIds(prepared, this.indexer);
    const { Tensor } = this.ort;
    const len = ids.length;
    const textIds = new Tensor("int64", BigInt64Array.from(ids, BigInt), [1, len]);
    const textMask = new Tensor("float32", new Float32Array(len).fill(1), [1, 1, len]);
    const style = this.style(voice);

    const dp = await this.sessions.durationPredictor.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask });
    const seconds = Number((dp.duration.data as Float32Array)[0]) / speed;
    if (!(seconds > 0)) throw new Error("Durasi ucapan tidak valid.");
    const enc = await this.sessions.textEncoder.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });

    const chunk = this.cfg.ae.base_chunk_size * this.cfg.ttl.chunk_compress_factor;
    const latentLen = Math.max(1, Math.ceil(Math.floor(seconds * this.sampleRate) / chunk));
    const latentDim = this.cfg.ttl.latent_dim * this.cfg.ttl.chunk_compress_factor;
    const noise = gaussian(opts.seed ?? 7);
    let xt = new Float32Array(latentDim * latentLen);
    for (let i = 0; i < xt.length; i++) xt[i] = noise();
    const latentMask = new Tensor("float32", new Float32Array(latentLen).fill(1), [1, 1, latentLen]);
    const total = new Tensor("float32", new Float32Array([steps]), [1]);
    for (let step = 0; step < steps; step++) {
      await opts.onStep?.(step + 1, steps);
      const out = await this.sessions.vectorEstimator.run({
        noisy_latent: new Tensor("float32", xt, [1, latentDim, latentLen]), text_emb: enc.text_emb, style_ttl: style.ttl,
        latent_mask: latentMask, text_mask: textMask, current_step: new Tensor("float32", new Float32Array([step]), [1]), total_step: total,
      });
      xt = Float32Array.from(out.denoised_latent.data as Float32Array);
    }
    const wav = await this.sessions.vocoder.run({ latent: new Tensor("float32", xt, [1, latentDim, latentLen]) });
    const samples = Float32Array.from(wav.wav_tts.data as Float32Array);
    // The vocoder pads to whole latent chunks; trim to the predicted duration.
    return samples.subarray(0, Math.min(samples.length, Math.ceil(seconds * this.sampleRate)));
  }
}
