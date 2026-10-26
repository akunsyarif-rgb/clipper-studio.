import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTimeline, FPS, MAX_SECONDS, sceneFrames } from "../script";
import { assembleNarration, clipKey, LEAD_SECONDS, sceneSecondsFor, TAIL_SECONDS } from "./narration";
import { gaussian, MODEL_FILES, parseIndexer, parseVoiceBank, preprocess, Supertonic, textToIds, type OrtModule, type TtsConfig } from "./supertonic";

function voiceBin(n: number, t: [number, number], d: [number, number]) {
  const head = new BigInt64Array([n, t[0], t[1], n, d[0], d[1]].map(BigInt));
  const ttl = Float32Array.from({ length: n * t[0] * t[1] }, (_, i) => i);
  const dp = Float32Array.from({ length: n * d[0] * d[1] }, (_, i) => -i);
  const buf = new Uint8Array(48 + (ttl.length + dp.length) * 4);
  buf.set(new Uint8Array(head.buffer), 0);
  buf.set(new Uint8Array(ttl.buffer), 48);
  buf.set(new Uint8Array(dp.buffer), 48 + ttl.length * 4);
  return buf.buffer;
}

describe("model file parsers", () => {
  it("reads the sherpa-onnx voice bank layout (header, all style_ttl, then all style_dp)", () => {
    const bank = parseVoiceBank(voiceBin(2, [3, 4], [2, 2]));
    expect(bank).toMatchObject({ count: 2, ttlDims: [3, 4], dpDims: [2, 2] });
    expect(bank.ttl.length).toBe(24);
    expect(Array.from(bank.dp)).toEqual([-0, -1, -2, -3, -4, -5, -6, -7]);
  });
  it("rejects truncated or inconsistent voice banks", () => {
    expect(() => parseVoiceBank(voiceBin(2, [3, 4], [2, 2]).slice(0, 100))).toThrow();
    const bad = voiceBin(2, [3, 4], [2, 2]);
    new BigInt64Array(bad, 0, 6)[3] = BigInt(5);
    expect(() => parseVoiceBank(bad)).toThrow();
  });
  it("reads the unicode indexer", () => {
    expect(Array.from(parseIndexer(new Int32Array([5, -1, 7]).buffer))).toEqual([5, -1, 7]);
    expect(() => parseIndexer(new ArrayBuffer(3))).toThrow();
  });
});

describe("text preparation", () => {
  it("normalises punctuation, adds a final period and wraps the language tag", () => {
    expect(preprocess("Halo  “dunia” — apa kabar", "id")).toBe('<id>Halo "dunia" - apa kabar.</id>');
    expect(preprocess("Hello , world!", "en")).toBe("<en>Hello, world!</en>");
    expect(preprocess("email@kami", "id")).toBe("<id>email di kami.</id>");
    expect(preprocess("Mulai 🚀 sekarang", "id")).toBe("<id>Mulai sekarang.</id>");
  });
  it("drops characters without a token", () => {
    const indexer = new Int32Array(128).fill(-1);
    indexer["a".charCodeAt(0)] = 1; indexer["b".charCodeAt(0)] = 2;
    expect(textToIds("abxa", indexer)).toEqual([1, 2, 1]);
  });
  it("has deterministic noise per seed", () => {
    const a = gaussian(3), b = gaussian(3), c = gaussian(4);
    const xs = Array.from({ length: 5 }, a), ys = Array.from({ length: 5 }, b), zs = Array.from({ length: 5 }, c);
    expect(xs).toEqual(ys);
    expect(xs).not.toEqual(zs);
    const many = Array.from({ length: 20000 }, gaussian(9));
    const mean = many.reduce((s, x) => s + x, 0) / many.length;
    const sd = Math.sqrt(many.reduce((s, x) => s + (x - mean) ** 2, 0) / many.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(sd).toBeGreaterThan(0.9);
    expect(sd).toBeLessThan(1.1);
  });
});

describe("narration assembly", () => {
  const rate = 1000;
  it("places each clip at its scene start plus the lead-in, on a track as long as the timeline", () => {
    const clips = [new Float32Array(1500).fill(0.5), new Float32Array(800).fill(-0.5)];
    const { samples, sceneSeconds } = assembleNarration(clips, rate, FPS);
    expect(sceneSeconds).toEqual([LEAD_SECONDS + 1.5 + TAIL_SECONDS, LEAD_SECONDS + 0.8 + TAIL_SECONDS].map(x => expect.closeTo(x, 6)));
    const frames = sceneSeconds.map(s => sceneFrames(s));
    expect(samples.length).toBe(Math.round(((frames[0] + frames[1]) / FPS) * rate));
    const start2 = Math.round((frames[0] / FPS + LEAD_SECONDS) * rate);
    expect(samples[Math.round(LEAD_SECONDS * rate) - 1]).toBe(0);
    expect(samples[Math.round(LEAD_SECONDS * rate)]).toBe(0.5);
    expect(samples[start2 - 1]).toBe(0);
    expect(samples[start2]).toBe(-0.5);
    // The timeline built from the same scene lengths has exactly the same total.
    const t = buildTimeline("Kalimat satu di sini.\nKalimat dua.", { kind: "scenes", seconds: sceneSeconds });
    expect(t.ok && t.totalFrames).toBe(frames[0] + frames[1]);
  });
  it("timeline rejects stale or oversized voice tracks", () => {
    expect(buildTimeline("Satu.\nDua kalimat.", { kind: "scenes", seconds: [2] })).toMatchObject({ ok: false });
    const r = buildTimeline("Satu kata ini.\nDua kata itu.", { kind: "scenes", seconds: [MAX_SECONDS, 5] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/melebihi/);
  });
  it("keys clips by text, language, voice and speed", () => {
    expect(clipKey("a", "id", 1, 1.05)).not.toBe(clipKey("a", "en", 1, 1.05));
    expect(sceneSecondsFor(2000, 1000)).toBeCloseTo(LEAD_SECONDS + 2 + TAIL_SECONDS);
  });
});

// Runs the real Supertonic 3 model (assembled into public/supertonic by `npm run pretest`) with
// onnxruntime-web's WASM backend, exactly as the browser does.
const dir = join(process.cwd(), "public", "supertonic");
const hasModel = MODEL_FILES.every(f => existsSync(join(dir, f)));
describe.skipIf(!hasModel)("Supertonic 3 synthesis", () => {
  let tts: Supertonic;
  const load = async () => {
    if (tts) return tts;
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    const ab = (f: string) => { const b = readFileSync(join(dir, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const [durationPredictor, textEncoder, vectorEstimator, vocoder] = await Promise.all(MODEL_FILES.map(f => ort.InferenceSession.create(new Uint8Array(ab(f)))));
    tts = new Supertonic(ort as unknown as OrtModule, { durationPredictor, textEncoder, vectorEstimator, vocoder }, JSON.parse(readFileSync(join(dir, "tts.json"), "utf8")) as TtsConfig, parseIndexer(ab("unicode_indexer.bin")), parseVoiceBank(ab("voice.bin")));
    return tts;
  };

  /** Median pitch over voiced 40 ms frames (autocorrelation), in Hz. */
  function medianF0(x: Float32Array, sr: number) {
    const win = Math.round(0.04 * sr), hop = Math.round(0.01 * sr), lo = Math.floor(sr / 400), hi = Math.floor(sr / 70);
    const f0s: number[] = [];
    for (let i = 0; i + win < x.length; i += hop) {
      let e = 0;
      for (let j = 0; j < win; j++) e += x[i + j] ** 2;
      if (Math.sqrt(e / win) < 0.02) continue;
      let best = 0, bestK = 0;
      for (let k = lo; k < hi; k++) { let c = 0; for (let j = 0; j + k < win; j++) c += x[i + j] * x[i + j + k]; if (c > best) { best = c; bestK = k; } }
      if (best / e > 0.45) f0s.push(sr / bestK);
    }
    f0s.sort((a, b) => a - b);
    return { f0: f0s[Math.floor(f0s.length / 2)] ?? 0, voiced: f0s.length };
  }

  it("speaks Indonesian with a female voice: plausible length, voiced, high pitch", async () => {
    const t = await load();
    const text = "Halo semuanya, selamat datang.";
    const s = await t.synthesize(text, "id", 0, { steps: 6 });
    const seconds = s.length / t.sampleRate;
    expect(t.sampleRate).toBe(44100);
    expect(seconds).toBeGreaterThan(text.length / 25);
    expect(seconds).toBeLessThan(text.length / 6);
    const { f0, voiced } = medianF0(s, t.sampleRate);
    expect(voiced).toBeGreaterThan(seconds * 20);
    expect(f0).toBeGreaterThan(160);
  }, 180_000);

  it("speaks English with a male voice: low pitch, deterministic per seed", async () => {
    const t = await load();
    const a = await t.synthesize("Start now, even if your steps are small.", "en", 7, { steps: 6, seed: 5 });
    const b = await t.synthesize("Start now, even if your steps are small.", "en", 7, { steps: 6, seed: 5 });
    expect(Array.from(a.subarray(0, 2000))).toEqual(Array.from(b.subarray(0, 2000)));
    const { f0 } = medianF0(a, t.sampleRate);
    expect(f0).toBeGreaterThan(70);
    expect(f0).toBeLessThan(160);
  }, 180_000);

  it("rejects text with nothing to say", async () => {
    const t = await load();
    await expect(t.synthesize("🚀🚀", "id", 0)).rejects.toThrow(/karakter/);
  }, 60_000);
});
