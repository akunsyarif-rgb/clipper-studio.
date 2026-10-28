import { describe, expect, it } from "vitest";
import { fitWithin, imageProblem, kenBurns, MAX_IMAGE_SIDE } from "./scene-image";

describe("fitWithin", () => {
  it("shrinks the longest side to the limit and keeps the aspect ratio", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_IMAGE_SIDE, height: 1650 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1650, height: MAX_IMAGE_SIDE });
  });
  it("never enlarges a small image", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("kenBurns", () => {
  it("moves slowly from the first frame to the last and alternates direction", () => {
    const a0 = kenBurns(0, 0, 90), a1 = kenBurns(0, 90, 90);
    const b0 = kenBurns(1, 0, 90), b1 = kenBurns(1, 90, 90);
    expect(a1.scale).toBeGreaterThan(a0.scale); // zoom in
    expect(b1.scale).toBeLessThan(b0.scale); // then zoom out
    expect(Math.sign(kenBurns(0, 90, 90).x)).toBe(-Math.sign(kenBurns(2, 90, 90).x));
  });
  it("never shows the image edge: the pan stays inside the margin the zoom leaves", () => {
    for (let i = 0; i < 4; i++) for (let f = 0; f <= 120; f += 6) {
      const k = kenBurns(i, f, 120);
      const margin = ((k.scale - 1) / 2) * 100; // % of the image on each side
      expect(Math.abs(k.x)).toBeLessThanOrEqual(margin + 1e-9);
      expect(Math.abs(k.y)).toBeLessThanOrEqual(margin + 1e-9);
    }
  });
  it("is clamped outside the scene and starts and ends at rest (eased)", () => {
    expect(kenBurns(0, -10, 90)).toEqual(kenBurns(0, 0, 90));
    expect(kenBurns(0, 200, 90)).toEqual(kenBurns(0, 90, 90));
    const step0 = kenBurns(0, 1, 90).scale - kenBurns(0, 0, 90).scale;
    const stepMid = kenBurns(0, 46, 90).scale - kenBurns(0, 45, 90).scale;
    expect(step0).toBeLessThan(stepMid / 10);
  });
});

describe("imageProblem", () => {
  it("accepts common photo formats, also when the browser gives no type", () => {
    expect(imageProblem({ type: "image/jpeg", size: 1000, name: "a.jpg" })).toBeNull();
    expect(imageProblem({ type: "", size: 1000, name: "IMG_1.HEIC" })).toBeNull();
    expect(imageProblem({ type: "image/webp", size: 1000, name: "pin.webp" })).toBeNull();
  });
  it("rejects videos, documents and huge files", () => {
    expect(imageProblem({ type: "video/mp4", size: 1000, name: "a.mp4" })).toMatch(/JPG/);
    expect(imageProblem({ type: "application/pdf", size: 1000, name: "a.pdf" })).toMatch(/JPG/);
    expect(imageProblem({ type: "image/png", size: 30 * 1024 * 1024, name: "a.png" })).toMatch(/terlalu besar/);
  });
});
