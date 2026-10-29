// Sound effects made from nothing: plain maths on sample arrays (seeded noise, sine sweeps, a bell), so the result is identical on
// every device and can be tested without an audio device. A whole effects track is rendered to one mono WAV for the composition.
import { encodeWav } from "./audio";
import type { SfxEvent, SfxKind } from "./sfx";

export const SFX_RATE = 44100;

/** Small seeded generator (the same noise every time). */
function rng(seed: number) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; };
}

const norm = (x: Float32Array, peak: number) => {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i] / m) * peak;
  return x;
};

/** Noise through a band-pass filter whose centre sweeps up: air moving past. */
function whoosh(rate: number): Float32Array {
  const n = Math.round(rate * 0.5), out = new Float32Array(n), noise = rng(7);
  let low = 0, band = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const centre = 350 * Math.pow(11, Math.min(1, t / 0.36));                 // 350 Hz up to about 3.8 kHz
    const f = 2 * Math.sin(Math.PI * centre / rate), q = 0.55;
    const high = noise() - low - q * band;
    band += f * high; low += f * band;
    const attack = Math.sin(Math.min(1, t / 0.14) * Math.PI / 2) ** 2;
    out[i] = band * attack * Math.exp(-Math.max(0, t - 0.14) * 12) * Math.min(1, (0.5 - t) / 0.04);
  }
  return norm(out, 0.9);
}

/** A short bubble: a sine that drops in pitch. */
function pop(rate: number): Float32Array {
  const n = Math.round(rate * 0.16), out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    phase += 2 * Math.PI * (230 + 520 * Math.exp(-t * 28)) / rate;
    out[i] = Math.sin(phase) * Math.min(1, t / 0.004) * Math.exp(-t * 26);
  }
  return norm(out, 0.9);
}

/** A soft bell: three inharmonic partials with different decays. */
function ding(rate: number): Float32Array {
  const n = Math.round(rate * 1.1), out = new Float32Array(n);
  const partials: [number, number, number][] = [[1568, 1, 5], [3136, 0.45, 8], [4331, 0.25, 12]];
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v = 0;
    for (const [f, a, d] of partials) v += Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t * d);
    out[i] = v * Math.min(1, t / 0.002);
  }
  return norm(out, 0.85);
}

/** A low hit: a falling sine plus a very short click. */
function thud(rate: number): Float32Array {
  const n = Math.round(rate * 0.32), out = new Float32Array(n), noise = rng(11);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    phase += 2 * Math.PI * (48 + 70 * Math.exp(-t * 22)) / rate;
    out[i] = Math.sin(phase) * Math.exp(-t * 11) + noise() * 0.5 * Math.exp(-t * 90);
  }
  return norm(out, 0.95);
}

const SHAPES: Record<SfxKind, (rate: number) => Float32Array> = { whoosh, pop, ding, thud };

/** One effect, peak at `gain` (0..1). */
export function synthEffect(kind: SfxKind, gain = 1, rate = SFX_RATE): Float32Array {
  const x = SHAPES[kind](rate);
  const g = Math.min(1, Math.max(0, gain));
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

/** The whole track as mono samples, `totalFrames` long; overlapping effects add and a soft clip keeps the sum under 1. */
export function mixSfx(events: SfxEvent[], totalFrames: number, fps: number, rate = SFX_RATE): Float32Array {
  const out = new Float32Array(Math.max(1, Math.round((totalFrames / fps) * rate)));
  const cache = new Map<SfxKind, Float32Array>();
  for (const e of events) {
    let base = cache.get(e.kind);
    if (!base) { base = SHAPES[e.kind](rate); cache.set(e.kind, base); }
    const at = Math.round((e.frame / fps) * rate);
    for (let i = 0; i < base.length && at + i < out.length; i++) if (at + i >= 0) out[at + i] += base[i] * e.gain;
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]);
  return out;
}

/** WAV bytes of the track (mono, 16-bit). */
export function sfxWav(events: SfxEvent[], totalFrames: number, fps: number, rate = SFX_RATE): ArrayBuffer {
  return encodeWav([mixSfx(events, totalFrames, fps, rate)], rate);
}
