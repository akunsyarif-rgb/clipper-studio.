import { describe, expect, it } from "vitest";
import { BRANDS, matchBrands } from "./brands";
import { BRAND_STYLE, brandStyle } from "./brand-style";
import { barHeights, clamp01, curvePoint, easeOut, floater, progress, ring, wave } from "./brand-motion";
import { contrast } from "./layout";
import { SCRIM } from "./overlay";
import { ICONS } from "./visuals";

describe("every popular name has a look", () => {
  it("has a colour readable on the veil, a kind of scene and an icon", () => {
    for (const b of BRANDS) {
      const st = BRAND_STYLE[b.id];
      expect(st, `style of ${b.id}`).toBeDefined();
      expect(contrast(st.color, SCRIM), `${b.id} colour`).toBeGreaterThanOrEqual(4.5);
      if (st.color2) expect(contrast(st.color2, SCRIM), `${b.id} second colour`).toBeGreaterThanOrEqual(4.5);
      expect(ICONS[b.id], `icon of ${b.id}`).toBeDefined();
    }
  });
  it("lists no style for a name that does not exist, and falls back for an unknown one", () => {
    expect(Object.keys(BRAND_STYLE).filter(id => !BRANDS.some(b => b.id === id))).toEqual([]);
    expect(brandStyle("nothing").stage).toBe("generic");
  });
  it("has unique ids and words that are lower case", () => {
    expect(new Set(BRANDS.map(b => b.id)).size).toBe(BRANDS.length);
    for (const b of BRANDS) for (const w of b.words) expect(w).toBe(w.toLowerCase());
  });
});

describe("more popular terms", () => {
  const ids = (t: string) => matchBrands(t).map(b => b.id);
  it("knows editing, design, work and payment apps", () => {
    expect(ids("Edit dulu di CapCut lalu desain di Canva.")).toEqual(["capcut", "canva"]);
    expect(ids("Rapat lewat Zoom meeting atau Google Meet.")).toEqual(["meeting"]);
    expect(ids("Kirim lewat Gmail, simpan di Google Drive.")).toEqual(["gmail", "drive", "google"].filter(i => i !== "google"));
    expect(ids("Bayar pakai GoPay atau QRIS.")).toEqual(["ewallet"]);
    expect(ids("Main Roblox dan Minecraft sama teman di Discord.")).toEqual(["games", "discord"]);
    expect(ids("Kode ada di GitHub, kasih bintang ya.")).toEqual(["github"]);
    expect(ids("Simpan inspirasi di Pinterest dan Snapchat.")).toEqual(["pinterest", "snapchat"]);
  });
  it("does not take ordinary words for names", () => {
    expect(ids("Zoom in sedikit pada wajahnya.")).toEqual([]);
    expect(ids("Dana untuk proyek ini cukup besar.")).toEqual([]);
    expect(ids("Satu per satu, pelan-pelan, tanpa buru-buru.")).toEqual([]);
    expect(ids("Kita lihat word by word.")).toEqual([]);
  });
});

describe("motion helpers are deterministic and bounded", () => {
  it("clamps and eases", () => {
    expect(clamp01(-1)).toBe(0); expect(clamp01(2)).toBe(1);
    expect(easeOut(0)).toBe(0); expect(easeOut(1)).toBe(1); expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(progress(10, 20, 10)).toBe(0); expect(progress(25, 20, 10)).toBe(0.5); expect(progress(99, 20, 10)).toBe(1);
  });
  it("wave stays within 0..1 and repeats", () => {
    for (let f = 0; f < 200; f += 7) { const v = wave(f, 30, 1); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    expect(wave(5, 30)).toBeCloseTo(wave(35, 30), 9);
  });
  it("equalizer bars stay between the minimum and 1, differ from each other and are the same every time", () => {
    for (const f of [0, 13, 99]) { const h = barHeights(f, 7); expect(h).toHaveLength(7); for (const v of h) { expect(v).toBeGreaterThanOrEqual(0.2 - 1e-9); expect(v).toBeLessThanOrEqual(1 + 1e-9); } expect(new Set(h.map(v => v.toFixed(3))).size).toBeGreaterThan(3); expect(barHeights(f, 7)).toEqual(h); }
  });
  it("a curve starts and ends where it should and points along its travel", () => {
    const a = { x: 0, y: 100 }, c = { x: 100, y: 0 }, b = { x: 200, y: 50 };
    expect(curvePoint(0, a, c, b)).toMatchObject({ x: 0, y: 100 });
    expect(curvePoint(1, a, c, b)).toMatchObject({ x: 200, y: 50 });
    expect(curvePoint(0, a, c, b).angle).toBeLessThan(0); // starts heading up
    expect(curvePoint(1, a, c, b).angle).toBeGreaterThan(0); // ends heading down
  });
  it("floaters rise, fade in and out and stay inside the box", () => {
    for (let i = 0; i < 4; i++) for (let f = 0; f < 150; f += 5) { const p = floater(f, i, 4); expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThan(1); expect(p.opacity).toBeGreaterThanOrEqual(-1e-9); expect(p.opacity).toBeLessThanOrEqual(1); }
    expect(floater(0, 0, 4).opacity).toBeCloseTo(0, 6);
    expect(floater(35, 0, 1, 70).opacity).toBeCloseTo(1, 6);
  });
  it("rings expand as they fade", () => {
    expect(ring(0, 0, 3).opacity).toBeCloseTo(1, 6);
    const early = ring(10, 0, 1), late = ring(40, 0, 1);
    expect(late.r).toBeGreaterThan(early.r);
    expect(late.opacity).toBeLessThan(early.opacity);
  });
});
