import { describe, expect, it } from "vitest";
import { captionBox, captionShift, DEFAULT_CAPTION_POS, isDefaultCaptionPos, normalizeCaptionPos } from "./caption-box";
import { CAPTION_BOTTOM, CONTENT_WIDTH } from "./layout";
import { HEIGHT, WIDTH } from "./script";

describe("caption box", () => {
  it("the default is the old place: centred, bottom edge CAPTION_BOTTOM above the frame bottom, normal size", () => {
    const b = captionBox(undefined);
    expect(b.centerX).toBe(WIDTH / 2);
    expect(b.bottom).toBeCloseTo(HEIGHT - CAPTION_BOTTOM, 0);
    expect(b.maxWidth).toBe(CONTENT_WIDTH);
    expect(b.fontScale).toBe(1);
    expect(isDefaultCaptionPos(DEFAULT_CAPTION_POS)).toBe(true);
  });
  it("is relative: the position is a percentage of the frame, so the same values give the same picture at any frame size", () => {
    const a = captionBox({ x: 50, y: 60, scale: 120 }, 1080, 1920), b = captionBox({ x: 50, y: 60, scale: 120 }, 2160, 3840);
    expect(a.centerX / 1080).toBeCloseTo(b.centerX / 2160, 3);
    expect(a.bottom / 1920).toBeCloseTo(b.bottom / 3840, 3);
    expect(a.bottom).toBeCloseTo(0.6 * 1920, 1);
    expect(a.fontScale).toBe(b.fontScale);
    expect(captionBox({ x: 40, y: 80, scale: 100 }).centerX).toBeCloseTo(0.4 * WIDTH, 1);
  });
  it("never leaves the frame, whatever the slider says: the block is narrower near a side and its centre is held inside", () => {
    for (const x of [-50, 0, 15, 50, 85, 100, 500]) {
      const b = captionBox({ x, y: 80, scale: 100 });
      expect(b.centerX - b.maxWidth / 2).toBeGreaterThanOrEqual(0);
      expect(b.centerX + b.maxWidth / 2).toBeLessThanOrEqual(WIDTH);
      expect(b.maxWidth).toBeGreaterThanOrEqual(300);
    }
    const low = captionBox({ x: 50, y: 500, scale: 1000 }), high = captionBox({ x: 50, y: -5, scale: -3 });
    expect(low.bottom).toBeLessThanOrEqual(HEIGHT);
    expect(low.fontScale).toBe(2);
    expect(high.bottom).toBeGreaterThan(0);
    expect(high.fontScale).toBe(0.5);
  });
  it("reads a saved position safely: junk and the default both mean 'not set'", () => {
    expect(normalizeCaptionPos(undefined)).toBeUndefined();
    expect(normalizeCaptionPos("x")).toBeUndefined();
    expect(normalizeCaptionPos({ x: "50", y: 70, scale: 100 })).toBeUndefined();
    expect(normalizeCaptionPos({ x: 50, y: DEFAULT_CAPTION_POS.y, scale: 100 })).toBeUndefined();
    expect(normalizeCaptionPos({ x: 10, y: 99, scale: 400 })).toEqual({ x: 15, y: 95, scale: 200 });
    expect(normalizeCaptionPos({ x: 33.33, y: 60.04, scale: 120.4 })).toEqual({ x: 33.3, y: 60, scale: 120 });
  });
  it("a caption inside a layout (the graphic cutaway) moves by the difference from its usual place and scales", () => {
    expect(captionShift(undefined)).toEqual({ dx: 0, dy: 0, fontScale: 1 });
    const s = captionShift({ x: 70, y: 50, scale: 150 });
    expect(s.dx).toBeGreaterThan(0);
    expect(s.dy).toBeLessThan(0);
    expect(s.fontScale).toBe(1.5);
  });
});
