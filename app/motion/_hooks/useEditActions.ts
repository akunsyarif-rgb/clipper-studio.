import { useState } from "react";
import { type Mood } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import { type CaptionStyleId, type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import { type Cut, type VisualOverride } from "@/lib/visuals";
import { type Density } from "@/lib/importance";
import type { BrandMotion, OverlayPosition } from "@/lib/overlay";
import type { EditPlan } from "@/lib/edit-command";
import { registerIcon } from "@/lib/visuals";
import type { LoadedIcon } from "@/lib/iconify";
import { type CinePlan } from "@/lib/cinematic";
import { type Edit, type EditProfile } from "@/lib/edit-profile";
import { type StickerMode } from "@/lib/stickers";
import { type SfxMode } from "@/lib/sfx";
import { type TypePackId } from "@/lib/fonts";
import type { Visual } from "@/lib/command-agent";
import type { MusicMode, SceneImageFile, VoiceMode } from "../_components/types";
import type { Dispatch, SetStateAction } from "react";
import type { TimelineResult } from "@/lib/script";

type Inputs = {
  brandMotion: BrandMotion;
  captions: boolean;
  captionStyle: CaptionStyleId;
  cutOverrides: Record<string, Cut>;
  density: Density;
  editProfile: EditProfile;
  images: Record<string, SceneImageFile>;
  overlayPos: OverlayPosition;
  removeSceneImage: (text: string) => void;
  setBackdrop: Dispatch<SetStateAction<"plain" | "mesh">>;
  setBrandMotion: Dispatch<SetStateAction<BrandMotion>>;
  setCaptions: Dispatch<SetStateAction<boolean>>;
  setCaptionStyle: Dispatch<SetStateAction<CaptionStyleId>>;
  setCine: Dispatch<SetStateAction<{ plan: CinePlan; fx: Record<string, string>; } | null>>;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setCustomIcons: Dispatch<SetStateAction<Record<string, { label: string; node: [string, Record<string, string>][]; }>>>;
  setCutOverrides: Dispatch<SetStateAction<Record<string, Cut>>>;
  setDensity: Dispatch<SetStateAction<Density>>;
  setEditProfile: Dispatch<SetStateAction<EditProfile>>;
  setEdits: Dispatch<SetStateAction<Edit[]>>;
  setEmphasis: Dispatch<SetStateAction<{ from: number; to: number; }[]>>;
  setGrain: Dispatch<SetStateAction<boolean>>;
  setMood: Dispatch<SetStateAction<Mood>>;
  setMoodTouched: Dispatch<SetStateAction<boolean>>;
  setMusicMode: Dispatch<SetStateAction<MusicMode>>;
  setNarration: Dispatch<SetStateAction<Narration | null>>;
  setOverlayPos: Dispatch<SetStateAction<OverlayPosition>>;
  setOverrides: Dispatch<SetStateAction<Record<string, VisualOverride>>>;
  setPalette: Dispatch<SetStateAction<PaletteId>>;
  setScript: Dispatch<SetStateAction<string>>;
  setSfxMode: Dispatch<SetStateAction<SfxMode>>;
  setStickerMode: Dispatch<SetStateAction<StickerMode>>;
  setStyle: Dispatch<SetStateAction<StyleId>>;
  setTitle: Dispatch<SetStateAction<string>>;
  setTypography: Dispatch<SetStateAction<TypePackId>>;
  setVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  timeline: TimelineResult;
};

export default function useEditActions({ brandMotion, captions, captionStyle, cutOverrides, density, editProfile, images, overlayPos, removeSceneImage, setBackdrop, setBrandMotion, setCaptions, setCaptionStyle, setCine, setContentPreset, setCustomIcons, setCutOverrides, setDensity, setEditProfile, setEdits, setEmphasis, setGrain, setMood, setMoodTouched, setMusicMode, setNarration, setOverlayPos, setOverrides, setPalette, setScript, setSfxMode, setStickerMode, setStyle, setTitle, setTypography, setVoiceMode, timeline }: Inputs) {
function applyIcon(text: string, icon: LoadedIcon) {
    registerIcon(icon.id, icon.label, icon.node);
    setCustomIcons(prev => ({ ...prev, [icon.id]: { label: icon.label, node: icon.node as [string, Record<string, string>][] } }));
    setOverrides(prev => ({ ...prev, [text]: { ...prev[text], icon: icon.id } }));
  }
  /** Words from a command (one per scene, in turn) that say what each scene's picture should show; with them the photos are filled in once. */
  const [queryHints, setQueryHints] = useState<Record<string, Visual>>({});
  const [autoPhotos, setAutoPhotos] = useState(0);
  /** The edit assistant's last change: what to put back, and which pictures it added. */
  const [editUndo, setEditUndo] = useState<{ editProfile: EditProfile; captions: boolean; captionStyle: CaptionStyleId; overlayPos: OverlayPosition; density: Density; brandMotion: BrandMotion; queryHints: Record<string, Visual>; imageKeys: string[]; cutOverrides: Record<string, string> } | null>(null);
  const [asrStart, setAsrStart] = useState(0);
  function applyEditPlan(plan: EditPlan) {
    setEditUndo({ editProfile, captions, captionStyle, overlayPos, density, brandMotion, queryHints, imageKeys: Object.keys(images), cutOverrides });
    if (plan.profile) { setEditProfile(plan.profile); setEdits([]); setEmphasis([]); }
    if (plan.captions !== undefined) setCaptions(plan.captions);
    if (plan.captionStyle) setCaptionStyle(plan.captionStyle);
    if (plan.overlayPos) setOverlayPos(plan.overlayPos);
    if (plan.density) setDensity(plan.density);
    if (plan.brandMotion) setBrandMotion(plan.brandMotion);
    if (plan.inserts) {
      const v = plan.inserts.visuals;
      setQueryHints(Object.fromEntries(timeline.ok ? timeline.scenes.map((sc, i) => [sc.text, v[i % v.length]]) : []));
      setAutoPhotos(n => n + 1);
    }
  }
  function undoEditPlan() {
    const u = editUndo; if (!u) return;
    setEditProfile(u.editProfile); setEdits([]); setEmphasis([]); setCaptions(u.captions); setCaptionStyle(u.captionStyle); setOverlayPos(u.overlayPos); setDensity(u.density); setBrandMotion(u.brandMotion); setQueryHints(u.queryHints);
    for (const k of Object.keys(images)) if (!u.imageKeys.includes(k)) removeSceneImage(k);
    setCutOverrides(u.cutOverrides as typeof cutOverrides);
    setEditUndo(null);
  }
  function applyCinematic(plan: CinePlan, visuals?: Visual[]) {
    const c = plan.concept;
    if (visuals?.length) {
      setQueryHints(Object.fromEntries(plan.scenes.map((sc, i) => [sc.text, visuals[i % visuals.length]])));
      setAutoPhotos(n => n + 1);
    }
    setScript(plan.script); setTitle(plan.brief.product.slice(0, 60)); setContentPreset("custom");
    setStyle(c.style); setPalette(c.palette); setTypography(c.typography); setBackdrop(c.backdrop); setGrain(c.grain); setSfxMode(c.sfx);
    setMoodTouched(true); setMood(c.mood); setMusicMode("auto"); setCaptions(false); setVoiceMode("none"); setNarration(null);
    setOverrides({}); setCutOverrides({}); setStickerMode("off");
    setCine({ plan, fx: plan.fxByText });
  }
  return { applyCinematic, applyEditPlan, applyIcon, asrStart, autoPhotos, editUndo, queryHints, setAsrStart, undoEditPlan };
}
