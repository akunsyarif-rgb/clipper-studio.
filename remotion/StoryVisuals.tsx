// The Story Motion Lab's four objects as reusable, palette-aware accents. Frame-driven CSS 3D (spring/interpolate only):
// no timers, no randomness, no WebGL. They carry no text, so nothing is added to the narration on screen.
import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { StoryVisualKind } from "../lib/story-visual";

export type Tone = { accent: string; text: string; bg1: string; bg2: string };

const ease = (v: number, from: number, to: number) => interpolate(v, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
/** Never fully invisible: no frame of a scene starts empty. */
const floor = (v: number) => Math.max(0.25, v);

/** Floating focal point: tilts and drifts; "converge" is the smaller, finished version with a bright core. */
function Orb({ size, tone, frame, converge }: { size: number; tone: Tone; frame: number; converge: boolean }) {
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 90, mass: 0.7 } });
  const rotate = interpolate(frame, [0, 90], [-22, 24], { extrapolateRight: "extend" });
  const drift = Math.sin((frame / 90) * Math.PI * 2) * (size * 0.06);
  const s = converge ? size * 0.82 : size;
  return (
    <div data-visual="story-orb" style={{
      width: s, height: s, position: "relative", borderRadius: "50%",
      background: `linear-gradient(135deg, ${tone.text} 0%, ${tone.accent} 55%, ${tone.bg2} 100%)`,
      boxShadow: `inset -${s * 0.07}px -${s * 0.08}px ${s * 0.14}px ${tone.bg1}88, inset ${s * 0.04}px ${s * 0.05}px ${s * 0.09}px #ffffffaa, 0 ${s * 0.12}px ${s * 0.32}px ${tone.accent}55`,
      opacity: floor(enter),
      transform: `perspective(900px) translate3d(0px, ${drift + (1 - enter) * 70}px, 0px) rotateX(${rotate}deg) rotateY(${-rotate * 1.35}deg) rotateZ(${rotate * 0.3}deg) scale(${0.72 + enter * 0.28})`,
      transformStyle: "preserve-3d",
    }}>
      <div style={{ position: "absolute", inset: "12%", border: "2px solid #ffffffa8", borderRadius: "50%", transform: "translateZ(34px) rotate(22deg)" }} />
      <div style={{ position: "absolute", width: "35%", height: "35%", top: "14%", left: "17%", borderRadius: "50%", background: "#ffffff88", filter: "blur(14px)", transform: "translateZ(54px)" }} />
      {converge ? <div style={{ position: "absolute", inset: "32%", borderRadius: s * 0.1, background: "#fff8df", transform: "translateZ(82px) rotate(45deg)", boxShadow: "0 0 40px #fff8df99" }} /> : null}
    </div>
  );
}

/** Four blocks rising one after another: progress made visible. */
function Steps({ size, tone, frame }: { size: number; tone: Tone; frame: number }) {
  const { fps } = useVideoConfig();
  const unit = size / 330;
  return (
    <div data-visual="story-steps" style={{ display: "flex", alignItems: "flex-end", gap: 16 * unit, height: size, perspective: 900 }}>
      {[0, 1, 2, 3].map(step => {
        const p = spring({ frame: frame - 8 - step * 9, fps, config: { damping: 15, stiffness: 110, mass: 0.55 } });
        const height = [0.27, 0.46, 0.72, 1][step] * size;
        return (
          <div key={step} style={{
            width: 84 * unit, height, borderRadius: `${20 * unit}px ${20 * unit}px ${9 * unit}px ${9 * unit}px`,
            background: `linear-gradient(160deg, ${tone.accent}${["66", "99", "cc", "ff"][step]}, ${tone.bg2})`,
            border: `1px solid ${tone.text}55`, boxShadow: `0 ${20 * unit}px ${36 * unit}px #0005, inset 0 2px 0 #ffffff66`,
            opacity: floor(p), transform: `translateY(${(1 - p) * 100 * unit}px) rotateY(-22deg) rotateX(8deg) translateZ(${step * 10}px)`, transformStyle: "preserve-3d",
          }} />
        );
      })}
    </div>
  );
}

/** Layered rings around a rotating core: sustained motion. */
function Orbit({ size, tone, frame }: { size: number; tone: Tone; frame: number }) {
  const p = ease(frame, 0, 20);
  const rotation = interpolate(frame, [0, 90], [-38, 322], { extrapolateRight: "extend" });
  const k = size / 440;
  return (
    <div data-visual="story-orbit" style={{ width: size, height: size, position: "relative", perspective: 900, opacity: floor(p) }}>
      {[0, 1, 2].map(ring => (
        <div key={ring} style={{
          position: "absolute", inset: (42 + ring * 26) * k, border: `2px solid ${tone.accent}${["99", "bb", "77"][ring]}`, borderRadius: "50%",
          transform: `rotateX(${62 + ring * 9}deg) rotateY(${rotation * (ring % 2 ? -0.45 : 0.65)}deg) rotateZ(${rotation * (ring + 1) * 0.22}deg)`,
          boxShadow: `0 0 ${28 * k}px ${tone.accent}22`,
        }} />
      ))}
      <div style={{
        position: "absolute", width: 128 * k, height: 128 * k, left: 156 * k, top: 156 * k, borderRadius: 36 * k,
        background: `linear-gradient(135deg, ${tone.text}, ${tone.accent} 60%, ${tone.bg2})`, boxShadow: `0 0 ${65 * k}px ${tone.accent}77, inset -12px -14px 22px ${tone.bg1}77`,
        transform: `translateZ(80px) rotateX(${rotation * 0.35}deg) rotateY(${rotation}deg) rotateZ(${rotation * 0.18}deg)`,
      }} />
      <div style={{ position: "absolute", width: 20 * k, height: 20 * k, left: 38 * k, top: 76 * k, borderRadius: "50%", background: tone.accent, boxShadow: `0 0 ${32 * k}px ${tone.accent}`, transform: `translateZ(110px) rotateY(${rotation}deg)` }} />
    </div>
  );
}

/** One accent object, `size` px tall at most. Frame is the scene's own frame (these live inside a Sequence). */
export function StoryVisual({ kind, size, tone }: { kind: StoryVisualKind; size: number; tone: Tone }) {
  const frame = useCurrentFrame();
  if (kind === "steps") return <Steps size={size} tone={tone} frame={frame} />;
  if (kind === "orbit") return <Orbit size={size} tone={tone} frame={frame} />;
  return <Orb size={size} tone={tone} frame={frame} converge={kind === "converge"} />;
}
