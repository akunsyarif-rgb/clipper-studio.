import { describe, expect, it } from "vitest";
import { contrast, SAFE } from "./layout";
import { hasOverlay, MAX_OVERLAY_FRAMES, overlayBand, overlayColors, overlayKeyword, OVERLAY_HEIGHT, SCRIM } from "./overlay";
import { HEIGHT, PALETTES } from "./script";
import { detectVisual } from "./visuals";

describe("overlayBand", () => {
  it("keeps both positions inside the safe areas", () => {
    for (const pos of ["top", "lower"] as const) {
      const b = overlayBand(pos);
      expect(b.top).toBeGreaterThanOrEqual(SAFE.top);
      expect(b.top + b.height).toBeLessThanOrEqual(HEIGHT - SAFE.bottom);
      expect(b.height).toBe(OVERLAY_HEIGHT);
    }
  });

  it("puts the top band at the top and the lower band above the captions without touching them", () => {
    const top = overlayBand("top"), lower = overlayBand("lower");
    expect(top.top).toBe(SAFE.top);
    expect(lower.top).toBeGreaterThan(top.top + top.height);
    // The caption block starts at 1920 - 380 - 24 - 170 = 1346; the band ends above it with a gap.
    expect(lower.top + lower.height).toBeLessThan(HEIGHT - SAFE.bottom - 24 - 170);
  });

  it("keeps an animation short, like graphic cutaways", () => {
    expect(MAX_OVERLAY_FRAMES).toBe(120);
  });
});

describe("overlayColors", () => {
  it.each(Object.entries(PALETTES))("%s: text and accent are readable over the dark veil", (_, p) => {
    const c = overlayColors(p);
    expect(contrast(c.text, SCRIM)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.accent, SCRIM)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a bright accent and replaces a dark one by the palette's light tone", () => {
    expect(overlayColors(PALETTES.violet).accent).toBe(PALETTES.violet.accent);
    expect(overlayColors(PALETTES.pearl).accent).toBe(PALETTES.pearl.bg1);
    expect(overlayColors(PALETTES.ivory).accent).toBe(PALETTES.ivory.bg1);
  });
});

describe("overlayKeyword", () => {
  it("returns the first emphasised word as written, in capitals", () => {
    expect(overlayKeyword("Uang itu penting sekali.", { emphasis: ["uang"] })).toBe("UANG");
    expect(overlayKeyword("Semua *Disiplin*, bukan bakat.", { emphasis: ["disiplin"] })).toBe("DISIPLIN");
  });
  it("is null without emphasis or when the word is not in the text", () => {
    expect(overlayKeyword("Tidak ada penekanan.", { emphasis: [] })).toBeNull();
    expect(overlayKeyword("Tidak ada penekanan.", { emphasis: ["lain"] })).toBeNull();
  });
  it("strips punctuation around the word", () => {
    expect(overlayKeyword("Mulailah, sekarang!", { emphasis: ["sekarang"] })).toBe("SEKARANG");
  });
});

describe("hasOverlay", () => {
  it("is true for scenes the visual detector found something in", () => {
    for (const t of ["Ada 73% orang berhenti.", "Pertama, mulai.", "Siapa yang mau?", "Ikuti untuk tips.", "Uang itu penting."]) expect(hasOverlay(detectVisual(t))).toBe(true);
  });
  it("is false for a plain statement and for forced templates without their data", () => {
    expect(hasOverlay(detectVisual("Ya begitulah."))).toBe(false);
    expect(hasOverlay({ template: "number", icon: null, emphasis: [] })).toBe(false);
    expect(hasOverlay({ template: "compare", icon: null, emphasis: [] })).toBe(false);
  });
});
