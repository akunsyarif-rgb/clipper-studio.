// Motion graphics drawn over the speaker (source-video edits): the picture stays on the person, and the animation
// appears in the empty space above (or just above the captions). Frame-deterministic, inside the safe areas.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CONTENT_WIDTH, fitText, MOTION, SAFE, TYPE } from "../lib/layout";
import { BRANDS } from "../lib/brands";
import { brandStyle } from "../lib/brand-style";
import { ring } from "../lib/brand-motion";
import { beatFrame, overlayAnchors, overlayBand, overlayColors, overlayKeyword, type BrandMotion, type OverlayPosition } from "../lib/overlay";
import type { Scene } from "../lib/script";
import { ICONS, type SceneVisual } from "../lib/visuals";
import { BrandStage, STAGE_H, STAGE_W } from "./BrandStage";
import { CompareCard, Headline, measureFor, formatNumber, type Colors } from "./Families";
import { LineIcon } from "./SceneVisuals";

const TILE = 140;

/** A popular name: its icon pops in when the name is spoken, with the name under it. */
function BrandTile({ id, label, delay, width, text, scene }: { id: string; label: string; delay: number; width: number; text: string; scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = Math.min(1, spring({ frame: frame - delay, fps, config: MOTION.springFirm }));
  const brand = BRANDS.find(b => b.id === id);
  if (!brand) return null;
  const color = brandStyle(id).color;
  const pulse = ring(Math.max(0, frame - delay - 8), 0, 1, 72);
  return (
    <div data-brand={id} style={{ width, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: p, transform: `translateY(${(1 - p) * 18}px) scale(${0.85 + 0.15 * p})` }}>
      <div style={{ position: "relative", width: TILE, height: TILE }}>
        {/* One soft ring that breathes outwards: the only motion of the calm style. */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 34, border: `2px solid ${color}`, opacity: pulse.opacity * 0.55 * p, transform: `scale(${1 + 0.28 * pulse.r})` }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: 34, border: `3px solid ${color}`, background: "#00000066", boxShadow: `0 0 36px ${color}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LineIcon node={brand.icon} size={88} color={color} delay={delay + 2} strokeWidth={1.9} />
        </div>
      </div>
      <Headline text={label} width={width} height={50} maxSize={36} minSize={20} lineHeight={1.05} align="center" colors={{ accent: color, text, bg1: "#101010", bg2: "#101010" }} focus={new Set()} font={TYPE.sans} weight={800} letterSpacing={0.04} reveal="none" scene={scene} />
    </div>
  );
}

/** The animated scene of a name, running from the moment it is said. */
function StageAt({ id, delay }: { id: string; delay: number }) {
  const frame = useCurrentFrame();
  const brand = BRANDS.find(b => b.id === id);
  if (!brand) return null;
  return <BrandStage id={id} node={brand.icon} f={frame - delay} />;
}

export function VideoOverlay({ scene, visual, colors, position, length, offset, brandMotion = "simple", topInset = 0 }: { scene: Scene; visual: SceneVisual; colors: Colors; position: OverlayPosition; length: number; offset: number; brandMotion?: BrandMotion; /** Space (px from the top) a top watermark takes; a top band starts below it. */ topInset?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const oc = overlayColors(colors);
  const band = overlayBand(position, topInset);
  const fade = Math.min(interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }), interpolate(frame, [length - 8, length], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const pop = Math.min(1, spring({ frame, fps, config: MOTION.springCalm }));
  const slide = (1 - pop) * MOTION.rise * (position === "top" ? -1 : 1);
  const keyword = overlayKeyword(scene.text, visual);
  const icon = visual.icon ? ICONS[visual.icon] : null;
  const down = position === "top";
  const brands = visual.brands ?? [];
  const anchors = overlayAnchors(scene.text, visual);
  // Names show up in a row, each when it is said (the first one as the animation starts).
  const itemWidth = brands.length ? Math.min(260, (CONTENT_WIDTH - 36 * (brands.length - 1)) / brands.length) : 0;
  const tileFor = (b: (typeof brands)[number], width: number) => <BrandTile key={b.id} id={b.id} label={b.word.toUpperCase()} delay={beatFrame(scene, b.index, offset)} width={width} text={oc.text} scene={scene} />;
  const STAGE_SCALE = 0.9;
  // One name gets its own animated scene next to its icon; several names share the row as icons, each popping in when said.
  const brandRow = brands.length === 1 && brandMotion === "full" ? (
    <div data-visual={"brand-" + brands[0].id} style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {tileFor(brands[0], 190)}
      <div style={{ width: STAGE_W * STAGE_SCALE, height: STAGE_H * STAGE_SCALE }}>
        <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${STAGE_SCALE})`, transformOrigin: "left top" }}>
          <StageAt id={brands[0].id} delay={beatFrame(scene, brands[0].index, offset) + 2} />
        </div>
      </div>
    </div>
  ) : brands.length ? (
    <div data-visual={"brand-" + brands.map(b => b.id).join("-")} data-brand-motion="simple" style={{ display: "flex", gap: 36, alignItems: "flex-start" }}>
      {brands.map(b => tileFor(b, itemWidth))}
    </div>
  ) : null;

  const tile = icon ? (
    <div data-visual={"icon-" + visual.icon} style={{ width: TILE, height: TILE, flexShrink: 0, borderRadius: 34, border: `3px solid ${oc.accent}`, background: "#00000055", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <LineIcon node={icon.icon} size={84} color={oc.accent} delay={4} strokeWidth={1.9} />
    </div>
  ) : null;
  const keywordText = (maxWidth: number) => keyword ? (
    <Headline text={keyword} width={maxWidth} height={TILE + 40} maxSize={96} minSize={40} lineHeight={1.05} align="left" colors={oc} focus={new Set()} reveal="lines" scene={scene} delay={6} />
  ) : null;

  let content: React.ReactNode = null;
  if (brandRow && ["statement", "question", "quote"].includes(visual.template)) {
    content = brandRow;
  } else if (visual.template === "number" && visual.number) {
    const { value, decimals, prefix, suffix, label } = visual.number;
    const count = interpolate(frame, [4, Math.min(length * 0.6, fps * 1.4)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const eased = 1 - Math.pow(1 - count, 3);
    const shown = decimals ? value * eased : Math.round(value * eased);
    const finalText = formatNumber(value, decimals, prefix) + suffix;
    const fig = fitText(finalText, measureFor(TYPE.display, 900), { maxWidth: CONTENT_WIDTH * 0.97, maxHeight: 230, maxSize: 200, minSize: 90, lineHeight: 1, letterSpacing: -0.03, maxLines: 1 });
    content = (
      <div data-visual="number" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: TYPE.display, fontWeight: 900, fontSize: fig.fontSize, lineHeight: 1, letterSpacing: "-0.03em", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: oc.accent, textShadow: "0 6px 30px #000a" }}>{formatNumber(shown, decimals, prefix) + suffix}</div>
        {label ? <span style={{ fontFamily: TYPE.sans, fontWeight: 700, fontSize: 32, letterSpacing: 6, textTransform: "uppercase", color: oc.text }}>{label}</span> : null}
      </div>
    );
  } else if (visual.template === "list") {
    const n = visual.listIndex;
    const label = visual.listLabel ? visual.listLabel.toUpperCase() : n == null ? "LANGKAH" : `LANGKAH ${n}`;
    content = (
      <div data-visual="list" style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ width: TILE, height: TILE, borderRadius: "50%", border: `5px solid ${oc.accent}`, background: "#00000055", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TYPE.display, fontSize: 72, color: oc.accent }}>
          {n == null ? <LineIcon node={ICONS.right.icon} size={74} color={oc.accent} delay={4} strokeWidth={2.2} /> : n}
        </div>
        <span style={{ fontFamily: TYPE.sans, fontWeight: 800, fontSize: 40, letterSpacing: 8, color: oc.text, textShadow: "0 4px 20px #000a" }}>{label}</span>
      </div>
    );
  } else if (visual.template === "question") {
    content = (
      <div data-visual="question" style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ fontFamily: TYPE.display, fontSize: 220, lineHeight: 0.9, color: oc.accent, textShadow: "0 6px 30px #000a", transform: `rotate(${Math.sin(frame / 12) * 4}deg)` }}>?</div>
        {keywordText(CONTENT_WIDTH - 220 - 28)}
      </div>
    );
  } else if (visual.template === "compare" && visual.compare) {
    const cmp = visual.compare;
    // The rejected option arrives with "bukan", the better one with "tapi".
    const badAt = beatFrame(scene, anchors.start, offset);
    const goodAt = Math.max(badAt + 6, beatFrame(scene, anchors.second ?? anchors.start, offset));
    const common = { scene, colors: oc, neutral: cmp.neutral, width: CONTENT_WIDTH, textHeight: 70 };
    content = (
      <div data-visual="compare" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <CompareCard {...common} text={cmp.bad} good={false} delay={badAt} />
        <CompareCard {...common} text={cmp.good} good delay={goodAt} />
      </div>
    );
  } else if (visual.template === "cta") {
    const p = Math.min(1, spring({ frame: frame - 8, fps, config: MOTION.springFirm }));
    content = (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "flex-start" }}>
        {brandRow}
        <div data-visual="cta" style={{ display: "flex", alignItems: "center", gap: 18, alignSelf: "flex-start", height: 110, padding: "0 46px", borderRadius: 999, background: oc.accent, color: "#101010", fontFamily: TYPE.display, fontSize: 42, letterSpacing: 2, opacity: p, transform: `scale(${0.9 + 0.1 * p})`, whiteSpace: "nowrap", maxWidth: CONTENT_WIDTH, boxShadow: "0 10px 40px #0008" }}>
        {visual.cta ?? "MULAI"}
        <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="#101010" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
      </div>
    );
  } else if (visual.template === "quote") {
    content = <div data-visual="quote" style={{ fontFamily: TYPE.serif, fontSize: 240, lineHeight: 0.7, height: 130, color: oc.accent, textShadow: "0 6px 30px #000a" }}>“</div>;
  } else if (tile || keyword) {
    content = (
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {tile}
        {keywordText(CONTENT_WIDTH - (tile ? TILE + 28 : 0))}
      </div>
    );
  }
  if (!content) return null;

  // Above the head the veil starts at the screen edge; above the captions it fades out at both ends so no hard edge shows on the picture.
  const veil = down ? "linear-gradient(to bottom, #000000b0 0%, #00000088 62%, #0000 100%)" : "linear-gradient(to bottom, #0000 0%, #000000a8 28%, #000000a8 72%, #0000 100%)";
  return (
    <div style={{ position: "absolute", inset: 0, opacity: fade, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: down ? 0 : band.top - 100, height: down ? band.top + band.height + 40 : band.height + 200, background: veil }} />
      <div data-overlay={position} style={{ position: "absolute", left: SAFE.side, width: CONTENT_WIDTH, top: band.top, height: band.height, display: "flex", flexDirection: "column", justifyContent: down ? "flex-start" : "flex-end", alignItems: "flex-start", transform: `translateY(${slide}px)`, opacity: pop }}>
        {content}
      </div>
    </div>
  );
}
