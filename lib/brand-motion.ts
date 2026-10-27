// Small deterministic motion helpers for the animated scenes of popular names. Everything is a function of the frame
// number: no clocks, no randomness, so a preview, a render and a re-render look the same.

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const easeOut = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);
/** How far an action that starts at frame `start` and lasts `dur` frames has got (0..1). */
export const progress = (f: number, start: number, dur: number) => clamp01((f - start) / Math.max(1, dur));
/** Smooth 0..1 wave that repeats every `period` frames. */
export const wave = (f: number, period: number, phase = 0) => 0.5 + 0.5 * Math.sin((2 * Math.PI * f) / period + phase);

/** Heights (min..1) of an equalizer's bars at frame `f`; every bar moves at its own pace. */
export function barHeights(f: number, count: number, min = 0.2): number[] {
  return Array.from({ length: count }, (_, i) => min + (1 - min) * (0.5 + 0.5 * Math.sin(f / (3 + ((i * 7) % 5)) + i * 1.7)));
}

export type Point = { x: number; y: number };

/** Point on a curve with one control point (t 0..1) and the direction of travel in degrees. */
export function curvePoint(t: number, a: Point, c: Point, b: Point): Point & { angle: number } {
  const u = 1 - t;
  const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
  const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
  const dx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
  const dy = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

/**
 * Something that floats up and fades (a heart, a note): `i` of `count` share the loop of `life` frames, spread evenly
 * in time and across the width. x and y are 0..1 (y counted from the bottom), opacity rises then falls.
 */
export function floater(f: number, i: number, count: number, life = 70): { x: number; y: number; opacity: number; scale: number } {
  const age = (f + (i * life) / count) % life;
  const t = age / life;
  return { x: clamp01(0.12 + 0.76 * ((i * 0.38197) % 1) + 0.04 * Math.sin(age / 7 + i)), y: t, opacity: Math.sin(Math.PI * t), scale: 0.6 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.3)) };
}

/** Radius fraction (0..1) and opacity of ring `i` of an expanding pulse that repeats every `period` frames. */
export function ring(f: number, i: number, count: number, period = 54): { r: number; opacity: number } {
  const t = ((f + (i * period) / count) % period) / period;
  return { r: easeOut(t), opacity: 1 - t };
}
