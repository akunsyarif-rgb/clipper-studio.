// Editing profiles for a source video in the motion studio: "standard" (as before), "music" (rhythm) and "comedy" (timing).
// Pure analysis and planning: the audio comes in as samples, the transcript as words, the picture as small luma grids, and the
// result is a list of reviewable edits on the file's own timeline. Edits only change the picture (zoom, a held frame, a small
// replay, a flash) and the captions' emphasis: the original audio and the length of the video are never changed, so a wrong
// or failed analysis can at worst add an effect the creator switches off, never cut or shift the video.
import type { Word } from "./transcript";

export type EditProfile = "standard" | "music" | "comedy";
export const EDIT_PROFILES: { id: EditProfile; label: string; hint: string }[] = [
  { id: "standard", label: "Standar", hint: "seperti biasa: subtitle dan animasi sesuai naskah" },
  { id: "music", label: "Musik / ritme", hint: "efek mengikuti ketukan dan energi lagu; audio asli utuh" },
  { id: "comedy", label: "Komedi", hint: "menjaga jeda dan timing; zoom dan penekanan di punchline" },
];

/** punch = zoom in and hold (comedy); pulse = a short zoom pulse on a beat (music); freeze = hold one frame for a moment;
 *  replay = the punchline again in a small window during the reaction; flash = a white flash on a big energy rise. */
export type EditKind = "punch" | "pulse" | "freeze" | "replay" | "flash";
export const EDIT_LABELS: Record<EditKind, string> = { punch: "Zoom punchline", pulse: "Denyut ketukan", freeze: "Bekukan gambar", replay: "Ulang punchline", flash: "Kilat energi" };

export type Edit = {
  id: string;
  kind: EditKind;
  /** Seconds on the source file's own timeline. */
  at: number;
  duration: number;
  /** Zoom factor for punch and pulse. */
  scale?: number;
  /** replay only: where on the file the replayed part starts. */
  from?: number;
  reason: string;
  on: boolean;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---- audio analysis -------------------------------------------------------------------------------------------------

export const ENV_HOP = 256;

/**
 * Onset strength per hop: the rise in log energy of the signal and of its high-passed copy (hits and attacks), half-wave
 * rectified. At 16 kHz with a hop of 256 samples this is 62.5 values per second.
 */
export function onsetEnvelope(samples: Float32Array, hop = ENV_HOP): Float32Array {
  const n = Math.floor(samples.length / hop);
  const out = new Float32Array(n);
  let prevLow = 0, prevHigh = 0, last = 0;
  for (let i = 0; i < n; i++) {
    let low = 0, high = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) {
      const x = samples[j], d = x - last;
      last = x;
      low += x * x; high += d * d;
    }
    const l = Math.log1p(1000 * low / hop), h = Math.log1p(1000 * high / hop);
    // The first hop has nothing before it: its energy is not an onset.
    out[i] = i === 0 ? 0 : Math.max(0, l - prevLow) + Math.max(0, h - prevHigh);
    prevLow = l; prevHigh = h;
  }
  return out;
}

export type Tempo = { bpm: number; confidence: number; periodHops: number };

/** Tempo from the autocorrelation of the onset envelope, between 70 and 180 BPM, slightly preferring 90-140. */
export function estimateTempo(env: Float32Array, envRate: number): Tempo {
  const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, env.length);
  const x = Float32Array.from(env, v => v - mean);
  const minLag = Math.floor(envRate * 60 / 180), maxLag = Math.ceil(envRate * 60 / 70);
  let zero = 0;
  for (let i = 0; i < x.length; i++) zero += x[i] * x[i];
  if (zero <= 1e-9 || x.length < maxLag * 4) return { bpm: 0, confidence: 0, periodHops: 0 };
  let best = 0, bestLag = 0, sum = 0, count = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = lag; i < x.length; i++) acc += x[i] * x[i - lag];
    const r = acc / zero;
    const bpm = envRate * 60 / lag;
    const weight = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115), 2) / 0.35);
    sum += r; count++;
    if (r * weight > best) { best = r * weight; bestLag = lag; }
  }
  if (!bestLag) return { bpm: 0, confidence: 0, periodHops: 0 };
  // Refine the period to a fraction of a hop with the neighbouring lags.
  const ac = (lag: number) => { let a = 0; for (let i = lag; i < x.length; i++) a += x[i] * x[i - lag]; return a / zero; };
  const y0 = ac(bestLag - 1), y1 = ac(bestLag), y2 = ac(bestLag + 1);
  const denom = y0 - 2 * y1 + y2;
  const period = bestLag + (Math.abs(denom) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / denom)) : 0);
  const raw = y1, floor = sum / Math.max(1, count);
  const confidence = Math.max(0, Math.min(1, (raw - Math.max(0, floor)) / 0.35));
  return { bpm: Math.round(envRate * 60 / period * 10) / 10, confidence: Math.round(confidence * 100) / 100, periodHops: period };
}

/** Beat times (seconds): the phase whose grid collects the most onset strength, then every period. Downbeats: every fourth beat, phase likewise. */
export function beatGrid(env: Float32Array, envRate: number, periodHops: number): { beats: number[]; downbeats: number[] } {
  if (!(periodHops > 0) || env.length < periodHops * 2) return { beats: [], downbeats: [] };
  let bestPhase = 0, bestSum = -1;
  for (let p = 0; p < periodHops; p += 0.5) {
    let s = 0;
    for (let t = p; t < env.length; t += periodHops) s += env[Math.round(t)] ?? 0;
    if (s > bestSum) { bestSum = s; bestPhase = p; }
  }
  // Follow the music: each beat is looked for near where the last one predicts it, so a tempo that is slightly off (or a
  // drummer who drifts) does not slide the grid away from the hits. The grid's phase is a compromise over the whole song, so
  // the beats are followed forwards and backwards, and the pass that lands on more onset strength is kept.
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const reach = Math.max(1, Math.round(periodHops * 0.12));
  const near = (t: number) => {
    let at = Math.round(t), peak = env[at] ?? 0;
    for (let h = Math.max(0, Math.round(t) - reach); h <= Math.min(env.length - 1, Math.round(t) + reach); h++) if (env[h] > peak) { peak = env[h]; at = h; }
    return peak > mean * 1.5 ? at : t;
  };
  const forward: number[] = [];
  for (let t = bestPhase; t < env.length; ) { const hit = near(t); forward.push(hit); t = hit + periodHops; }
  const backward: number[] = [];
  for (let t = forward[forward.length - 1]; t >= 0; ) { const hit = near(t); backward.unshift(hit); t = hit - periodHops; }
  const strength = (hs: number[]) => hs.reduce((a, h) => a + (env[Math.round(h)] ?? 0), 0) / Math.max(1, hs.length);
  const beats = (strength(backward) > strength(forward) ? backward : forward).map(h => r3(h / envRate));
  let bestBar = 0, barSum = -1;
  for (let k = 0; k < 4; k++) {
    let s = 0;
    for (let i = k; i < beats.length; i += 4) s += env[Math.round(beats[i] * envRate)] ?? 0;
    if (s > barSum) { barSum = s; bestBar = k; }
  }
  return { beats, downbeats: beats.filter((_, i) => i % 4 === bestBar) };
}

/**
 * How clearly the onsets follow a grid of this period: the onset strength collected by the best phase against the average over
 * all phases. Clicks or drums give a high ratio; noise or plain speech stays close to 1. Mapped to 0..1.
 */
export function gridConfidence(env: Float32Array, periodHops: number): number {
  if (!(periodHops > 0) || env.length < periodHops * 8) return 0;
  const sums: number[] = [];
  for (let p = 0; p < periodHops; p += 1) {
    let s = 0;
    for (let t = p; t < env.length; t += periodHops) s += env[Math.round(t)] ?? 0;
    sums.push(s);
  }
  const mean = sums.reduce((a, b) => a + b, 0) / sums.length, best = Math.max(...sums);
  const ratio = best / Math.max(1e-9, mean);
  return Math.round(Math.max(0, Math.min(1, (ratio - 1.6) / 1.4)) * 100) / 100;
}

/** Loudness (dB, relative to full scale) per window of `win` seconds. */
export function energyCurve(samples: Float32Array, rate: number, win = 0.5): { t: number; db: number }[] {
  const n = Math.max(1, Math.round(rate * win)), out: { t: number; db: number }[] = [];
  for (let i = 0; i + n <= samples.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += samples[j] * samples[j];
    out.push({ t: r3(i / rate), db: Math.round(10 * Math.log10(s / n + 1e-10) * 10) / 10 });
  }
  return out;
}

/** Moments where the loudness rises clearly and stays up (a drop, a chorus coming in): at least `rise` dB over the 2 s before. */
export function energyRises(curve: { t: number; db: number }[], win = 0.5, rise = 6, minGap = 8): number[] {
  const k = Math.max(1, Math.round(2 / win)), out: number[] = [];
  for (let i = k; i + k <= curve.length; i++) {
    const before = curve.slice(i - k, i).reduce((a, b) => a + b.db, 0) / k;
    const after = curve.slice(i, i + k).reduce((a, b) => a + b.db, 0) / k;
    if (after - before >= rise && after > -40 && (!out.length || curve[i].t - out[out.length - 1] >= minGap)) out.push(curve[i].t);
  }
  return out;
}

export type MusicAnalysis = {
  ok: boolean;
  /** Why no rhythm edits are planned (shown to the creator). */
  reason?: string;
  bpm: number;
  confidence: number;
  beats: number[];
  downbeats: number[];
  energy: { t: number; db: number }[];
  rises: number[];
};

export const MIN_BEAT_CONFIDENCE = 0.3;

/** Tempo, beats, loudness and energy rises of the audio (16 kHz mono samples starting at file second `offset`). */
export function analyzeMusic(samples: Float32Array, rate: number, offset = 0): MusicAnalysis {
  const energy = energyCurve(samples, rate).map(e => ({ ...e, t: r3(e.t + offset) }));
  const empty = { bpm: 0, confidence: 0, beats: [], downbeats: [], energy, rises: [] };
  if (samples.length < rate * 6) return { ok: false, reason: "Audio terlalu pendek untuk membaca ketukan (minimal 6 detik).", ...empty };
  const loud = energy.filter(e => e.db > -45).length / Math.max(1, energy.length);
  if (loud < 0.3) return { ok: false, reason: "Audionya hampir senyap, jadi ketukan tidak bisa dibaca.", ...empty };
  const envRate = rate / ENV_HOP;
  const env = onsetEnvelope(samples);
  const tempo = estimateTempo(env, envRate);
  const rises = energyRises(energy);
  const grid = beatGrid(env, envRate, tempo.periodHops);
  // Both the autocorrelation and the grid must agree: noise can have a chance peak in one of them, not in both.
  const confidence = Math.min(tempo.confidence, gridConfidence(env, tempo.periodHops));
  if (confidence < MIN_BEAT_CONFIDENCE) return { ok: false, reason: `Ketukan tidak terbaca dengan yakin (keyakinan ${confidence}). Tidak ada efek ketukan yang diterapkan.`, ...empty, bpm: tempo.bpm, confidence, rises };
  return { ok: true, bpm: tempo.bpm, confidence, beats: grid.beats.map(t => r3(t + offset)), downbeats: grid.downbeats.map(t => r3(t + offset)), energy, rises };
}

/** The nearest beat to `t` (or `t` itself when there is no beat within `max` seconds). */
export function snapToBeat(t: number, beats: number[], max = 0.4): number {
  let best = t, dist = Infinity;
  for (const b of beats) { const d = Math.abs(b - t); if (d < dist) { dist = d; best = b; } }
  return dist <= max ? best : t;
}

/**
 * The loudest stretch of `length` seconds inside [from, to], starting on a downbeat and ending on the beat nearest to its end:
 * a musical moment to keep. Null when the range is shorter than the moment.
 */
export function bestMusicalMoment(a: MusicAnalysis, length: number, from: number, to: number): { start: number; end: number } | null {
  if (to - from < length) return null;
  const starts = (a.downbeats.length ? a.downbeats : a.energy.map(e => e.t)).filter(t => t >= from && t + length <= to + 0.01);
  if (!starts.length) return null;
  let best = starts[0], bestDb = -Infinity;
  for (const s of starts) {
    const win = a.energy.filter(e => e.t >= s && e.t < s + length);
    const db = win.reduce((x, e) => x + e.db, 0) / Math.max(1, win.length);
    if (db > bestDb + 0.05) { bestDb = db; best = s; }
  }
  const end = Math.min(to, snapToBeat(best + length, a.beats, 0.3));
  return { start: r3(best), end: r3(end) };
}

// ---- picture: scene changes ---------------------------------------------------------------------------------------------

/**
 * Cuts in the footage from small luma grids sampled at `times`: a frame that differs from the one before by much more than the
 * usual frame-to-frame change (and by at least 18 of 255 on average) is a new shot.
 */
export function sceneCuts(frames: Uint8ClampedArray[], times: number[]): number[] {
  const diffs: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    let s = 0;
    for (let j = 0; j < a.length; j++) s += Math.abs(a[j] - b[j]);
    diffs.push(s / Math.max(1, a.length));
  }
  const sorted = diffs.slice(1).sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const out: number[] = [];
  for (let i = 1; i < diffs.length; i++) if (diffs[i] >= Math.max(18, median * 3)) out.push(r3(times[i]));
  return out;
}

// ---- comedy: pauses, setups, punchlines, reactions -----------------------------------------------------------------------

/** Words that often turn a sentence into a punchline (Indonesian and English). */
const TWIST = /\b(ternyata|padahal|malah|eh|lho|loh|kok|emang|katanya|tau-?tau|tiba-?tiba|akhirnya|actually|turns out|instead|apparently|plot twist)\b/i;

export type Punchline = {
  /** The punchline's first and last spoken second (file time). */
  start: number;
  end: number;
  text: string;
  /** The silence (or laughter) after it, kept as it is. */
  pause: number;
  /** The loud non-speech sound in that pause (laughter, a reaction), when the audio was analysed. */
  reaction: boolean;
  score: number;
  why: string[];
};

/**
 * Punchlines from word timing: a phrase followed by a pause of at least `minPause` seconds, scored by the pause, by a loud
 * reaction during it (when the loudness is known), by a twist word, and by a question just before it (a setup). The pauses
 * themselves are never shortened: they are the timing.
 */
export function findPunchlines(words: Word[], o: { energy?: { t: number; db: number }[]; minPause?: number; max?: number; minGap?: number } = {}): Punchline[] {
  const minPause = o.minPause ?? 0.6, max = o.max ?? 6, minGap = o.minGap ?? 6;
  const ws = [...words].filter(w => w.text.trim()).sort((a, b) => a.start - b.start);
  if (ws.length < 3) return [];
  const floor = o.energy && o.energy.length ? [...o.energy].map(e => e.db).sort((a, b) => a - b)[Math.floor(o.energy.length * 0.5)] : null;
  const found: Punchline[] = [];
  let phraseStart = 0;
  for (let i = 0; i < ws.length; i++) {
    const gap = i + 1 < ws.length ? ws[i + 1].start - ws[i].end : Infinity;
    const sentenceEnd = /[.!?…]$/.test(ws[i].text.trim());
    if (gap < 0.35 && !sentenceEnd) continue;
    const phrase = ws.slice(phraseStart, i + 1);
    const prev = phraseStart > 0 ? ws.slice(Math.max(0, phraseStart - 12), phraseStart) : [];
    phraseStart = i + 1;
    // The last phrase has no known pause after it (the clip may simply end there), so it is not a punchline by timing.
    if (!Number.isFinite(gap) || gap < minPause) continue;
    const pause = gap;
    const text = phrase.map(w => w.text).join(" ");
    const why: string[] = [`jeda ${pause.toFixed(1)} dtk sesudahnya`];
    let score = Math.min(1, (pause - minPause) / 1.6) * 0.45;
    let reaction = false;
    if (floor !== null && o.energy) {
      const during = o.energy.filter(e => e.t >= ws[i].end + 0.1 && e.t < ws[i].end + pause - 0.1);
      if (during.length && during.some(e => e.db >= floor + 3)) { reaction = true; score += 0.3; why.push("ada suara reaksi (tawa) di jedanya"); }
    }
    if (TWIST.test(text)) { score += 0.2; why.push("ada kata pembalik (mis. ternyata/padahal/malah)"); }
    if (prev.length && /\?$/.test(prev[prev.length - 1].text.trim())) { score += 0.15; why.push("didahului pertanyaan (setup)"); }
    if (phrase.length <= 10) score += 0.05;
    found.push({ start: r3(phrase[0].start), end: r3(ws[i].end), text, pause: r3(pause), reaction, score: Math.round(score * 100) / 100, why });
  }
  const strong = found.filter(p => p.score >= 0.25).sort((a, b) => b.score - a.score);
  const kept: Punchline[] = [];
  for (const p of strong) if (kept.length < max && kept.every(k => Math.abs(k.end - p.end) >= minGap)) kept.push(p);
  return kept.sort((a, b) => a.start - b.start);
}

// ---- plans ------------------------------------------------------------------------------------------------------------

export type MusicOptions = { pulse: "off" | "subtle" | "strong"; flash: boolean };
export type ComedyOptions = { punch: boolean; freeze: boolean; replay: boolean };
export const DEFAULT_MUSIC: MusicOptions = { pulse: "subtle", flash: true };
export const DEFAULT_COMEDY: ComedyOptions = { punch: true, freeze: false, replay: false };

/**
 * Rhythm edits inside [from, to]: a short zoom pulse on downbeats in the louder half of the song (at most one every two bars,
 * none within 0.3 s of a cut in the footage), and a flash on a clear energy rise, moved onto the nearest downbeat. Nothing at all
 * when the beat was not read with confidence.
 */
export function planMusic(a: MusicAnalysis, from: number, to: number, o: MusicOptions = DEFAULT_MUSIC, cuts: number[] = []): Edit[] {
  if (!a.ok) return [];
  const edits: Edit[] = [];
  if (o.pulse !== "off" && a.downbeats.length) {
    const inside = a.energy.filter(e => e.t >= from && e.t < to).map(e => e.db).sort((x, y) => x - y);
    const loud = inside[Math.floor(inside.length * 0.5)] ?? -Infinity;
    const dbAt = (t: number) => a.energy.reduce((best, e) => (Math.abs(e.t - t) < Math.abs(best.t - t) ? e : best), a.energy[0])?.db ?? -Infinity;
    let last = -Infinity;
    const minGap = (60 / Math.max(1, a.bpm)) * 8 - 0.05;
    for (const d of a.downbeats) {
      if (d < from + 0.5 || d > to - 0.5 || d - last < minGap) continue;
      if (dbAt(d) < loud || cuts.some(c => Math.abs(c - d) < 0.3)) continue;
      edits.push({ id: `pulse-${d}`, kind: "pulse", at: d, duration: 0.35, scale: o.pulse === "strong" ? 1.08 : 1.04, reason: `ketukan utama di bagian yang keras (${a.bpm} BPM)`, on: true });
      last = d;
    }
  }
  if (o.flash) for (const r of a.rises) {
    const at = snapToBeat(r, a.downbeats.length ? a.downbeats : a.beats, 1);
    if (at < from + 0.5 || at > to - 0.5) continue;
    edits.push({ id: `flash-${at}`, kind: "flash", at, duration: 0.2, reason: "energi lagu naik jelas di sini", on: true });
  }
  return edits.sort((x, y) => x.at - y.at);
}

/**
 * Comedy edits for each punchline inside [from, to]: a punch-in that starts on the punchline's last word and holds through the
 * reaction (eased in and out), optionally a short freeze at the end of the punchline and a small replay of it during a long
 * enough reaction. The pause itself stays exactly as it was.
 */
export function planComedy(punches: Punchline[], from: number, to: number, o: ComedyOptions = DEFAULT_COMEDY, words: Word[] = []): Edit[] {
  const edits: Edit[] = [];
  for (const p of punches) {
    if (p.end < from || p.start > to) continue;
    const last = [...words].reverse().find(w => w.end <= p.end + 0.01 && w.start >= p.start - 0.01);
    const hit = last ? last.start : Math.max(p.start, p.end - 0.4);
    const hold = Math.min(2.5, Math.max(0.8, p.pause));
    if (o.punch) edits.push({ id: `punch-${hit}`, kind: "punch", at: r3(hit), duration: r3(Math.min(to - hit, p.end - hit + hold)), scale: 1.18, reason: `punchline: "${p.text.slice(0, 60)}" · ${p.why.join(", ")}`, on: true });
    if (o.freeze && p.end + 0.5 <= to) edits.push({ id: `freeze-${p.end}`, kind: "freeze", at: p.end, duration: 0.5, reason: "jeda dramatis di akhir punchline (suara tetap jalan)", on: true });
    if (o.replay && p.pause >= 1.2 && p.end + 0.2 + Math.min(2.5, p.end - p.start) <= to) {
      const len = Math.min(2.5, p.end - p.start, p.pause - 0.2);
      edits.push({ id: `replay-${p.end}`, kind: "replay", at: r3(p.end + 0.2), duration: r3(len), from: r3(p.end - len), reason: "ulangan kecil punchline selama reaksi", on: true });
    }
  }
  return edits.filter(e => e.duration > 0.1).sort((x, y) => x.at - y.at);
}

/** The punchline phrases, as caption emphasis ranges (file time). */
export const emphasisRanges = (punches: Punchline[]) => punches.map(p => ({ from: p.start, to: p.end }));

/** A suggestion only (never applied by itself): which profile the material looks like. */
export function suggestProfile(i: { beatConfidence?: number; wordsPerMinute?: number; punchlines?: number }): EditProfile | null {
  if ((i.beatConfidence ?? 0) >= 0.5 && (i.wordsPerMinute ?? 0) < 60) return "music";
  if ((i.punchlines ?? 0) >= 2 && (i.wordsPerMinute ?? 0) >= 60) return "comedy";
  return null;
}

// ---- edits on the output timeline ---------------------------------------------------------------------------------------

export type RenderEdit = { kind: EditKind; at: number; duration: number; scale?: number; from?: number };

/** The switched-on edits that fall inside the trim, moved onto the output timeline (0 = the trim's start); `from` stays file time. */
export function toRenderEdits(edits: Edit[], trimStart: number, length: number): RenderEdit[] {
  return edits.filter(e => e.on && e.at >= trimStart - 0.001 && e.at < trimStart + length).map(e => ({
    kind: e.kind, at: r3(e.at - trimStart), duration: r3(Math.min(e.duration, trimStart + length - e.at)),
    ...(e.scale ? { scale: e.scale } : {}), ...(e.from !== undefined ? { from: e.from } : {}),
  })).filter(e => e.duration > 0.05);
}

/** Zoom of the base video at second `t` of the output: punch-ins ease in over 0.15 s and out over 0.25 s; pulses jump and settle. */
export function zoomAt(edits: RenderEdit[], t: number): number {
  let z = 1;
  for (const e of edits) {
    if (t < e.at || t > e.at + e.duration) continue;
    const s = e.scale ?? 1, k = t - e.at, left = e.at + e.duration - t;
    if (e.kind === "punch") z = Math.max(z, 1 + (s - 1) * Math.min(1, k / 0.15, left / 0.25));
    if (e.kind === "pulse") z = Math.max(z, 1 + (s - 1) * Math.min(1, k / 0.04) * Math.max(0, 1 - Math.max(0, k - 0.04) / Math.max(0.05, e.duration - 0.04)));
  }
  return Math.round(z * 10000) / 10000;
}

export function isEdit(x: unknown): x is Edit {
  const e = x as Partial<Edit> | null;
  return !!e && typeof e.id === "string" && ["punch", "pulse", "freeze", "replay", "flash"].includes(e.kind as string)
    && typeof e.at === "number" && Number.isFinite(e.at) && e.at >= 0 && typeof e.duration === "number" && e.duration > 0 && e.duration <= 10
    && (e.scale === undefined || (typeof e.scale === "number" && e.scale >= 1 && e.scale <= 1.5)) && (e.from === undefined || (typeof e.from === "number" && e.from >= 0))
    && typeof e.reason === "string" && typeof e.on === "boolean";
}
