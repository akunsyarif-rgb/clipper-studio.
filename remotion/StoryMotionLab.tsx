import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Isolated visual prototype for script-led motion.
 * Uses frame-driven CSS 3D transforms so it does not add a WebGL dependency yet.
 * This is a visual proof-of-concept, not a replacement for ScriptVideo.
 */
type Beat = {
  text: string;
  kicker: string;
  mode: "question" | "steps" | "orbit" | "resolve";
  note: string;
};

const BEATS: Beat[] = [
  {
    text: "Jangan tunggu semangat datang.",
    kicker: "MULAI DARI SINI",
    mode: "question",
    note: "The idea arrives before the object: one floating focal point creates tension.",
  },
  {
    text: "Mulailah, meski langkahmu kecil.",
    kicker: "LANGKAH PERTAMA",
    mode: "steps",
    note: "A path of blocks rises in sequence to make progress visible.",
  },
  {
    text: "Disiplin membuatmu tetap bergerak.",
    kicker: "JAGA MOMENTUM",
    mode: "orbit",
    note: "Layered rings and a rotating core communicate sustained motion.",
  },
  {
    text: "Mulai sekarang.",
    kicker: "SATU TINDAKAN",
    mode: "resolve",
    note: "Scattered elements converge into one clear, memorable focal point.",
  },
];

const clamp = (value: number, from: number, to: number) =>
  interpolate(value, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

function FloatingCore({ frame, mode }: { frame: number; mode: Beat["mode"] }) {
  const enter = spring({ frame: frame - 4, fps: 30, config: { damping: 14, stiffness: 90, mass: 0.7 } });
  const rotate = interpolate(frame, [0, 90], [-22, 24]);
  const drift = Math.sin((frame / 90) * Math.PI * 2) * 18;
  const size = mode === "resolve" ? 250 : 310;
  return (
    <div
      data-visual="floating-core"
      style={{
        width: size,
        height: size,
        position: "relative",
        borderRadius: mode === "steps" ? 42 : "50%",
        background: "linear-gradient(135deg, #f7f3df 0%, #9adbc8 34%, #6d8df2 68%, #c2a0f5 100%)",
        boxShadow: "inset -22px -24px 44px #121d3b88, inset 12px 14px 28px #ffffffbb, 0 36px 100px #4c74e855",
        opacity: enter,
        transform: `perspective(900px) translate3d(0px, ${drift + (1 - enter) * 90}px, 0px) rotateX(${rotate}deg) rotateY(${-rotate * 1.35}deg) rotateZ(${rotate * 0.3}deg) scale(${0.72 + enter * 0.28})`,
        transformStyle: "preserve-3d",
      }}
    >
      <div style={{ position: "absolute", inset: "12%", border: "2px solid #ffffffa8", borderRadius: mode === "steps" ? 28 : "50%", transform: "translateZ(34px) rotate(22deg)" }} />
      <div style={{ position: "absolute", width: "35%", height: "35%", top: "14%", left: "17%", borderRadius: "50%", background: "#ffffff88", filter: "blur(18px)", transform: "translateZ(54px)" }} />
      {mode === "resolve" ? <div style={{ position: "absolute", inset: "32%", borderRadius: 24, background: "#fff8df", transform: "translateZ(82px) rotate(45deg)", boxShadow: "0 0 48px #fff8df99" }} /> : null}
    </div>
  );
}

function StepPath({ frame }: { frame: number }) {
  return (
    <div data-visual="step-path" style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 300, perspective: 900 }}>
      {[0, 1, 2, 3].map((step) => {
        const p = spring({ frame: frame - 8 - step * 9, fps: 30, config: { damping: 15, stiffness: 110, mass: 0.55 } });
        const height = [70, 120, 190, 260][step];
        return (
          <div key={step} style={{
            width: 92,
            height,
            borderRadius: "22px 22px 10px 10px",
            background: `linear-gradient(160deg, ${["#d5f5d6", "#a8e5d3", "#91b7f7", "#d2a7f5"][step]}, #293b66)`,
            border: "1px solid #ffffff77",
            boxShadow: "0 24px 42px #0005, inset 0 2px 0 #ffffff99",
            opacity: p,
            transform: `translateY(${(1 - p) * 110}px) rotateY(-22deg) rotateX(8deg) translateZ(${step * 10}px)`,
            transformStyle: "preserve-3d",
          }} />
        );
      })}
    </div>
  );
}

function OrbitSystem({ frame }: { frame: number }) {
  const p = clamp(frame, 0, 20);
  const rotation = interpolate(frame, [0, 90], [-38, 322]);
  return (
    <div data-visual="orbit-system" style={{ width: 440, height: 440, position: "relative", perspective: 900, opacity: p }}>
      {[0, 1, 2].map((ring) => (
        <div key={ring} style={{
          position: "absolute", inset: 42 + ring * 26,
          border: `2px solid ${["#b9d7ad99", "#80e2d0aa", "#f2d28c99"][ring]}`,
          borderRadius: "50%",
          transform: `rotateX(${62 + ring * 9}deg) rotateY(${rotation * (ring % 2 ? -0.45 : 0.65)}deg) rotateZ(${rotation * (ring + 1) * 0.22}deg)`,
          boxShadow: "0 0 28px #a3f1d522",
        }} />
      ))}
      <div style={{
        position: "absolute", width: 128, height: 128, left: 156, top: 156,
        borderRadius: 36, background: "linear-gradient(135deg, #fff1bd, #8bd9c1 48%, #8b9af5)",
        boxShadow: "0 0 65px #90dfd477, inset -12px -14px 22px #17284a77",
        transform: `translateZ(80px) rotateX(${rotation * 0.35}deg) rotateY(${rotation}deg) rotateZ(${rotation * 0.18}deg)`,
      }} />
      <div style={{ position: "absolute", width: 20, height: 20, left: 38, top: 76, borderRadius: "50%", background: "#f6ce78", boxShadow: "0 0 32px #f6ce78", transform: `translateZ(110px) rotateY(${rotation}deg)` }} />
    </div>
  );
}

export const StoryMotionLab: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneFrames = 90;
  const index = Math.min(BEATS.length - 1, Math.floor(frame / sceneFrames));
  const local = frame - index * sceneFrames;
  const beat = BEATS[index];
  const entrance = spring({ frame: local - 2, fps, config: { damping: 18, stiffness: 120, mass: 0.65 } });
  const exit = interpolate(local, [sceneFrames - 8, sceneFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(entrance, exit);
  const titleY = interpolate(entrance, [0, 1], [54, 0]);
  const accentWidth = interpolate(local, [4, 30], [0, 340], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const backgroundPosition = interpolate(frame, [0, 360], [0, 100]);

  return (
    <AbsoluteFill style={{
      overflow: "hidden",
      background: "radial-gradient(ellipse at 50% 36%, #243b48 0%, #101924 44%, #080c14 100%)",
      color: "#f7f5eb",
      fontFamily: "Arial, Helvetica, sans-serif",
    }}>
      <AbsoluteFill style={{ opacity: 0.14, backgroundImage: "linear-gradient(#8fd9c511 1px, transparent 1px), linear-gradient(90deg, #8fd9c511 1px, transparent 1px)", backgroundSize: "72px 72px", transform: `perspective(600px) rotateX(58deg) translateY(${backgroundPosition}px) scale(1.8)`, transformOrigin: "center 58%" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "space-between", padding: "112px 88px 92px", opacity }}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 23, letterSpacing: 5, color: "#b9d7ad", fontWeight: 700 }}>
          <span>STORY MOTION LAB</span><span>0{index + 1} / 04</span>
        </div>
        <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 62 }}>
          <div style={{ height: 480, width: "100%", display: "flex", justifyContent: "center", alignItems: "center", perspective: 1100 }}>
            {beat.mode === "steps" ? <StepPath frame={local} /> : beat.mode === "orbit" ? <OrbitSystem frame={local} /> : <FloatingCore frame={local} mode={beat.mode} />}
          </div>
          <div style={{ width: "100%", textAlign: "center", transform: `translateY(${titleY}px)` }}>
            <div style={{ fontSize: 24, letterSpacing: 8, color: "#b9d7ad", fontWeight: 700, marginBottom: 28 }}>{beat.kicker}</div>
            <div style={{ fontSize: beat.mode === "resolve" ? 94 : 78, lineHeight: 1.08, fontWeight: 800, letterSpacing: -2, maxWidth: 900, margin: "0 auto", textWrap: "balance" as never }}>{beat.text}</div>
            <div style={{ height: 4, width: accentWidth, maxWidth: "80%", background: "linear-gradient(90deg, #b9d7ad, #80e2d0, #f6ce78)", margin: "34px auto 0", borderRadius: 99 }} />
          </div>
        </div>
        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ height: 2, background: "#ffffff33", flex: 1, borderRadius: 99 }}><div style={{ height: "100%", width: `${((index + 1) / BEATS.length) * 100}%`, background: "#b9d7ad" }} /></div>
          <span style={{ fontSize: 20, color: "#c8d2d2" }}>SCRIPT → VISUAL</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
