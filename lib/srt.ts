// SRT export for script videos: the same phrase chunks and timing the burned-in captions use,
// so the file matches what the video shows. Idea adopted from MoneyPrinterTurbo (MIT): ship the subtitle file next to the MP4.
import { formatSrtTime } from "./transcript";
import { FPS, HIGHLIGHT_LEAD_FRAMES, phraseChunks, type Scene } from "./script";
import { stripMarks } from "./visuals";

/** Silence kept at the end of a spoken scene (matches the pause the voice adds), so the last caption does not linger. */
const TAIL_FRAMES = Math.round(0.35 * FPS);

/** Frame inside the scene at which word `i` becomes the active word (inverse of activeWordIndex). */
function wordFrame(scene: Scene, i: number, n: number): number {
  const s = scene.wordStarts;
  if (s && s.length === n) return s[i];
  const speaking = Math.max(1, scene.durationInFrames * 0.9);
  return Math.max(0, Math.ceil((i * speaking) / n) - HIGHLIGHT_LEAD_FRAMES);
}

export type SrtCue = { start: number; end: number; text: string };

/** One cue per caption phrase, in seconds from the start of the video. */
export function sceneCues(scenes: Scene[], fps = FPS): SrtCue[] {
  const cues: SrtCue[] = [];
  let offset = 0;
  for (const scene of scenes) {
    const text = stripMarks(scene.text).split(/\s+/).filter(Boolean).join(" ");
    const n = text ? text.split(" ").length : 0;
    const chunks = n ? phraseChunks(text) : [];
    const end = offset + scene.durationInFrames;
    chunks.forEach((chunk, ci) => {
      const first = wordFrame(scene, chunk.start, n);
      const last = chunk.start + chunk.words.length - 1;
      const next = chunks[ci + 1];
      const spoken = scene.wordEnds && scene.wordEnds.length === n ? scene.wordEnds[last] + 6 : Infinity;
      // A phrase lasts until the next one starts (or, for the last, until its words end / the scene's tail).
      const stop = next ? wordFrame(scene, next.start, n) : Math.min(scene.durationInFrames - (scene.wordEnds ? 0 : TAIL_FRAMES), spoken);
      const from = offset + Math.min(first, scene.durationInFrames - 1);
      const to = Math.min(end, Math.max(from + 6, offset + stop));
      cues.push({ start: from / fps, end: to / fps, text: chunk.words.join(" ") });
    });
    offset = end;
  }
  return cues;
}

export function scenesToSrt(scenes: Scene[], fps = FPS): string {
  return sceneCues(scenes, fps).map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`).join("\n");
}
