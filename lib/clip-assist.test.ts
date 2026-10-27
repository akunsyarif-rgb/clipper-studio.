import { describe, expect, it } from "vitest";
import { copyPrompt, MAX_MOMENTS, MOMENT_MAX_SECONDS, momentsPrompt, parseCopy, parseMoments, suggestMoments, writeCopy, type Line } from "./clip-assist";

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
