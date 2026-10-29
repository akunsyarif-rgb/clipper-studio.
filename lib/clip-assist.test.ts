import { describe, expect, it } from "vitest";
import { continuesEarlier, copyPrompt, LEAD_IN_SECONDS, lineTextAt, MAX_MOMENTS, MAX_REACH_BACK, startWithLeadIn, stepped, stepToLine, type Item, MOMENT_MAX_SECONDS, momentsPrompt, parseCopy, parseMoments, suggestMoments, writeCopy, type Line } from "./clip-assist";

const gem = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const oa = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
const opts = (transport: (p: object) => Promise<Response | null>, extra: object = {}) => ({ apiKey: "", model: "m", language: "id", retryDelaysMs: [] as number[], transport, ...extra });

/** 12 lines of 5 s each: line i covers [5i, 5i+5]. */
const lines: Line[] = Array.from({ length: 12 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: `kalimat ${i}` }));

describe("best moments", () => {
  it("asks with numbered lines and their times, JSON last", () => {
    const p = momentsPrompt(lines, "id");
    expect(p).toContain("bahasa Indonesia");
    expect(p).toContain(`${MOMENT_MAX_SECONDS} detik`);
    const last = JSON.parse(p.split("\n").at(-1)!);
    expect(last[3]).toEqual({ i: 3, start: 15, end: 20, text: "kalimat 3" });
    expect(momentsPrompt(lines, "en")).toContain("bahasa Inggris");
  });
  it("turns line numbers into times, keeps order, titles and reasons", () => {
    const m = parseMoments(gem({ moments: [{ start: 6, end: 9, title: "Cerita  gaji", reason: "angka kuat" }, { start: 0, end: 2, title: "Pembuka", reason: "hook" }] }), lines);
    expect(m.map(x => [x.start, x.end, x.title])).toEqual([[0, 15, "Pembuka"], [30, 50, "Cerita gaji"]]);
    expect(m[1]).toMatchObject({ startIndex: 6, endIndex: 9, reason: "angka kuat" });
  });
  it("drops moments that are invalid, too short, or overlapping; trims too long ones at a line", () => {
    const m = parseMoments(gem({ moments: [
      { start: 0, end: 0, title: "terlalu pendek", reason: "" },        // 5 s
      { start: 3, end: 99, title: "di luar", reason: "" },
      { start: 5, end: 2, title: "terbalik", reason: "" },
      { start: 1.5, end: 3, title: "bukan bulat", reason: "" },
      { start: 0, end: 11, title: "panjang", reason: "" },               // 60 s: ok within 90
      { start: 4, end: 6, title: "tumpang tindih", reason: "" },
    ] }), lines);
    expect(m.map(x => x.title)).toEqual(["panjang"]);
    const long: Line[] = Array.from({ length: 40 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: "x" }));
    const trimmed = parseMoments(gem({ moments: [{ start: 0, end: 39, title: "sangat panjang", reason: "" }] }), long);
    expect(trimmed[0].end - trimmed[0].start).toBeLessThanOrEqual(MOMENT_MAX_SECONDS);
    expect(trimmed[0].end).toBe(90);
  });
  it("keeps at most the limit and accepts an empty list", () => {
    const many: Line[] = Array.from({ length: 80 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: "x" }));
    const ms = Array.from({ length: 9 }, (_, k) => ({ start: k * 8, end: k * 8 + 2, title: `m${k}`, reason: "" }));
    expect(parseMoments(gem({ moments: ms }), many)).toHaveLength(MAX_MOMENTS);
    expect(parseMoments(gem({ moments: [] }), lines)).toEqual([]);
    expect(() => parseMoments(gem({ nope: 1 }), lines)).toThrow(/daftar momen/);
  });
  it("works through either service format and sends nothing for an empty transcript", async () => {
    let n = 0;
    const t = async () => { n++; return ok(oa({ moments: [{ start: 0, end: 2, title: "A", reason: "b" }] })); };
    expect((await suggestMoments(lines, opts(t, { format: "openai" })))[0].title).toBe("A");
    expect(await suggestMoments([], opts(t))).toEqual([]);
    expect(n).toBe(1);
  });
});

describe("title, description and hashtags", () => {
  it("cleans the answer: hashtags get a #, lose punctuation and spaces, no duplicates, at most 10", () => {
    const c = parseCopy(gem({ title: "  Gaji   100 juta  ", description: "Ceritanya.", hashtags: ["gaji", "#Gaji", "tips keuangan", "#a-b!", "", ...Array.from({ length: 12 }, (_, i) => `t${i}`)] }));
    expect(c.title).toBe("Gaji 100 juta");
    expect(c.hashtags.slice(0, 4)).toEqual(["#gaji", "#Gaji", "#tipskeuangan", "#ab"]);
    expect(c.hashtags).toHaveLength(10);
    expect(new Set(c.hashtags).size).toBe(10);
  });
  it("needs a title and a hashtag list", () => {
    expect(() => parseCopy(gem({ title: "", hashtags: [] }))).toThrow(/judul/);
    expect(() => parseCopy(gem({ title: "x" }))).toThrow(/tagar/);
  });
  it("sends the clip's words only, trimmed in length, and writes in the clip's language", async () => {
    let text = "";
    const t = async (p: object) => { text = (p as { contents: { parts: { text: string }[] }[] }).contents[0].parts[0].text; return ok(gem({ title: "T", description: "D", hashtags: ["x"] })); };
    expect((await writeCopy("a ".repeat(5000), opts(t))).title).toBe("T");
    expect(text.length).toBeLessThan(7000);
    expect(copyPrompt("halo", "en")).toContain("bahasa Inggris");
    await expect(writeCopy("   ", opts(t))).rejects.toMatchObject({ kind: "format" });
  });
});

import { DEFAULT_LIMITS, limitsForVideo } from "./clip-assist";
import { sliceTranscript } from "./transcript";

describe("moments in a whole long video", () => {
  it("asks for more and longer moments, up to three minutes, scaled by the video's length", () => {
    expect(limitsForVideo(60)).toEqual({ min: 20, max: 180, count: 3 });
    expect(limitsForVideo(19 * 60)).toEqual({ min: 20, max: 180, count: 10 });
    expect(limitsForVideo(600).count).toBe(5);
    const p = momentsPrompt(lines, "id", limitsForVideo(600));
    expect(p).toContain("3 sampai 5 potongan");
    expect(p).toContain("20 sampai 180 detik");
    expect(momentsPrompt(lines, "id")).toContain(`${DEFAULT_LIMITS.min} sampai ${DEFAULT_LIMITS.max} detik`);
  });
  it("accepts a two-minute moment only under the long-video limits", () => {
    const long: Line[] = Array.from({ length: 40 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: "x" }));
    const answer = gem({ moments: [{ start: 0, end: 23, title: "dua menit", reason: "" }] });
    expect(parseMoments(answer, long)[0].end).toBe(90);
    expect(parseMoments(answer, long, limitsForVideo(600))[0].end).toBe(120);
  });
  it("caps a moment at three minutes and drops one below the minimum", () => {
    const huge: Line[] = Array.from({ length: 80 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: "x" }));
    const m = parseMoments(gem({ moments: [{ start: 0, end: 79, title: "terlalu panjang", reason: "" }, { start: 79, end: 79, title: "pendek", reason: "" }] }), huge, limitsForVideo(600));
    expect(m).toHaveLength(1);
    expect(m[0].end - m[0].start).toBeLessThanOrEqual(180);
  });
});

describe("a clip's own transcript", () => {
  const w = (text: string, start: number, end: number) => ({ text, start, end });
  const t = { language: "indonesian", granularity: "word" as const, duration: 100, segments: [
    { start: 0, end: 10, text: "satu dua", words: [w("satu", 0, 5), w("dua", 5, 10)] },
    { start: 20, end: 30, text: "tiga empat", words: [w("tiga", 20, 25), w("empat", 25, 30)] },
    { start: 40, end: 50, text: "lima enam", words: [w("lima", 40, 45), w("enam", 45, 50)] },
  ] };
  it("starts at zero and keeps only what falls inside", () => {
    const s = sliceTranscript(t, 20, 50);
    expect(s.duration).toBe(30);
    expect(s.segments.map(x => [x.start, x.end, x.text])).toEqual([[0, 10, "tiga empat"], [20, 30, "lima enam"]]);
    expect(s.segments[0].words.map(x => [x.start, x.end])).toEqual([[0, 5], [5, 10]]);
  });
  it("cuts a segment that starts before the window, dropping the words outside", () => {
    const s = sliceTranscript(t, 22, 45);
    expect(s.segments.map(x => x.text)).toEqual(["tiga empat", "lima"]);
    expect(s.segments[0].words[0]).toEqual({ text: "tiga", start: 0, end: 3 });
    expect(s.segments[1].end).toBe(23);
  });
  it("is empty when nothing is said there", () => {
    expect(sliceTranscript(t, 60, 90).segments).toEqual([]);
  });
});

describe("where a clip starts", () => {
  // Lines with small pauses between them: line i covers [6i + 1, 6i + 6]; the gap before it is 1 s (0 for the first line it is 1 s from 0).
  const spoken = (texts: string[]): Line[] => texts.map((text, i) => ({ start: i * 6 + 1, end: i * 6 + 6, text }));
  const ten = spoken(["Soal uang bulanan.", "Jadi pertama catat pengeluaranmu.", "Nah, kedua sisihkan di awal.", "Karena itu tabungan tumbuh.", "Ketiga hindari utang konsumtif.", "Lalu evaluasi tiap minggu.", "Itu saja tipsnya.", "Sampai jumpa.", "Satu lagi.", "Terakhir."]);

  it("knows which openers only continue an earlier thought", () => {
    for (const t of ["Jadi pertama catat.", "nah, kedua", "Karena itu kita", "But then it", "And so"]) expect(continuesEarlier(t)).toBe(true);
    for (const t of ["Soal uang bulanan.", "Pernah kehabisan uang?", "Ini rahasianya.", "Banyak orang salah.", "Jadilah disiplin."]) expect(continuesEarlier(t)).toBe(false);
  });
  it("moves the start back to the sentence that introduces the topic, with a short lead-in", () => {
    const [m] = parseMoments(gem({ moments: [{ start: 1, end: 4, title: "Tips uang", reason: "" }] }), ten, { min: 8, max: 90, count: 6 });
    expect(m.startIndex).toBe(0);
    expect(m.reachedBack).toBe(1);
    expect(m.start).toBeCloseTo(1 - LEAD_IN_SECONDS, 5); // line 0 starts at 1 s, 1 s after 0 s: room for the full lead-in
    expect(m.end).toBe(ten[4].end);
  });
  it("reaches back at most twice, and never into the clip before", () => {
    const lns = spoken(["Pokok bahasan.", "Jadi satu.", "Nah dua.", "Lalu tiga.", "Tapi empat.", "Dan lima.", "Selesai di sini.", "Penutup yang baik."]);
    const [m] = parseMoments(gem({ moments: [{ start: 4, end: 7, title: "x", reason: "" }] }), lns, { min: 8, max: 90, count: 6 });
    expect(m.reachedBack).toBe(MAX_REACH_BACK);
    expect(m.startIndex).toBe(2);
    const two = parseMoments(gem({ moments: [{ start: 0, end: 2, title: "a", reason: "" }, { start: 3, end: 7, title: "b", reason: "" }] }), lns, { min: 8, max: 90, count: 6 });
    expect(two[1].startIndex).toBe(3); // the line before belongs to the first clip, so it is not taken
  });
  it("leaves a clean opener alone", () => {
    const [m] = parseMoments(gem({ moments: [{ start: 0, end: 3, title: "x", reason: "" }] }), ten, { min: 8, max: 90, count: 6 });
    expect(m.reachedBack).toBeUndefined();
  });
  it("the lead-in never reaches into the previous line", () => {
    const tight: Line[] = [{ start: 0, end: 5, text: "a" }, { start: 5.1, end: 10, text: "b" }, { start: 12, end: 20, text: "c" }];
    expect(startWithLeadIn(tight, 1)).toBeCloseTo(5, 5); // only 0.1 s of gap
    expect(startWithLeadIn(tight, 2)).toBeCloseTo(12 - LEAD_IN_SECONDS, 5);
    expect(startWithLeadIn(tight, 0)).toBe(0);
  });
  it("steps one sentence earlier or later, and says what is said there", () => {
    expect(stepToLine(ten, ten[3].start - LEAD_IN_SECONDS, "start", -1)).toBeCloseTo(startWithLeadIn(ten, 2), 5);
    expect(stepToLine(ten, startWithLeadIn(ten, 3), "start", 1)).toBeCloseTo(startWithLeadIn(ten, 4), 5);
    expect(stepToLine(ten, ten[4].end, "end", -1)).toBe(ten[3].end);
    expect(stepToLine(ten, ten[4].end, "end", 1)).toBe(ten[5].end);
    expect(stepToLine(ten, 0, "start", -1)).toBeNull();
    expect(stepToLine(ten, ten[9].end, "end", 1)).toBeNull();
    expect(lineTextAt(ten, startWithLeadIn(ten, 1), "start")).toBe("Jadi pertama catat pengeluaranmu.");
    expect(lineTextAt(ten, ten[3].end, "end")).toBe("Karena itu tabungan tumbuh.");
    expect(lineTextAt(ten, 0, "end")).toBe("");
  });
  it("tells the model to start from the sentence that introduces the topic", () => {
    expect(momentsPrompt(ten, "id")).toContain("jangan mulai dari kalimat yang diawali kata sambung");
  });
});

describe("stepping a suggestion one sentence", () => {
  const ls: Line[] = [{ start: 1, end: 6, text: "a" }, { start: 7, end: 12, text: "b" }, { start: 13, end: 19, text: "c" }, { start: 20, end: 40, text: "d" }];
  const item = (start: number, end: number): Item => ({ start, end, title: "t", reason: "", checked: true, note: "Awal dimundurkan" });
  it("moves to the next sentence boundary and drops the note", () => {
    const m = stepped(item(startWithLeadIn(ls, 2), 40), "start", -1, ls, 100);
    expect(m.start).toBeCloseTo(startWithLeadIn(ls, 1), 5);
    expect(m.note).toBeUndefined();
    expect(stepped(item(startWithLeadIn(ls, 1), 40), "start", 1, ls, 100).start).toBeCloseTo(startWithLeadIn(ls, 2), 5);
    expect(stepped(item(1, 19), "end", 1, ls, 100).end).toBe(40);
  });
  it("stays put when there is no further sentence or the clip would get too short", () => {
    const first = item(0.7, 19);
    expect(stepped(first, "start", -1, ls, 100)).toBe(first);
    const tiny = item(startWithLeadIn(ls, 2), startWithLeadIn(ls, 2) + 5);
    expect(stepped(tiny, "start", 1, ls, 100).end - stepped(tiny, "start", 1, ls, 100).start).toBeGreaterThanOrEqual(5);
  });
});
