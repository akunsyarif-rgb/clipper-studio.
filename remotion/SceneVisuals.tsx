import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { IconNode } from "lucide";
import { ICONS, type SceneVisual } from "../lib/visuals";

type Colors = { bg1: string; bg2: string; accent: string; text: string };
const SANS = "Arial, sans-serif";
const HEAVY = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";

/**
 * Lucide line icon drawn stroke by stroke (pathLength + dashoffset), then gently floating.
 * Attributes are set directly on the SVG elements so the browser renderer's SVG snapshot keeps them.
 */
export function LineIcon({ node, size, color, delay = 0, strokeWidth = 1.6 }: { node: IconNode; size: number; color: string; delay?: number; strokeWidth?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = node.length;
  const float = Math.sin((frame - delay) / 14) * 6;
  const pop = spring({ frame: frame - delay, fps, config: { damping: 10, stiffness: 140 } });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: `translateY(${float}px) scale(${0.7 + 0.3 * pop})`, overflow: "visible", flexShrink: 0 }}>
      {node.map(([tag, attrs], i) => {
        // Each part starts a little after the previous one; the whole icon is drawn in ~0.7 s.
        const start = delay + (i * 12) / Math.max(1, n);
        const p = interpolate(frame, [start, start + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        // Hidden until it starts drawing; otherwise round line caps show up as stray dots.
        return React.createElement(tag, { ...(attrs as Record<string, string>), key: i, pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - p, strokeOpacity: p > 0 ? 1 : 0 });
      })}
    </svg>
  );
}

/** Largest font size (px) at which the final number fits the 896 px text column on one line. */
export function counterSize(finalText: string): number {
  // Arial Black digits are about 0.72 em wide, minus 6 px of negative letter spacing per glyph.
  const perEm = 0.72, avail = 896;
  for (let size = 220; size > 80; size -= 10) if (finalText.length * (perEm * size - 6) <= avail) return size;
  return 80;
}

function formatNumber(value: number, decimals: number, prefix: string): string {
  const s = value.toLocaleString(prefix === "$" ? "en-US" : "id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return prefix ? `${prefix}${prefix === "Rp" ? " " : ""}${s}` : s;
}

/** Large element shown above the headline: list number, question mark, counter or quote mark. */
export function TopVisual({ visual, colors, sceneFrames }: { visual: SceneVisual; colors: Colors; sceneFrames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 9, stiffness: 150, mass: 0.7 } });

  if (visual.template === "list") {
    const ring = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
    const label = visual.listLabel ? visual.listLabel.toUpperCase() : visual.listIndex == null ? "" : "LANGKAH";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 30, marginBottom: 40, transform: `scale(${0.6 + 0.4 * pop})`, transformOrigin: "left center" }} data-visual="list">
        <div style={{ position: "relative", width: 170, height: 170, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={170} height={170} viewBox="0 0 170 170" style={{ position: "absolute", inset: 0 }}>
            <circle cx={85} cy={85} r={78} fill="none" stroke={colors.accent} strokeWidth={6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ring} transform="rotate(-90 85 85)" />
          </svg>
          {visual.listIndex == null
            ? <LineIcon node={ICONS.right.icon} size={92} color={colors.accent} delay={4} strokeWidth={2.2} />
            : <span style={{ fontFamily: HEAVY, fontSize: 92, color: colors.accent, lineHeight: 1 }}>{visual.listIndex}</span>}
        </div>
        {label && <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 40, letterSpacing: 8, color: colors.text, opacity: 0.85 }}>{label}</span>}
      </div>
    );
  }

  if (visual.template === "question") {
    const wobble = Math.sin(frame / 9) * 6;
    return (
      <div style={{ fontFamily: HEAVY, fontSize: 300, lineHeight: 0.9, color: colors.accent, marginBottom: 20, transform: `scale(${pop}) rotate(${wobble}deg)`, transformOrigin: "left bottom", textShadow: `0 0 60px ${colors.accent}55` }} data-visual="question">?</div>
    );
  }

  if (visual.template === "number" && visual.number) {
    const { value, decimals, prefix, suffix, label, year } = visual.number;
    const count = interpolate(frame, [4, Math.min(sceneFrames * 0.6, fps * 1.4)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const eased = 1 - Math.pow(1 - count, 3);
    const shown = year ? value : decimals ? value * eased : Math.round(value * eased);
    const bar = interpolate(frame, [6, fps * 1.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const text = year ? String(value) : formatNumber(shown, decimals, prefix) + suffix;
    const finalText = year ? String(value) : formatNumber(value, decimals, prefix) + suffix;
    return (
      <div style={{ marginBottom: 36 }} data-visual="number">
        {/* Size from the final text so the counter never reflows while it counts; one line, never wrapped. */}
        <div style={{ fontFamily: HEAVY, fontSize: counterSize(finalText), lineHeight: 0.95, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: colors.accent, letterSpacing: -6, transform: `scale(${0.7 + 0.3 * pop})`, transformOrigin: "left bottom", textShadow: `0 0 50px ${colors.accent}44` }}>{text}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14 }}>
          <div style={{ height: 10, width: 260, borderRadius: 6, background: `${colors.text}25`, overflow: "hidden" }}><div style={{ height: "100%", width: `${bar * 100}%`, background: colors.accent }} /></div>
          {label && <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 34, letterSpacing: 6, textTransform: "uppercase", color: colors.text, opacity: 0.8 }}>{label}</span>}
        </div>
      </div>
    );
  }

  if (visual.template === "quote") {
    return <div style={{ fontFamily: "Georgia, serif", fontSize: 320, lineHeight: 0.6, height: 150, color: colors.accent, opacity: 0.9 * pop, transform: `translateY(${(1 - pop) * 40}px)` }} data-visual="quote">“</div>;
  }
  return null;
}

/** Element below the headline: concept icon, ✗/✓ comparison or call-to-action button. */
export function BottomVisual({ visual, colors }: { visual: SceneVisual; colors: Colors }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (visual.template === "compare" && visual.compare) {
    const { bad, good, neutral } = visual.compare;
    const left = spring({ frame: frame - 6, fps, config: { damping: 13, stiffness: 120 } });
    const right = spring({ frame: frame - 16, fps, config: { damping: 13, stiffness: 120 } });
    const card = (text: string, ok: boolean, p: number, from: number) => (
      <div style={{ flex: 1, minWidth: 0, borderRadius: 28, padding: "30px 26px", border: `3px solid ${ok || neutral ? colors.accent : colors.text + "55"}`, background: ok ? `${colors.accent}1f` : `${colors.text}0d`, opacity: p, transform: `translateX(${(1 - p) * from}px)`, display: "flex", flexDirection: "column", gap: 18 }}>
        <LineIcon node={neutral ? ICONS.balance.icon : ok ? ICONS.right.icon : ICONS.wrong.icon} size={86} color={ok || neutral ? colors.accent : colors.text + "aa"} delay={ok ? 18 : 8} strokeWidth={2} />
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 38, lineHeight: 1.2, color: colors.text, opacity: ok || neutral ? 1 : 0.65, textDecoration: ok || neutral ? "none" : "line-through", overflowWrap: "anywhere" }}>{text}</span>
      </div>
    );
    return (
      <div style={{ display: "flex", gap: 24, marginTop: 56, alignItems: "stretch" }} data-visual="compare">
        {card(bad, false, left, -120)}
        {card(good, true, right, 120)}
      </div>
    );
  }

  if (visual.template === "cta") {
    const p = spring({ frame: frame - 8, fps, config: { damping: 9, stiffness: 140 } });
    const pulse = 1 + 0.04 * Math.sin(frame / 5);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 60, transform: `scale(${p * pulse})`, transformOrigin: "left center" }} data-visual="cta">
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "26px 44px", borderRadius: 999, background: colors.accent, color: colors.bg1, fontFamily: HEAVY, fontSize: 46, letterSpacing: 2, boxShadow: `0 0 50px ${colors.accent}66` }}>
          {visual.cta ?? "MULAI"}
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={colors.bg1} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
        <div style={{ transform: `translate(${-20 + Math.sin(frame / 6) * 10}px, 24px)` }}>
          <LineIcon node={ICONS.cta.icon} size={96} color={colors.text} delay={14} strokeWidth={1.8} />
        </div>
      </div>
    );
  }

  const icon = visual.icon ? ICONS[visual.icon] : null;
  if (!icon) return null;
  return (
    <div style={{ marginTop: 60, display: "flex", alignItems: "center", gap: 28 }} data-visual={"icon-" + visual.icon}>
      <div style={{ width: 210, height: 210, borderRadius: 52, border: `3px solid ${colors.accent}66`, background: `${colors.accent}14`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 60px ${colors.accent}22` }}>
        <LineIcon node={icon.icon} size={140} color={colors.accent} delay={8} />
      </div>
    </div>
  );
}
