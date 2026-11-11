import { useEffect, useMemo } from "react";
import { type Music } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import { type CaptionStyleId, fitScenesToVideo, FPS, totalFrames, type PaletteId, type StyleId, type VideoProps } from "@/lib/script";
import { resolveVisual, sceneTopics, type Cut, type VisualOverride } from "@/lib/visuals";
import { planNarrative } from "@/lib/narrative";
import { planAnimations, type Density } from "@/lib/importance";
import type { BrandMotion, OverlayPosition } from "@/lib/overlay";
import { type CaptionPos } from "@/lib/caption-box";
import { type CinePlan } from "@/lib/cinematic";
import { toRenderEdits, type Edit, type EditProfile } from "@/lib/edit-profile";
import { trimSeconds, type Trim } from "@/lib/trim";
import { planStickers, type StickerMode } from "@/lib/stickers";
import { planSfx, SFX_VOLUME, type SfxMode } from "@/lib/sfx";
import { sfxWav } from "@/lib/sfx-synth";
import { DEFAULT_TYPE_PACK, type TypePackId } from "@/lib/fonts";
import { isWatermarkActive, type Watermark } from "@/lib/watermark";
import type { SceneScore } from "@/lib/gemini";
import { isAudioFile } from "@/lib/clip";
import type { AiNarration, SceneImageFile } from "../_components/types";
import type { SceneTimings } from "@/lib/transcript";
import type { TimelineResult } from "@/lib/script";

type Inputs = {
  aiFresh: AiNarration | null;
  aiScores: Record<string, SceneScore>;
  backdrop: "plain" | "mesh";
  brandMotion: BrandMotion;
  captionPos: CaptionPos | undefined;
  captions: boolean;
  captionStyle: CaptionStyleId;
  cine: { plan: CinePlan; fx: Record<string, string>; } | null;
  clipStarts: Record<string, number>;
  comedySfx: boolean;
  customIcons: Record<string, { label: string; node: [string, Record<string, string>][]; }>;
  cutOverrides: Record<string, Cut>;
  density: Density;
  editProfile: EditProfile;
  edits: Edit[];
  emphasis: { from: number; to: number; }[];
  grain: boolean;
  images: Record<string, SceneImageFile>;
  music: Music | null;
  narration: Narration | null;
  overlayPos: OverlayPosition;
  overrides: Record<string, VisualOverride>;
  palette: PaletteId;
  sfxMode: SfxMode;
  source: { file: File; url: string; seconds: number; } | null;
  stickerMode: StickerMode;
  stickerOverrides: Record<string, string>;
  storyVisuals: boolean;
  style: StyleId;
  timed: SceneTimings | null;
  timeline: TimelineResult;
  title: string;
  trim: Trim | null;
  typography: TypePackId;
  videoEdit: boolean;
  watermark: Watermark;
};

export default function useSceneComposition({ aiFresh, aiScores, backdrop, brandMotion, captionPos, captions, captionStyle, cine, clipStarts, comedySfx, customIcons, cutOverrides, density, editProfile, edits, emphasis, grain, images, music, narration, overlayPos, overrides, palette, sfxMode, source, stickerMode, stickerOverrides, storyVisuals, style, timed, timeline, title, trim, typography, videoEdit, watermark }: Inputs) {
const sceneContext = timeline.ok ? sceneTopics(timeline.scenes.map(sc => sc.text)) : [];
  const sceneVisuals = timeline.ok ? timeline.scenes.map((sc, i) => resolveVisual(sc.text, overrides[sc.text], sceneContext[i])) : [];
  const narrativePlan = timeline.ok ? planNarrative(timeline.scenes.map(sc => sc.text)) : [];
  // Which scenes deserve an animation: judged on what they say, not on whether an icon exists for a word.
  const animationPlan = timeline.ok
    ? planAnimations(timeline.scenes.map((sc, i) => ({ text: sc.text, visual: sceneVisuals[i], seconds: sc.durationInFrames / FPS })), density, timeline.scenes.map(sc => aiScores[sc.text]))
    : { cuts: [], judgements: [] };
  const planned = animationPlan.cuts;
  const stickerPlan = timeline.ok && !(videoEdit && source) ? planStickers(timeline.scenes.map(sc => sc.text), { mode: stickerMode, overrides: stickerOverrides }) : [];
  const sceneList = timeline.ok ? (videoEdit && source ? (list: typeof timeline.scenes) => fitScenesToVideo(list, Math.round(trimSeconds(trim, source.seconds) * FPS)) : (list: typeof timeline.scenes) => list)(timeline.scenes).map((sc, i) => ({
    ...sc, visual: sceneVisuals[i], narrative: narrativePlan[i], ...(timed && !aiFresh ? { wordStarts: timed.wordStarts[i], wordEnds: timed.wordEnds[i], pauseFrames: undefined } : {}),
    ...(videoEdit && source ? { cut: cutOverrides[sc.text] ?? planned[i], ...(cutOverrides[sc.text] === "clip" ? { clipFrom: clipStarts[sc.text] ?? (trim?.start ?? 0) } : {}) } : {}),
    ...(images[sc.text]?.mediaType === "video" ? { videoSrc: images[sc.text].url } : images[sc.text] ? { image: images[sc.text].url } : {}),
    ...(stickerPlan[i] ? { sticker: stickerPlan[i]! } : {}),
    ...(cine?.fx[sc.text] && !(videoEdit && source) ? { fx: cine.fx[sc.text] } : {}),
  })) : [];
  // Sound effects: planned from the scenes, synthesised on the device into one small WAV that plays in the preview and the MP4.
  const outLength = timeline.ok ? totalFrames(sceneList) / FPS : 0;
  const editActive = !!(videoEdit && source) && editProfile !== "standard";
  const renderEdits = editActive ? toRenderEdits(edits, trim?.start ?? 0, outLength) : [];
  const renderEmphasis = editActive && editProfile === "comedy" ? emphasis.map(r => ({ from: r.from - (trim?.start ?? 0), to: r.to - (trim?.start ?? 0) })).filter(r => r.to > 0 && r.from < outLength) : [];
  const sfxPlan = [...planSfx(sceneList, sfxMode, { videoEdit: !!(videoEdit && source) }),
    // Comedy: a small pop on each punch-in (switched on by the creator; off by default).
    ...(editActive && editProfile === "comedy" && comedySfx ? renderEdits.filter(e => e.kind === "punch").map(e => ({ frame: Math.round(e.at * FPS), kind: "pop" as const, gain: 0.5 })) : [])].sort((a, b) => a.frame - b.frame);
  // Keyed by what the track contains (not by array identity, which changes every render): the same effects keep the same WAV.
  const sfxFrames = totalFrames(sceneList);
  const sfxKey = JSON.stringify([sfxPlan, sfxFrames]);
  const sfxBytes = useMemo(() => sfxPlan.length ? sfxWav(sfxPlan, sfxFrames, FPS) : null, [sfxKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The WAV gets its address in the same render as the plan, so a render started right after a change always has the matching sound.
  const sfxSrc = useMemo(() => sfxBytes ? URL.createObjectURL(new Blob([sfxBytes], { type: "audio/wav" })) : null, [sfxBytes]);
  useEffect(() => () => { if (sfxSrc) URL.revokeObjectURL(sfxSrc); }, [sfxSrc]);
  const props: VideoProps | null = timeline.ok ? {
    title: title.trim(), scenes: sceneList, style, palette, audioSrc: narration?.url ?? null, captions, video: videoEdit && source ? { src: source.url, seconds: source.seconds, ...(trim ? { trimStart: trim.start } : {}), ...(isAudioFile(source.file) ? { audioOnly: true } : {}) } : null, ...(renderEdits.length ? { edits: renderEdits } : {}), ...(renderEmphasis.length ? { captionEmphasis: renderEmphasis } : {}), overlay: overlayPos, brandMotion,
    music, speech: narration?.speech ?? null, ...(isWatermarkActive(watermark) ? { watermark } : {}), ...(storyVisuals ? {} : { storyVisuals: false }), ...(typography !== DEFAULT_TYPE_PACK ? { typography } : {}), ...(captionStyle !== "classic" ? { captionStyle } : {}), ...(captionPos ? { captionPos } : {}), ...(backdrop === "mesh" ? { backdrop } : {}), ...(grain ? { grain } : {}), ...(sfxSrc ? { sfx: { src: sfxSrc, volume: SFX_VOLUME } } : {}),
  } : null;
  const usedIcons = (() => { const ids = new Set(Object.values(overrides).map(o => o.icon).filter((x): x is string => !!x && x in customIcons)); return ids.size ? { icons: Object.fromEntries([...ids].map(id => [id, customIcons[id]])) } : {}; })();
  return { animationPlan, narrativePlan, planned, props, sceneContext, sceneList, sceneVisuals, stickerPlan, usedIcons };
}
