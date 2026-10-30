// Sharper subtitle timing for lines the AI transcribed: the AI says roughly when each line starts and ends (often half a second
// or more off), but the audio itself shows where speech really begins and stops. Pure functions over audio samples: voiced
// regions from the loudness, lines snapped to the silences next to them, and words spread over the time the voice is actually
// there (not over the pauses). Where the audio is unclear nothing is changed, so this can only sharpen a timing, never lose a line.
import type { Word } from "./transcript";

export type TimedLine = { start: number; end: number; text: string; words?: Word[] };
export type Region = { start: number; end: number };

const HOP = 0.01;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Loudness per 10 ms hop in dB (relative to full scale). */
export function frameLevels(samples: Float32Array, rate: number): Float32Array {
  const n = Math.max(1, Math.round(rate * HOP)), frames = Math.floor(samples.length / n), out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * n; i < (f + 1) * n; i++) s += samples[i] * samples[i];
    out[f] = 10 * Math.log10(s / n + 1e-10);
  }
  return out;
}

/**
 * Where there is speech (or any sound that is not the background): frames louder than the background level plus a margin,
 * with dips shorter than 0.18 s bridged (the gaps between syllables and words) and blips shorter than 0.08 s dropped.
 * Empty when the audio is silent or so even that nothing stands out.
 */
export function voicedRegions(samples: Float32Array, rate: number): Region[] {
  const lv = frameLevels(samples, rate);
  if (lv.length < 20) return [];
  const sorted = [...lv].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.15)], top = sorted[Math.floor(sorted.length * 0.95)];
  if (top - floor < 12 || top < -55) return []; // too even (a constant tone or noise) or too quiet to tell speech from background
  const threshold = Math.max(floor + 9, top - 30, -52);
  const raw: Region[] = [];
  let from = -1;
  for (let f = 0; f <= lv.length; f++) {
    const on = f < lv.length && lv[f] >= threshold;
    if (on && from < 0) from = f;
    if (!on && from >= 0) { raw.push({ start: from * HOP, end: f * HOP }); from = -1; }
  }
  const merged: Region[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end < 0.18) last.end = r.end; else merged.push({ ...r });
  }
  return merged.filter(r => r.end - r.start >= 0.08).map(r => ({ start: r3(r.start), end: r3(r.end) }));
}

/** Words placed over the voiced time inside [start, end] in proportion to their length; the pauses between voiced stretches take no words. */
export function wordsOverVoice(text: string, start: number, end: number, regions: Region[]): Word[] {
  const list = text.split(/\s+/).filter(Boolean);
  if (list.length === 0 || end <= start) return [];
  const spans = regions.map(r => ({ start: Math.max(r.start, start), end: Math.min(r.end, end) })).filter(r => r.end - r.start > 0.03);
  const voiced = spans.reduce((a, r) => a + (r.end - r.start), 0);
  // No voice to go by (or hardly any): an even spread, as before.
  if (voiced < Math.min(0.5, (end - start) * 0.4)) return evenWords(list, start, end);
  const weight = list.reduce((a, w) => a + w.length + 1, 0);
  const locate = (v: number) => { // voiced time -> [real time, index of the stretch]
    let left = v;
    for (let k = 0; k < spans.length; k++) { const len = spans[k].end - spans[k].start; if (left <= len + 1e-9) return { t: spans[k].start + Math.min(left, len), k }; left -= len; }
    return { t: spans[spans.length - 1].end, k: spans.length - 1 };
  };
  let used = 0, prevEnd = start;
  return list.map(w => {
    const a = locate(used);
    used += (voiced * (w.length + 1)) / weight;
    const b = locate(used);
    let from = a.t, to = b.t;
    // A word never straddles a pause: it goes to the stretch where most of it falls.
    if (a.k !== b.k) {
      const inFirst = spans[a.k].end - from, inLast = to - spans[b.k].start;
      if (inFirst >= inLast) to = spans[a.k].end; else from = spans[b.k].start;
    }
    from = Math.max(from, prevEnd);
    to = Math.max(to, from + 0.02);
    prevEnd = to;
    return { text: w, start: r3(from), end: r3(to) };
  });
}

function evenWords(list: string[], start: number, end: number): Word[] {
  const total = list.reduce((a, w) => a + w.length + 1, 0);
  let t = start;
  return list.map(w => { const next = t + ((end - start) * (w.length + 1)) / total; const word = { text: w, start: r3(t), end: r3(next) }; t = next; return word; });
}

export const SNAP_WINDOW = 1.2;
const START_PAD = 0.06, END_PAD = 0.12;

/**
 * Snaps each line to the silences around it: its start to the start of the voiced stretch nearest to where the AI said it began
 * (only when that is a real silence-to-speech edge within `window` seconds), its end likewise, never overlapping the neighbours
 * and never shorter than 0.3 s; then the words are spread over the voice. A line with no clear edge nearby keeps the AI's time.
 */
export function refineLines(lines: TimedLine[], regions: Region[], window = SNAP_WINDOW): TimedLine[] {
  if (regions.length === 0) return lines.map(l => ({ ...l }));
  const out: TimedLine[] = [];
  const sorted = [...lines];
  for (let i = 0; i < sorted.length; i++) {
    const l = sorted[i];
    const prevEnd = out.length ? out[out.length - 1].end : 0, nextStart = i + 1 < sorted.length ? sorted[i + 1].start : Infinity;
    // A start is a place where speech begins after silence; an end is where it stops before silence.
    const starts = regions.map(r => r.start).filter(t => Math.abs(t - l.start) <= window);
    const ends = regions.map(r => r.end).filter(t => Math.abs(t - l.end) <= window);
    const nearest = (list: number[], to: number) => list.reduce((best, t) => (Math.abs(t - to) < Math.abs(best - to) ? t : best), list[0]);
    let start = starts.length ? Math.max(prevEnd, nearest(starts, l.start) - START_PAD) : l.start;
    let end = ends.length ? Math.min(nextStart, nearest(ends, l.end) + END_PAD) : l.end;
    if (end - start < 0.3) { start = l.start; end = l.end; }
    start = Math.max(prevEnd, start);
    if (end <= start) { start = Math.max(prevEnd, l.start); end = Math.max(start + 0.3, l.end); }
    out.push({ ...l, start: r3(start), end: r3(end), words: wordsOverVoice(l.text, start, end, regions) });
  }
  return out;
}
