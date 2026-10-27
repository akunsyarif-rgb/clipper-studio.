// Motion graphics that sit ON TOP of the speaker (instead of replacing the picture): where they go, which colours
// stay readable over footage, and which word to feature. Pure and deterministic.
import { contrast, SAFE } from "./layout";
import { HEIGHT, wordStartFrame, type Scene } from "./script";
import { stripMarks, wordKey } from "./text";
import type { SceneVisual } from "./visuals";

export type OverlayPosition = "top" | "lower";
/** How much a popular name is animated: "simple" is its icon and name with one soft pulse, "full" adds a small scene of its own. */
export type BrandMotion = "simple" | "full";

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

/**
 * The words to feature on an icon or keyword overlay: the first run of emphasised words as written, in capitals
 * ("GOOD MORNING", not just "GOOD"), at most three words; null when nothing is emphasised.
 */
export function overlayKeyword(text: string, visual: Pick<SceneVisual, "emphasis">): string | null {
  const emphasis = new Set(visual.emphasis);
  const words = stripMarks(text).split(/\s+/).filter(Boolean);
  const first = words.findIndex(w => emphasis.has(wordKey(w)));
  if (first < 0) return null;
  const run: string[] = [];
  for (let i = first; i < words.length && run.length < 3 && emphasis.has(wordKey(words[i])); i++) {
    run.push(words[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
    // A comma or full stop ends the phrase.
    if (/[,.;:!?]$/.test(words[i])) break;
  }
  const phrase = run.filter(Boolean).join(" ");
  return phrase ? phrase.toUpperCase() : null;
}

/** Whether a scene has something worth drawing over the speaker. */
export function hasOverlay(visual: Pick<SceneVisual, "template" | "icon" | "emphasis" | "number" | "compare"> & { brands?: unknown[] }): boolean {
  if (visual.brands?.length) return true;
  if (visual.template === "number") return !!visual.number;
  if (visual.template === "compare") return !!visual.compare;
  return visual.template !== "statement" || !!visual.icon || visual.emphasis.length > 0;
}

/** An animation appears this many frames before its word, so it has settled when the word is heard (0.13 s). */
export const OVERLAY_LEAD_FRAMES = 4;
/** An animation shorter than this (a neighbour takes over almost at once) is not worth showing. */
export const MIN_OVERLAY_FRAMES = 15;

/**
 * The words of a scene an animation is about, as positions among the scene's words: `start` is the word it should
 * appear on (the number, the name, the call to action, the emphasised word), and `second` the word of its second beat
 * (the "tapi" of "bukan X, tapi Y", when the better option arrives).
 */
export function overlayAnchors(text: string, visual: SceneVisual): { start: number; second?: number } {
  const keys = stripMarks(text).split(/\s+/).filter(Boolean).map(wordKey);
  const find = (test: (k: string) => boolean) => keys.findIndex(test);
  // Only a plain statement, question or quote is about the names themselves; a number, comparison, list or call to action
  // keeps its own word (a call to action shows the names too, each on its own beat).
  if (visual.brands?.length && ["statement", "question", "quote"].includes(visual.template)) return { start: Math.min(Math.max(0, visual.brands[0].index), Math.max(0, keys.length - 1)) };
  switch (visual.template) {
    case "number": {
      const raw = visual.number ? wordKey(visual.number.raw) : "";
      const i = raw ? find(k => k === raw || k.startsWith(raw)) : -1;
      return { start: i >= 0 ? i : Math.max(0, find(k => /\d/.test(k))) };
    }
    case "compare": {
      const bad = find(k => /^(bukan|not)$/.test(k));
      const good = find(k => /^(tapi|tetapi|melainkan|but|instead|vs|versus|daripada)$/.test(k));
      return { start: Math.max(0, bad), second: good >= 0 ? good : Math.floor(keys.length / 2) };
    }
    case "cta": {
      const word = (visual.cta ?? "").toLowerCase().split(" ")[0];
      const i = word ? find(k => k === word || (word.length >= 4 && k.includes(word))) : -1;
      return { start: Math.max(0, i) };
    }
    case "list": case "question": case "quote":
      return { start: 0 };
    default: {
      const emphasised = new Set(visual.emphasis);
      return { start: Math.max(0, find(k => emphasised.has(k))) };
    }
  }
}

/** Where one animation sits on the video's timeline. */
export type OverlayWindow = {
  /** Index of the scene whose animation this is. */
  scene: number;
  /** Absolute frame at which it appears, and how long it stays. */
  from: number;
  length: number;
  /** Frames from the start of its scene to `from`. */
  offset: number;
};

/**
 * When each "Video + animasi" scene shows its animation: from just before the word it is about is spoken, for at most
 * four seconds. It may run on into the next scene, but never past the next animation, never over a scene that
 * takes over the whole picture (a full graphic or a clip), and never past the end of the video.
 */
export function overlayWindows(scenes: Scene[], visuals: SceneVisual[], totalFrames: number): OverlayWindow[] {
  const starts: number[] = [];
  let at = 0;
  for (const s of scenes) { starts.push(at); at += s.durationInFrames; }
  const out: OverlayWindow[] = [];
  scenes.forEach((scene, i) => {
    if (scene.cut !== "overlay") return;
    const n = stripMarks(scene.text).split(/\s+/).filter(Boolean).length;
    const anchor = overlayAnchors(scene.text, visuals[i]);
    const offset = Math.max(0, Math.min(wordStartFrame(scene, anchor.start, n) - OVERLAY_LEAD_FRAMES, scene.durationInFrames - 1));
    out.push({ scene: i, from: starts[i] + offset, length: MAX_OVERLAY_FRAMES, offset });
  });
  out.forEach((w, k) => {
    let end = Math.min(totalFrames, w.from + MAX_OVERLAY_FRAMES);
    if (out[k + 1]) end = Math.min(end, out[k + 1].from);
    for (let j = w.scene + 1; j < scenes.length && starts[j] < end; j++) {
      if (scenes[j].cut === "graphic" || scenes[j].cut === "clip") { end = starts[j]; break; }
    }
    w.length = end - w.from;
  });
  return out.filter(w => w.length >= MIN_OVERLAY_FRAMES);
}

/** Frame (within its animation) at which word `index` of the scene is spoken: the beat an animation reacts to. */
export function beatFrame(scene: Pick<Scene, "wordStarts" | "durationInFrames" | "pauseFrames" | "text">, index: number, offset: number): number {
  const n = stripMarks(scene.text).split(/\s+/).filter(Boolean).length;
  return Math.max(0, wordStartFrame(scene, index, n) - offset);
}

