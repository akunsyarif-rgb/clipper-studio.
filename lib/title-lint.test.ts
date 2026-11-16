import { describe, expect, it } from "vitest";
import { lintThumb, lintTitle, rankTitles, THUMB_MAX_WORDS } from "./title-lint";

const ids = (r: ReturnType<typeof lintTitle>) => r.issues.map(i => i.id);

describe("title and thumbnail lint", () => {
  it("a short title with a number and a different thumbnail has no issues", () => {
    const r = lintTitle("5 kebiasaan yang menguras gaji", "DIAM-DIAM BOCOR");
    expect(r.issues).toEqual([]);
    expect(r.good.join(" ")).toMatch(/angka/);
    expect(r.good.join(" ")).toMatch(/berbeda/);
    expect(r.score).toBeGreaterThan(95);
  });

  it("reports the two cut points separately: desktop near 60, mobile near 40, with what the mobile feed would show", () => {
    const longer = "Cara menabung dari gaji pas-pasan tanpa merasa tersiksa setiap bulan";
    const r = lintTitle(longer);
    expect(ids(r)).toContain("panjang");
    expect(ids(r)).toContain("ponsel");
    expect(r.issues.find(i => i.id === "ponsel")!.message).toMatch(/Cara menabung dari gaji pas-pasan/);
    const mid = lintTitle("Cara menabung dari gaji pas-pasan tanpa tersiksa");
    expect(ids(mid)).not.toContain("panjang");
    expect(ids(mid)).toContain("ponsel");
    expect(ids(lintTitle("Menabung 20% gaji"))).toEqual([]);
    expect(ids(lintTitle("x ".repeat(60)))).toContain("panjang");
  });

  it("flags more than two all-caps words as shouting, but not acronyms", () => {
    expect(ids(lintTitle("INI SANGAT PENTING SEKALI 3 hal"))).toContain("teriak");
    expect(ids(lintTitle("Panduan SEO untuk UMKM 2026"))).not.toContain("teriak");
    expect(lintTitle("Satu kata PENTING 3 hal").good.join(" ")).toMatch(/kapital/);
  });

  it("flags hype words and asks for a number, a date or a name instead", () => {
    const r = lintTitle("Rahasia luar biasa untuk semua orang");
    expect(ids(r)).toContain("kosong");
    expect(r.issues.find(i => i.id === "kosong")!.message).toMatch(/rahasia/);
    expect(ids(r)).toContain("tanpa-angka");
    expect(ids(lintTitle("Hemat listrik di Jakarta"))).not.toContain("tanpa-angka");
    expect(ids(lintTitle("Hemat listrik 30% per bulan"))).not.toContain("tanpa-angka");
  });

  it("notices when the first three words carry no subject, and likes an open question", () => {
    expect(ids(lintTitle("Ini cara untuk 3 hal"))).toContain("depan");
    expect(ids(lintTitle("Laptop murah 2026"))).not.toContain("depan");
    expect(lintTitle("Kenapa gaji cepat habis?").good.join(" ")).toMatch(/pertanyaan/);
  });

  it("the pairing is the unit: a thumbnail that repeats the title is named, and so is a thumbnail with too many words", () => {
    const dup = lintTitle("Gaji cepat habis? 3 penyebabnya", "GAJI HABIS");
    expect(ids(dup)).toContain("kembar");
    expect(dup.issues.find(i => i.id === "kembar")!.message).toMatch(/gaji, habis/);
    expect(dup.good.join(" ")).not.toMatch(/berbeda/);
    const wordy = lintTitle("Gaji cepat habis? 3 penyebabnya", "INI DIA PENYEBAB UTAMA NYA");
    expect(ids(wordy)).toContain("thumb-panjang");
    expect(THUMB_MAX_WORDS).toBe(3);
  });

  it("scores 100, minus 14 per issue, plus 4 per good point, kept between 0 and 100", () => {
    const r = lintTitle("Rahasia luar biasa untuk semua orang");
    expect(r.score).toBe(Math.max(0, Math.min(100, 100 - 14 * r.issues.length + 4 * r.good.length)));
    expect(lintTitle("INI SANGAT PENTING SEKALI RAHASIA LUAR BIASA ".repeat(4), "INI SANGAT PENTING SEKALI").score).toBeGreaterThanOrEqual(0);
  });

  it("lints a thumbnail text alone, or against the on-screen line it sits next to", () => {
    expect(lintThumb("GAJI HABIS").issues).toEqual([]);
    expect(lintThumb("INI DIA PENYEBAB UTAMA").issues.map(i => i.id)).toContain("thumb-panjang");
    expect(lintThumb("GAJI HABIS", "Kenapa gajimu cepat habis").issues.map(i => i.id)).toContain("kembar");
    expect(lintThumb("TERNYATA SALAH", "Kenapa gajimu cepat habis").issues).toEqual([]);
  });

  it("ranks titles best first", () => {
    const ranked = rankTitles(["Rahasia luar biasa untuk semua orang", "5 kebiasaan yang menguras gaji"], "DIAM-DIAM BOCOR");
    expect(ranked[0].subject).toBe("5 kebiasaan yang menguras gaji");
  });
});
