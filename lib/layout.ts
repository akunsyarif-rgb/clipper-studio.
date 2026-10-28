// Quiet Editorial Motion: layout tokens, safe areas and text fitting for the 1080×1920 canvas.
// Pure and deterministic; the Remotion composition supplies a real text measurer, tests a fake one.
import { HEIGHT, WIDTH } from "./script";

/**
 * Areas short-form apps cover with their own UI: tabs and logo on top (200–250 px), username, description and audio bar at the
 * bottom (350–450 px), the action rail on the right (120–150 px). The left only needs 40–60 px for curved bezels, but the side
 * inset is the larger right one on both sides, so centred layouts stay centred.
 */
export const SAFE = { top: 220, bottom: 380, side: 130 } as const;
/** Burned-in captions end this far above the bottom edge (500–600 px): above the platform's description, below the face. */
export const CAPTION_BOTTOM = 520;
/** Height reserved above the bottom safe edge for the burned-in caption line. */
export const CAPTION_RESERVE = 170;
export const CONTENT_WIDTH = WIDTH - SAFE.side * 2;
/** Main visual content (headline, subject) stays in a centred band this tall. */
export const ACTIVE_HEIGHT = 1200;
/** What survives a 1:1 crop (profile grid, feed): the centred 1080×1080 square. Key information belongs inside. */
export const SQUARE_CROP = { top: (HEIGHT - WIDTH) / 2, bottom: (HEIGHT + WIDTH) / 2 } as const;

/**
 * Vertical box available to a scene's content, with or without burned-in captions. It never exceeds the active band
 * (ACTIVE_HEIGHT) and is centred in the safe area, so headlines sit where the eye is and clear every platform overlay.
 */
export function contentBox(captions: boolean): { top: number; bottom: number; height: number; width: number } {
  const safeBottom = HEIGHT - SAFE.bottom;
  if (captions) {
    const bottom = Math.min(safeBottom - CAPTION_RESERVE, SAFE.top + ACTIVE_HEIGHT);
    return { top: SAFE.top, bottom, height: bottom - SAFE.top, width: CONTENT_WIDTH };
  }
  const height = Math.min(ACTIVE_HEIGHT, safeBottom - SAFE.top);
  const top = Math.round((SAFE.top + safeBottom - height) / 2);
  return { top, bottom: top + height, height, width: CONTENT_WIDTH };
}

/** Motion tokens: one calm vocabulary shared by every composition family. */
export const MOTION = {
  /** Frames for a line/element to settle. */
  settle: 14,
  /** Delay between consecutive lines or cards. */
  stagger: 5,
  /** Rise distance (px) for entering text. */
  rise: 22,
  springCalm: { damping: 22, stiffness: 90, mass: 0.8 },
  springFirm: { damping: 16, stiffness: 150, mass: 0.6 },
} as const;

export const TYPE = {
  display: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
  sans: "Arial, 'Helvetica Neue', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  kicker: 24,
  kickerSpacing: 6,
} as const;

/** Width in px of `text` at 100 px font size. */
export type Measure = (text: string) => number;

export type FitOptions = {
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  lineHeight: number;
  /** Letter spacing in em (negative tightens); applied per character. */
  letterSpacing?: number;
  maxLines?: number;
};

export type FitResult = { fontSize: number; lines: string[][]; fits: boolean };

const SIZE_STEP = 2;
/** Absolute floor: below this a 1080 px-wide phone frame is no longer readable. */
const FLOOR = 28;

function wrap(words: string[], widths: number[], space: number, size: number, ls: number, maxWidth: number): { lines: string[][]; widest: number } {
  const lines: string[][] = [];
  let line: string[] = [], lineW = 0, widest = 0;
  words.forEach((w, i) => {
    const ww = (widths[i] * size) / 100 + ls * size * w.length;
    const add = line.length ? (space * size) / 100 + ww : ww;
    if (line.length && lineW + add > maxWidth) {
      lines.push(line); widest = Math.max(widest, lineW);
      line = [w]; lineW = ww;
    } else { line.push(w); lineW += add; }
  });
  if (line.length) { lines.push(line); widest = Math.max(widest, lineW); }
  return { lines, widest };
}

/**
 * Largest font size at which the words wrap (at word boundaries only) inside the box:
 * every line no wider than maxWidth, total height and line count within limits.
 * Line breaks are decided here, not by the browser, so the render matches what was checked.
 */
export function fitText(text: string, measure: Measure, o: FitOptions): FitResult {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { fontSize: o.maxSize, lines: [], fits: true };
  const widths = words.map(w => measure(w));
  const space = measure(" ") || 28;
  const ls = o.letterSpacing ?? 0;
  const ok = (size: number) => {
    const { lines, widest } = wrap(words, widths, space, size, ls, o.maxWidth);
    const fits = widest <= o.maxWidth && lines.length * size * o.lineHeight <= o.maxHeight && lines.length <= (o.maxLines ?? Infinity);
    return { lines, fits };
  };
  for (let size = o.maxSize; size >= o.minSize; size -= SIZE_STEP) {
    const r = ok(size);
    if (r.fits) return { fontSize: size, lines: r.lines, fits: true };
  }
  // Below the preferred minimum: keep shrinking until it fits, so text is never cropped.
  for (let size = o.minSize - SIZE_STEP; size >= FLOOR; size -= SIZE_STEP) {
    const r = ok(size);
    if (r.fits) return { fontSize: size, lines: r.lines, fits: true };
  }
  return { fontSize: FLOOR, lines: ok(FLOOR).lines, fits: false };
}

/**
 * Conservative width estimate (px at 100 px) for heavy sans-serif when no canvas is available:
 * wide glyphs count more, narrow ones less. Tuned to over- rather than under-estimate.
 */
export const estimateHeavy: Measure = text => {
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w += 30;
    else if (/[mwMW@%]/.test(ch)) w += 100;
    else if (/[A-Z0-9]/.test(ch)) w += 76;
    else if (/[iljtfIr.,;:!'|]/.test(ch)) w += 38;
    else w += 64;
  }
  return w;
};

/** Contrast ratio (WCAG 2.x) between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
