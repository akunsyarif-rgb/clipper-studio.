import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ffmpegArgs, outputSize } from "./clip";
import { CAPTION_BOTTOM, contentBox, estimateHeavy, SAFE } from "./layout";
import { overlayBand } from "./overlay";
import {
  cleanWatermarkText, DEFAULT_WATERMARK, isWatermarkActive, loadWatermark, normalizeWatermark, saveWatermark, watermarkBox, watermarkInsets,
  WATERMARK_MAX_CHARS, WATERMARK_POSITIONS, type Watermark,
} from "./watermark";
import { WatermarkLayer } from "../remotion/Watermark";

const mono = (t: string) => t.length * 60; // 60 px per character at 100 px
const on = (over: Partial<Watermark> = {}): Watermark => ({ ...DEFAULT_WATERMARK, enabled: true, text: "@ArkaSenja", ...over });
const FRAME = { width: 1080, height: 1920 };

describe("watermark settings", () => {
  it("is off by default and appears only when enabled and non-empty", () => {
    expect(isWatermarkActive(DEFAULT_WATERMARK)).toBe(false);
    expect(isWatermarkActive(on())).toBe(true);
    expect(isWatermarkActive(on({ enabled: false }))).toBe(false);
    expect(isWatermarkActive(on({ text: "" }))).toBe(false);
    expect(isWatermarkActive(on({ text: "   \n\t " }))).toBe(false);
    expect(isWatermarkActive(on({ opacity: 0 }))).toBe(false);
    expect(isWatermarkActive(undefined)).toBe(false);
    expect(isWatermarkActive(null)).toBe(false);
  });
  it("cleans the text: control characters, line breaks and extra spaces go, length is limited", () => {
    expect(cleanWatermarkText("  @Arka \n  Senja\t")).toBe("@Arka Senja");
    expect(cleanWatermarkText("a\u0000b​c d")).toBe("a b c d");
    expect(cleanWatermarkText("x".repeat(100))).toHaveLength(WATERMARK_MAX_CHARS);
  });
  it("turns any stored value into valid settings", () => {
    expect(normalizeWatermark(null)).toEqual(DEFAULT_WATERMARK);
    expect(normalizeWatermark("junk")).toEqual(DEFAULT_WATERMARK);
    expect(normalizeWatermark({ enabled: "yes", text: 5, position: "middle", size: 99, opacity: -3 })).toEqual({ ...DEFAULT_WATERMARK, size: 9, opacity: 0.1 });
    expect(normalizeWatermark({ enabled: true, text: " Brand ", position: "top-left", size: 6, opacity: 0.8 })).toEqual({ enabled: true, text: "Brand", position: "top-left", size: 6, opacity: 0.8 });
  });
  it("is remembered for the editing session and restored for the next render", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(loadWatermark(storage)).toEqual(DEFAULT_WATERMARK);
    saveWatermark(on({ position: "top-right", size: 7, opacity: 0.4 }), storage);
    expect(loadWatermark(storage)).toEqual(on({ position: "top-right", size: 7, opacity: 0.4 }));
    store.set("clipper:watermark:v1", "{not json");
    expect(loadWatermark(storage)).toEqual(DEFAULT_WATERMARK);
    expect(() => saveWatermark(on(), { setItem: () => { throw new Error("blocked"); } })).not.toThrow();
    expect(loadWatermark(null)).toEqual(DEFAULT_WATERMARK);
  });
});

describe("watermarkBox", () => {
  it("puts each position in its own corner, inside the safe area of a 9:16 frame", () => {
    const boxes = Object.fromEntries(WATERMARK_POSITIONS.map(p => [p.id, watermarkBox(on({ position: p.id }), FRAME, mono)]));
    for (const b of Object.values(boxes)) {
      expect(b.x).toBeGreaterThanOrEqual(SAFE.side);
      expect(b.x + b.width).toBeLessThanOrEqual(FRAME.width - SAFE.side);
      expect(b.y).toBeGreaterThanOrEqual(SAFE.top);
      expect(b.y + b.height).toBeLessThanOrEqual(FRAME.height - SAFE.bottom);
    }
    expect(boxes["top-left"].x).toBe(SAFE.side);
    expect(boxes["top-left"].y).toBe(SAFE.top);
    expect(boxes["top-right"].x + boxes["top-right"].width).toBe(FRAME.width - SAFE.side);
    expect(boxes["bottom-left"].y + boxes["bottom-left"].height).toBeLessThanOrEqual(FRAME.height - SAFE.bottom);
    expect(boxes["bottom-right"].align).toBe("right");
    expect(boxes["bottom-left"].align).toBe("left");
    expect(new Set(Object.values(boxes).map(b => `${b.x},${b.y}`)).size).toBe(4);
  });
  it("grows with the size setting and shrinks to fit when the text is long", () => {
    const small = watermarkBox(on({ size: 3 }), FRAME, mono), big = watermarkBox(on({ size: 9 }), FRAME, mono);
    expect(big.fontSize).toBeGreaterThan(small.fontSize * 2.5);
    const long = watermarkBox(on({ text: "x".repeat(WATERMARK_MAX_CHARS), size: 9 }), FRAME, mono);
    expect(long.width).toBeLessThanOrEqual(FRAME.width - SAFE.side * 2);
    expect(long.fontSize).toBeLessThan(big.fontSize);
  });
  it("scales to other frame sizes and uses a plain margin on landscape or square output", () => {
    const small = watermarkBox(on({ position: "bottom-right" }), { width: 720, height: 1280 }, mono);
    const full = watermarkBox(on({ position: "bottom-right" }), FRAME, mono);
    expect(small.fontSize / full.fontSize).toBeCloseTo(720 / 1080, 1);
    const wide = watermarkBox(on({ position: "top-left" }), { width: 1920, height: 1080 }, mono);
    expect(wide.x).toBe(Math.ceil(1920 * 0.04));
    expect(wide.y).toBe(Math.ceil(1080 * 0.04));
  });
  it("never covers captions: bottom corners stay below the caption block, which ends 520 px above the bottom", () => {
    for (const position of ["bottom-left", "bottom-right"] as const) {
      const b = watermarkBox(on({ position, size: 9 }), FRAME, mono);
      const captionTop = FRAME.height - CAPTION_BOTTOM - 170;
      expect(b.y).toBeGreaterThan(captionTop + 170 - 1); // below the caption's last line
    }
  });
});

describe("keeping other elements clear of the watermark", () => {
  it("reserves nothing when there is no watermark", () => {
    expect(watermarkInsets(null, FRAME, mono)).toEqual({ top: 0, bottom: 0 });
    expect(watermarkInsets(on({ enabled: false }), FRAME, mono)).toEqual({ top: 0, bottom: 0 });
    expect(watermarkInsets(on({ text: "" }), FRAME, mono)).toEqual({ top: 0, bottom: 0 });
  });
  it("pushes the scene box and top overlays away from a top watermark, and the box up from a bottom one", () => {
    const top = watermarkInsets(on({ position: "top-left", size: 9 }), FRAME, mono);
    expect(top.top).toBeGreaterThan(SAFE.top);
    expect(contentBox(false, top).top).toBeGreaterThanOrEqual(top.top);
    expect(overlayBand("top", top.top).top).toBeGreaterThanOrEqual(top.top);
    expect(overlayBand("top").top).toBe(SAFE.top);
    const bottom = watermarkInsets(on({ position: "bottom-right", size: 9 }), FRAME, mono);
    expect(bottom.bottom).toBeGreaterThan(SAFE.bottom);
    const box = contentBox(false, bottom);
    expect(box.bottom).toBeLessThanOrEqual(FRAME.height - bottom.bottom);
    expect(contentBox(false)).toEqual(contentBox(false, { top: 0, bottom: 0 }));
  });
});

describe("preview and export use the same description", () => {
  const html = (w: Watermark | undefined) => renderToStaticMarkup(createElement(WatermarkLayer, { watermark: w }));
  it("draws nothing for a missing, disabled or empty watermark", () => {
    expect(html(undefined)).toBe("");
    expect(html(on({ enabled: false }))).toBe("");
    expect(html(on({ text: "  " }))).toBe("");
  });
  it("the composition places the text exactly where watermarkBox says (the clipper's PNG uses the same box)", () => {
    for (const position of ["top-left", "top-right", "bottom-left", "bottom-right"] as const) {
      const w = on({ position, size: 6, opacity: 0.5 });
      const box = watermarkBox(w, FRAME, estimateHeavy);
      const out = html(w);
      expect(out).toContain(`left:${box.x}px`);
      expect(out).toContain(`top:${box.y}px`);
      expect(out).toContain(`width:${box.width}px`);
      expect(out).toContain(`font-size:${box.fontSize}px`);
      expect(out).toContain("opacity:0.5");
      expect(out).toContain(`data-position="${position}"`);
      expect(out).toContain(">@ArkaSenja<");
    }
  });
});

describe("clipper export arguments", () => {
  const range = { start: 1, duration: 5 };
  it("without a watermark the arguments are the plain single-input export", () => {
    const a = ffmpegArgs("/input/a.mp4", range, "9:16", "720", "pad", null);
    expect(a).toEqual(ffmpegArgs("/input/a.mp4", range, "9:16", "720", "pad"));
    expect(a.filter(x => x === "-i")).toHaveLength(1);
    expect(a.join(" ")).not.toMatch(/overlay|watermark/);
    expect(a).toContain("-vf");
  });
  it("with a watermark the image is a second input laid over the finished frame, audio kept", () => {
    for (const fit of ["pad", "crop", "blur"] as const) {
      const a = ffmpegArgs("/input/a.mp4", range, "9:16", "720", fit, { file: "watermark.png", x: 120, y: 1500 });
      expect(a.filter(x => x === "-i")).toEqual(["-i", "-i"]);
      expect(a[a.indexOf("-i", a.indexOf("-i") + 1) + 1]).toBe("watermark.png");
      const graph = a[a.indexOf("-filter_complex") + 1];
      expect(graph.startsWith("[0:v:0]")).toBe(true);
      expect(graph).toContain("[base];[base][1:v]overlay=120:1500");
      expect(a).not.toContain("-vf");
      expect(a).toContain("[out]");
      expect(a).toContain("0:a:0?");
      // -t must come after the last input, so it limits the output (not the picture).
      expect(a.indexOf("-t")).toBeGreaterThan(a.lastIndexOf("-i"));
    }
    const { width } = outputSize("9:16", "720");
    expect(width).toBe(720);
  });
});
