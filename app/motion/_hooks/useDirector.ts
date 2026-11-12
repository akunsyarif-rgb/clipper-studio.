import { type CaptionStyleId, type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import { type Cut, type VisualOverride } from "@/lib/visuals";
import { type StickerMode } from "@/lib/stickers";
import { type SfxMode } from "@/lib/sfx";
import { type TypePackId } from "@/lib/fonts";
import { record, redo, undo, type History } from "@/lib/revision";
import { planToOverrides, type DirectorPlan } from "@/lib/director";
import type { SceneScore } from "@/lib/gemini";
import type { DirectorSnap } from "../_components/types";
import type { Dispatch, SetStateAction } from "react";
import type { TimelineResult } from "@/lib/script";

type Inputs = {
  aiScores: Record<string, SceneScore>;
  backdrop: "plain" | "mesh";
  captionStyle: CaptionStyleId;
  contentPreset: ContentPresetId | "custom";
  cutOverrides: Record<string, Cut>;
  directorHistory: History<DirectorSnap>;
  directorInfo: Record<string, { reason: string; imageIdea?: string; imageQuery?: string; }>;
  directorNote: string;
  grain: boolean;
  overrides: Record<string, VisualOverride>;
  palette: PaletteId;
  setAiScores: Dispatch<SetStateAction<Record<string, SceneScore>>>;
  setBackdrop: Dispatch<SetStateAction<"plain" | "mesh">>;
  setCaptionStyle: Dispatch<SetStateAction<CaptionStyleId>>;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setCutOverrides: Dispatch<SetStateAction<Record<string, Cut>>>;
  setDirectorHistory: Dispatch<SetStateAction<History<DirectorSnap>>>;
  setDirectorInfo: Dispatch<SetStateAction<Record<string, { reason: string; imageIdea?: string; imageQuery?: string; }>>>;
  setDirectorNote: Dispatch<SetStateAction<string>>;
  setGrain: Dispatch<SetStateAction<boolean>>;
  setOverrides: Dispatch<SetStateAction<Record<string, VisualOverride>>>;
  setPalette: Dispatch<SetStateAction<PaletteId>>;
  setSfxMode: Dispatch<SetStateAction<SfxMode>>;
  setStickerMode: Dispatch<SetStateAction<StickerMode>>;
  setStickerOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  setStyle: Dispatch<SetStateAction<StyleId>>;
  setTypography: Dispatch<SetStateAction<TypePackId>>;
  sfxMode: SfxMode;
  source: { file: File; url: string; seconds: number; } | null;
  stickerMode: StickerMode;
  stickerOverrides: Record<string, string>;
  style: StyleId;
  timeline: TimelineResult;
  typography: TypePackId;
  videoEdit: boolean;
};

export default function useDirector({ aiScores, backdrop, captionStyle, contentPreset, cutOverrides, directorHistory, directorInfo, directorNote, grain, overrides, palette, setAiScores, setBackdrop, setCaptionStyle, setContentPreset, setCutOverrides, setDirectorHistory, setDirectorInfo, setDirectorNote, setGrain, setOverrides, setPalette, setSfxMode, setStickerMode, setStickerOverrides, setStyle, setTypography, sfxMode, source, stickerMode, stickerOverrides, style, timeline, typography, videoEdit }: Inputs) {
const directorSnap = (): DirectorSnap => ({ stickerMode, stickerOverrides, sfxMode, typography, backdrop, grain, captionStyle, style, palette, contentPreset, overrides, cutOverrides, info: directorInfo, aiScores, note: directorNote });
  function restoreDirector(v: DirectorSnap) {
    setStyle(v.style); setPalette(v.palette); setContentPreset(v.contentPreset); setStickerMode(v.stickerMode); setStickerOverrides(v.stickerOverrides); setSfxMode(v.sfxMode); setTypography(v.typography); setBackdrop(v.backdrop); setGrain(v.grain); setCaptionStyle(v.captionStyle);
    setOverrides(v.overrides); setCutOverrides(v.cutOverrides);
    setDirectorInfo(v.info); setAiScores(v.aiScores); setDirectorNote(v.note);
  }
  /** Applies one revision of the AI director as ordinary choices; the state before it is kept as a version so it can be undone and redone. */
  function applyDirector(plan: DirectorPlan, label: string) {
    if (!timeline.ok) return;
    const texts = timeline.scenes.map(sc => sc.text);
    const { overrides: ov, cuts, stickers: stk } = planToOverrides(plan, texts);
    setDirectorHistory(h => record(h, label, directorSnap()));
    if (plan.style) setStyle(plan.style);
    if (plan.palette) setPalette(plan.palette);
    if (plan.typography) setTypography(plan.typography);
    if (plan.backdrop) setBackdrop(plan.backdrop);
    if (plan.grain !== undefined) setGrain(plan.grain);
    if (plan.captionStyle) setCaptionStyle(plan.captionStyle);
    if (plan.sfx) setSfxMode(plan.sfx);
    if (plan.stickers) setStickerMode(plan.stickers);
    if (Object.keys(stk).length) { setStickerOverrides(prev => ({ ...prev, ...stk })); if (!plan.stickers) setStickerMode("auto"); }
    if (plan.style || plan.palette) setContentPreset("custom");
    setOverrides(prev => ({ ...prev, ...ov }));
    if (videoEdit && source) setCutOverrides(prev => ({ ...prev, ...cuts }));
    const info: Record<string, { reason: string; imageIdea?: string; imageQuery?: string }> = { ...directorInfo };
    plan.scenes.forEach((s, i) => { if (s) info[texts[i]] = { reason: s.reason, imageIdea: s.imageIdea, imageQuery: s.imageQuery }; });
    setDirectorInfo(info);
    const scores: Record<string, SceneScore> = { ...aiScores };
    plan.scenes.forEach((scene, i) => { if (scene?.importanceScore !== undefined) scores[texts[i]] = { score: scene.importanceScore, reason: scene.importanceReason ?? "" }; });
    setAiScores(scores);
    setDirectorNote(plan.note);
  }
  function undoDirector() {
    const r = undo(directorHistory, directorSnap());
    if (!r) return;
    setDirectorHistory(r.history); restoreDirector(r.state);
  }
  function redoDirector() {
    const r = redo(directorHistory, directorSnap());
    if (!r) return;
    setDirectorHistory(r.history); restoreDirector(r.state);
  }
  /** A choice made by hand replaces the AI's reason for that scene; the picture idea stays. */
  function manualChoice(text: string) {
    setDirectorInfo(prev => prev[text]?.reason ? { ...prev, [text]: { ...prev[text], reason: "" } } : prev);
  }
  return { applyDirector, manualChoice, redoDirector, undoDirector };
}
