import { describe, expect, it } from "vitest";
import { contentBox, contrast, estimateHeavy, fitText, SAFE, type Measure } from "./layout";
import { HEIGHT, PALETTES, WIDTH } from "./script";

// Monospace fake: every character is 60 px wide at 100 px, so expected wraps can be computed by hand.
const mono: Measure = t => t.length * 60;

describe("safe areas", () => {
  it("keeps the content box inside the frame and above the caption band", () => {
    const withCaptions = contentBox(true), without = contentBox(false);
    expect(withCaptions.top).toBe(SAFE.top);
    expect(withCaptions.bottom).toBeLessThan(without.bottom);
    expect(without.bottom).toBe(HEIGHT - SAFE.bottom);
    expect(withCaptions.width + SAFE.side * 2).toBe(WIDTH);
    expect(withCaptions.height).toBeGreaterThan(900);
  });
});

describe("fitText", () => {
  const box = { maxWidth: 860, maxHeight: 700, maxSize: 120, minSize: 52, lineHeight: 1.06 };

  it("keeps short text at the maximum size on one line", () => {
    const r = fitText("Mulai lagi", mono, box);
    expect(r).toMatchObject({ fontSize: 120, fits: true });
    expect(r.lines).toEqual([["Mulai", "lagi"]]);
  });

  it("wraps at word boundaries and never exceeds the width or height", () => {
    const text = "Mengapa sebagian besar orang berhenti membangun kebiasaan baik setelah tiga minggu pertama?";
    const r = fitText(text, mono, box);
    expect(r.fits).toBe(true);
    expect(r.lines.flat().join(" ")).toBe(text);
    for (const line of r.lines) expect((line.join(" ").length * 60 * r.fontSize) / 100).toBeLessThanOrEqual(box.maxWidth);
    expect(r.lines.length * r.fontSize * box.lineHeight).toBeLessThanOrEqual(box.maxHeight);
  });

  it("shrinks so the longest single word fits the width", () => {
    const r = fitText("Antidisestablishmentarianism", mono, box);
    expect((28 * 60 * r.fontSize) / 100).toBeLessThanOrEqual(box.maxWidth);
    expect(r.lines).toHaveLength(1);
  });

  it("goes below the preferred minimum rather than cropping the 140-character scene limit", () => {
    const text = "kata ".repeat(28).trim();
    const r = fitText(text, mono, { ...box, maxHeight: 300 });
    expect(r.fits).toBe(true);
    expect(r.fontSize).toBeLessThan(box.minSize);
  });

  it("respects a one-line limit for counters", () => {
    const r = fitText("Rp 1.250.000", mono, { ...box, maxLines: 1, maxSize: 240, minSize: 90 });
    expect(r.lines).toHaveLength(1);
    expect((12 * 60 * r.fontSize) / 100).toBeLessThanOrEqual(box.maxWidth);
  });

  it("accounts for letter spacing", () => {
    const loose = fitText("abcdefghij", mono, { ...box, letterSpacing: 0.2, maxLines: 1 });
    const tight = fitText("abcdefghij", mono, { ...box, letterSpacing: -0.02, maxLines: 1 });
    expect(loose.fontSize).toBeLessThan(tight.fontSize);
  });

  it("returns nothing to draw for empty text", () => {
    expect(fitText("  ", mono, box).lines).toEqual([]);
  });

  it("has a fallback estimate that over-estimates heavy-sans widths", () => {
    // Arial Black "M" ≈ 0.94 em, "a" ≈ 0.67 em; the estimate must not be smaller than real glyphs.
    expect(estimateHeavy("M")).toBeGreaterThanOrEqual(94);
    expect(estimateHeavy("aaaa")).toBeGreaterThanOrEqual(4 * 60);
  });
});

describe("palette contrast", () => {
  it.each(Object.entries(PALETTES))("%s text is readable on both background stops (WCAG AA large text ≥ 3)", (_, p) => {
    expect(contrast(p.text, p.bg1)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.text, p.bg2)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.accent, p.bg1)).toBeGreaterThanOrEqual(3);
  });

  it("computes the textbook black/white ratio", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });
});
