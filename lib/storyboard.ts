// Storyboard: the structured, inspectable plan the Scene Engine will render (see docs/AI_DIRECTOR_PRODUCT_SPEC.md).
// Pure and deterministic: built from the scenes the studio already has, validated before render. A passing
// storyboard is not proof of a good render; it only catches what can be known without drawing frames.
import { chooseFamily, planLayouts, splitCause, type Family, type Layout } from "./composition";
import { chooseStoryVisual, type StoryVisualKind } from "./story-visual";
import { contentBox, estimateHeavy, fitText } from "./layout";
import type { MotionIntensity, NarrativeRole, VisualStrategy } from "./narrative";
import { FPS, MIN_SCENE_SECONDS, type Scene } from "./script";
import { detectVisual, stripMarks } from "./visuals";

export type CaptionPolicy = "none" | "phrase" | "suppressed-duplicate";

export type StoryboardScene = {
  id: string;
  order: number;
  /** The spoken words only: never scene labels or production notes. */
  narrationText: string;
  role: NarrativeRole;
  strategy: VisualStrategy;
  intensity: MotionIntensity;
  family: Family;
  layout: Layout;
  /** Accent object (Story Motion Lab) drawn above the text, or null. */
  accent: StoryVisualKind | null;
  /** Sticker id (lib/stickers.ts) popped in above the text, or null; it replaces the accent object. */
  sticker: string | null;
  template: string;
  /** Library icon the scene shows, if any, and whether the user supplied a picture behind it. */
  asset: { icon?: string; image?: { src: string; available: boolean } };
  captionPolicy: CaptionPolicy;
  timing: { frames: number; seconds: number; pauseFrames: number };
  transitionIn: "none" | "fade-in";
  /** Whether the layout is a deliberate reset from the previous scene or continues it. */
  continuity: "start" | "reset" | "continues";
};

export type Storyboard = { fps: number; videoEdit: boolean; totalFrames: number; scenes: StoryboardScene[] };

export type StoryboardOptions = {
  fps?: number;
  /** Editing over a source video: scenes are not drawn as text compositions. */
  videoEdit?: boolean;
  captions?: boolean;
  /** Accent objects are on unless this is false. */
  storyVisuals?: boolean;
  /** Pictures known to be missing (e.g. a revoked blob URL); a scene referencing one is flagged. */
  missingImages?: ReadonlySet<string>;
};

export function buildStoryboard(scenes: Scene[], o: StoryboardOptions = {}): Storyboard {
  const fps = o.fps ?? FPS;
  const videoEdit = !!o.videoEdit;
  const rows = scenes.map((sc, i) => {
    const visual = sc.visual ?? detectVisual(sc.text);
    const role: NarrativeRole = sc.narrative?.role ?? (i === 0 ? "hook" : i === scenes.length - 1 ? "resolution" : "continuation");
    return { sc, visual, role, family: chooseFamily(visual, sc.narrative, role) };
  });
  const layouts = planLayouts(rows.map(r => ({ family: r.family, role: r.role, intensity: r.sc.narrative?.intensity })));
  const out: StoryboardScene[] = rows.map(({ sc, visual, role, family }, i) => ({
    id: `scene-${i + 1}`,
    order: i,
    narrationText: stripMarks(sc.text),
    role,
    strategy: sc.narrative?.strategy ?? "minimal",
    intensity: sc.narrative?.intensity ?? "emphasis",
    family,
    layout: layouts[i],
    sticker: !videoEdit && sc.sticker && !sc.image ? sc.sticker : null,
    accent: videoEdit || o.storyVisuals === false || (sc.sticker && !sc.image) ? null : chooseStoryVisual({
      family, layout: layouts[i], role, template: visual.template, occupied: !!sc.image || !!(visual.iconPinned && visual.icon),
      causeEffect: visual.template !== "list" && splitCause(stripMarks(sc.text)) !== null,
    }),
    template: visual.template,
    asset: { ...(visual.icon ? { icon: visual.icon } : {}), ...(sc.image ? { image: { src: sc.image, available: !o.missingImages?.has(sc.image) } } : {}) },
    // Text scenes already show the whole narration as their headline; a caption bar would repeat it.
    captionPolicy: !o.captions ? "none" : videoEdit ? "phrase" : "suppressed-duplicate",
    timing: { frames: sc.durationInFrames, seconds: Math.round((sc.durationInFrames / fps) * 100) / 100, pauseFrames: sc.pauseFrames ?? 0 },
    transitionIn: i === 0 ? "none" : "fade-in",
    continuity: i === 0 ? "start" : layouts[i] === layouts[i - 1] && family === rows[i - 1].family ? "continues" : "reset",
  }));
  return { fps, videoEdit, totalFrames: out.reduce((a, s) => a + s.timing.frames, 0), scenes: out };
}

export type IssueCode =
  | "EMPTY_NARRATION" | "PRODUCTION_NOTE" | "DUPLICATE_NARRATION" | "TOO_SHORT" | "MISSING_ASSET"
  | "TEXT_TOO_SMALL" | "REPEATED_COMPOSITION" | "NO_VARIATION" | "DURATION_MISMATCH" | "NO_SCENES" | "EXPORT_EMPTY" | "EXPORT_SIZE" | "EXPORT_DURATION";
export type Issue = { level: "error" | "warning"; code: IssueCode; scene?: string; message: string };

// "Scene 2:", "Adegan 3 -", "[musik naik]", "(visual: ...)", "Catatan: ..." are directions, not speech.
const NOTE = /^\s*(?:(?:scene|adegan|babak|shot)\s*\d+\s*[:.\-–—)]|(?:catatan|note|visual|musik|music|sfx|vo)\s*:|\[[^\]]*\]\s*$|\([^)]*\)\s*$)/i;
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
const FULL_BOX = contentBox(false);

export type ValidateOptions = {
  /** Length of the narration audio in seconds, when audio drives timing; scenes must add up to it. */
  audioSeconds?: number;
  /** Frames of tolerance between audio and scenes. */
  toleranceFrames?: number;
};

export function validateStoryboard(sb: Storyboard, o: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], code: IssueCode, message: string, scene?: StoryboardScene) => issues.push({ level, code, message, ...(scene ? { scene: scene.id } : {}) });
  if (sb.scenes.length === 0) { add("error", "NO_SCENES", "Belum ada scene."); return issues; }
  const seen = new Map<string, StoryboardScene>();
  const minFrames = Math.ceil(MIN_SCENE_SECONDS * sb.fps);
  sb.scenes.forEach((s, i) => {
    if (!s.narrationText.trim()) add("error", "EMPTY_NARRATION", `Scene ${i + 1} tidak punya teks narasi.`, s);
    if (NOTE.test(s.narrationText)) add("warning", "PRODUCTION_NOTE", `Scene ${i + 1} tampak berisi catatan produksi, bukan narasi: "${s.narrationText.slice(0, 40)}". Catatan akan terbaca oleh suara AI dan tampil di layar.`, s);
    const key = norm(s.narrationText);
    const prev = key ? seen.get(key) : undefined;
    if (prev) add("warning", "DUPLICATE_NARRATION", `Scene ${i + 1} mengulang narasi ${prev.id.replace("scene-", "scene ")}.`, s); else if (key) seen.set(key, s);
    // Only a suggestion: exact timing from a transcript or the end of a source video legitimately makes a scene short.
    if (s.timing.frames < minFrames) add("warning", "TOO_SHORT", `Scene ${i + 1} hanya ${s.timing.seconds} dtk; scene sependek ini cepat berlalu dan sulit dibaca. Gabungkan dengan scene sebelumnya bila terasa terburu-buru.`, s);
    if (s.asset.image && !s.asset.image.available) add("error", "MISSING_ASSET", `Gambar scene ${i + 1} tidak tersedia lagi; pilih ulang atau hapus gambar.`, s);
    if (!sb.videoEdit && s.family === "editorial") {
      const fit = fitText(s.narrationText, estimateHeavy, { maxWidth: FULL_BOX.width * 0.97, maxHeight: FULL_BOX.height * 0.5, maxSize: 80, minSize: 46, lineHeight: 1.12 });
      if (!fit.fits) add("warning", "TEXT_TOO_SMALL", `Kalimat scene ${i + 1} terlalu panjang untuk dibaca nyaman; pecah menjadi dua scene.`, s);
    }
    const a = sb.scenes[i - 1], b = sb.scenes[i - 2];
    if (!sb.videoEdit && a && b && [a, b].every(x => x.family === s.family && x.layout === s.layout)) add("warning", "REPEATED_COMPOSITION", `Scene ${i - 1}-${i + 1} memakai komposisi yang sama tiga kali berturut-turut.`, s);
  });
  if (!sb.videoEdit && sb.scenes.length >= 3 && new Set(sb.scenes.map(s => `${s.family}/${s.layout}`)).size === 1) add("warning", "NO_VARIATION", "Semua scene memakai komposisi yang sama.");
  if (o.audioSeconds !== undefined) {
    const diff = Math.abs(sb.totalFrames - Math.round(o.audioSeconds * sb.fps));
    if (diff > (o.toleranceFrames ?? Math.ceil(sb.fps * 0.15))) add("error", "DURATION_MISMATCH", `Total scene ${(sb.totalFrames / sb.fps).toFixed(2)} dtk berbeda dari narasi ${o.audioSeconds.toFixed(2)} dtk; suara bisa terpotong atau tertinggal.`);
  }
  return issues;
}

/** Facts about a finished export that can be checked without looking at pixels. */
export type RenderFacts = { bytes: number; width?: number; height?: number; seconds?: number };

export function validateExport(sb: Storyboard, r: RenderFacts, dims: { width: number; height: number } = { width: 1080, height: 1920 }): Issue[] {
  const issues: Issue[] = [];
  if (!r.bytes) issues.push({ level: "error", code: "EXPORT_EMPTY", message: "Berkas hasil render kosong." });
  if (r.width !== undefined && r.height !== undefined && (r.width !== dims.width || r.height !== dims.height)) issues.push({ level: "error", code: "EXPORT_SIZE", message: `Ukuran hasil ${r.width}×${r.height}, seharusnya ${dims.width}×${dims.height}.` });
  const want = sb.totalFrames / sb.fps;
  if (r.seconds !== undefined && Math.abs(r.seconds - want) > 0.5) issues.push({ level: "error", code: "EXPORT_DURATION", message: `Durasi hasil ${r.seconds.toFixed(1)} dtk, seharusnya ${want.toFixed(1)} dtk.` });
  return issues;
}
