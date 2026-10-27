import { describe, expect, it } from "vitest";
import { RETRY_OPTIONS, transcribeSpeech, type Pipe } from "./run";
import { ASR_SAMPLE_RATE } from "./speech";
import { transcriptFromWords, transcriptText } from "../transcript";

const RATE = ASR_SAMPLE_RATE;
const voice = (seconds: number, amp = 0.3) => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amp * (0.7 * Math.sin((2 * Math.PI * 180 * i) / RATE) + 0.3 * Math.sin((2 * Math.PI * 600 * i) / RATE)) * (0.7 + 0.3 * Math.sin((2 * Math.PI * 3 * i) / RATE)));
const silence = (seconds: number) => new Float32Array(Math.round(seconds * RATE));
const join = (...parts: Float32Array[]) => { const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const words = (...ws: [string, number, number][]) => ({ chunks: ws.map(([text, a, b]) => ({ text, timestamp: [a, b] })) });

describe("transcribeSpeech", () => {
  const audio = () => join(silence(2), voice(3), silence(5), voice(2), silence(2));

  it("sends only the speech, and moves each region's timestamps to where it sits in the recording", async () => {
    const calls: number[] = [];
    const pipe: Pipe = async (slice, opts) => { calls.push(slice.length / RATE); expect(opts.language).toBe("indonesian"); expect(opts.return_timestamps).toBe("word"); return words([" Halo", 0.3, 0.6], [" dunia", 0.7, 1.1]); };
    const run = await transcribeSpeech(pipe, audio(), "indonesian");
    expect(calls).toHaveLength(2);
    expect(calls.reduce((a, b) => a + b, 0)).toBeLessThan(7); // 14 s recording, about 6 s of it spoken
    expect(run.granularity).toBe("word");
    expect(run.chunks).toHaveLength(4);
    // The second voice starts at 10 s (padding moves its region to 9.75 s), so its first word at 0.3 s lands near 10 s.
    expect(run.chunks[2].timestamp[0]).toBeGreaterThan(9.9);
    expect(run.chunks[2].timestamp[0]).toBeLessThan(10.3);
    for (let i = 1; i < run.chunks.length; i++) expect(run.chunks[i].timestamp[0]!).toBeGreaterThanOrEqual(run.chunks[i - 1].timestamp[0]!);
    expect(run.speechSeconds).toBeGreaterThan(5); expect(run.speechSeconds).toBeLessThan(7);
    expect(run.retried).toBe(0);
  });

  it("reports progress in seconds of speech, from 0 to the total, never going back", async () => {
    const seen: [number, number][] = [];
    await transcribeSpeech(async () => words([" a", 0, 1]), audio(), "indonesian", (d, t) => seen.push([d, t]));
    expect(seen[0][0]).toBe(0);
    expect(seen.length).toBe(3);
    expect(seen.at(-1)![0]).toBeCloseTo(seen.at(-1)![1], 6);
    for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThan(seen[i - 1][0]);
  });

  it("finds nothing to say in silence and never calls the model", async () => {
    let called = false;
    const run = await transcribeSpeech(async () => { called = true; return words(); }, silence(10), "indonesian");
    expect(called).toBe(false);
    expect(run.chunks).toEqual([]);
    expect(run.speechSeconds).toBe(0);
  });

  it("runs a region again with repetition penalties when its text loops, and keeps the better answer", async () => {
    const seen: unknown[] = [];
    const loop = words([" Jadi", 0, 0.3], ...Array.from({ length: 12 }, (_, i): [string, number, number] => [i % 2 ? " mana?" : " yang", 0.5 + i * 0.2, 0.7 + i * 0.2]));
    const pipe: Pipe = async (_s, opts) => { seen.push(opts); return opts.repetition_penalty ? words([" Jadi", 0, 0.3], [" yang", 0.4, 0.6], [" mana?", 0.6, 1]) : loop; };
    const run = await transcribeSpeech(pipe, join(silence(1), voice(3), silence(1)), "indonesian");
    expect(run.retried).toBe(1);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject(RETRY_OPTIONS);
    expect(run.chunks.map(c => c.text).join("")).toBe(" Jadi yang mana?");
  });

  it("keeps a looping answer when the retry does not help (the final folding handles it)", async () => {
    const loop = words(...Array.from({ length: 16 }, (_, i): [string, number, number] => [i % 2 ? " mana?" : " yang", i * 0.2, i * 0.2 + 0.2]));
    const run = await transcribeSpeech(async () => loop, join(silence(1), voice(3), silence(1)), "indonesian");
    expect(run.retried).toBe(1);
    const t = transcriptFromWords(run.chunks, 5, "id");
    expect(transcriptText(t)).toBe("yang mana?");
  });

  it("switches the whole run to segment timestamps when the model has no word alignment", async () => {
    const modes: unknown[] = [];
    const pipe: Pipe = async (_s, opts) => {
      modes.push(opts.return_timestamps);
      if (opts.return_timestamps === "word") throw new Error("Model outputs do not have cross attentions for alignment");
      return words([" Halo dunia", 0, 2]);
    };
    const run = await transcribeSpeech(pipe, audio(), "indonesian");
    expect(run.granularity).toBe("segment");
    // First region: word (fails) then segment; second region goes straight to segments.
    expect(modes).toEqual(["word", true, true]);
    expect(run.chunks).toHaveLength(2);
  });

  it("passes any other error on, untouched", async () => {
    await expect(transcribeSpeech(async () => { throw new Error("out of memory"); }, audio(), "indonesian")).rejects.toThrow("out of memory");
  });

  it("normalises a quiet recording before it reaches the model", async () => {
    let peak = 0;
    await transcribeSpeech(async s => { peak = Math.max(peak, ...s.map(Math.abs)); return words([" a", 0, 1]); }, join(silence(1), voice(2, 0.05), silence(1)), "indonesian");
    expect(peak).toBeGreaterThan(0.3);
  });
});
