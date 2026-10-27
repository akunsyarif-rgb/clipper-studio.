import { describe, expect, it } from "vitest";
import { audioArgs } from "./clip";
import { autoCuts, detectVisual } from "./visuals";
import { activeWordIndex, buildTimeline, FPS, phraseChunks, phraseLine, splitScript } from "./script";
import {
  activeAt, alignWords, allWords, asrEta, collapseRepeats, looksLooping, asrSlowHint, asrTimingSummary, editSegment, explainTranscribeError, formatSrtTime, groupSegments, mergeSubwords, parseHandoff, parseWords, shiftWords,
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
  it("draws an animation over the speaker for scenes with a number, step, question, concept or call to action", () => {
    const cuts = autoCuts([v("Ada 100 ribu orang yang ikut."), v("Uang itu penting sekali."), v("Pertama, tentukan targetmu."), v("Siapa yang mau mulai?"), v("Ikuti untuk tips berikutnya.")]);
    expect(cuts).toEqual(["overlay", "overlay", "overlay", "overlay", "overlay"]);
  });
  it("stays on the speaker for plain statements", () => {
    expect(autoCuts([v("Ya begitulah."), v("Sudah lama sekali.")])).toEqual(["video", "video"]);
  });
  it("never chooses a full-screen graphic or a clip by itself", () => {
    const cuts = autoCuts([v("Ada 100 ribu orang yang ikut."), v("Ya begitulah."), v("Uang itu penting."), v("Bukan motivasi, tapi sistem.")]);
    expect(cuts.includes("graphic") || cuts.includes("clip")).toBe(false);
  });
  it("features a hand-emphasised word even without an icon", () => {
    expect(autoCuts([{ template: "statement", icon: null, emphasis: ["sederhana"] }])).toEqual(["overlay"]);
  });
});

describe("phrase captions", () => {
  it("chunks by words, characters and punctuation without losing or reordering words", () => {
    const text = "Belum satu bulan di jalan ini, gerakan pertunukan untuk kutan Perhari sudah menembus angkat 172 orang.";
    const chunks = phraseChunks(text);
    expect(chunks.flatMap(c => c.words).join(" ")).toBe(text);
    for (const c of chunks) { expect(c.words.length).toBeLessThanOrEqual(4); expect(c.words.join(" ").length).toBeLessThanOrEqual(26 + 12); }
    expect(chunks.find(c => c.words.includes("ini,"))!.words.at(-1)).toBe("ini,");
  });
  it("finds the chunk of the active word", () => {
    const l = phraseLine("Satu dua tiga empat lima enam", 4);
    expect(l.words).toEqual(["lima", "enam"]);
    expect(l.activeInLine).toBe(0);
    expect(phraseLine("Satu dua", -1).words).toEqual([]);
  });
});

describe("shiftWords and word ends", () => {
  const t = transcriptFromWords(SAMPLE, 5, "id");
  it("shifts, clamps at 0 and keeps order", () => {
    const early = shiftWords(allWords(t), -0.5);
    expect(early[0].start).toBe(0);
    for (let i = 1; i < early.length; i++) expect(early[i].start).toBeGreaterThanOrEqual(early[i - 1].start);
    expect(shiftWords(allWords(t), 0.3)[0].start).toBeCloseTo(0.5, 5);
  });
  it("sceneTimings gives word ends after word starts and counts too-short scenes", () => {
    const r = sceneTimings(splitScript(transcriptText(t)), allWords(t), FPS, 5)!;
    r.wordStarts.forEach((ws, i) => ws.forEach((st, j) => expect(r.wordEnds[i][j]).toBeGreaterThanOrEqual(st)));
    expect(r.tooShort).toBe(0);
    const tiny = sceneTimings(["Ya.", "Baik."], [{ text: "Ya.", start: 0, end: 0.3 }, { text: "Baik.", start: 0.5, end: 0.9 }], FPS, 1)!;
    expect(tiny.tooShort).toBe(2);
  });
});

describe("alignWords / edited scripts (fuzzy timing)", () => {
  const words = allWords(transcriptFromWords(SAMPLE, 5, "id"));
  const w = (text: string) => text.split(/\s+/);

  it("maps a script with fixed typos one to one", () => {
    const r = alignWords(w("Jangan tunggu semangat dateng. Mulailah sekarang"), words)!;
    expect(r.map(x => x.start)).toEqual(words.map(x => x.start));
  });

  it("keeps timing when a word is added and gives the new word time between its neighbours", () => {
    const r = alignWords(w("Jangan tunggu semangat itu datang. Mulailah sekarang"), words)!;
    expect(r).toHaveLength(6 + 1);
    expect(r[3].start).toBeGreaterThanOrEqual(words[2].end - 1e-9);
    expect(r[3].end).toBeLessThanOrEqual(words[3].start + 1e-9);
    expect(r[4].start).toBe(words[3].start);
    expect(r[6].start).toBe(words[5].start);
  });

  it("keeps timing when a word is dropped", () => {
    const r = alignWords(w("Jangan tunggu datang. Mulailah sekarang"), words)!;
    expect(r.map(x => x.start)).toEqual([0.2, 0.6, 1.6, 3.0, 3.6]);
  });

  it("keeps timing when two transcript words are written as one", () => {
    const r = alignWords(w("Jangan tunggu semangat datang. Mulailah sekarang"), words.map((x, i) => (i === 4 ? { ...x, text: "Mulai" } : x)))!;
    expect(r).toHaveLength(6);
  });

  it("returns monotonic times", () => {
    const r = alignWords(w("Jangan tunggu semangat yang datang. Mulailah dari sekarang"), words)!;
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBeGreaterThanOrEqual(r[i - 1].start - 1e-9);
  });

  it("refuses a script that adds as many words as it keeps", () => {
    expect(alignWords(w("Jangan sekali-kali tunggu semangat yang besar datang. Mulailah dari sekarang juga"), words)).toBeNull();
  });

  it("refuses scripts that are mostly different", () => {
    expect(alignWords(w("Kata lain sama sekali berbeda dari ucapan"), words)).toBeNull();
    expect(alignWords([], words)).toBeNull();
  });

  it("is used by sceneTimings when the word count changed, and says so", () => {
    const t = transcriptFromWords(SAMPLE, 5, "id");
    const r = sceneTimings(splitScript("Jangan tunggu semangat itu datang.\nMulailah sekarang"), allWords(t), FPS, 5)!;
    expect(r.aligned).toBe(true);
    expect(r.seconds.reduce((a, b) => a + b, 0)).toBeCloseTo(5, 5);
    expect(r.wordStarts[1][0]).toBe(0);
    expect(sceneTimings(splitScript("Jangan tunggu semangat datang.\nMulailah sekarang"), allWords(t), FPS, 5)!.aligned).toBe(false);
  });
});

describe("ASR progress helpers", () => {
  it("estimates the time left from the windows already done", () => {
    expect(asrEta(0, 4, 10)).toBe("");
    expect(asrEta(4, 4, 80)).toBe("");
    expect(asrEta(1, 4, 20)).toBe("sekitar 1 mnt 0 dtk lagi");
    expect(asrEta(3, 4, 30)).toBe("sekitar 10 dtk lagi");
    expect(asrEta(7, 8, 70)).toBe("sekitar 10 dtk lagi");
    expect(asrEta(7, 8, 14)).toBe("kurang dari 5 dtk lagi");
    expect(asrEta(12.5, 50, 25)).toBe("sekitar 1 mnt 15 dtk lagi"); // any unit works, e.g. seconds of speech
  });

  it("reports where the time went", () => {
    expect(asrTimingSummary({ loadSeconds: 41.4, reused: false, inferSeconds: 63, audioSeconds: 45 })).toBe("model dimuat 41 dtk; transkripsi 63 dtk untuk 45 dtk audio (1.4× durasi)");
    expect(asrTimingSummary({ loadSeconds: 0, reused: true, inferSeconds: 20, audioSeconds: 40 })).toContain("dipakai ulang");
  });

  it("suggests the faster model only when the heavy one was slower than the audio", () => {
    const slow = { loadSeconds: 1, reused: false, inferSeconds: 90, audioSeconds: 60 };
    expect(asrSlowHint("Xenova/whisper-small", slow)).toMatch(/base/);
    expect(asrSlowHint("Xenova/whisper-small", { ...slow, inferSeconds: 30 })).toBe("");
    expect(asrSlowHint("Xenova/whisper-base", slow)).toBe("");
  });
});

describe("repetition loops (a model stuck repeating itself)", () => {
  const w = (text: string): { text: string; start: number; end: number }[] => text.split(" ").map((t, i) => ({ text: t, start: i, end: i + 0.5 }));

  it("recognises a looping phrase and leaves natural repetition alone", () => {
    expect(looksLooping("Jadi, apa yang mana? " + "Yang mana? ".repeat(30))).toBe(true);
    expect(looksLooping("ya ya ya ya ya")).toBe(true);
    expect(looksLooping("tidak, tidak, tidak, aku tidak mau")).toBe(false);
    expect(looksLooping("Halo semuanya, selamat datang kembali di channel kami.")).toBe(false);
    expect(looksLooping("satu dua tiga satu dua tiga")).toBe(false);
    expect(looksLooping("satu dua tiga satu dua tiga satu dua tiga")).toBe(true);
  });

  it("ignores case and punctuation when comparing", () => {
    expect(looksLooping("Yang mana? yang MANA, Yang mana! yang mana.")).toBe(true);
  });

  it("folds a loop into its first occurrence and keeps its timing", () => {
    const words = w("Jadi apa " + "yang mana? ".repeat(10).trim() + " sendiri");
    const out = collapseRepeats(words);
    expect(out.map(x => x.text).join(" ")).toBe("Jadi apa yang mana? sendiri");
    expect(out[2]).toEqual(words[2]);
    expect(out.at(-1)).toEqual(words.at(-1));
  });

  it("folds a single repeated word only from the fourth repeat", () => {
    expect(collapseRepeats(w("ya ya ya itu")).map(x => x.text).join(" ")).toBe("ya ya ya itu");
    expect(collapseRepeats(w("ya ya ya ya itu")).map(x => x.text).join(" ")).toBe("ya itu");
  });

  it("does not touch normal text", () => {
    const words = w("Aplikasi di TikTok punya indikasi sendiri lah gitu");
    expect(collapseRepeats(words)).toEqual(words);
    expect(collapseRepeats([])).toEqual([]);
  });

  it("is applied to a transcript, so a looping recording gives a readable one", () => {
    const chunks = [" Jadi", " apa", ...Array.from({ length: 12 }, (_, i) => [{ text: " yang", timestamp: [2 + i, 2.4 + i] as [number, number] }, { text: " mana?", timestamp: [2.4 + i, 2.8 + i] as [number, number] }]).flat()]
      .map((c, i) => typeof c === "string" ? { text: c, timestamp: [i, i + 0.5] as [number, number] } : c);
    const t = transcriptFromWords(chunks, 20, "id");
    expect(transcriptText(t)).toBe("Jadi apa yang mana?");
  });

  it("also folds loops in a segment-only transcript", () => {
    const t = transcriptFromSegments([{ text: " Halo " + "yang mana? ".repeat(8), timestamp: [0, 10] }], 10, "id");
    expect(t.segments[0].text).toBe("Halo yang mana?");
  });
});
