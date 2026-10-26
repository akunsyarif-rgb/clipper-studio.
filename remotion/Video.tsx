import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";

const scenes = [
  { start: 0, duration: 120, kicker: "SEBUAH PENGINGAT", title: "JANGAN TUNGGU", subtitle: "SEMANGAT DATANG.", symbol: "◷" },
  { start: 120, duration: 150, kicker: "UBAH POLA", title: "MULAILAH", subtitle: "MESKI LANGKAHMU KECIL.", symbol: "↗" },
  { start: 270, duration: 180, kicker: "TETAP BERGERAK", title: "PILIH DISIPLIN", subtitle: "BUKAN SEKADAR MOTIVASI.", symbol: "✳" },
  { start: 450, duration: 225, kicker: "SATU LANGKAH HARI INI", title: "TERUS MAJU", subtitle: "PROGRES MENGALAHKAN SEMPURNA.", symbol: "✓" },
  { start: 675, duration: 225, kicker: "MULAI SEKARANG", title: "SATU LANGKAH.", subtitle: "ITU SUDAH BERARTI.", symbol: "→" },
];

const palette = { bg1: "#14132e", bg2: "#4d286f", accent: "#6cf4e7", text: "#ffffff" };

function Scene({ kicker, title, subtitle, symbol }: { kicker: string; title: string; subtitle: string; symbol: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 13, stiffness: 110, mass: 0.7 } });
  const opacity = interpolate(frame, [0, 8, 55, 72], [0, 1, 1, 0.9], { extrapolateRight: "clamp" });
  const drift = interpolate(frame, [0, 90], [28, -8], { extrapolateRight: "clamp" });
  const scale = interpolate(enter, [0, 1], [0.82, 1]);
  const symbolScale = spring({ frame: frame - 12, fps, config: { damping: 8, stiffness: 160 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: 92, color: palette.text, opacity, transform: `translateY(${drift}px)` }}>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 24, letterSpacing: 6, fontWeight: 700, color: palette.accent, marginBottom: 42 }}>{kicker}</div>
      <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: 105, lineHeight: 0.98, letterSpacing: -5, fontWeight: 900, transform: `scale(${scale})`, transformOrigin: "left center", textShadow: "0 8px 40px #0005" }}>{title}</div>
      <div style={{ height: 8, width: 125, background: palette.accent, marginTop: 40, marginBottom: 28, boxShadow: `0 0 24px ${palette.accent}` }} />
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 34, lineHeight: 1.3, fontWeight: 700, maxWidth: 800 }}>{subtitle}</div>
      <div style={{ marginTop: 58, width: 88, height: 88, borderRadius: 24, border: `2px solid ${palette.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 58, color: palette.accent, transform: `scale(${Math.max(0, symbolScale)}) rotate(${interpolate(frame, [0, 60], [-12, 0], { extrapolateRight: "clamp" })}deg)`, boxShadow: `0 0 35px ${palette.accent}25` }}>{symbol}</div>
    </AbsoluteFill>
  );
}

export const MotionVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const wash = interpolate(frame, [0, 180, 360, 540, 899], [0, 1, 0.72, 0.95, 0.4], { extrapolateRight: "clamp" });
  const progress = interpolate(frame, [0, 899], [0, 100], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(145deg, ${palette.bg1} 0%, ${palette.bg2} 100%)`, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 80% 20%, ${palette.accent}18 0%, transparent 36%)`, opacity: wash }} />
      <div style={{ position: "absolute", width: 700, height: 700, border: `1px solid ${palette.accent}45`, borderRadius: "50%", right: -380, top: 250, boxShadow: `0 0 100px ${palette.accent}12` }} />
      <div style={{ position: "absolute", left: 70, right: 70, top: 72, display: "flex", justifyContent: "space-between", color: `${palette.accent}cc`, font: "bold 18px monospace", letterSpacing: 3 }}><span>MOTION / 001</span><span>30 FPS</span></div>
      {scenes.map((scene) => <Sequence key={scene.start} from={scene.start} durationInFrames={scene.duration}><Scene kicker={scene.kicker} title={scene.title} subtitle={scene.subtitle} symbol={scene.symbol} /></Sequence>)}
      <div style={{ position: "absolute", bottom: 72, left: 70, right: 70, display: "flex", alignItems: "center", gap: 22, color: "#ffffffb8", font: "bold 17px monospace", letterSpacing: 3 }}><span>KEEP MOVING FORWARD</span><div style={{ height: 3, background: "#ffffff30", flex: 1 }}><div style={{ height: "100%", width: `${progress}%`, background: palette.accent }} /></div></div>
    </AbsoluteFill>
  );
};
