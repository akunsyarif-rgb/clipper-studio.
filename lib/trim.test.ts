import { describe, expect, it } from "vitest";
import { absoluteWords, clampTrim, handoffRange, handoffTrim, isWhole, reslice, snapToWords, trimSeconds } from "./trim";
import { scriptFromTranscript, type Transcript } from "./transcript";

const w = (text: string, start: number, end: number) => ({ text, start, end });
const transcript = (words: ReturnType<typeof w>[][], duration: number): Transcript => ({
  language: "id", granularity: "word", duration,
  segments: words.map(ws => ({ start: ws[0].start, end: ws[ws.length - 1].end, text: ws.map(x => x.text).join(" "), words: ws })),
});

describe("trim range", () => {
  it("keeps the range inside the file, at least a second, at most three minutes", () => {
    expect(clampTrim({ start: -3, end: 20 }, 60)).toEqual({ start: 0, end: 20 });
    expect(clampTrim({ start: 10, end: 90 }, 60)).toEqual({ start: 10, end: 60 });
    expect(clampTrim({ start: 10, end: 10.2 }, 60)).toEqual({ start: 10, end: 11 });
    expect(clampTrim({ start: 59.9, end: 60 }, 60, "start")).toEqual({ start: 59, end: 60 });
    expect(clampTrim({ start: 0, end: 400 }, 400)).toEqual({ start: 0, end: 180 });
    expect(clampTrim({ start: 10, end: 400 }, 400, "start")).toEqual({ start: 220, end: 400 });
  });
  it("tells whole from trimmed and gives the length", () => {
    expect(isWhole(null, 60)).toBe(true);
    expect(isWhole({ start: 0, end: 60 }, 60)).toBe(true);
    expect(isWhole({ start: 3, end: 60 }, 60)).toBe(false);
    expect(trimSeconds({ start: 3, end: 43 }, 60)).toBe(40);
    expect(trimSeconds(null, 60)).toBe(60);
  });
  it("puts words on the file's timeline", () => {
    expect(absoluteWords([w("a", 0.5, 1)], 3)).toEqual([w("a", 3.5, 4)]);
  });
});

describe("snap to words", () => {
  const words = [w("Jadi", 3.2, 3.6), w("kita", 3.7, 4), w("mulai", 4.1, 4.6), w("sekarang", 4.7, 5.4), w("Lalu", 6.5, 6.9)];
  it("starts a little before the first word and ends a little after the last, trimming silence", () => {
    const t = snapToWords({ start: 1, end: 5.9 }, words);
    expect(t.start).toBeCloseTo(3.05, 5);
    expect(t.end).toBeCloseTo(5.55, 5);
  });
  it("a start inside a word goes to the word's beginning", () => {
    const t = snapToWords({ start: 3.4, end: 5.4 }, words);
    expect(t.start).toBeCloseTo(3.05, 5);
  });
  it("never reaches into the neighbouring word", () => {
    const close = [w("a", 1, 1.5), w("b", 1.55, 2), w("c", 2.05, 2.5)];
    const t = snapToWords({ start: 1.52, end: 2.5 }, close);
    expect(t.start).toBeGreaterThanOrEqual(1.5 - 1e-9);
    expect(t.end).toBeCloseTo(2.65, 5);
  });
  it("keeps the range when no word is inside or the result would be shorter than a second", () => {
    expect(snapToWords({ start: 10, end: 12 }, words)).toEqual({ start: 10, end: 12 });
    expect(snapToWords({ start: 3, end: 3.5 }, [w("a", 3.1, 3.4)])).toEqual({ start: 3, end: 3.5 });
  });
});

describe("what a trim does to a transcript", () => {
  const t = transcript([[w("Halo", 0.2, 0.6), w("dunia.", 0.7, 1.2)], [w("Apa", 3, 3.3), w("kabar.", 3.4, 4)]], 5);
  const script = scriptFromTranscript(t, 30);
  it("is unchanged for the same range", () => {
    expect(reslice(t, { start: 0, end: 5 }, { start: 0, end: 5 }, script, 30).outcome).toBe("same");
  });
  it("cuts the transcript and rebuilds an unedited script when the range shrinks", () => {
    const r = reslice(t, { start: 10, end: 15 }, { start: 12.5, end: 15 }, script, 30);
    expect(r.outcome).toBe("kept");
    expect(r.transcript?.segments).toHaveLength(1);
    expect(r.transcript?.segments[0].words[0].start).toBeCloseTo(0.5, 3);
    expect(r.script).toBe(scriptFromTranscript(r.transcript!, 30));
    expect(r.script).not.toContain("Halo");
  });
  it("keeps an edited script as it is", () => {
    const r = reslice(t, { start: 10, end: 15 }, { start: 12.5, end: 15 }, "Naskah yang saya ubah", 30);
    expect(r.outcome).toBe("kept"); expect(r.script).toBeNull();
  });
  it("drops the transcript when the range grows past what was transcribed", () => {
    const r = reslice(t, { start: 10, end: 15 }, { start: 8, end: 15 }, script, 30);
    expect(r).toEqual({ transcript: null, script: null, outcome: "lost" });
  });
});

describe("what the clipper hands over", () => {
  it("adds up to three seconds on each side that exist in the video", () => {
    expect(handoffRange(10, 40, 100)).toEqual({ start: 7, duration: 36, padStart: 3, padEnd: 3 });
    expect(handoffRange(1, 40, 100)).toEqual({ start: 0, duration: 43, padStart: 1, padEnd: 3 });
    expect(handoffRange(10, 99, 100)).toEqual({ start: 7, duration: 93, padStart: 3, padEnd: 1 });
    expect(handoffRange(0, 30, 100).padStart).toBe(0);
  });
  it("the default trim is the clip itself inside the footage", () => {
    expect(handoffTrim(3, 3, 30)).toEqual({ start: 3, end: 33 });
    expect(handoffTrim(0, 3, 30)).toEqual({ start: 0, end: 30 });
    expect(handoffTrim(0, 0, 30)).toBeNull();
  });
});
