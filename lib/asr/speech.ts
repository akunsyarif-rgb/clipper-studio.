// Finds where a recording is actually spoken, so the speech model only hears speech. Silence, room noise and music
// are what make Whisper invent text (the classic "Yang mana? Yang mana? Yang mana? …"), and skipping them is faster.
// Pure, deterministic and independent of the model.

export const ASR_SAMPLE_RATE = 16000;
/** One window of the model is 30 s; regions stay below it, padding included. */
export const MAX_REGION_SECONDS = 27.5;
const PAD_SECONDS = 0.25;
const FRAME_SECONDS = 0.03;

export type Region = { start: number; end: number };

/**
 * Raises a quiet recording to a usable level (peak about 0.9) with a limited gain, in place; never clips.
 * Returns the gain that was applied (1 when the audio was loud enough or silent).
 */
export function normalizeSpeech(samples: Float32Array, target = 0.9, maxGain = 8): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
  if (peak < 1e-4 || peak >= target * 0.8) return 1;
  const gain = Math.min(maxGain, target / peak);
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return gain;
}

/** Root-mean-square level of each 30 ms frame. */
export function frameEnergies(samples: Float32Array, rate = ASR_SAMPLE_RATE, frameSeconds = FRAME_SECONDS): Float32Array {
  const size = Math.max(1, Math.round(rate * frameSeconds));
  const out = new Float32Array(Math.ceil(samples.length / size));
  for (let f = 0; f < out.length; f++) {
    let sum = 0;
    const from = f * size, to = Math.min(samples.length, from + size);
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    out[f] = Math.sqrt(sum / Math.max(1, to - from));
  }
  return out;
}

const percentile = (sorted: Float32Array, p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

export type SpeechOptions = {
  /** Speech shorter than this is a click or a cough, not a word. */
  minSpeechSeconds?: number;
  /** Pauses shorter than this stay inside one region. */
  mergeGapSeconds?: number;
};

/**
 * Regions (in seconds) that contain speech, each at most MAX_REGION_SECONDS long and padded a little on both sides.
 * The threshold follows the recording: a point between its noise floor (quiet 10 %) and its speech level (loud 10 %).
 * Long stretches are cut at their quietest moment, not in the middle of a word.
 */
export function speechRegions(samples: Float32Array, rate = ASR_SAMPLE_RATE, opts: SpeechOptions = {}): Region[] {
  const minSpeech = opts.minSpeechSeconds ?? 0.25;
  const mergeGap = opts.mergeGapSeconds ?? 0.6;
  const e = frameEnergies(samples, rate);
  if (e.length === 0) return [];
  const sorted = Float32Array.from(e).sort();
  const noise = percentile(sorted, 0.1), loud = percentile(sorted, 0.9);
  if (loud < 0.004) return [];
  const threshold = Math.max(0.006, noise + (loud - noise) * 0.2);
  const voiced = Array.from(e, v => v > threshold);

  // Runs of voiced frames, then join runs separated by a short pause and drop runs that are too short.
  const runs: { from: number; to: number }[] = [];
  for (let i = 0; i < voiced.length; i++) {
    if (!voiced[i]) continue;
    let j = i;
    while (j + 1 < voiced.length && voiced[j + 1]) j++;
    runs.push({ from: i, to: j });
    i = j;
  }
  const gapFrames = Math.round(mergeGap / FRAME_SECONDS), minFrames = Math.round(minSpeech / FRAME_SECONDS);
  const joined: { from: number; to: number }[] = [];
  for (const r of runs) {
    const last = joined[joined.length - 1];
    if (last && r.from - last.to <= gapFrames) last.to = r.to; else joined.push({ ...r });
  }
  const spoken = joined.filter(r => r.to - r.from + 1 >= minFrames);

  const total = samples.length / rate;
  const maxFrames = Math.floor(MAX_REGION_SECONDS / FRAME_SECONDS);
  const cut: { from: number; to: number }[] = [];
  const split = (from: number, to: number) => {
    if (to - from + 1 <= maxFrames) { cut.push({ from, to }); return; }
    // Quietest frame in the last quarter of the window that still fits.
    const lo = from + Math.floor(maxFrames * 0.75), hi = from + maxFrames;
    let at = hi;
    for (let f = lo; f <= hi; f++) if (e[f] < e[at]) at = f;
    cut.push({ from, to: at });
    split(at + 1, to);
  };
  spoken.forEach(r => split(r.from, r.to));

  return cut.map(r => ({
    start: Math.max(0, r.from * FRAME_SECONDS - PAD_SECONDS),
    end: Math.min(total, (r.to + 1) * FRAME_SECONDS + PAD_SECONDS),
  })).reduce<Region[]>((acc, r) => {
    // Padding can make neighbours touch; keep them separate so no region grows past a window.
    const last = acc[acc.length - 1];
    if (last && r.start < last.end) r = { start: last.end, end: Math.max(last.end, r.end) };
    if (r.end - r.start > 0.05) acc.push(r);
    return acc;
  }, []);
}
