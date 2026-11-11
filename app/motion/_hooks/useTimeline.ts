import { useMemo } from "react";
import { type Mood, type Music } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import { buildTimeline, FPS, MIN_SCENE_SECONDS, splitScript, splitScriptWithPauses, validateTitle, type DurationMode } from "@/lib/script";
import { analyzeVoiceScript, applyOverrides, narrationKey, segmentKeys, type DirectionOverrides } from "@/lib/voice-director";
import { type TtsLang } from "@/lib/tts/supertonic";
import { allWords, shiftWords, sceneTimings, type Transcript } from "@/lib/transcript";
import { type CinePlan } from "@/lib/cinematic";
import { trimSeconds, type Trim } from "@/lib/trim";
import type { AiNarration, Generated, MusicMode, Track, VoiceMode, VoiceProgress } from "../_components/types";

type Inputs = {
  aiNarration: AiNarration | null;
  captionOffset: number;
  cine: { plan: CinePlan; fx: Record<string, string>; } | null;
  duck: boolean;
  generated: Generated | null;
  imported: Transcript | null;
  manualNarration: Narration | null;
  mood: Mood;
  musicMode: MusicMode;
  musicVolume: number;
  recordingSeconds: number | null;
  script: string;
  seed: number;
  source: { file: File; url: string; seconds: number; } | null;
  target: string;
  title: string;
  trim: Trim | null;
  ttsLang: TtsLang;
  ttsSpeed: number;
  ttsVoice: number;
  uploadedMusic: Track | null;
  videoEdit: boolean;
  voiceDirectionOverrides: DirectionOverrides;
  voiceMode: VoiceMode;
  voiceProgress: VoiceProgress | null;
};

export default function useTimeline({ aiNarration, captionOffset, cine, duck, generated, imported, manualNarration, mood, musicMode, musicVolume, recordingSeconds, script, seed, source, target, title, trim, ttsLang, ttsSpeed, ttsVoice, uploadedMusic, videoEdit, voiceDirectionOverrides, voiceMode, voiceProgress }: Inputs) {
// Automatic voice over is valid only for the exact sentences, language, voice and speed it was made from.
  const voiceScript = useMemo(() => splitScriptWithPauses(script), [script]);
  const autoDirections = useMemo(() => analyzeVoiceScript(voiceScript.texts, ttsLang), [voiceScript, ttsLang]);
  const voiceSegmentKeys = useMemo(() => segmentKeys(voiceScript.texts), [voiceScript]);
  const voiceDirections = useMemo(() => applyOverrides(autoDirections, voiceSegmentKeys, voiceDirectionOverrides), [autoDirections, voiceSegmentKeys, voiceDirectionOverrides]);
  // Only what changes the sound (tempo, pause) can make a generated narration out of date; emotion, style, intonation and emphasis cannot.
  const voiceKey = useMemo(() => narrationKey(voiceScript, ttsLang, ttsVoice, ttsSpeed, voiceDirections), [voiceScript, ttsLang, ttsVoice, ttsSpeed, voiceDirections]);
  const aiFresh = voiceMode === "ai" && aiNarration?.key === voiceKey ? aiNarration : null;
  const narration = voiceMode === "ai" ? aiFresh?.narration ?? null : voiceMode === "manual" ? manualNarration : null;
  // Transcript timing applies while the script still matches the transcript words and the narration is the original audio.
  const timings = useMemo(() => imported ? sceneTimings(splitScript(script), shiftWords(allWords(imported), captionOffset), FPS, imported.duration) : null, [imported, script, captionOffset]);
  const timed = voiceMode !== "ai" && timings && (!narration || Math.abs(narration.seconds - imported!.duration) <= 1) ? timings : null;
  const cineActive = !!cine && cine.plan.script === script && !aiFresh && !narration && !(videoEdit && source);
  const mode: DurationMode = aiFresh ? { kind: "scenes", seconds: aiFresh.sceneSeconds }
    : cineActive ? { kind: "scenes", seconds: cine!.plan.scenes.map(x => x.seconds), exact: true }
    : timed ? { kind: "scenes", seconds: timed.seconds, exact: true }
    : narration ? { kind: "audio", seconds: narration.seconds }
    // Editing over a video whose captions have no usable timing: the scenes still span exactly the video, never more or less.
    : videoEdit && source && splitScript(script).length * MIN_SCENE_SECONDS <= trimSeconds(trim, source.seconds) ? { kind: "target", seconds: trimSeconds(trim, source.seconds) }
    : target === "auto" || voiceMode === "ai" ? { kind: "auto" } : { kind: "target", seconds: Number(target) };
  const voiceBusy = voiceProgress !== null;
  const timeline = useMemo(() => buildTimeline(script, mode, FPS), [script, mode.kind, mode.kind === "target" ? mode.seconds : null, cineActive, cine?.plan, aiFresh, narration?.seconds, target, timed]); // eslint-disable-line react-hooks/exhaustive-deps
  const videoSeconds = timeline.ok ? timeline.seconds : 0;
  const titleError = validateTitle(title);
  const recording = recordingSeconds !== null;

  const generatedFresh = generated && generated.mood === mood && generated.seed === seed && Math.abs(generated.seconds - videoSeconds) < 0.05 ? generated : null;
  const musicTrack: Track | null = musicMode === "auto" ? generatedFresh : musicMode === "upload" ? uploadedMusic : null;
  const music: Music | null = musicTrack ? { src: musicTrack.url, volume: musicVolume / 100, duck, loop: musicMode === "upload" } : null;
  return { aiFresh, autoDirections, cineActive, generatedFresh, mode, music, musicTrack, narration, recording, timed, timeline, timings, titleError, videoSeconds, voiceBusy, voiceDirections, voiceKey, voiceScript, voiceSegmentKeys };
}
