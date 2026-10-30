import { describe, expect, it } from "vitest";
import { refineLines, voicedRegions, wordsOverVoice, type TimedLine } from "./align";

const RATE = 16000;
/** Speech-like audio: loud tone bursts over [a, b] seconds on a quiet noise floor. */
function audio(seconds: number, bursts: [number, number][], loud = 0.3): Float32Array {
  const x = new Float32Array(Math.round(seconds * RATE));
  let seed = 3;
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = ((seed / 4294967296) - 0.5) * 0.004;
    const on = bursts.some(([a, b]) => t >= a && t < b);
    x[i] = noise + (on ? loud * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) : 0);
  }
  return x;
}

describe("voiced regions", () => {
  it("finds the stretches of speech and bridges the short dips inside a sentence", () => {
    const r = voicedRegions(audio(10, [[1, 2.5], [2.6, 4], [6, 8]]), RATE);
    expect(r).toHaveLength(2);
    expect(r[0].start).toBeCloseTo(1, 1); expect(r[0].end).toBeCloseTo(4, 1);
    expect(r[1].start).toBeCloseTo(6, 1); expect(r[1].end).toBeCloseTo(8, 1);
  });
  it("finds nothing in silence or in an even tone", () => {
    expect(voicedRegions(new Float32Array(10 * RATE), RATE)).toEqual([]);
    expect(voicedRegions(audio(10, [[0, 10]]), RATE).length).toBeLessThanOrEqual(1);
    expect(voicedRegions(new Float32Array(100), RATE)).toEqual([]);
  });
});

describe("words over the voice", () => {
  it("skips the pauses and keeps proportion to word length", () => {
    const w = wordsOverVoice("satu dua tiga empat", 0, 6, [{ start: 0, end: 2 }, { start: 4, end: 6 }]);
    expect(w.map(x => x.text)).toEqual(["satu", "dua", "tiga", "empat"]);
    // "satu dua" fit the first stretch, "tiga empat" the second: nothing falls in the pause (2-4 s).
    for (const x of w) expect(x.end <= 2.0001 || x.start >= 3.9999).toBe(true);
    for (let i = 1; i < w.length; i++) expect(w[i].start).toBeGreaterThanOrEqual(w[i - 1].end - 1e-6);
    expect(w[0].start).toBeCloseTo(0, 2); expect(w.at(-1)!.end).toBeCloseTo(6, 2);
  });
  it("spreads evenly when there is no voice to go by", () => {
    const w = wordsOverVoice("a bb ccc", 10, 16, []);
    expect(w[0].start).toBe(10); expect(w.at(-1)!.end).toBeCloseTo(16, 2);
  });
});

describe("refining the AI's line times", () => {
  // True speech: 1.0-3.8 s and 5.2-8.0 s. The AI was 0.6 s late on the first line and 0.7 s early on the second.
  const regions = voicedRegions(audio(10, [[1, 3.8], [5.2, 8]]), RATE);
  const ai: TimedLine[] = [{ start: 1.6, end: 4.3, text: "kalimat pertama yang cukup panjang" }, { start: 4.5, end: 7.4, text: "kalimat kedua juga panjang" }];
  it("moves starts and ends to where the voice starts and stops", () => {
    const r = refineLines(ai, regions);
    expect(r[0].start).toBeCloseTo(0.94, 1); expect(r[0].end).toBeCloseTo(3.92, 1);
    expect(r[1].start).toBeCloseTo(5.14, 1); expect(r[1].end).toBeCloseTo(8.12, 1);
    expect(r[0].end).toBeLessThanOrEqual(r[1].start);
    expect(r[0].words!.at(-1)!.end).toBeLessThanOrEqual(r[0].end + 1e-6);
  });
  it("keeps the AI's time where there is no silence edge nearby, and never overlaps or shortens a line below 0.3 s", () => {
    const one = refineLines([{ start: 20, end: 24, text: "jauh dari suara" }], regions);
    expect(one[0].start).toBe(20); expect(one[0].end).toBe(24);
    const tight = refineLines([{ start: 1.0, end: 1.2, text: "oh" }, { start: 1.2, end: 3.8, text: "ya begitu" }], regions);
    expect(tight[0].end - tight[0].start).toBeGreaterThanOrEqual(0.19);
    expect(tight[1].start).toBeGreaterThanOrEqual(tight[0].end - 1e-6);
  });
  it("changes nothing without usable audio", () => {
    const r = refineLines(ai, []);
    expect(r.map(l => [l.start, l.end])).toEqual([[1.6, 4.3], [4.5, 7.4]]);
    expect(r[0].words).toBeUndefined();
  });
  it("gets closer to the truth than the AI's own times", () => {
    const truth = [[1, 3.8], [5.2, 8]];
    const err = (ls: TimedLine[]) => ls.reduce((a, l, i) => a + Math.abs(l.start - truth[i][0]) + Math.abs(l.end - truth[i][1]), 0);
    expect(err(refineLines(ai, regions))).toBeLessThan(err(ai) / 3);
  });
});
