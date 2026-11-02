import { describe, expect, it } from "vitest";
import { easeOutBack, iconEntrance, POP_FRAMES, SLIDE_DISTANCE, SLIDE_FRAMES } from "./icon-motion";
import { iconLookupFor, iconNamesFor, stem } from "./icon-keywords";

describe("entrance animations", () => {
  it("pop starts at nothing, overshoots a little, and settles at exactly full size", () => {
    expect(iconEntrance("pop", 0).scale).toBeCloseTo(0, 10);
    const peak = Math.max(...Array.from({ length: POP_FRAMES + 1 }, (_, f) => iconEntrance("pop", f).scale));
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.2);
    expect(iconEntrance("pop", POP_FRAMES + 30)).toEqual({ scale: 1, opacity: 1, y: 0 });
    expect(easeOutBack(1)).toBeCloseTo(1, 10);
  });
  it("slide-up fades in while rising from below, then rests", () => {
    expect(iconEntrance("slide-up", 0)).toEqual({ scale: 1, opacity: 0, y: SLIDE_DISTANCE });
    const mid = iconEntrance("slide-up", SLIDE_FRAMES / 2);
    expect(mid.opacity).toBeGreaterThan(0.5); expect(mid.y).toBeGreaterThan(0); expect(mid.y).toBeLessThan(SLIDE_DISTANCE);
    expect(iconEntrance("slide-up", SLIDE_FRAMES)).toEqual({ scale: 1, opacity: 1, y: 0 });
  });
  it("respects the delay, is deterministic, and draw is left to the icon", () => {
    expect(iconEntrance("pop", 5, 10).scale).toBeCloseTo(0, 10);
    expect(iconEntrance("slide-up", 7, 3)).toEqual(iconEntrance("slide-up", 7, 3));
    expect(iconEntrance("draw", 0)).toEqual({ scale: 1, opacity: 1, y: 0 });
  });
});

describe("transcript words to icon names", () => {
  it("maps the examples", () => {
    expect(iconNamesFor("Bisnis ini untung besar")[0]).toBe("briefcase");
    expect(iconNamesFor("Kita untung besar")).toEqual(["trending-up"]);
    expect(iconNamesFor("Jangan buang waktu")).toEqual(["circle-x", "clock"]);
  });
  it("stems Indonesian affixes", () => {
    expect(stem("keuntungan")).toContain("untung");
    expect(iconNamesFor("keuntungannya besar")).toEqual(["trending-up"]);
    expect(iconNamesFor("menabung dari sekarang")).toContain("piggy-bank");
    expect(iconNamesFor("berjualan setiap hari")).toEqual(expect.arrayContaining(["calendar"]));
  });
  it("a lookup prefers the director's English query, then the dictionary, then long words", () => {
    expect(iconLookupFor("apa saja", "rocket launch")).toEqual({ exact: [], query: "rocket launch" });
    expect(iconLookupFor("Waktu terus berjalan")).toEqual({ exact: ["lucide:clock"], query: "clock" });
    expect(iconLookupFor("Meja kayu besar.").exact).toEqual([]);
    expect(iconLookupFor("Meja kayu besar.").query).toBe("besar Meja");
  });
  it("every mapped name is a plain icon name (lowercase, hyphenated)", async () => {
    const { ICON_WORDS } = await import("./icon-keywords");
    for (const [w, n] of Object.entries(ICON_WORDS)) { expect(w).toMatch(/^[a-z]+$/); expect(n).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/); }
  });
});
