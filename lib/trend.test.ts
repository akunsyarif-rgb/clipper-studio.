import { describe, expect, it } from "vitest";
import { addTrendChip, EMPTY_TREND, parseTrend, trendPrompt, trendProblem } from "./trend";

const brief = { ...EMPTY_TREND, niche: "tips freelance", trend: "Gajian akhir bulan", audience: "pekerja muda" };
const wrap = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const idea = (n: number) => ({ angle: `Sudut ${n}`, title: `Judul ${n}`, hook: "Gajian habis tanggal 5?", whyFits: "Cocok dengan gajian", lines: ["Gajian habis tanggal 5?", "Coba pecah jadi tiga pos.", "Pos satu: wajib.", "Simpan ya."] });

describe("trend start", () => {
  it("needs a niche and a trend the creator wrote", () => {
    expect(trendProblem(EMPTY_TREND)).toMatch(/niche/);
    expect(trendProblem({ ...EMPTY_TREND, niche: "masak" })).toMatch(/tren/);
    expect(trendProblem(brief)).toBeNull();
  });
  it("tells the model it has no live trend data and carries only the creator's facts", () => {
    const p = trendPrompt(brief);
    expect(p).toContain("TIDAK punya data tren langsung");
    expect(p).toContain("Gajian akhir bulan");
    expect(p).toContain("TikTok");
    expect(trendPrompt(brief, "lebih santai")).toContain("lebih santai");
  });
  it("keeps usable ideas and drops the rest", () => {
    const out = parseTrend(wrap({ ideas: [idea(1), { angle: "x", lines: ["satu"] }, idea(2)] }));
    expect(out.map(i => i.angle)).toEqual(["Sudut 1", "Sudut 2"]);
  });
  it("fails when nothing is usable", () => {
    expect(() => parseTrend(wrap({ ideas: [{ lines: ["a"] }] }))).toThrow();
    expect(() => parseTrend(wrap({ nope: 1 }))).toThrow();
  });
  it("cleans lines and uses the first line when the hook is missing", () => {
    const out = parseTrend(wrap({ ideas: [{ lines: ["1. **Halo** dunia", "- Dua", "Tiga"] }] }));
    expect(out[0].lines).toEqual(["Halo dunia", "Dua", "Tiga"]);
    expect(out[0].hook).toBe("Halo dunia");
  });
  it("adds a chip once", () => {
    expect(addTrendChip("", "Ramadan")).toBe("Ramadan");
    expect(addTrendChip("Ramadan", "ramadan")).toBe("Ramadan");
    expect(addTrendChip("Ramadan", "Lebaran")).toBe("Ramadan, Lebaran");
  });
});
