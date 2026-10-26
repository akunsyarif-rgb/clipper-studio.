import { describe, expect, it } from "vitest";
import { audioArgs } from "./clip";
import { autoCuts, detectVisual } from "./visuals";
import { activeWordIndex, buildTimeline, FPS, splitScript } from "./script";
import {
  activeAt, allWords, editSegment, explainTranscribeError, formatSrtTime, groupSegments, mergeSubwords, parseHandoff, parseWords,
  sceneTimings, serializeHandoff, spreadWords, toSrt, transcriptFromSegments, transcriptFromWords, transcriptText, validateTranscribeRange,
  type RawChunk,
} from "./transcript";

const chunk = (text: string, s: number | null, e: number | null): RawChunk => ({ text, timestamp: [s, e] });
const SAMPLE: RawChunk[] = [
  chunk(" Jangan", 0.2, 0.6), chunk(" tunggu", 0.6, 1.0), chunk(" semangat", 1.0, 1.6), chunk(" datang.", 1.6, 2.2),
  chunk(" Mulailah", 3.0, 3.6), chunk(" sekarang", 3.6, 4.4),
];

describe("parseWords", () => {
  it("keeps timestamps, trims text and rounds to milliseconds", () => {
    const w = parseWords([chunk("  halo ", 0.1234, 0.5678)], 10);
    expect(w).toEqual([{ text: "halo", start: 0.123, end: 0.568 }]);
  });
  it("fills a missing end from the next word and a missing start from the previous end", () => {
    const w = parseWords([chunk(" a", 1, null), chunk(" b", 2, 3), chunk(" c", null, null)], 10);
    expect(w[0].end).toBe(2);
    expect(w[2].start).toBe(3);
    expect(w[2].end).toBeCloseTo(3.3, 5);
  });
  it("never overlaps or goes backwards, and clamps to the duration", () => {
    const w = parseWords([chunk(" a", 1, 2), chunk(" b", 1.5, 2.5), chunk(" c", 9.9, 12)], 10);
    expect(w[1].start).toBe(2);
    for (let i = 1; i < w.length; i++) expect(w[i].start).toBeGreaterThanOrEqual(w[i - 1].end);
    expect(w[2].end).toBe(10);
  });
  it("drops empty chunks and bracketed non-speech tags", () => {
    expect(parseWords([chunk(" ", 0, 1), chunk(" [MUSIK]", 1, 2), chunk(" (tepuk tangan)", 2, 3), chunk(" ya", 3, 4)], 10).map(w => w.text)).toEqual(["ya"]);
  });
});

describe("mergeSubwords", () => {
  it("joins tokens that do not start with a space", () => {
    const m = mergeSubwords([chunk(" ber", 0, 0.2), chunk("main", 0.2, 0.5), chunk(" bola", 0.5, 0.9)]);
    expect(m.map(c => c.text)).toEqual([" bermain", " bola"]);
    expect(m[0].timestamp).toEqual([0, 0.5]);
  });
});

describe("groupSegments / transcriptFromWords", () => {
  it("splits at sentence ends and pauses", () => {
    const t = transcriptFromWords(SAMPLE, 5, "id");
    expect(t.granularity).toBe("word");
    expect(t.segments.map(s => s.text)).toEqual(["Jangan tunggu semangat datang.", "Mulailah sekarang"]);
    expect(t.segments[0].start).toBe(0.2);
    expect(t.segments[1].end).toBe(4.4);
  });
  it("cuts long runs of words without punctuation", () => {
    const words = Array.from({ length: 60 }, (_, i) => ({ text: "kata", start: i * 0.3, end: i * 0.3 + 0.25 }));
    const segs = groupSegments(words);
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) { expect(s.text.length).toBeLessThanOrEqual(140); expect(s.end - s.start).toBeLessThanOrEqual(10.3); }
    expect(segs.flatMap(s => s.words)).toHaveLength(60);
  });
  it("merges very short segments into their neighbour", () => {
    const t = transcriptFromWords([chunk(" Ya.", 0, 0.3), chunk(" Baik", 0.4, 0.8), chunk(" sekali", 0.8, 1.5), chunk(" ini.", 1.5, 2)], 5, "id");
    expect(t.segments).toHaveLength(1);
  });
});

describe("transcriptFromSegments (no word timestamps)", () => {
  it("spreads words inside each segment and flags the granularity", () => {
    const t = transcriptFromSegments([chunk(" Satu dua tiga empat", 0, 4), chunk(" lima enam", 4, null)], 6, "id");
    expect(t.granularity).toBe("segment");
    expect(t.segments[0].words).toHaveLength(4);
    expect(t.segments[0].words[0].start).toBe(0);
    expect(t.segments[0].words[3].end).toBeCloseTo(4, 2);
    expect(t.segments[1].end).toBe(6);
  });
});

describe("editSegment", () => {
  const t = transcriptFromWords(SAMPLE, 5, "id");
  it("keeps word timing when the word count is unchanged", () => {
    const e = editSegment(t, 0, "Jangan tunggu semangat datang!");
    expect(e.segments[0].text).toBe("Jangan tunggu semangat datang!");
    expect(e.segments[0].words.map(w => [w.start, w.end])).toEqual(t.segments[0].words.map(w => [w.start, w.end]));
  });
  it("spreads new words over the same span when the count changes, staying monotonic", () => {
    const e = editSegment(t, 0, "Jangan menunggu semangat itu datang");
    const w = e.segments[0].words;
    expect(w).toHaveLength(5);
    expect(w[0].start).toBe(t.segments[0].start);
    expect(w[4].end).toBeCloseTo(t.segments[0].end, 2);
    for (let i = 1; i < w.length; i++) expect(w[i].start).toBeCloseTo(w[i - 1].end, 2);
  });
  it("removes a segment when its text is emptied and does not mutate the input", () => {
    expect(editSegment(t, 1, "  ").segments).toHaveLength(1);
    expect(t.segments).toHaveLength(2);
  });
  it("ignores an out-of-range index", () => { expect(editSegment(t, 9, "x")).toBe(t); });
});

describe("SRT and lookup", () => {
  const t = transcriptFromWords(SAMPLE, 5, "id");
  it("formats SRT timestamps", () => {
    expect(formatSrtTime(3723.4567)).toBe("01:02:03,457");
    expect(formatSrtTime(-1)).toBe("00:00:00,000");
  });
  it("writes numbered cues", () => {
    expect(toSrt(t)).toBe("1\n00:00:00,200 --> 00:00:02,200\nJangan tunggu semangat datang.\n\n2\n00:00:03,000 --> 00:00:04,400\nMulailah sekarang\n");
  });
  it("finds the active word and reports silence", () => {
    expect(activeAt(t, 1.2)).toEqual({ segment: 0, word: 2 });
    expect(activeAt(t, 2.6)).toBeNull();
    expect(activeAt(t, 4.0)).toEqual({ segment: 1, word: 1 });
  });
  it("joins segments into script lines", () => { expect(transcriptText(t)).toBe("Jangan tunggu semangat datang.\nMulailah sekarang"); });
  it("spreadWords covers the span exactly", () => {
    const w = spreadWords("a bb ccc", 1, 4);
    expect(w[0].start).toBe(1);
    expect(w[2].end).toBeCloseTo(4, 2);
  });
});

describe("sceneTimings (transcript → motion scenes)", () => {
  const t = transcriptFromWords(SAMPLE, 5, "id");
  const texts = splitScript(transcriptText(t));
  it("derives scene lengths that sum to the transcript duration, with per-word frames", () => {
    const r = sceneTimings(texts, allWords(t), FPS, 5)!;
    expect(r.seconds).toHaveLength(2);
    expect(r.seconds.reduce((a, b) => a + b, 0)).toBeCloseTo(5, 5);
    expect(r.wordStarts[0]).toEqual([6, 18, 30, 48]); // first word at 0.2 s = frame 6
    expect(r.wordStarts[1][0]).toBe(0);
    const total = buildTimeline(transcriptText(t), { kind: "scenes", seconds: r.seconds }, FPS);
    expect(total.ok && total.totalFrames).toBe(150);
  });
  it("returns null when the script no longer matches the transcript words", () => {
    expect(sceneTimings(splitScript("Kata lain sama sekali"), allWords(t), FPS)).toBeNull();
  });
  it("ignores *emphasis* marks when matching words", () => {
    expect(sceneTimings(splitScript("Jangan tunggu *semangat* datang.\nMulailah sekarang"), allWords(t), FPS, 5)).not.toBeNull();
  });
});

describe("activeWordIndex with transcript timing (regression)", () => {
  it("is unchanged without wordStarts", () => {
    expect(activeWordIndex("satu dua tiga empat", 0, 100)).toBe(0);
    expect(activeWordIndex("satu dua tiga empat", 89, 100)).toBe(3);
  });
  it("follows spoken word starts", () => {
    const starts = [0, 40, 45, 80];
    expect(activeWordIndex("satu dua tiga empat", 0, 100, starts)).toBe(0);
    expect(activeWordIndex("satu dua tiga empat", 41, 100, starts)).toBe(1);
    expect(activeWordIndex("satu dua tiga empat", 79, 100, starts)).toBe(2);
    expect(activeWordIndex("satu dua tiga empat", 99, 100, starts)).toBe(3);
  });
  it("ignores wordStarts of the wrong length", () => {
    expect(activeWordIndex("satu dua", 0, 100, [0])).toBe(0);
  });
});

describe("handoff", () => {
  const t = transcriptFromWords(SAMPLE, 5, "id");
  it("round-trips", () => { expect(parseHandoff(serializeHandoff(t, "a.mp4"))).toEqual({ source: "a.mp4", transcript: t }); });
  it("rejects missing, malformed and over-long data", () => {
    expect(parseHandoff(null)).toBeNull();
    expect(parseHandoff("{not json")).toBeNull();
    expect(parseHandoff(JSON.stringify({ v: 2, transcript: t }))).toBeNull();
    expect(parseHandoff(JSON.stringify({ v: 1, transcript: { ...t, duration: 500 } }))).toBeNull();
    expect(parseHandoff(JSON.stringify({ v: 1, transcript: { ...t, segments: [{ text: "x", start: 0, end: 1, words: [{ text: 1 }] }] } }))).toBeNull();
  });
});

describe("limits and errors", () => {
  it("keeps the 3 minute limit", () => {
    expect(validateTranscribeRange(180)).toBeNull();
    expect(validateTranscribeRange(181)).toMatch(/3 menit/);
    expect(validateTranscribeRange(0)).not.toBeNull();
    expect(validateTranscribeRange(NaN)).not.toBeNull();
  });
  it("explains common failures in Indonesian", () => {
    expect(explainTranscribeError("no audio: video tidak punya audio")).toMatch(/tidak memiliki suara/);
    expect(explainTranscribeError("RangeError: Array buffer allocation failed")).toMatch(/Memori/);
    expect(explainTranscribeError("Failed to fetch https://huggingface.co/x")).toMatch(/diunduh/);
    expect(explainTranscribeError("???")).toMatch(/Transkripsi gagal/);
  });
});

describe("audioArgs", () => {
  it("extracts 16 kHz mono PCM of the range, audio only", () => {
    const a = audioArgs("/input/v.mp4", { start: 12.5, duration: 30 });
    expect(a.slice(0, 6)).toEqual(["-ss", "12.500", "-i", "/input/v.mp4", "-t", "30.000"]);
    expect(a).toContain("-vn");
    expect(a.join(" ")).toContain("-ac 1 -ar 16000 -f s16le");
    expect(a).not.toContain("libx264");
  });
});

describe("autoCuts (source-video edit plan)", () => {
  const v = (t: string) => detectVisual(t);
  it("keeps the speaker first and never puts two graphics in a row", () => {
    const cuts = autoCuts([v("Ada 100 ribu orang yang ikut."), v("Uang itu penting sekali."), v("Waktu itu berharga."), v("Ya begitulah."), v("Siapa yang mau mulai?")]);
    expect(cuts[0]).toBe("video");
    expect(cuts.some(c => c === "graphic")).toBe(true);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i] === "graphic" && cuts[i - 1] === "graphic").toBe(false);
  });
  it("stays on the speaker for plain statements", () => {
    expect(autoCuts([v("Ya begitulah."), v("Sudah lama sekali.")])).toEqual(["video", "video"]);
  });
});
