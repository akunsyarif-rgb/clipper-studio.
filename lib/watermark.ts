// Custom text watermark. One pure description (settings, safe-area geometry) drives every place it appears: the Remotion
// composition (preview and the browser-rendered MP4) and the clipper's FFmpeg export (a PNG of this same text and
// geometry laid over the video), so what the creator previews is what the file contains.
import { SAFE } from "./layout";

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type Watermark = {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  /** Text height as a share of the frame width, in percent. */
  size: number;
  /** 0.1 .. 1 */
  opacity: number;
};

export const WATERMARK_POSITIONS: { id: WatermarkPosition; label: string }[] = [
  { id: "top-left", label: "Kiri atas" }, { id: "top-right", label: "Kanan atas" },
  { id: "bottom-left", label: "Kiri bawah" }, { id: "bottom-right", label: "Kanan bawah" },
];
export const WATERMARK_MAX_CHARS = 32;
export const WATERMARK_SIZE = { min: 3, max: 9, step: 0.5 } as const;
export const WATERMARK_OPACITY = { min: 0.1, max: 1, step: 0.05 } as const;
export const DEFAULT_WATERMARK: Watermark = { enabled: false, text: "", position: "bottom-right", size: 5, opacity: 0.6 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Control characters, zero-width marks and line/paragraph separators (written as escapes so the source stays plain ASCII).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028\\u2029]", "g");

/** Text as it will be drawn: control characters and line breaks removed, spaces collapsed, limited in length. */
export function cleanWatermarkText(raw: string): string {
  return raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, WATERMARK_MAX_CHARS).trim();
}

/** Any value (stored settings, a project file) turned into valid settings; unknown fields are dropped, bad values replaced. */
export function normalizeWatermark(v: unknown): Watermark {
  const o = typeof v === "object" && v !== null ? v as Record<string, unknown> : {};
  const position = WATERMARK_POSITIONS.some(p => p.id === o.position) ? o.position as WatermarkPosition : DEFAULT_WATERMARK.position;
  const num = (x: unknown, d: number) => typeof x === "number" && Number.isFinite(x) ? x : d;
  return {
    enabled: o.enabled === true,
    text: typeof o.text === "string" ? cleanWatermarkText(o.text) : "",
    position,
    size: clamp(num(o.size, DEFAULT_WATERMARK.size), WATERMARK_SIZE.min, WATERMARK_SIZE.max),
    opacity: clamp(num(o.opacity, DEFAULT_WATERMARK.opacity), WATERMARK_OPACITY.min, WATERMARK_OPACITY.max),
  };
}

/** A watermark appears only when it is switched on and has text; otherwise nothing is drawn anywhere. */
export function isWatermarkActive(w: Watermark | null | undefined): w is Watermark {
  return !!w && w.enabled && cleanWatermarkText(w.text).length > 0 && w.opacity > 0;
}

/** Width in px of `text` at 100 px font size (same contract as lib/layout Measure). */
export type TextMeasure = (text: string) => number;

export type WatermarkBox = { x: number; y: number; width: number; height: number; fontSize: number; align: "left" | "right" };

/**
 * Where the watermark sits in a frame of `width`×`height`. Portrait video (9:16) keeps the platform safe area: below the
 * top tabs, above the description area and clear of the right-hand button rail (same insets as every other element);
 * other shapes use a 4 % margin. The text shrinks to fit the width between the margins.
 */
export function watermarkBox(w: Watermark, frame: { width: number; height: number }, measure: TextMeasure): WatermarkBox {
  const text = cleanWatermarkText(w.text);
  const portrait = frame.height / frame.width > 1.5;
  const scale = frame.width / 1080;
  const side = portrait ? SAFE.side * scale : frame.width * 0.04;
  const top = portrait ? SAFE.top * scale : frame.height * 0.04;
  const bottom = portrait ? SAFE.bottom * scale : frame.height * 0.04;
  const maxWidth = frame.width - side * 2;
  const wanted = (frame.width * w.size) / 100;
  const per100 = Math.max(1, measure(text));
  const fontSize = Math.max(8, Math.min(wanted, (maxWidth / per100) * 100));
  // Whole pixels, rounded outwards, then placed so the (rounded) box itself stays inside the margins.
  const width = Math.ceil(Math.min(maxWidth, (per100 / 100) * fontSize));
  const height = Math.ceil(fontSize * 1.25);
  const right = w.position.endsWith("right");
  const x = right ? Math.floor(frame.width - side - width) : Math.ceil(side);
  const y = w.position.startsWith("top") ? Math.ceil(top) : Math.floor(frame.height - bottom - height);
  return { x, y, width, height, fontSize: Math.round(fontSize * 10) / 10, align: right ? "right" : "left" };
}

/**
 * Space a watermark takes at the top or bottom of the frame (box plus a gap), so other elements (text scenes, overlays)
 * can stay clear of it instead of the other way round.
 */
export function watermarkInsets(w: Watermark | null | undefined, frame: { width: number; height: number }, measure: TextMeasure, gap = 24): { top: number; bottom: number } {
  if (!isWatermarkActive(w)) return { top: 0, bottom: 0 };
  const b = watermarkBox(w, frame, measure);
  return w.position.startsWith("top") ? { top: b.y + b.height + gap, bottom: 0 } : { top: 0, bottom: frame.height - b.y + gap };
}

export const WATERMARK_FONT = "Arial, 'Helvetica Neue', sans-serif";
export const WATERMARK_WEIGHT = 800;
/** Soft shadow so white text reads on bright and dark footage alike; the same values are drawn into the clipper's PNG. */
export const WATERMARK_SHADOW = { blur: 6, offsetY: 2, color: "rgba(0,0,0,0.65)" } as const;

const KEY = "clipper:watermark:v1";
/** Settings for the editing session (this tab): the same ones are reused for every re-render and by both screens. */
export function loadWatermark(storage: Pick<Storage, "getItem"> | null = typeof sessionStorage !== "undefined" ? sessionStorage : null): Watermark {
  try { const raw = storage?.getItem(KEY); return raw ? normalizeWatermark(JSON.parse(raw)) : { ...DEFAULT_WATERMARK }; } catch { return { ...DEFAULT_WATERMARK }; }
}
export function saveWatermark(w: Watermark, storage: Pick<Storage, "setItem"> | null = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
  try { storage?.setItem(KEY, JSON.stringify(normalizeWatermark(w))); } catch { /* storage blocked: kept for this page only */ }
}

export const WATERMARK_PNG_NAME = "watermark.png";
/** Transparent margin around the text inside the PNG, so the soft shadow is not cut off. */
export const WATERMARK_PNG_PAD = 12;
