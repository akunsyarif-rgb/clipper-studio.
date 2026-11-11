import { useEffect, useMemo } from "react";
import { type Mood } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import { type CaptionStyleId, FPS, splitScript, type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import { type TtsLang } from "@/lib/tts/supertonic";
import { allWords, shiftWords, sceneTimings, mergeShortScenes, type Transcript } from "@/lib/transcript";
import { type Cut, type VisualOverride } from "@/lib/visuals";
import { type Density } from "@/lib/importance";
import type { BrandMotion, OverlayPosition } from "@/lib/overlay";
import { isPristine, SESSION_VERSION, type SessionData } from "@/lib/session";
import { clearSession, deleteSource, loadSession, loadSource, saveSession, saveSource } from "@/lib/session-store";
import { normalizeCaptionPos, type CaptionPos } from "@/lib/caption-box";
import { registerIcon } from "@/lib/visuals";
import type { Entrance } from "@/lib/icon-motion";
import { conceptFor, restoreCine, saveCine, type CinePlan } from "@/lib/cinematic";
import { isEdit, type Edit, type EditProfile } from "@/lib/edit-profile";
import { type Trim } from "@/lib/trim";
import { type StickerMode } from "@/lib/stickers";
import { type SfxMode } from "@/lib/sfx";
import { DEFAULT_TYPE_PACK, type TypePackId } from "@/lib/fonts";
import { cloud } from "@/lib/cloud";
import { SAMPLE } from "../_components/constants";
import type { MusicMode, VoiceMode } from "../_components/types";
import type { Dispatch, SetStateAction } from "react";

type Inputs = {
  asrBusy: boolean;
  autosave: boolean;
  backdrop: "plain" | "mesh";
  brandMotion: BrandMotion;
  captionOffset: number;
  captionPos: CaptionPos | undefined;
  captions: boolean;
  captionStyle: CaptionStyleId;
  chooseEntrance: (e: Entrance) => void;
  cine: { plan: CinePlan; fx: Record<string, string>; } | null;
  clipStarts: Record<string, number>;
  cloudUser: string | null;
  comedySfx: boolean;
  contentPreset: ContentPresetId | "custom";
  customIcons: Record<string, { label: string; node: [string, Record<string, string>][]; }>;
  cutOverrides: Record<string, Cut>;
  density: Density;
  editProfile: EditProfile;
  edits: Edit[];
  emphasis: { from: number; to: number; }[];
  grain: boolean;
  iconEntrance: Entrance;
  imported: Transcript | null;
  overlayPos: OverlayPosition;
  overrides: Record<string, VisualOverride>;
  palette: PaletteId;
  rendering: boolean;
  saved: SessionData | null;
  savedSource: { name: string; seconds: number; } | null;
  script: string;
  setAutosave: Dispatch<SetStateAction<boolean>>;
  setBackdrop: Dispatch<SetStateAction<"plain" | "mesh">>;
  setBrandMotion: Dispatch<SetStateAction<BrandMotion>>;
  setCaptionOffset: Dispatch<SetStateAction<number>>;
  setCaptionPos: Dispatch<SetStateAction<CaptionPos | undefined>>;
  setCaptions: Dispatch<SetStateAction<boolean>>;
  setCaptionStyle: Dispatch<SetStateAction<CaptionStyleId>>;
  setCine: Dispatch<SetStateAction<{ plan: CinePlan; fx: Record<string, string>; } | null>>;
  setClipStarts: Dispatch<SetStateAction<Record<string, number>>>;
  setComedySfx: Dispatch<SetStateAction<boolean>>;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setCustomIcons: Dispatch<SetStateAction<Record<string, { label: string; node: [string, Record<string, string>][]; }>>>;
  setCutOverrides: Dispatch<SetStateAction<Record<string, Cut>>>;
  setDensity: Dispatch<SetStateAction<Density>>;
  setEditProfile: Dispatch<SetStateAction<EditProfile>>;
  setEdits: Dispatch<SetStateAction<Edit[]>>;
  setEmphasis: Dispatch<SetStateAction<{ from: number; to: number; }[]>>;
  setGrain: Dispatch<SetStateAction<boolean>>;
  setImported: Dispatch<SetStateAction<Transcript | null>>;
  setMood: Dispatch<SetStateAction<Mood>>;
  setMoodTouched: Dispatch<SetStateAction<boolean>>;
  setMusicMode: Dispatch<SetStateAction<MusicMode>>;
  setNarration: Dispatch<SetStateAction<Narration | null>>;
  setOverlayPos: Dispatch<SetStateAction<OverlayPosition>>;
  setOverrides: Dispatch<SetStateAction<Record<string, VisualOverride>>>;
  setPalette: Dispatch<SetStateAction<PaletteId>>;
  setSaved: Dispatch<SetStateAction<SessionData | null>>;
  setSavedCloud: Dispatch<SetStateAction<boolean>>;
  setSavedSource: Dispatch<SetStateAction<{ name: string; seconds: number; } | null>>;
  setScript: Dispatch<SetStateAction<string>>;
  setSfxMode: Dispatch<SetStateAction<SfxMode>>;
  setSource: Dispatch<SetStateAction<{ file: File; url: string; seconds: number; } | null>>;
  setStickerMode: Dispatch<SetStateAction<StickerMode>>;
  setStickerOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  setStoryVisuals: Dispatch<SetStateAction<boolean>>;
  setStyle: Dispatch<SetStateAction<StyleId>>;
  setTarget: Dispatch<SetStateAction<string>>;
  setTitle: Dispatch<SetStateAction<string>>;
  setTrim: Dispatch<SetStateAction<Trim | null>>;
  setTtsLang: Dispatch<SetStateAction<TtsLang>>;
  setTtsSpeed: Dispatch<SetStateAction<number>>;
  setTtsVoice: Dispatch<SetStateAction<number>>;
  setTypography: Dispatch<SetStateAction<TypePackId>>;
  setVideoEdit: Dispatch<SetStateAction<boolean>>;
  setVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  sfxMode: SfxMode;
  source: { file: File; url: string; seconds: number; } | null;
  stickerMode: StickerMode;
  stickerOverrides: Record<string, string>;
  storyVisuals: boolean;
  style: StyleId;
  target: string;
  title: string;
  trim: Trim | null;
  ttsLang: TtsLang;
  ttsSpeed: number;
  ttsVoice: number;
  typography: TypePackId;
  usedIcons: { icons: { [k: string]: { label: string; node: [string, Record<string, string>][]; }; }; } | { icons?: undefined; };
  videoEdit: boolean;
  voiceMode: VoiceMode;
};

export default function useSessionPersistence({ asrBusy, autosave, backdrop, brandMotion, captionOffset, captionPos, captions, captionStyle, chooseEntrance, cine, clipStarts, cloudUser, comedySfx, contentPreset, customIcons, cutOverrides, density, editProfile, edits, emphasis, grain, iconEntrance, imported, overlayPos, overrides, palette, rendering, saved, savedSource, script, setAutosave, setBackdrop, setBrandMotion, setCaptionOffset, setCaptionPos, setCaptions, setCaptionStyle, setCine, setClipStarts, setComedySfx, setContentPreset, setCustomIcons, setCutOverrides, setDensity, setEditProfile, setEdits, setEmphasis, setGrain, setImported, setMood, setMoodTouched, setMusicMode, setNarration, setOverlayPos, setOverrides, setPalette, setSaved, setSavedCloud, setSavedSource, setScript, setSfxMode, setSource, setStickerMode, setStickerOverrides, setStoryVisuals, setStyle, setTarget, setTitle, setTrim, setTtsLang, setTtsSpeed, setTtsVoice, setTypography, setVideoEdit, setVoiceMode, sfxMode, source, stickerMode, stickerOverrides, storyVisuals, style, target, title, trim, ttsLang, ttsSpeed, ttsVoice, typography, usedIcons, videoEdit, voiceMode }: Inputs) {
const snapshot = useMemo<SessionData>(() => ({
    v: SESSION_VERSION, savedAt: 0, script, title, style, palette, contentPreset, target, captions, overrides, cutOverrides, clipStarts, videoEdit, captionOffset, overlay: overlayPos, density, brandMotion, ...(storyVisuals ? {} : { storyVisuals: false }), ...(typography !== DEFAULT_TYPE_PACK ? { typography } : {}), ...(captionStyle !== "classic" ? { captionStyle } : {}), ...(captionPos ? { captionPos } : {}), ...(trim ? { trim } : {}), ...(editProfile !== "standard" ? { edit: { profile: editProfile, edits, emphasis, sfx: comedySfx } } : {}), ...(backdrop === "mesh" ? { backdrop } : {}), ...(grain ? { grain } : {}), ...(cine ? { cine: saveCine(cine) } : {}), ...usedIcons, ...(iconEntrance !== "pop" ? { iconMotion: iconEntrance } : {}), ...(stickerMode !== "off" ? { stickerMode } : {}), ...(Object.keys(stickerOverrides).length ? { stickerOverrides } : {}), ...(sfxMode !== "off" ? { sfx: sfxMode } : {}), imported,
    voiceMode: voiceMode === "ai" ? "ai" : "none", ttsLang, ttsVoice, ttsSpeed,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [script, title, style, palette, contentPreset, target, captions, overrides, cutOverrides, clipStarts, videoEdit, captionOffset, overlayPos, density, brandMotion, storyVisuals, typography, captionStyle, backdrop, grain, stickerMode, stickerOverrides, sfxMode, cine, customIcons, iconEntrance, imported, voiceMode, ttsLang, ttsVoice, ttsSpeed, trim, editProfile, edits, emphasis, comedySfx, captionPos]);
  useEffect(() => {
    if (!autosave || isPristine(snapshot, SAMPLE, !!source)) return;
    const t = setTimeout(() => { const s = { ...snapshot, savedAt: Date.now() }; void saveSession(s); void cloud.pushSession(s); }, 1000);
    return () => clearTimeout(t);
  }, [autosave, snapshot, source]);
  // Signed in: a session saved from another device that is newer than this one is offered like a local one.
  useEffect(() => {
    if (!cloudUser) return;
    let alive = true;
    void (async () => {
      const [remote, local] = await Promise.all([cloud.pullSession(), loadSession()]);
      if (!alive || !remote || isPristine(remote, SAMPLE, false)) return;
      if (remote.savedAt <= (local?.savedAt ?? 0)) return;
      // The offer sits above the script box: showing it while a field is focused would push the page down mid-typing. Wait until typing stops.
      const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
      while (alive && typing()) await new Promise(r => setTimeout(r, 500));
      if (!alive) return;
      setSaved(remote); setSavedCloud(true); setSavedSource(null);
    })();
    return () => { alive = false; };
  }, [cloudUser, setSaved, setSavedCloud, setSavedSource]);
  useEffect(() => {
    // Writing a large video to storage competes for memory with transcription and rendering; wait until they are done.
    if (!autosave || asrBusy || rendering) return;
    if (!source) { void deleteSource(); return; }
    void saveSource({ blob: source.file, name: source.file.name, type: source.file.type, lastModified: source.file.lastModified, seconds: source.seconds });
  }, [autosave, source, asrBusy, rendering]);
  async function restoreSession() {
    const s = saved;
    if (!s) return;
    setScript(s.script); setTitle(s.title); setStyle(s.style); setPalette(s.palette); setContentPreset(s.contentPreset); setTarget(s.target); setCaptions(s.captions);
    chooseEntrance(s.iconMotion ?? "pop");
    for (const [id, i] of Object.entries(s.icons ?? {})) registerIcon(id, i.label, i.node as never);
    setCustomIcons(s.icons ?? {});
    setOverrides(s.overrides); setCutOverrides(s.cutOverrides); setClipStarts(s.clipStarts); setCaptionOffset(s.captionOffset); setOverlayPos(s.overlay ?? "top"); setDensity(s.density ?? "balanced"); setBrandMotion(s.brandMotion ?? "simple"); setStoryVisuals(s.storyVisuals !== false); setTypography(s.typography ?? DEFAULT_TYPE_PACK); setCaptionStyle(s.captionStyle ?? "classic"); setCaptionPos(normalizeCaptionPos(s.captionPos)); setBackdrop(s.backdrop ?? "plain"); setGrain(s.grain === true); setStickerMode(s.stickerMode ?? "off"); setStickerOverrides(s.stickerOverrides ?? {}); setSfxMode(s.sfx ?? "off"); setCine(s.cine ? restoreCine(s.cine) : null); setImported(s.imported);
    if (s.cine) { setMoodTouched(true); setMood(conceptFor(s.cine.tone).mood); setMusicMode("auto"); }
    setVoiceMode(s.voiceMode); setTtsLang(s.ttsLang); setTtsVoice(s.ttsVoice); setTtsSpeed(s.ttsSpeed);
    const rec = savedSource ? await loadSource() : null;
    if (rec) {
      const file = rec.blob instanceof File ? rec.blob : new File([rec.blob], rec.name, { type: rec.type, lastModified: rec.lastModified });
      setSource({ file, url: URL.createObjectURL(file), seconds: rec.seconds });
      setTrim(s.trim ?? null); 
      setEditProfile(s.edit?.profile ?? "standard"); setEdits((s.edit?.edits ?? []).filter(isEdit)); setEmphasis(s.edit?.emphasis ?? []); setComedySfx(!!s.edit?.sfx);
      setVideoEdit(s.videoEdit);
    } else setVideoEdit(false); // editing over the video needs the video itself
    setSaved(null); setSavedCloud(false); setAutosave(true);
  }
  /** A transcript's timing, with the creator's own script kept: used after a local (Whisper) transcript of the clip. */
  function useTimingOnly(t: Transcript): string | null {
    const words = shiftWords(allWords(t), captionOffset);
    if (!sceneTimings(splitScript(script), words, FPS, t.duration)) return "Naskah terlalu berbeda dari hasil ini, jadi waktunya tidak bisa dipakai. Pilih \"Pakai transkrip\" untuk mengganti naskah dengan hasil ini.";
    setScript(mergeShortScenes(script, allWords(t), FPS, t.duration));
    setImported(t); setVoiceMode("none"); setNarration(null); setVideoEdit(true); setCaptions(true);
    return null;
  }
  async function discardSession() { await clearSession(); setSavedCloud(false); setSaved(null); setSavedSource(null); setAutosave(true); }
  return { discardSession, restoreSession, useTimingOnly };
}
