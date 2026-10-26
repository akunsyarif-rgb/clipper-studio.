import { describe, expect, it } from "vitest";
import { CONCEPTS, detectCompare, detectNumber, detectSemanticConcept, detectVisual, ICONS, matchConcept, resolveVisual, stripMarks, wordKey } from "./visuals";
import { CONTENT_PRESETS, PALETTES } from "./script";

describe("matchConcept (Indonesian + English keywords)", () => {
  it.each([
    ["Jangan tunggu semangat datang.", "wait"],
    ["Mulailah, meski langkahmu kecil.", "start"],
    ["Disiplin membuatmu tetap bergerak.", "discipline"],
    ["Hemat uang setiap bulan.", "wallet"],
    ["Kamu harus bermain lebih sering.", "game"],
    ["Don't wait for motivation to show up.", "wait"],
    ["Read one book every week.", "book"],
    ["Our sales grew this year.", null],
    ["Investasi kecil hari ini.", "wallet"],
  ])("%s → %s", (text, id) => {
    const m = matchConcept(text);
    if (id === null) expect(m === null || m.id !== "game").toBe(true);
    else expect(m?.id).toBe(id);
  });
  it("does not match short keywords inside unrelated words", () => {
    expect(matchConcept("The domain will remain online.")?.id).not.toBe("game"); // "main" in remain/domain
    expect(matchConcept("Pakailah jam tangan.")?.id).toBe("time");
    expect(matchConcept("Ideal sekali.")?.id).not.toBe("idea"); // "ide" is whole-word only
  });
  it("returns null when nothing matches", () => {
    expect(matchConcept("Lorem ipsum dolor sit amet.")).toBeNull();
  });
  it("has an icon for every concept and unique ids", () => {
    const ids = CONCEPTS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CONCEPTS) {
      expect(Array.isArray(c.icon) && c.icon.length).toBeTruthy();
      expect(ICONS[c.id]).toBeDefined();
    }
  });
});

describe("semantic visual mapping", () => {
  it.each([
    ["Al-Qur'an mengajarkan kita untuk bersabar.", "book"],
    ["Awali harimu dengan doa dan dzikir.", "calm"],
    ["Kunjungi masjid untuk shalat berjamaah.", "home"],
    ["Iman, takwa, dan syukur perlu dijaga.", "heart"],
    ["Gunakan teknologi AI untuk membantu pekerjaan.", "ai"],
    ["Pelajari data sebelum mengambil keputusan.", "data"],
    ["Bangun bisnis digital yang bermanfaat.", "work"],
    ["Pendidikan membantu siswa berkembang.", "book"],
    ["Buat video pendek untuk media sosial.", "video"],
  ])("%s → %s", (text, id) => {
    expect(detectSemanticConcept(text)).toBe(id);
    expect(detectVisual(text).icon).toBe(id);
  });
});

describe("content presets", () => {
  it("provides six distinct reusable content starting points", () => {
    expect(CONTENT_PRESETS).toHaveLength(6);
    expect(new Set(CONTENT_PRESETS.map(p => p.id)).size).toBe(6);
    for (const preset of CONTENT_PRESETS) {
      expect(PALETTES[preset.palette]).toBeDefined();
      expect(["hybrid", "kinetic", "popup", "cinematic"]).toContain(preset.style);
    }
  });
});

describe("detectVisual templates", () => {
  it.each([
    ["Pertama, tentukan target yang jelas.", "list", 1],
    ["Second, keep every sentence short.", "list", 2],
    ["Terakhir, rayakan progresmu.", "list", null],
    ["Langkah 3 adalah konsistensi.", "list", 3],
    ["2) Siapkan peralatan.", "list", 2],
  ])("%s → list #%s", (text, template, index) => {
    const v = detectVisual(text);
    expect(v.template).toBe(template);
    expect(v.listIndex).toBe(index);
  });

  it("questions, CTA and quotes", () => {
    expect(detectVisual("Kenapa kamu sulit fokus?").template).toBe("question");
    expect(detectVisual("Want better videos?").template).toBe("question");
    expect(detectVisual("Follow untuk tips berikutnya!")).toMatchObject({ template: "cta", cta: "FOLLOW" });
    expect(detectVisual("Start now. Your future self will thank you.")).toMatchObject({ template: "cta", cta: "START NOW" });
    expect(detectVisual('"Mulailah dari yang kecil."').template).toBe("quote");
    expect(detectVisual("Disiplin membuatmu tetap bergerak.").template).toBe("statement");
  });

  it("numbers: percent, money, multipliers and counted nouns", () => {
    expect(detectNumber("80% kreator menyerah.")).toMatchObject({ value: 80, suffix: "%", raw: "80" });
    expect(detectNumber("Hemat Rp 50.000 setiap minggu.")).toMatchObject({ value: 50000, prefix: "Rp", label: "", raw: "50.000" });
    expect(detectNumber("It saves $1,200 a year.")).toMatchObject({ value: 1200, prefix: "$" });
    expect(detectNumber("Naik 3x lipat.")).toMatchObject({ value: 3, suffix: "×" });
    expect(detectNumber("Ada 5 cara mudah.")).toMatchObject({ value: 5, label: "cara" });
    expect(detectNumber("Here are three simple tips.")).toMatchObject({ value: 3, label: "tips" });
    expect(detectNumber("Rating 4,5 bintang.")).toMatchObject({ value: 4.5, decimals: 1 });
    expect(detectNumber("One small step every day.")).toBeNull();
    expect(detectNumber("Merdeka pada tahun 1945.")).toMatchObject({ value: 1945, year: true });
    expect(detectNumber("It was founded in 2024.")).toMatchObject({ value: 2024, year: true });
    expect(detectNumber("Lebih dari 17.000 pulau.")).toMatchObject({ value: 17000, year: false });
    expect(detectNumber("Ada 5000 orang.")).toMatchObject({ value: 5000, year: false }); // outside 1000–2100 it is a quantity
    expect(detectNumber("Naik 2024%.")).toMatchObject({ year: false });
    expect(detectVisual("80% kreator menyerah di bulan pertama.").emphasis).toContain("80");
  });

  it("comparisons in both languages", () => {
    expect(detectCompare("Pilih disiplin, bukan sekadar motivasi.")).toEqual({ bad: "sekadar motivasi", good: "Pilih disiplin", neutral: false });
    expect(detectCompare("Bukan bakat, tapi latihan yang membuatmu hebat.")).toMatchObject({ bad: "bakat", good: "latihan yang membuatmu hebat" });
    expect(detectCompare("Satu langkah hari ini lebih baik dari rencana sempurna.")).toMatchObject({ bad: "rencana sempurna", good: "Satu langkah hari ini" });
    expect(detectCompare("Progress beats perfection.")).toMatchObject({ bad: "perfection", good: "Progress" });
    expect(detectCompare("Focus on habits instead of goals.")).toMatchObject({ bad: "goals", good: "Focus on habits" });
    expect(detectCompare("Konsistensi vs motivasi?")).toMatchObject({ neutral: true });
    expect(detectCompare("Disiplin membuatmu bergerak.")).toBeNull();
  });
});

describe("emphasis and overrides", () => {
  it("uses *marked* words instead of automatic keywords, and strips the marks", () => {
    const v = detectVisual("Jangan tunggu *semangat* datang.");
    expect(v.emphasis).toEqual(["semangat"]);
    expect(stripMarks("Jangan tunggu *semangat* datang.")).toBe("Jangan tunggu semangat datang.");
    expect(stripMarks("a * b")).toBe("a  b");
  });
  it("highlights the keyword that picked the icon when nothing is marked", () => {
    expect(detectVisual("Disiplin membuatmu tetap bergerak.").emphasis).toEqual(["disiplin"]);
  });
  it("normalises words for matching", () => {
    expect(wordKey("“Sukses,”")).toBe("sukses");
    expect(wordKey("Kréatif!")).toBe("kreatif");
  });
  it("applies template and icon overrides", () => {
    const text = "Pilih disiplin, bukan sekadar motivasi.";
    expect(resolveVisual(text).template).toBe("compare");
    const v = resolveVisual(text, { template: "statement", icon: "money" });
    expect(v).toMatchObject({ template: "statement", icon: "money" });
    expect(resolveVisual(text, { icon: "none" }).icon).toBeNull();
    expect(resolveVisual(text, { icon: "does-not-exist" }).icon).toBe(resolveVisual(text).icon);
    expect(resolveVisual("Hemat 20% biaya.", { template: "number" }).number?.value).toBe(20);
    expect(resolveVisual("Mulai dari sini.", { template: "cta" }).cta).toBeTruthy();
    expect(resolveVisual("Biasa saja.", { template: "list" }).listIndex).toBeNull();
  });
});
