import { describe, expect, it } from "vitest";
import { ASR_SAMPLE_RATE, frameEnergies, MAX_REGION_SECONDS, normalizeSpeech, speechRegions } from "./speech";

const RATE = ASR_SAMPLE_RATE;
/** Deterministic "speech": a mix of tones with a slow amplitude wobble, so it has energy like a voice. */
function voice(seconds: number, amp = 0.3): Float32Array {
  const n = Math.round(seconds * RATE), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = amp * (0.6 * Math.sin(2 * Math.PI * 180 * t) + 0.3 * Math.sin(2 * Math.PI * 540 * t) + 0.1 * Math.sin(2 * Math.PI * 1500 * t)) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 3 * t));
  }
  return out;
}
const silence = (seconds: number, noise = 0) => {
  const out = new Float32Array(Math.round(seconds * RATE));
  // Pseudo-random room noise from a fixed seed.
  let x = 12345;
  if (noise > 0) for (let i = 0; i < out.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; out[i] = noise * ((x / 0x7fffffff) * 2 - 1); }
  return out;
};
const join = (...parts: Float32Array[]) => { const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };

describe("normalizeSpeech", () => {
  it("raises a quiet recording, limited, without clipping", () => {
    const quiet = voice(1, 0.05);
    const gain = normalizeSpeech(quiet);
    expect(gain).toBeGreaterThan(2);
    expect(gain).toBeLessThanOrEqual(8);
    expect(Math.max(...quiet.map(Math.abs))).toBeLessThanOrEqual(0.9 + 1e-6);
  });
  it("leaves loud audio and silence alone", () => {
    const loud = Float32Array.from({ length: RATE }, (_, i) => 0.9 * Math.sin((2 * Math.PI * 200 * i) / RATE));
    expect(normalizeSpeech(loud)).toBe(1);
    expect(normalizeSpeech(silence(1))).toBe(1);
  });
  it("never applies more than the maximum gain, so a hiss is not turned into a roar", () => {
    const hiss = silence(1, 0.001);
    expect(normalizeSpeech(hiss)).toBeLessThanOrEqual(8);
  });
});

describe("frameEnergies", () => {
  it("has one value per 30 ms and tells voice from silence", () => {
    const e = frameEnergies(join(voice(1), silence(1)));
    expect(e.length).toBe(Math.ceil(2 * RATE / 480));
    expect(e[10]).toBeGreaterThan(0.05);
    expect(e[e.length - 5]).toBe(0);
  });
});

describe("speechRegions", () => {
  it("finds each spoken part with a little padding, and nothing in the silence between", () => {
    const r = speechRegions(join(silence(1), voice(3), silence(4), voice(2), silence(1)));
    expect(r).toHaveLength(2);
    expect(r[0].start).toBeGreaterThan(0.6); expect(r[0].start).toBeLessThan(1);
    expect(r[0].end).toBeGreaterThan(4); expect(r[0].end).toBeLessThan(4.5);
    expect(r[1].start).toBeGreaterThan(7.5); expect(r[1].start).toBeLessThan(8.1);
    expect(r[1].end).toBeGreaterThan(10); expect(r[1].end).toBeLessThan(10.6);
  });

  it("keeps a short pause inside one region", () => {
    expect(speechRegions(join(voice(2), silence(0.4), voice(2)))).toHaveLength(1);
  });

  it("ignores a click shorter than a word", () => {
    expect(speechRegions(join(silence(1), voice(0.1), silence(2)))).toEqual([]);
  });

  it("returns nothing for silence, digital zero and very faint hiss", () => {
    expect(speechRegions(silence(5))).toEqual([]);
    expect(speechRegions(silence(5, 0.0005))).toEqual([]);
    expect(speechRegions(new Float32Array(0))).toEqual([]);
  });

  it("works in room noise: speech stands out from a steady background", () => {
    const noisy = (s: Float32Array, n: Float32Array) => s.map((v, i) => v + n[i]);
    const bg = silence(9, 0.02);
    const mix = noisy(join(silence(3), voice(3), silence(3)), bg);
    const r = speechRegions(mix);
    expect(r).toHaveLength(1);
    expect(r[0].start).toBeGreaterThan(2.4); expect(r[0].end).toBeLessThan(6.6);
  });

  it("cuts a long stretch of speech into windows the model can take, at a quiet moment", () => {
    const long = join(voice(20), silence(0.2), voice(40));
    const r = speechRegions(long, RATE, { mergeGapSeconds: 1 });
    expect(r.length).toBeGreaterThanOrEqual(3);
    for (const x of r) expect(x.end - x.start).toBeLessThanOrEqual(MAX_REGION_SECONDS + 0.6);
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBeGreaterThanOrEqual(r[i - 1].end - 1e-9);
    // Together they still cover the speech.
    expect(r[0].start).toBeLessThan(0.3);
    expect(r.at(-1)!.end).toBeGreaterThan(59.5);
  });

  it("covers continuous speech completely, with no gap larger than the padding", () => {
    const r = speechRegions(voice(70));
    for (let i = 1; i < r.length; i++) expect(r[i].start - r[i - 1].end).toBeLessThan(0.6);
    expect(r.reduce((a, x) => a + x.end - x.start, 0)).toBeGreaterThan(68);
  });
});
