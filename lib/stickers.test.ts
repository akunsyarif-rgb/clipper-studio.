import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchSticker, planStickers, STICKER_BY_ID, STICKER_CREDIT, STICKERS } from "./stickers";

const dir = join(process.cwd(), "public", "stickers");

describe("sticker files and licence", () => {
  it("every sticker is a real SVG with a size, and no file is shipped unused", () => {
    for (const s of STICKERS) {
      const path = join(dir, s.file);
      expect(existsSync(path), s.file).toBe(true);
      const head = readFileSync(path, "utf8").slice(0, 200);
      expect(head, s.file).toMatch(/^<svg width="512" height="512"/);
    }
    const used = new Set(STICKERS.map(s => s.file));
    expect(readdirSync(dir).filter(f => f.endsWith(".svg") && !used.has(f))).toEqual([]);
    expect(new Set(STICKERS.map(s => s.id)).size).toBe(STICKERS.length);
  });
  it("ships the CC-BY 4.0 text and the attribution, and the credit line names the author and the licence", () => {
    expect(readFileSync(join(dir, "LICENSE-GRAPHICS.txt"), "utf8")).toMatch(/Attribution 4\.0 International/);
    expect(readFileSync(join(dir, "ATTRIBUTION.txt"), "utf8")).toMatch(/Twitter, Inc and other contributors/);
    expect(STICKER_CREDIT).toMatch(/Twemoji/);
    expect(STICKER_CREDIT).toMatch(/CC-BY 4\.0/);
  });
});

describe("matchSticker", () => {
  it("reads Indonesian and English meaning, on whole words only", () => {
    expect(matchSticker("Jangan tunggu semangat datang.")?.id).toBe("hourglass");
    expect(matchSticker("Mulailah, meski langkahmu kecil.")?.id).toBe("seedling");
    expect(matchSticker("Disiplin membuatmu tetap bergerak.")?.id).toBe("muscle");
    expect(matchSticker("Mulai sekarang.")?.id).toBe("rocket");
    expect(matchSticker("Save money every month")?.id).toBe("money");
    expect(matchSticker("Awas penipuan online!")?.id).toBe("alert");
  });
  it("does not fire inside other words, and leaves neutral sentences without a sticker", () => {
    expect(matchSticker("Mulailah perlahan.")).toBeNull();      // "mulailah" is not "mulai"
    expect(matchSticker("Kita bertemu kemarin sore.")).toBeNull();
    expect(matchSticker("")).toBeNull();
  });
  it("every sticker can be reached by at least one of its own words", () => {
    for (const s of STICKERS) {
      const first = s.words.split("|")[0];
      const hit = matchSticker(`Ini tentang ${first} saja`);
      expect(hit, `${s.id} via "${first}"`).not.toBeNull();
    }
  });
});

describe("planStickers", () => {
  const texts = ["Jangan tunggu semangat datang.", "Mulailah, meski langkahmu kecil.", "Disiplin membuatmu tetap bergerak.", "Satu langkah hari ini lebih baik dari rencana sempurna.", "Mulai sekarang."];
  it("is off when switched off", () => {
    expect(planStickers(texts, { mode: "off" }).every(x => x === null)).toBe(true);
  });
  it("picks by meaning for the five-scene sample, within the share limit", () => {
    const plan = planStickers(texts, { mode: "auto" });
    expect(plan).toEqual(["hourglass", "seedling", "muscle", null, null]);
    expect(plan.filter(Boolean).length).toBeLessThanOrEqual(Math.ceil(texts.length * 0.6));
  });
  it("never repeats a sticker in the next scene", () => {
    const plan = planStickers(["Hemat uang ya.", "Uang itu penting.", "Uang lagi?"], { mode: "auto", maxShare: 1 });
    expect(plan).toEqual(["money", null, "money"]);
  });
  it("a creator's choice wins: a named sticker is kept even when repeated, and 'none' removes it", () => {
    const plan = planStickers(["Hemat uang ya.", "Uang itu penting.", "Uang lagi?"], { mode: "auto", maxShare: 1, overrides: { "Uang itu penting.": "gem", "Uang lagi?": "none" } });
    expect(plan).toEqual(["money", "gem", null]);
    expect(STICKER_BY_ID.gem.emoji).toBe("💎");
    expect(planStickers(["Biasa saja."], { mode: "auto", overrides: { "Biasa saja.": "fire" } })).toEqual(["fire"]);
    expect(planStickers(["Biasa saja."], { mode: "auto", overrides: { "Biasa saja.": "tidak-ada" } })).toEqual([null]);
  });
});
