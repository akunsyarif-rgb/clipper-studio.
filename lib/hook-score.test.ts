import { describe, expect, it } from "vitest";
import { bandOf, hookLineOf, hookScorable, rankHooks, scoreHook, wordCount } from "./hook-score";

const EMPTY_GREETING = "Halo guys, selamat datang di video ini, hari ini kita akan membahas tips yang luar biasa";
const HYPE = "Rahasia sukses yang luar biasa dan ajaib untuk semua orang";
const STRONG = "Kamu kehilangan 40% hasil panenmu sebelum sempat dijual, dan penyebabnya bukan hama.";
const SPECIFIC = "Gajimu habis tanggal 15? Ini 3 kebiasaan yang diam-diam membuang Rp 1,2 juta tiap bulan.";
const GENERIC = "Jadwal minum obat harus teratur.";

describe("hook score", () => {
  it("a greeting and a hype line score low; a specific line that speaks to the viewer scores well above them", () => {
    const lows = [EMPTY_GREETING, HYPE, GENERIC].map(t => scoreHook(t).verdict);
    const highs = [STRONG, SPECIFIC].map(t => scoreHook(t).verdict);
    expect(Math.max(...lows)).toBeLessThan(Math.min(...highs));
    expect(scoreHook(EMPTY_GREETING).band).toBe("lemah");
    expect(scoreHook(STRONG).band).not.toBe("lemah");
  });

  it("the verdict is 60% of the mean and 40% of the weakest property, so one dead property pulls it down", () => {
    const h = scoreHook(STRONG);
    const values = h.properties.map(p => p.value);
    expect(h.verdict).toBe(Math.round(0.6 * (values.reduce((a, b) => a + b, 0) / 5) + 0.4 * Math.min(...values)));
    expect(h.verdict).toBeLessThan(Math.round(values.reduce((a, b) => a + b, 0) / 5));
    expect(h.properties.map(p => p.key)).toEqual(["spesifik", "menyapa", "taruhan", "penasaran", "ringkas"]);
  });

  it("names the weakest property and the one change to make first", () => {
    const h = scoreHook(EMPTY_GREETING);
    expect(h.weakest).toBe("spesifik");
    expect(h.fix).toMatch(/angka, nama, atau tanggal/);
    expect(scoreHook(GENERIC).fix.length).toBeGreaterThan(10);
  });

  it("brevity: 9 to 24 words is full marks; shorter and longer lines lose points", () => {
    const brevity = (t: string) => scoreHook(t).properties.find(p => p.key === "ringkas")!.value;
    expect(brevity("satu dua tiga empat lima enam tujuh delapan sembilan")).toBe(100);
    expect(brevity("Tips hemat")).toBeLessThan(40);
    expect(brevity(Array.from({ length: 40 }, () => "kata").join(" "))).toBeLessThan(30);
    expect(wordCount("Rp 1,2 juta per bulan")).toBe(5);
  });

  it("speaking to the viewer: kamu, anda and the possessive -mu count, ordinary words ending in -mu do not", () => {
    const address = (t: string) => scoreHook(t).properties.find(p => p.key === "menyapa")!.value;
    expect(address("Gajimu habis sebelum akhir bulan")).toBeGreaterThan(address("Gaji habis sebelum akhir bulan"));
    expect(address("Kamu perlu tahu ini")).toBeGreaterThan(address("Ini perlu diketahui"));
    expect(address("Tamu datang membawa jamu")).toBe(address("Orang datang membawa oleh-oleh"));
  });

  it("specificity: a number or a name helps, hype and greetings hurt", () => {
    const spec = (t: string) => scoreHook(t).properties.find(p => p.key === "spesifik")!.value;
    expect(spec("Biaya naik 30% di Jakarta")).toBeGreaterThan(spec("Biaya naik banyak di sana"));
    expect(spec("Cara hemat yang luar biasa dan ajaib")).toBeLessThan(spec("Cara hemat listrik"));
  });

  it("curiosity: a question helps; a line that answers itself loses the gap", () => {
    const cur = (t: string) => scoreHook(t).properties.find(p => p.key === "penasaran")!.value;
    expect(cur("Kenapa tabunganmu tidak pernah cukup?")).toBeGreaterThan(cur("Tabunganmu tidak pernah cukup"));
    expect(cur("Tabunganmu habis karena boros")).toBeLessThan(cur("Tabunganmu habis tapi ternyata bukan boros"));
  });

  it("recognises the shape of the opening, and says nothing for a plain statement", () => {
    expect(scoreHook("5 cara hemat listrik di rumah").formula?.name).toBe("Daftar");
    expect(scoreHook("Kenapa gajimu cepat habis?").formula?.name).toBe("Pertanyaan");
    expect(scoreHook("97% orang berhenti menabung sebelum bulan ketiga").formula?.name).toBe("Statistik");
    expect(scoreHook(GENERIC).formula).toBeNull();
  });

  it("ranks options best first and keeps the order of ties", () => {
    const ranked = rankHooks([GENERIC, STRONG, EMPTY_GREETING, SPECIFIC]);
    expect(ranked[0].verdict).toBeGreaterThanOrEqual(ranked[1].verdict);
    expect(ranked.at(-1)!.text).toBe(EMPTY_GREETING);
    expect(rankHooks(["a b c d e f g", "a b c d e f g"]).map(h => h.text)).toEqual(["a b c d e f g", "a b c d e f g"]);
  });

  it("takes the opening line of a script as it will be said: no emphasis marks, no [jeda] tags, no blank lines", () => {
    expect(hookLineOf("\n\n *Jangan* tunggu semangat datang. [jeda 1s]\nMulailah.")).toBe("Jangan tunggu semangat datang.");
    expect(hookLineOf("(jeda 2s) Halo dunia")).toBe("Halo dunia");
    expect(hookLineOf("   \n  ")).toBe("");
    expect(hookScorable("dua kata")).toBe(false);
    expect(hookScorable("tiga kata ya")).toBe(true);
  });

  it("empty text scores zero and never throws; bands start at 55 and 72", () => {
    expect(scoreHook("").verdict).toBeLessThan(30);
    expect(scoreHook("   ").words).toBe(0);
    expect([bandOf(54), bandOf(55), bandOf(71), bandOf(72)]).toEqual(["lemah", "cukup", "cukup", "kuat"]);
  });
});
