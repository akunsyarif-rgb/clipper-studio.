// Trimming the start and end of the video in the motion studio (pure). The trim is a range of the source file, in seconds;
// the file itself is never changed, so the range can be moved again at any time. Transcripts made for the video are relative
// to the start of the range (as the clipper's clips are), so changing the range slices or invalidates them (see `reslice`).
import { MAX_SECONDS } from "./script";
import { scriptFromTranscript, sliceTranscript, type Transcript, type Word } from "./transcript";

export type Trim = { start: number; end: number };
export const MIN_TRIM_SECONDS = 1;
/** Air kept before the first word and after the last word when snapping to words. */
export const SNAP_PAD_SECONDS = 0.15;
/** The extra footage the clipper adds before and after a clip it sends to the motion studio. */
export const HANDOFF_MARGIN_SECONDS = 3;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The range kept inside the file, at least a second long and at most the studio's limit; `edge` is the one the creator just moved (the other one gives way last). */
export function clampTrim(t: Trim, duration: number, edge: "start" | "end" = "end"): Trim {
  let { start, end } = t;
  start = Math.min(Math.max(0, start), Math.max(0, duration - MIN_TRIM_SECONDS));
  end = Math.min(Math.max(end, MIN_TRIM_SECONDS), duration);
  if (end - start < MIN_TRIM_SECONDS) { if (edge === "start") start = Math.max(0, end - MIN_TRIM_SECONDS); else end = Math.min(duration, start + MIN_TRIM_SECONDS); }
  if (end - start > MAX_SECONDS) { if (edge === "start") start = end - MAX_SECONDS; else end = start + MAX_SECONDS; }
  return { start: r3(start), end: r3(end) };
}

export const trimSeconds = (t: Trim | null, duration: number) => (t ? t.end - t.start : duration);
export const isWhole = (t: Trim | null, duration: number) => !t || (t.start < 0.05 && Math.abs(t.end - duration) < 0.05);

/** Words of a transcript on the file's own timeline (a transcript is relative to the start of the range it was made for). */
export function absoluteWords(words: Word[], rangeStart: number): Word[] {
  return words.map(w => ({ ...w, start: r3(w.start + rangeStart), end: r3(w.end + rangeStart) }));
}

/**
 * Snaps the range to the words spoken in it: the start goes to the beginning of the first word and the end to the end of the last
 * one, each with a little air and never reaching into a neighbouring word. A start that cuts a word in half therefore moves back
 * to the word's beginning (when that is known), and silence before the first word or after the last one is trimmed away.
 */
export function snapToWords(t: Trim, words: Word[], pad = SNAP_PAD_SECONDS): Trim {
  const inside = words.filter(w => w.end > t.start && w.start < t.end).sort((a, b) => a.start - b.start);
  if (inside.length === 0) return t;
  const first = inside[0], last = inside[inside.length - 1];
  const before = words.filter(w => w.end <= first.start + 1e-6).sort((a, b) => b.end - a.end)[0];
  const after = words.filter(w => w.start >= last.end - 1e-6).sort((a, b) => a.start - b.start)[0];
  const start = Math.max(0, first.start - pad, before ? before.end : 0);
  const end = Math.min(last.end + pad, after ? after.start : Infinity);
  return end - start < MIN_TRIM_SECONDS ? t : { start: r3(start), end: r3(end) };
}

export type Reslice = { transcript: Transcript | null; script: string | null; /** "kept": the words of the new range were all known; "lost": part of the new range was never transcribed. */ outcome: "same" | "kept" | "lost" };

/**
 * What happens to a transcript (made for `old`) when the range becomes `next`. Inside the old range the transcript is cut
 * to fit (and the script is rebuilt from it when the creator had not edited it); reaching outside it, the new part has no
 * words, so the transcript is dropped and must be made again for the new range.
 */
export function reslice(t: Transcript, old: Trim, next: Trim, script: string, fps: number): Reslice {
  if (Math.abs(old.start - next.start) < 0.001 && Math.abs(old.end - next.end) < 0.001) return { transcript: t, script: null, outcome: "same" };
  const inside = next.start >= old.start - 0.001 && next.end <= old.end + 0.001;
  if (!inside) return { transcript: null, script: null, outcome: "lost" };
  const sliced = sliceTranscript(t, next.start - old.start, next.end - old.start);
  const unedited = script === scriptFromTranscript(t, fps);
  return { transcript: sliced, script: unedited && sliced.segments.length > 0 ? scriptFromTranscript(sliced, fps) : null, outcome: "kept" };
}

/** The range a clip from the clipper is edited on: the clip itself, inside the footage that came with it. */
export function handoffTrim(padStart: number, padEnd: number, seconds: number): Trim | null {
  return padStart > 0.05 || padEnd > 0.05 ? { start: r3(padStart), end: r3(padStart + seconds) } : null;
}

/** The footage the clipper cuts for a clip: the clip plus up to 3 s on each side that exists in the video. */
export function handoffRange(start: number, end: number, videoDuration: number): { start: number; duration: number; padStart: number; padEnd: number } {
  const from = Math.max(0, start - HANDOFF_MARGIN_SECONDS), to = Math.min(videoDuration, end + HANDOFF_MARGIN_SECONDS);
  return { start: r3(from), duration: r3(to - from), padStart: r3(start - from), padEnd: r3(to - end) };
}
