// Pure assembly of per-scene synthesized speech into one narration track aligned to the scene timeline.
import { FPS, sceneFrames } from "../script";

/** Silence before and after each spoken scene. */
export const LEAD_SECONDS = 0.15;
export const TAIL_SECONDS = 0.35;

export const SPEEDS = [
  { id: 0.9, label: "Pelan" },
  { id: 1.05, label: "Normal" },
  { id: 1.2, label: "Cepat" },
];

export function clipKey(text: string, lang: string, voice: number, speed: number): string {
  return `${lang}|${voice}|${speed}|${text}`;
}

/** Scene length for a clip: lead-in + speech + tail. */
export function sceneSecondsFor(clipSamples: number, sampleRate: number): number {
  return LEAD_SECONDS + clipSamples / sampleRate + TAIL_SECONDS;
}

/**
 * Places each clip at the start of its scene (plus the lead-in) on one track whose length equals the
 * timeline, using the same frame rounding as buildTimeline's "scenes" mode.
 */
export function assembleNarration(clips: Float32Array[], sampleRate: number, fps = FPS): { samples: Float32Array; sceneSeconds: number[] } {
  const sceneSeconds = clips.map(c => sceneSecondsFor(c.length, sampleRate));
  const frames = sceneSeconds.map(s => sceneFrames(s, fps));
  const total = Math.round((frames.reduce((a, b) => a + b, 0) / fps) * sampleRate);
  const samples = new Float32Array(total);
  let startFrame = 0;
  clips.forEach((clip, i) => {
    const at = Math.round((startFrame / fps + LEAD_SECONDS) * sampleRate);
    samples.set(clip.subarray(0, Math.max(0, Math.min(clip.length, total - at))), at);
    startFrame += frames[i];
  });
  return { samples, sceneSeconds };
}
