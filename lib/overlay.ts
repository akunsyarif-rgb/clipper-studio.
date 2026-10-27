// Motion graphics that sit ON TOP of the speaker (instead of replacing the picture): where they go, which colours
// stay readable over footage, and which word to feature. Pure and deterministic.
import { contrast, SAFE } from "./layout";
import { HEIGHT } from "./script";
import { stripMarks, wordKey, type SceneVisual } from "./visuals";

export type OverlayPosition = "top" | "lower";

/** An overlay is shown for at most this many frames (same pace limit as graphic cutaways and clips). */
export const MAX_OVERLAY_FRAMES = 120;
export const OVERLAY_HEIGHT = 480;
/** Space kept between an overlay and the caption below it. */
const CAPTION_GAP = 40;
/** Height of the burned-in caption block (two lines) above the bottom safe edge. */
const CAPTION_BLOCK = 170;

/**
 * Vertical band of an overlay. "top" uses the empty space above the speaker's head; "lower" sits just above the
 * captions. Both stay inside the safe areas and never touch the caption band.
 */
export function overlayBand(position: OverlayPosition): { top: number; height: number } {
  if (position === "top") return { top: SAFE.top, height: OVERLAY_HEIGHT };
  const bottom = HEIGHT - SAFE.bottom - 24 - CAPTION_BLOCK - CAPTION_GAP;
  return { top: bottom - OVERLAY_HEIGHT, height: OVERLAY_HEIGHT };
}

/** A dark veil behind overlays keeps them readable on any footage; this is its darkest tone. */
export const SCRIM = "#101010";

/**
 * Text is always white over the veil; the accent keeps the palette's own colour when it is readable on the veil,
 * and otherwise becomes the palette's light background tone (light palettes have dark accents).
 */
export function overlayColors(colors: { accent: string; bg1: string; bg2: string }): { text: string; accent: string; bg1: string; bg2: string } {
  const accent = contrast(colors.accent, SCRIM) >= 4.5 ? colors.accent : colors.bg1;
  return { text: "#ffffff", accent, bg1: SCRIM, bg2: SCRIM };
}

/** The word to feature on an icon or keyword overlay: the first emphasised word, as written (upper-case), or null. */
export function overlayKeyword(text: string, visual: Pick<SceneVisual, "emphasis">): string | null {
  const emphasis = new Set(visual.emphasis);
  const word = stripMarks(text).split(/\s+/).find(w => emphasis.has(wordKey(w)));
  const clean = word?.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return clean ? clean.toUpperCase() : null;
}

/** Whether a scene has something worth drawing over the speaker. */
export function hasOverlay(visual: Pick<SceneVisual, "template" | "icon" | "emphasis" | "number" | "compare">): boolean {
  if (visual.template === "number") return !!visual.number;
  if (visual.template === "compare") return !!visual.compare;
  return visual.template !== "statement" || !!visual.icon || visual.emphasis.length > 0;
}
