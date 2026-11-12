import { useEffect, useMemo } from "react";
import { type Narration } from "@/lib/recorder";
import { type CaptionStyleId, type DurationMode, type PaletteId, type StyleId } from "@/lib/script";
import { type Cut } from "@/lib/visuals";
import { scenesToSrt } from "@/lib/srt";
import { type CaptionPos } from "@/lib/caption-box";
import { type Watermark } from "@/lib/watermark";
import { buildStoryboard, validateStoryboard, type Issue } from "@/lib/storyboard";
import type { AiNarration, MusicMode, Track, VoiceMode } from "../_components/types";
import type { Dispatch, SetStateAction } from "react";
import type { SceneVisual } from "@/lib/visuals";
import type { NarrativePlan } from "@/lib/narrative";
import type { TimelineResult } from "@/lib/script";

type Inputs = {
  aiFresh: AiNarration | null;
  aiNarration: AiNarration | null;
  captionPos: CaptionPos | undefined;
  captions: boolean;
  captionStyle: CaptionStyleId;
  duck: boolean;
  mode: DurationMode;
  musicMode: MusicMode;
  musicTrack: Track | null;
  musicVolume: number;
  narration: Narration | null;
  palette: PaletteId;
  recording: boolean;
  result: { url: string; name: string; size: number; } | null;
  sceneList: ({ fx?: string; sticker?: string; videoSrc: string; clipFrom?: number; cut?: Cut; wordStarts?: number[]; wordEnds?: number[]; pauseFrames?: number; visual: SceneVisual; narrative: NarrativePlan; text: string; durationInFrames: number; image?: string; } | { fx?: string; sticker?: string; image: string; clipFrom?: number; cut?: Cut; wordStarts?: number[]; wordEnds?: number[]; pauseFrames?: number; visual: SceneVisual; narrative: NarrativePlan; text: string; durationInFrames: number; videoSrc?: string; } | { fx?: string; sticker?: string; clipFrom?: number; cut?: Cut; wordStarts?: number[]; wordEnds?: number[]; pauseFrames?: number; visual: SceneVisual; narrative: NarrativePlan; text: string; durationInFrames: number; image?: string; videoSrc?: string; })[];
  script: string;
  setResult: Dispatch<SetStateAction<{ url: string; name: string; size: number; } | null>>;
  source: { file: File; url: string; seconds: number; } | null;
  storyVisuals: boolean;
  style: StyleId;
  target: string;
  timeline: TimelineResult;
  title: string;
  titleError: string | null;
  videoEdit: boolean;
  voiceMode: VoiceMode;
  watermark: Watermark;
};

export default function useStoryboardChecks({ aiFresh, aiNarration, captionPos, captions, captionStyle, duck, mode, musicMode, musicTrack, musicVolume, narration, palette, recording, result, sceneList, script, setResult, source, storyVisuals, style, target, timeline, title, titleError, videoEdit, voiceMode, watermark }: Inputs) {
// Structured plan the renderer will draw, checked before render (lib/storyboard.ts).
  const storyboard = useMemo(() => buildStoryboard(sceneList, { captions, videoEdit: !!(videoEdit && source), storyVisuals }), [sceneList, captions, videoEdit, source, storyVisuals]);
  const storyIssues: Issue[] = useMemo(() => validateStoryboard(storyboard, { audioSeconds: mode.kind === "audio" ? narration?.seconds : undefined }), [storyboard, mode.kind, narration?.seconds]);
  const storyErrors = storyIssues.filter(i => i.level === "error");

  const blocker = !timeline.ok ? timeline.error : titleError
    ?? (recording ? "Selesaikan perekaman narasi terlebih dahulu." : null)
    ?? (storyErrors[0]?.message ?? null)
    ?? (voiceMode === "ai" && !aiFresh ? (aiNarration ? "Naskah, bahasa, suara, kecepatan, atau tempo/jeda per kalimat berubah. Ketuk “Buat suara otomatis” lagi (hanya kalimat yang berubah dibuat ulang)." : "Ketuk “Buat suara otomatis” untuk membuat voice over dari naskah.") : null);

  // Inputs changed after a render: the downloaded file no longer matches the preview.
  // Subtitle file for the current script, offered once an MP4 exists; revoked when the script changes.
  const srtText = result && timeline.ok && captions && !videoEdit ? scenesToSrt(sceneList) : null;
  const srtUrl = useMemo(() => srtText ? URL.createObjectURL(new Blob([srtText], { type: "text/plain;charset=utf-8" })) : null, [srtText]);
  useEffect(() => () => { if (srtUrl) URL.revokeObjectURL(srtUrl); }, [srtUrl]);
  useEffect(() => { setResult(null); }, [script, title, style, palette, target, captions, narration, musicMode, musicTrack, musicVolume, duck, watermark, captionStyle, captionPos, setResult]);
  return { blocker, srtUrl, storyErrors, storyIssues, storyboard };
}
