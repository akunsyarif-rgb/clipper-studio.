// Motion Library: looks (style, palette, type, sound) and per-act motion presets that can be applied to a storyboard, plus the
// creator's own presets, kept on this device only (localStorage). No engine of its own: it only edits a CinePlan.
import { CONTENT_PRESETS, type PaletteId, type StyleId } from "./script";
import { conceptFor, FX_IDS, isFx, TONES, type Act, type CinePlan, type Concept, type FxId } from "./cinematic";
import { TYPE_PACK_IDS, type TypePackId } from "./fonts";
import { SFX_MODES, type SfxMode } from "./sfx";
import { PALETTES, STYLES } from "./script";

export type LibraryPreset = { id: string; name: string; builtIn?: boolean; concept: Concept; fxByAct: Partial<Record<Act, FxId>> };

const ACTS: Act[] = ["hook", "problem", "reveal", "feature", "proof", "cta"];
const KEY = "clipper:motion-library:v1";
export const MAX_PRESETS = 20;

/** Ready-made presets: the four cinematic tones, and the seven content templates applied to the current concept's look. */
export function builtInPresets(base: Concept): LibraryPreset[] {
  const tones = TONES.map(t => ({ id: `tone:${t.id}`, name: t.label, builtIn: true, concept: conceptFor(t.id), fxByAct: {} }));
  const content = CONTENT_PRESETS.map(p => ({ id: `content:${p.id}`, name: p.label, builtIn: true, concept: { ...base, style: p.style, palette: p.palette }, fxByAct: {} }));
  return [...tones, ...content];
}

export function presetFromPlan(name: string, plan: CinePlan): LibraryPreset {
  const fxByAct: Partial<Record<Act, FxId>> = {};
  for (const s of plan.scenes) if (!(s.act in fxByAct)) fxByAct[s.act] = s.fx;
  return { id: `mine:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.replace(/\s+/g, " ").trim().slice(0, 40), concept: { ...plan.concept }, fxByAct };
}

/** The plan with the preset's look and its motion per act (acts the preset does not name keep their motion). Morph never opens a film. */
export function applyPresetToPlan(plan: CinePlan, preset: LibraryPreset): CinePlan {
  const scenes = plan.scenes.map((s, i) => {
    let fx = preset.fxByAct[s.act] ?? s.fx;
    if (fx === "morph" && i === 0) fx = "hold-cut";
    return { ...s, fx };
  });
  return { ...plan, concept: { ...preset.concept }, scenes, fxByText: Object.fromEntries(scenes.map(s => [s.text, s.fx])) };
}

// ---- storage (only what passes validation is read back; anything else is ignored, never half-applied) ------------------------
const isConcept = (c: unknown): c is Concept => {
  const x = c as Concept | null;
  return !!x && STYLES.some(s => s.id === x.style) && typeof x.palette === "string" && x.palette in PALETTES && TYPE_PACK_IDS.includes(x.typography as TypePackId)
    && (x.backdrop === "plain" || x.backdrop === "mesh") && typeof x.grain === "boolean" && SFX_MODES.includes(x.sfx as SfxMode)
    && (x.mood === "tenang" || x.mood === "semangat" || x.mood === "sinematik") && typeof x.glass === "boolean";
};
export function parsePresets(raw: unknown): LibraryPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: LibraryPreset[] = [];
  for (const p of raw as Partial<LibraryPreset>[]) {
    if (!p || typeof p.id !== "string" || !p.id.startsWith("mine:") || typeof p.name !== "string" || !p.name.trim() || !isConcept(p.concept)) continue;
    const fxByAct: Partial<Record<Act, FxId>> = {};
    for (const a of ACTS) { const v = (p.fxByAct as Record<string, unknown> | undefined)?.[a]; if (isFx(v) && FX_IDS.includes(v)) fxByAct[a] = v; }
    out.push({ id: p.id, name: p.name.slice(0, 40), concept: p.concept, fxByAct });
    if (out.length >= MAX_PRESETS) break;
  }
  return out;
}
export function loadPresets(): LibraryPreset[] {
  try { return parsePresets(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { return []; }
}
/** Returns false when the browser refuses to store (private mode, quota). */
export function savePresets(list: LibraryPreset[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PRESETS))); return true; } catch { return false; }
}
export type { PaletteId, StyleId };
