// Where the subtitles sit over a source video and how big they are, in units relative to the picture (percent of its width and height),
// so the preview and the full-size MP4 are drawn the same way whatever size they are shown at. Absent means "as before":
// centred, just above the lower caption band, normal size; old saved sessions and the quick start never carry it.
import { CAPTION_BOTTOM, CONTENT_WIDTH, SAFE } from "./layout";
import { HEIGHT, WIDTH } from "./script";

export type CaptionPos = {
  /** Horizontal centre of the subtitle, percent of the width (50 = centred). */
  x: number;
  /** Where the bottom of the subtitle sits, percent of the height from the top (the block grows upward, as the default does). */
  y: number;
  /** Text size, percent of the normal size (100 = normal). */
  scale: number;
};

export const X_RANGE = { min: 15, max: 85 } as const;
export const Y_RANGE = { min: 25, max: 95 } as const;
export const SCALE_RANGE = { min: 50, max: 200 } as const;
/** The default place: the same bottom edge the subtitles have always had (CAPTION_BOTTOM above the bottom of the frame). */
export const DEFAULT_CAPTION_POS: CaptionPos = { x: 50, y: Math.round(((HEIGHT - CAPTION_BOTTOM) / HEIGHT) * 1000) / 10, scale: 100 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** A value read from storage or a project file -> a safe position, or undefined when it is missing, invalid or just the default. */
export function normalizeCaptionPos(v: unknown): CaptionPos | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (![o.x, o.y, o.scale].every(n => typeof n === "number" && Number.isFinite(n))) return undefined;
  const pos = { x: round1(clamp(o.x as number, X_RANGE.min, X_RANGE.max)), y: round1(clamp(o.y as number, Y_RANGE.min, Y_RANGE.max)), scale: Math.round(clamp(o.scale as number, SCALE_RANGE.min, SCALE_RANGE.max)) };
  return isDefaultCaptionPos(pos) ? undefined : pos;
}
export const isDefaultCaptionPos = (p: CaptionPos | undefined): boolean => !p || (p.x === DEFAULT_CAPTION_POS.x && p.y === DEFAULT_CAPTION_POS.y && p.scale === DEFAULT_CAPTION_POS.scale);

export type CaptionBox = { /** Centre of the block, composition pixels. */ centerX: number; /** Bottom edge of the block, composition pixels from the top. */ bottom: number; maxWidth: number; fontScale: number };
/**
 * The geometry in composition pixels. The block never leaves the frame: its widest allowed line shrinks near the sides and its
 * centre is held far enough from them for that width.
 */
export function captionBox(pos: CaptionPos | undefined, width = WIDTH, height = HEIGHT): CaptionBox {
  const p = pos ?? DEFAULT_CAPTION_POS;
  const margin = SAFE.side;
  const wanted = (clamp(p.x, X_RANGE.min, X_RANGE.max) / 100) * width;
  const maxWidth = clamp(2 * (Math.min(wanted, width - wanted) - margin), 300, Math.min(CONTENT_WIDTH, width - 2 * margin));
  const centerX = clamp(wanted, maxWidth / 2 + margin, width - maxWidth / 2 - margin);
  return { centerX, bottom: (clamp(p.y, Y_RANGE.min, Y_RANGE.max) / 100) * height, maxWidth, fontScale: clamp(p.scale, SCALE_RANGE.min, SCALE_RANGE.max) / 100 };
}

/**
 * For a caption that sits inside a layout (under the picture of a graphic cutaway) and cannot be placed freely: the move
 * from its usual place, in composition pixels, and the size. Zero move and 1x for the default.
 */
export function captionShift(pos: CaptionPos | undefined, width = WIDTH, height = HEIGHT): { dx: number; dy: number; fontScale: number } {
  if (!pos) return { dx: 0, dy: 0, fontScale: 1 };
  const b = captionBox(pos, width, height), d = captionBox(undefined, width, height);
  return { dx: b.centerX - d.centerX, dy: b.bottom - d.bottom, fontScale: b.fontScale };
}
