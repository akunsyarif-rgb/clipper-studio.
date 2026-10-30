import { describe, expect, it } from "vitest";
import { buildCoverPrompt, cleanAiCoverPrompt, cleanNegativePrompt, COVER_ASPECTS, NEGATIVE_PROMPT, SLOP_WORDS } from "./cover-prompt";
import { SEO_PLATFORMS } from "./seo";

const money = { topic: "hemat gaji", title: "Gaji habis tanggal 5?", transcript: "Gaji habis tanggal 5? Coba pecah jadi tiga pos. Pos satu untuk kebutuhan wajib. Simpan dan bagikan ya.", platform: "tiktok" as const };

describe("plain cover prompt", () => {
  it("follows the content: its subject, its opening line and a matching mood", () => {
    const c = buildCoverPrompt(money);
    expect(c.prompt).toContain("Subject: Gaji habis tanggal 5?");
    expect(c.prompt).toMatch(/Mood: calm, practical, money-conscious/);
    const cook = buildCoverPrompt({ topic: "resep sambal", transcript: "Sambal terasi ini bikin makan lahap. Ulek kasar saja.", platform: "tiktok" });
    expect(cook.prompt).toMatch(/Mood: warm, appetising/);
    expect(cook.prompt).not.toBe(c.prompt);
  });
  it("is a documentary photograph with no text in the image, honest imperfections and room for the headline", () => {
    const c = buildCoverPrompt(money);
    expect(c.prompt).toMatch(/documentary photograph/);
    expect(c.prompt).toMatch(/35mm or 50mm/);
    expect(c.prompt).toMatch(/small honest imperfections/);
    expect(c.prompt).toMatch(/Do not draw any text, letters, numbers, logos or watermarks/);
    expect(c.prompt).toMatch(/empty space in the upper third for a headline/);
    expect(c.negative).toBe(NEGATIVE_PROMPT);
    expect(c.negative).toMatch(/plastic or waxy skin/);
  });
  it("never uses a buzzword that makes a picture look generated", () => {
    for (const p of SEO_PLATFORMS) {
      const t = buildCoverPrompt({ ...money, platform: p.id }).prompt.toLowerCase();
      for (const w of SLOP_WORDS) expect(t.includes(w.toLowerCase()), `${p.id}: ${w}`).toBe(false);
    }
  });
  it("fits each platform's cover and keeps the subject out of the app's interface zones", () => {
    expect(buildCoverPrompt(money).prompt).toContain("9:16 (1080x1920)");
    expect(buildCoverPrompt({ ...money, platform: "x" }).prompt).toContain("16:9 (1280x720)");
    expect(buildCoverPrompt({ ...money, platform: "linkedin" }).prompt).toContain("4:5 (1080x1350)");
    expect(buildCoverPrompt(money).prompt).toContain(`top ${COVER_ASPECTS.tiktok.topPct}% and bottom ${COVER_ASPECTS.tiktok.bottomPct}%`);
  });
  it("shows a person candidly only when the content is about people, otherwise a concrete object or scene", () => {
    expect(buildCoverPrompt({ ...money, transcript: "Kamu pernah gaji habis tanggal 5? Aku juga. Coba pecah jadi tiga pos." }).prompt).toMatch(/One real-looking adult/);
    expect(buildCoverPrompt({ topic: "kopi", transcript: "Biji arabika disangrai sedang menghasilkan rasa manis alami pada cangkir.", platform: "tiktok" }).prompt).toMatch(/One concrete real-world object or scene/);
  });
  it("works with almost nothing to go on", () => {
    const c = buildCoverPrompt({ topic: "", transcript: "", platform: "youtube" });
    expect(c.prompt).toMatch(/Subject: an everyday situation/);
  });
});

describe("a prompt written by the AI", () => {
  it("loses the generated-look buzzwords and keeps the rest", () => {
    const { text, removed } = cleanAiCoverPrompt("Ultra-detailed 8K masterpiece, cinematic lighting. A man pours coffee, glowing steam, natural window light, epic mood.");
    expect(text).not.toMatch(/ultra|8k|masterpiece|cinematic|glowing|epic/i);
    expect(text).toContain("A man pours coffee");
    expect(text).toContain("natural window light");
    expect(removed).toEqual(expect.arrayContaining(["ultra-detailed", "8k", "masterpiece", "cinematic lighting", "glowing", "epic"]));
    expect(text).not.toMatch(/,\s*,|\(\s*\)/);
  });
  it("always carries the no-text rule, once", () => {
    expect(cleanAiCoverPrompt("A woman folds laundry on a bed.").text).toMatch(/Do not draw any text/);
    const own = cleanAiCoverPrompt("A woman folds laundry. No text in the image.").text;
    expect(own.match(/no text/gi)).toHaveLength(1);
    expect(cleanAiCoverPrompt("").text).toBe("");
  });
  it("negative prompts keep the AI's terms and add the standard ones", () => {
    expect(cleanNegativePrompt("Negative prompt: blurry, text")).toMatch(/^blurry, text, .*plastic or waxy skin/);
    expect(cleanNegativePrompt("")).toBe(NEGATIVE_PROMPT);
  });
});
