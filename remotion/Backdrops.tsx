// Aesthetic backgrounds that cost nothing to ship: soft moving colour fields from the palette, and a film-grain texture. Both are
// frame-driven (no timers, no randomness) and add no files and no dependency.
//
// They are written for what the browser MP4 renderer can draw (it paints the DOM itself): a radial gradient only when it is
// centred in its own box (so a glow is a positioned square with a centred gradient, not "circle at 25% 22%"), no stacked
// background images, no background url(); noise is a <canvas>. What the preview shows is what the file contains.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { HEIGHT, WIDTH } from "../lib/script";
import type { Colors } from "./Families";

/** A soft round glow centred at (cx, cy) px with the given radius; `color` is a 6-digit hex and `alpha` a 2-digit hex. */
export function Glow({ cx, cy, radius, color, alpha, opacity = 1 }: { cx: number; cy: number; radius: number; color: string; alpha: string; opacity?: number }) {
  const size = radius * 2;
  // Centred circle gradient: its radius reaches the box corner (size/2·√2), so the fade ends at radius / (size/2·√2) of it.
  const end = Math.round((100 / Math.SQRT2));
  return <div aria-hidden="true" style={{ position: "absolute", left: Math.round(cx - radius), top: Math.round(cy - radius), width: size, height: size, opacity, background: `radial-gradient(circle, ${color}${alpha} 0%, ${color}00 ${end}%)`, pointerEvents: "none" }} />;
}

/** Three slow colour fields drifting over the palette gradient ("mesh"). */
export function MeshBackdrop({ colors }: { colors: Colors }) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const at = (cx: number, cy: number, rx: number, ry: number, speed: number, phase: number) => ({
    x: (cx + Math.cos(t * speed + phase) * rx) / 100 * WIDTH,
    y: (cy + Math.sin(t * speed * 0.8 + phase) * ry) / 100 * HEIGHT,
  });
  const a = at(25, 22, 14, 10, 0.35, 0), b = at(78, 40, 12, 14, 0.28, 2.1), c = at(48, 80, 18, 8, 0.22, 4.2);
  return (
    <AbsoluteFill data-backdrop="mesh" aria-hidden="true">
      <Glow cx={a.x} cy={a.y} radius={760} color={colors.accent} alpha="55" />
      <Glow cx={b.x} cy={b.y} radius={820} color={colors.text} alpha="26" />
      <Glow cx={c.x} cy={c.y} radius={900} color={colors.accent} alpha="40" />
    </AbsoluteFill>
  );
}

// Film grain: a canvas, because the browser MP4 renderer draws <canvas> but not CSS background images. The noise is made once with
// a seeded generator (the same grain on every machine), at half size and drawn twice as large (soft, like real grain), and shifted
// a few pixels every other frame so it "boils". The visible canvas is painted in a ref callback, i.e. while the frame is committed.
const NOISE_W = 270, NOISE_H = 480;
let noise: HTMLCanvasElement | null = null;
function noiseSource(): HTMLCanvasElement | null {
  if (noise) return noise;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = NOISE_W; canvas.height = NOISE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(NOISE_W, NOISE_H);
  let a = 0x9e3779b9;
  const rand = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand() < 0.5 ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(rand() * 200);
  }
  ctx.putImageData(img, 0, 0);
  noise = canvas;
  return noise;
}

export function GrainOverlay({ strength = 0.3 }: { strength?: number }) {
  const frame = useCurrentFrame();
  const step = Math.floor(frame / 2);
  const dx = (step * 37) % NOISE_W, dy = (step * 91) % NOISE_H;
  const paint = (el: HTMLCanvasElement | null) => {
    const src = noiseSource();
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !src) return;
    ctx.clearRect(0, 0, el.width, el.height);
    for (const ox of [dx - NOISE_W, dx]) for (const oy of [dy - NOISE_H, dy]) ctx.drawImage(src, ox, oy);
  };
  return (
    <AbsoluteFill data-backdrop="grain" aria-hidden="true" style={{ pointerEvents: "none" }}>
      <canvas ref={paint} width={NOISE_W} height={NOISE_H} style={{ width: WIDTH, height: HEIGHT, opacity: strength, display: "block" }} />
    </AbsoluteFill>
  );
}
