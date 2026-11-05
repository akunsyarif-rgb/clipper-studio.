// What the motion studio remembers on this device between visits (pure types, validation and keys).
// Stored in the browser's own storage by session-store.ts; nothing is sent anywhere.
import { isEntrance, type Entrance } from "./icon-motion";
import { isFx, isGenre, TONES, type SavedCine } from "./cinematic";
import { CAPTION_STYLES, CONTENT_PRESETS, PALETTES, STYLES, type CaptionStyleId, type ContentPresetId, type PaletteId, type StyleId } from "./script";
import { TYPE_PACK_IDS, type TypePackId } from "./fonts";
import { SFX_MODES, type SfxMode } from "./sfx";
import type { Transcript } from "./transcript";
import { isEdit, type Edit, type EditProfile } from "./edit-profile";
import type { Density } from "./importance";
import type { BrandMotion, OverlayPosition } from "./overlay";
import type { Cut, VisualOverride } from "./visuals";

export const SESSION_VERSION = 1;

export type SessionData = {
  v: typeof SESSION_VERSION;
  savedAt: number;
  script: string;
  title: string;
  style: StyleId;
  palette: PaletteId;
  contentPreset: ContentPresetId | "custom";
  target: string;
  captions: boolean;
  overrides: Record<string, VisualOverride>;
  cutOverrides: Record<string, Cut>;
  clipStarts: Record<string, number>;
  videoEdit: boolean;
  captionOffset: number;
  /** Added later: older saved sessions do not have it (the default is used). */
  overlay?: OverlayPosition;
  density?: Density;
  brandMotion?: BrandMotion;
  storyVisuals?: boolean;
  typography?: TypePackId;
  captionStyle?: CaptionStyleId;
  /** Subtitle position and size (percent of the frame); absent in older sessions = the usual place. Read through normalizeCaptionPos. */
  captionPos?: { x: number; y: number; scale: number };
  /** The part of the source video that is used (seconds into the file); absent = the whole video. */
  trim?: { start: number; end: number };
  /** Editing profile over a source video and its reviewed edits (file time); absent = standard. */
  edit?: { profile: EditProfile; edits: Edit[]; emphasis: { from: number; to: number }[]; sfx: boolean };
  stickerMode?: "off" | "auto";
  stickerOverrides?: Record<string, string>;
  sfx?: SfxMode;
  backdrop?: "plain" | "mesh";
  grain?: boolean;
  /** Cinematic Studio: motion preset per scene text, and the beat-aligned scene lengths (seconds) of the script they belong to. */
  cine?: SavedCine;
  /** Icons from Iconify used by scenes (id -> label and drawing), so they come back without the network. */
  /** How Iconify icons come in (pop, slide-up, draw); absent = pop. */
  iconMotion?: Entrance;
  icons?: Record<string, { label: string; node: [string, Record<string, string>][] }>;
  imported: Transcript | null;
  /** "manual" (a recording that is not kept) is stored as "none". */
  voiceMode: "ai" | "none";
  ttsLang: "id" | "en";
  ttsVoice: number;
  ttsSpeed: number;
};

/** The uploaded source video, kept as its own record because it is large and rarely changes. */
export type SourceRecord = { blob: Blob; name: string; type: string; lastModified: number; seconds: number };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTranscript = (v: unknown): v is Transcript =>
  isObject(v) && Array.isArray(v.segments) && typeof v.duration === "number" && v.segments.every(s => isObject(s) && typeof s.text === "string" && Array.isArray(s.words));

/** Validate persisted Cinematic data without relying on a narrowing of a nested unknown property. */
function isSavedCine(value: unknown): value is SavedCine {
  if (!isObject(value)) return false;
  const cine = value;
  if (!isObject(cine.fx) || !Object.values(cine.fx).every(isFx)
    || typeof cine.script !== "string" || cine.script.length > 20000
    || !Array.isArray(cine.seconds) || cine.seconds.length === 0 || cine.seconds.length > 100
    || !cine.seconds.every(n => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 60)
    || typeof cine.bpm !== "number" || !Number.isFinite(cine.bpm) || cine.bpm < 30 || cine.bpm > 240
    || !TONES.some(t => t.id === cine.tone)) return false;

  if (cine.brief !== undefined) {
    const brief = cine.brief;
    if (!isObject(brief)
      || typeof brief.product !== "string" || brief.product.length > 60
      || typeof brief.tagline !== "string" || brief.tagline.length > 100
      || typeof brief.problem !== "string" || brief.problem.length > 120
      || !Array.isArray(brief.features) || brief.features.length > 4
      || !brief.features.every(f => typeof f === "string" && f.length <= 100)
      || typeof brief.proof !== "string" || brief.proof.length > 120
      || typeof brief.cta !== "string" || brief.cta.length > 80
      || !TONES.some(t => t.id === brief.tone) || brief.tone !== cine.tone
      || typeof brief.seconds !== "number" || !Number.isFinite(brief.seconds) || brief.seconds < 12 || brief.seconds > 60
      || (brief.language !== undefined && brief.language !== "id" && brief.language !== "en")
      || (brief.genre !== undefined && !isGenre(brief.genre))) return false;
  }

  if (cine.acts !== undefined
    && (!Array.isArray(cine.acts) || cine.acts.length !== cine.seconds.length
      || !cine.acts.every(a => ["hook", "problem", "reveal", "feature", "proof", "cta"].includes(String(a))))) return false;
  return true;
}

/** Accepts only data this version wrote: anything else (older format, corruption, edits) is ignored, never half-applied. */
export function isSession(v: unknown): v is SessionData {
  if (!isObject(v) || v.v !== SESSION_VERSION) return false;
  return typeof v.script === "string" && typeof v.title === "string"
    && STYLES.some(s => s.id === v.style) && typeof v.palette === "string" && v.palette in PALETTES
    && (v.contentPreset === "custom" || CONTENT_PRESETS.some(p => p.id === v.contentPreset))
    && typeof v.target === "string" && typeof v.captions === "boolean"
    && isObject(v.overrides) && isObject(v.cutOverrides) && isObject(v.clipStarts)
    && Object.values(v.cutOverrides).every(c => c === "video" || c === "overlay" || c === "graphic" || c === "clip")
    && Object.values(v.clipStarts).every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)
    && typeof v.videoEdit === "boolean" && typeof v.captionOffset === "number" && Number.isFinite(v.captionOffset)
    && (v.overlay === undefined || v.overlay === "top" || v.overlay === "lower")
    && (v.density === undefined || v.density === "sparse" || v.density === "balanced" || v.density === "rich")
    && (v.brandMotion === undefined || v.brandMotion === "simple" || v.brandMotion === "full")
    && (v.storyVisuals === undefined || typeof v.storyVisuals === "boolean")
    && (v.typography === undefined || TYPE_PACK_IDS.includes(v.typography as TypePackId))
    && (v.backdrop === undefined || v.backdrop === "plain" || v.backdrop === "mesh")
    && (v.grain === undefined || typeof v.grain === "boolean")
    && (v.icons === undefined || (isObject(v.icons) && Object.entries(v.icons).every(([k, i]) => k.startsWith("iconify:") && isObject(i) && typeof i.label === "string" && Array.isArray(i.node) && i.node.length > 0 && i.node.length < 40
      && i.node.every(n => Array.isArray(n) && typeof n[0] === "string" && ["path", "circle", "ellipse", "line", "polyline", "polygon", "rect"].includes(n[0]) && isObject(n[1]) && Object.values(n[1]).every(x => typeof x === "string" && /^[\d\s.,eE+\-a-zA-Z]*$/.test(x)))
      )))
    && (v.iconMotion === undefined || isEntrance(v.iconMotion))
    && (v.cine === undefined || isSavedCine(v.cine))
    && (v.stickerMode === undefined || v.stickerMode === "off" || v.stickerMode === "auto")
    && (v.stickerOverrides === undefined || (isObject(v.stickerOverrides) && Object.values(v.stickerOverrides).every(x => typeof x === "string")))
    && (v.sfx === undefined || SFX_MODES.includes(v.sfx as SfxMode))
    && (v.captionStyle === undefined || CAPTION_STYLES.some(c => c.id === v.captionStyle))
    && (v.edit === undefined || (isObject(v.edit) && (v.edit.profile === "standard" || v.edit.profile === "music" || v.edit.profile === "comedy") && Array.isArray(v.edit.edits) && v.edit.edits.every(isEdit)
      && Array.isArray(v.edit.emphasis) && v.edit.emphasis.every(r => isObject(r) && typeof r.from === "number" && typeof r.to === "number") && typeof v.edit.sfx === "boolean"))
    && (v.trim === undefined || (isObject(v.trim) && typeof v.trim.start === "number" && typeof v.trim.end === "number" && Number.isFinite(v.trim.start) && Number.isFinite(v.trim.end) && v.trim.start >= 0 && v.trim.end > v.trim.start))
    && (v.imported === null || isTranscript(v.imported))
    && (v.voiceMode === "ai" || v.voiceMode === "none") && (v.ttsLang === "id" || v.ttsLang === "en")
    && typeof v.ttsVoice === "number" && typeof v.ttsSpeed === "number";
}

/** A session that is just the untouched sample is not worth offering back. */
export function isPristine(s: Pick<SessionData, "script" | "imported" | "videoEdit">, sample: string, hasSource: boolean): boolean {
  return s.script === sample && !s.imported && !s.videoEdit && !hasSource;
}

export function sourceMatches(a: { name: string; size: number; lastModified: number }, b: { name: string; size: number; lastModified: number }): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * Version of the transcription method. Raising it makes transcripts made by an older method (before speech-only
 * processing and loop folding) stop being reused, so a better method is not hidden behind a worse saved result.
 */
export const ASR_PIPELINE_VERSION = 2;

/** Key for a finished transcript: the same file part, model, language and method always give the same text. */
export function asrCacheKey(file: { name: string; size: number; lastModified: number }, range: { start: number; duration: number }, model: string, language: string): string {
  return `asr${ASR_PIPELINE_VERSION}:${file.name}|${file.size}|${file.lastModified}|${range.start.toFixed(2)}|${range.duration.toFixed(2)}|${model}|${language}`;
}

/** How many finished transcripts are kept (oldest dropped first). */
export const ASR_CACHE_LIMIT = 8;

/** Adds `key` as the newest entry and returns the keys that must now be deleted. */
export function touchCache(index: string[], key: string, limit = ASR_CACHE_LIMIT): { index: string[]; drop: string[] } {
  const next = [...index.filter(k => k !== key), key];
  const drop = next.slice(0, Math.max(0, next.length - limit));
  return { index: next.slice(drop.length), drop };
}
