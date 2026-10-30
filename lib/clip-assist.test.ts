import { describe, expect, it } from "vitest";
import { applyJudgements, continuesEarlier, DROP_SCORE, GENRES, judgePrompt, MAX_EXTEND_START, parseJudgements, WEAK_SCORE, copyPrompt, LEAD_IN_SECONDS, lineTextAt, MAX_MOMENTS, MAX_REACH_BACK, startWithLeadIn, stepped, stepToLine, type Item, MOMENT_MAX_SECONDS, momentsPrompt, parseCopy, parseMoments, suggestMoments, writeCopy, type Line } from "./clip-assist";

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
    expect((await suggestMoments(lines, opts(t, { format: "openai" }), undefined, { judge: false }))[0].title).toBe("A");
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

describe("clips a new viewer can follow (comedy and the reading test)", () => {
  // 20 lines of 6 s each: line i covers [6i + 1, 6i + 6].
  const joke: Line[] = Array.from({ length: 20 }, (_, i) => ({ start: i * 6 + 1, end: i * 6 + 6, text: i === 6 ? "Ternyata ojeknya malah nunggu kita." : i === 5 ? "Jadi Budi ini janji jemput jam enam." : `kalimat ${i}` }));
  const lim = { min: 8, max: 90, count: 3 };
  const moment = (s: number, e: number) => ({ startIndex: s, endIndex: e, start: startWithLeadIn(joke, s), end: joke[e].end, title: `m${s}`, reason: "" });

  it("asks for whole jokes a new viewer understands when the genre is comedy, and not otherwise", () => {
    const c = momentsPrompt(joke, "id", lim, "komedi");
    expect(c).toMatch(/lelucon atau momen lucu yang UTUH/);
    expect(c).toMatch(/premis\/setup/);
    expect(c).toMatch(/punchline/);
    expect(c).toMatch(/jangan memilih lelucon yang bergantung pada kejadian di bagian lain/);
    expect(c).not.toMatch(/tips yang bisa langsung dipakai/);
    expect(momentsPrompt(joke, "id", lim)).toMatch(/tips yang bisa langsung dipakai/);
    expect(GENRES.map(g => g.id)).toEqual(["umum", "komedi"]);
  });
  it("gives the reader the clip alone with a little context before and after, and says what to judge", () => {
    const p = judgePrompt(joke, [moment(6, 8)], "id", "komedi");
    const items = JSON.parse(p.split("\n").at(-1)!);
    expect(items[0].klip).toEqual(["Ternyata ojeknya malah nunggu kita.", "kalimat 7", "kalimat 8"]);
    expect(items[0].sebelum).toHaveLength(4);
    expect(items[0].sebelum.at(-1)).toBe("Jadi Budi ini janji jemput jam enam.");
    expect(items[0].sesudah).toEqual(["kalimat 9", "kalimat 10"]);
    expect(p).toMatch(/BELUM melihat bagian video yang lain/);
    expect(p).toMatch(/tahu ada yang lucu tapi tidak tahu kenapa/);
    expect(p).not.toContain('"moments"');
  });
  it("reads the judgements: clamps them, ignores unknown clips, leaves skipped clips unjudged", () => {
    const j = parseJudgements(gem({ judgements: [{ i: 0, score: 12, understood: "x", missing: "", extendStart: 9, extendEnd: -2 }, { i: 7, score: 5, understood: "", missing: "", extendStart: 0, extendEnd: 0 }, { i: 1, score: "banyak" }] }), 3);
    expect(j[0]).toEqual({ score: 10, understood: "x", missing: "", extendStart: MAX_EXTEND_START, extendEnd: 0 });
    expect(j[1]).toBeUndefined(); expect(j[2]).toBeUndefined();
    expect(() => parseJudgements(gem({ nope: 1 }), 2)).toThrow(/penilaian/);
  });
  it("extends a clip that lacks its setup by the lines the reader asked for, with its lead-in", () => {
    const [m] = applyJudgements([moment(6, 8)], [{ score: 4, understood: "ada yang lucu", missing: "siapa Budi", extendStart: 1, extendEnd: 1 }], joke, lim);
    expect(m.startIndex).toBe(5); expect(m.endIndex).toBe(9);
    expect(m.start).toBeCloseTo(startWithLeadIn(joke, 5), 5);
    expect(m.end).toBe(joke[9].end);
    expect(m.judged).toMatchObject({ score: 4, missing: "siapa Budi", extendedStart: 1, extendedEnd: 1 });
  });
  it("never takes lines that belong to the clip before or after, and gives lines back when the clip would get too long", () => {
    const two = [moment(2, 6), moment(8, 12)];
    const out = applyJudgements(two, [{ score: 5, understood: "", missing: "", extendStart: 4, extendEnd: 3 }, { score: 5, understood: "", missing: "", extendStart: 4, extendEnd: 3 }], joke, { ...lim, count: 5 });
    expect(out[0].startIndex).toBe(0);               // may use lines 0-1, free
    expect(out[0].endIndex).toBe(7);                  // line 7 only: the next clip starts at 8
    expect(out[1].startIndex).toBe(8);                // line 7 belongs to the first clip's extension, but its own start can reach no earlier than the first clip's original end + 1
    const tight = applyJudgements([moment(6, 10)], [{ score: 5, understood: "", missing: "", extendStart: 4, extendEnd: 3 }], joke, { min: 8, max: 36, count: 3 });
    expect(tight[0].end - tight[0].start).toBeLessThanOrEqual(36);
    expect(tight[0].endIndex).toBeLessThan(13);
  });
  it("drops what stays incomprehensible when others remain, keeps the best in time order, and keeps unjudged clips", () => {
    const ms = [moment(0, 2), moment(4, 6), moment(8, 10), moment(12, 14), moment(16, 18)];
    const js = [
      { score: 9, understood: "a", missing: "", extendStart: 0, extendEnd: 0 },
      { score: 2, understood: "b", missing: "tidak jelas", extendStart: 0, extendEnd: 0 },   // dropped
      { score: 7, understood: "c", missing: "", extendStart: 0, extendEnd: 0 },
      undefined,                                                                          // not judged: kept
      { score: 8, understood: "d", missing: "", extendStart: 0, extendEnd: 0 },
    ];
    const out = applyJudgements(ms, js, joke, { ...lim, count: 4 });
    expect(out.map(m => m.title)).toEqual(["m0", "m8", "m12", "m16"]);
    const top2 = applyJudgements(ms, js, joke, { ...lim, count: 2 });
    expect(top2.map(m => m.title)).toEqual(["m0", "m16"]);
    expect(DROP_SCORE).toBeLessThan(WEAK_SCORE);
  });
  it("runs the reading test after the suggestions, and still returns them when the test fails", async () => {
    const prompts: string[] = [];
    const moments = { moments: [{ start: 6, end: 8, title: "Ojek nunggu", reason: "lucu" }, { start: 12, end: 14, title: "Lain", reason: "x" }] };
    const t = async (p: object) => {
      const text = (p as { contents: { parts: { text: string }[] }[] }).contents[0].parts[0].text; prompts.push(text);
      return ok(text.includes('"judgements"') ? gem({ judgements: [{ i: 0, score: 5, understood: "ada yang lucu", missing: "siapa Budi", extendStart: 1, extendEnd: 0 }, { i: 1, score: 9, understood: "jelas", missing: "", extendStart: 0, extendEnd: 0 }] }) : gem(moments));
    };
    const out = await suggestMoments(joke, opts(t), lim, { genre: "komedi" });
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toMatch(/lelucon atau momen lucu yang UTUH/);
    expect(out[0]).toMatchObject({ startIndex: 5, title: "Ojek nunggu" });
    expect(out[0].judged?.extendedStart).toBe(1);
    expect(out[1].judged?.score).toBe(9);
    // The test fails (the service answers with something else): the suggestions are returned unjudged.
    const broken = async (p: object) => { const text = (p as { contents: { parts: { text: string }[] }[] }).contents[0].parts[0].text; return ok(text.includes('"judgements"') ? gem({ nope: 1 }) : gem(moments)); };
    const plain = await suggestMoments(joke, opts(broken), lim, { genre: "komedi" });
    expect(plain.map(m => m.title)).toEqual(["Ojek nunggu", "Lain"]);
    expect(plain.every(m => m.judged === undefined)).toBe(true);
    // The test can be switched off.
    prompts.length = 0;
    await suggestMoments(joke, opts(t), lim, { judge: false });
    expect(prompts).toHaveLength(1);
  });
});
