// Quiet Editorial Motion: five composition families sharing one headline renderer and one motion vocabulary.
// Every animation is a function of the frame (springs/interpolate only); no timers, no randomness.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { splitCause, type Family } from "../lib/composition";
import { estimateHeavy, fitText, MOTION, TYPE, type FitOptions, type Measure } from "../lib/layout";
import type { NarrativeRole } from "../lib/narrative";
import { spokenFrames, type Scene, type StyleId } from "../lib/script";
import { ICONS, stripMarks, wordKey, type SceneVisual } from "../lib/visuals";
import { LineIcon } from "./SceneVisuals";

export type Colors = { bg1: string; bg2: string; accent: string; text: string };

export const ROLE_LABELS: Record<NarrativeRole, string> = {
  hook: "PEMBUKA", tension: "KONFLIK", explanation: "PENJELASAN", reveal: "INTI TEMUAN", application: "LANGKAH NYATA", resolution: "KESIMPULAN", continuation: "LANJUTAN",
};

const measures = new Map<string, Measure>();
/**
 * Width of text at 100 px in the font the browser will actually use (canvas resolves fallbacks
 * the same way the DOM does). Outside a browser it falls back to a conservative estimate.
 */
export function measureFor(fontFamily: string, weight: number): Measure {
  const id = `${weight} ${fontFamily}`;
  const cached = measures.get(id);
  if (cached) return cached;
  const ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  const cache = new Map<string, number>();
  const m: Measure = ctx ? text => {
    let w = cache.get(text);
    if (w === undefined) { ctx.font = `${weight} 100px ${fontFamily}`; w = ctx.measureText(text).width; cache.set(text, w); }
    return w;
  } : estimateHeavy;
  measures.set(id, m);
  return m;
}

/** Spring progress (0..1) starting at `delay` frames. */
function useAppear(delay: number, config: { damping: number; stiffness: number; mass: number } = MOTION.springCalm) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return Math.min(1, spring({ frame: frame - delay, fps, config }));
}

/** Frame (in scene) at which word `i` is spoken: transcript timing when known, else the even spread captions use. */
export function wordStart(scene: Scene, i: number, n: number): number {
  const s = scene.wordStarts;
  if (s && s.length === n) return s[i] ?? 0;
  return Math.floor((i / Math.max(1, n)) * spokenFrames(scene) * 0.9);
}

/** At most `max` emphasised words: one focus at a time, not a highlighter on every keyword. */
function focusSet(visual: SceneVisual, max = 2): Set<string> {
  return new Set(visual.emphasis.slice(0, max));
}

type HeadlineProps = {
  text: string;
  width: number;
  height: number;
  maxSize: number;
  minSize: number;
  lineHeight?: number;
  align: "left" | "center";
  colors: Colors;
  focus: Set<string>;
  font?: string;
  weight?: number;
  letterSpacing?: number;
  /** "lines": each line rises in turn. "words": words brighten as they are spoken (kinetic). */
  reveal: "lines" | "words" | "none";
  scene: Scene;
  /** Index of the first word of `text` inside the scene (for narration timing). */
  wordOffset?: number;
  delay?: number;
  color?: string;
};

/** Fitted headline: line breaks are computed, so nothing wraps or crops differently from what was measured. */
export function Headline(p: HeadlineProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const font = p.font ?? TYPE.display;
  const weight = p.weight ?? 900;
  const lineHeight = p.lineHeight ?? 1.06;
  const letterSpacing = p.letterSpacing ?? -0.02;
  const opts: FitOptions = { maxWidth: p.width * 0.97, maxHeight: p.height, maxSize: p.maxSize, minSize: p.minSize, lineHeight, letterSpacing };
  const fit = fitText(p.text, measureFor(font, weight), opts);
  const sceneWords = stripMarks(p.scene.text).split(/\s+/).filter(Boolean).length;
  let k = 0;
  return (
    <div data-fit={fit.fits ? "ok" : "floor"} style={{ width: p.width, fontFamily: font, fontWeight: weight, fontSize: fit.fontSize, lineHeight, letterSpacing: `${letterSpacing}em`, textAlign: p.align, color: p.color ?? p.colors.text }}>
      {fit.lines.map((line, li) => {
        const lp = p.reveal === "lines" ? Math.min(1, spring({ frame: frame - (p.delay ?? 0) - li * MOTION.stagger, fps, config: MOTION.springCalm })) : 1;
        return (
          <div key={li} style={{ whiteSpace: "nowrap", opacity: lp, transform: `translateY(${(1 - lp) * MOTION.rise}px)` }}>
            {line.map((w, wi) => {
              const i = k++;
              const at = wordStart(p.scene, (p.wordOffset ?? 0) + i, sceneWords);
              const said = p.reveal !== "words" || frame >= at - 2;
              const wp = p.reveal === "words" ? interpolate(frame, [at - 2, at + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
              const emph = p.focus.has(wordKey(w));
              const underline = emph && said ? interpolate(frame, [Math.max(at, p.delay ?? 0) + 2, Math.max(at, p.delay ?? 0) + 14], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
              return (
                <React.Fragment key={wi}>
                  <span style={{ position: "relative", display: "inline-block", color: emph ? p.colors.accent : undefined, opacity: p.reveal === "words" ? 0.24 + 0.76 * wp : 1, transform: p.reveal === "words" ? `translateY(${(1 - wp) * 10}px)` : undefined }}>
                    {w}
                    {emph && <span style={{ position: "absolute", left: 0, bottom: "-0.06em", height: "0.07em", width: `${underline}%`, background: p.colors.accent }} />}
                  </span>
                  {wi < line.length - 1 ? " " : null}
                </React.Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Kicker({ text, colors, align, delay = 0 }: { text: string; colors: Colors; align: "left" | "center"; delay?: number }) {
  const p = useAppear(delay);
  return (
    <div style={{ fontFamily: TYPE.sans, fontWeight: 700, fontSize: TYPE.kicker, letterSpacing: TYPE.kickerSpacing, textTransform: "uppercase", color: colors.accent, textAlign: align, opacity: p, width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</div>
  );
}

/** Thin accent rule that draws itself; the only ornament the editorial family uses. */
function Rule({ colors, width, delay = 0, align = "center" }: { colors: Colors; width: number; delay?: number; align?: "left" | "center" }) {
  const p = useAppear(delay);
  return <div style={{ width, height: 3, background: colors.accent, transform: `scaleX(${p})`, transformOrigin: align === "left" ? "left" : "center", alignSelf: align === "left" ? "flex-start" : "center" }} />;
}

function DownArrow({ color }: { color: string }) {
  return <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v16M6 14l6 6 6-6" /></svg>;
}

/** A creator-pinned concept icon for layouts that otherwise rely on type alone. */
function PinnedIcon({ visual, colors }: { visual: SceneVisual; colors: Colors }) {
  const icon = visual.iconPinned && visual.icon ? ICONS[visual.icon] : null;
  if (!icon) return null;
  return <div data-visual={"icon-" + visual.icon}><LineIcon node={icon.icon} size={96} color={colors.accent} delay={6} strokeWidth={1.8} /></div>;
}

export type FamilyProps = {
  family: Family;
  scene: Scene;
  visual: SceneVisual;
  role: NarrativeRole;
  index: number;
  count: number;
  title: string;
  style: StyleId;
  colors: Colors;
  box: { width: number; height: number };
};

const KICKER_BLOCK = 30 + 40;

/** 1. Editorial / cinematic: hook, reflection, conclusion. Centred, generous space, one rule. */
function Editorial({ scene, visual, role, title, colors, box }: FamilyProps) {
  const text = stripMarks(scene.text);
  const quote = visual.template === "quote";
  const resolution = role === "resolution";
  const label = role === "hook" && title ? title : quote ? "KUTIPAN" : visual.template === "question" ? "PERTANYAAN" : ROLE_LABELS[role];
  // Negative space is part of the layout: the headline never takes more than ~60% of the box.
  const pinned = visual.iconPinned && visual.icon ? 136 : 0;
  const room = Math.min(box.height - KICKER_BLOCK - 80 - pinned, box.height * 0.62);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
      <PinnedIcon visual={visual} colors={colors} />
      <Kicker text={label} colors={colors} align="center" />
      {quote ? <div style={{ fontFamily: TYPE.serif, fontSize: 160, lineHeight: 0.5, height: 60, color: colors.accent }}>“</div> : <Rule colors={colors} width={96} delay={4} />}
      <Headline text={quote ? text.replace(/^["“]|["”][.!]?$/g, "") : text} width={box.width} height={room} maxSize={resolution ? 88 : role === "hook" ? 120 : 104} minSize={52}
        align="center" colors={colors} focus={focusSet(visual, role === "hook" ? 1 : 2)} font={quote ? TYPE.serif : TYPE.display} weight={quote ? 700 : 900}
        letterSpacing={quote ? 0 : -0.02} lineHeight={quote ? 1.18 : 1.06} reveal="lines" scene={scene} delay={6} />
      {resolution ? <Rule colors={colors} width={64} delay={18} /> : null}
    </div>
  );
}

/** 2. Kinetic typography: words brighten as they are spoken; only the focus words take the accent. */
function Kinetic({ scene, visual, role, colors, box }: FamilyProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 40 }}>
      <PinnedIcon visual={visual} colors={colors} />
      <Kicker text={ROLE_LABELS[role]} colors={colors} align="left" />
      <Headline text={stripMarks(scene.text)} width={box.width} height={box.height - KICKER_BLOCK - 40 - (visual.iconPinned && visual.icon ? 136 : 0)} maxSize={116} minSize={52} lineHeight={1.04}
        align="left" colors={colors} focus={focusSet(visual)} reveal="words" scene={scene} />
    </div>
  );
}

/** 3. Explainer / infographic: step marker or cause → effect flow, with the concept icon as a label. */
function Explainer({ scene, visual, role, colors, box }: FamilyProps) {
  const text = stripMarks(scene.text);
  const cause = visual.template !== "list" ? splitCause(text) : null;
  const icon = visual.icon ? ICONS[visual.icon] : null;
  const head = useAppear(0, MOTION.springFirm);
  const words = text.split(/\s+/).filter(Boolean);
  const label = visual.template === "list" ? (visual.listLabel ? visual.listLabel.toUpperCase() : visual.listIndex == null ? "LANGKAH" : `LANGKAH ${visual.listIndex}`) : ROLE_LABELS[role];
  const HEADER = 128;
  const marker = visual.template === "list" && visual.listIndex != null
    ? <div data-visual="list" style={{ width: HEADER, height: HEADER, borderRadius: "50%", border: `4px solid ${colors.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TYPE.display, fontSize: 64, color: colors.accent }}>{visual.listIndex}</div>
    : icon ? <div data-visual={"icon-" + visual.icon} style={{ width: HEADER, height: HEADER, borderRadius: 32, border: `3px solid ${colors.accent}66`, display: "flex", alignItems: "center", justifyContent: "center" }}><LineIcon node={icon.icon} size={76} color={colors.accent} delay={6} strokeWidth={1.8} /></div>
    : null;
  const rest = box.height - (marker ? HEADER : 30) - 48;
  // The effect block appears when the narration reaches the connecting word.
  const afterFrom = cause ? words.length - cause.after.split(/\s+/).length : 0;
  const effectAt = cause ? Math.min(scene.durationInFrames * 0.4, wordStart(scene, afterFrom - 1, words.length)) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 48, borderLeft: `3px solid ${colors.accent}55`, paddingLeft: 36, marginLeft: -39 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: head, transform: `translateX(${(1 - head) * -16}px)` }}>
        {marker}
        <span style={{ fontFamily: TYPE.sans, fontWeight: 700, fontSize: TYPE.kicker, letterSpacing: TYPE.kickerSpacing, color: colors.accent }}>{label}</span>
      </div>
      {cause ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Headline text={cause.before} width={box.width} height={(rest - 100) / 2} maxSize={80} minSize={40} align="left" colors={colors} focus={focusSet(visual)} reveal="lines" scene={scene} delay={4} />
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: TYPE.sans, fontWeight: 700, fontSize: 30, color: colors.accent, height: 60 }}>
            <DownArrow color={colors.accent} />
            {cause.link}
          </div>
          <Headline text={cause.after} width={box.width} height={(rest - 100) / 2} maxSize={80} minSize={40} align="left" colors={colors} focus={focusSet(visual)} reveal="lines" scene={scene}
            wordOffset={afterFrom} delay={effectAt} />
        </div>
      ) : (
        <Headline text={text} width={box.width} height={rest} maxSize={92} minSize={46} align="left" colors={colors} focus={focusSet(visual)} reveal="lines" scene={scene} delay={4} />
      )}
    </div>
  );
}

const CARD_PAD = 34, CARD_ICON = 64;

function CompareCard({ text, good, delay, neutral, scene, colors, width, textHeight }: { text: string; good: boolean; delay: number; neutral: boolean; scene: Scene; colors: Colors; width: number; textHeight: number }) {
  const p = useAppear(delay);
  const strike = useAppear(delay + 12);
  const strong = good || neutral;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, padding: CARD_PAD, borderRadius: 24, width, boxSizing: "border-box", border: `3px solid ${strong ? colors.accent : colors.text + "40"}`, background: strong ? `${colors.accent}18` : "transparent", opacity: p, transform: `translateY(${(1 - p) * MOTION.rise}px)` }}>
      <LineIcon node={neutral ? ICONS.balance.icon : good ? ICONS.right.icon : ICONS.wrong.icon} size={CARD_ICON} color={strong ? colors.accent : colors.text + "99"} delay={delay + 4} strokeWidth={2} />
      <div style={{ position: "relative", opacity: strong ? 1 : 0.62 }}>
        {/* Text-decoration does not reach inline-block words, so the rejected option gets a drawn strike instead. */}
        {!strong && <div style={{ position: "absolute", left: -6, right: -6, top: "52%", height: 4, background: colors.text, transform: `scaleX(${strike})`, transformOrigin: "left" }} />}
        <Headline text={text} width={width - CARD_PAD * 2 - CARD_ICON - 24} height={textHeight} maxSize={64} minSize={34} lineHeight={1.12} align="left" colors={colors} focus={new Set()} font={TYPE.sans} weight={800} letterSpacing={-0.01} reveal="none" scene={scene} />
      </div>
    </div>
  );
}

/** 4. Comparison: stacked before/after cards (stacking reads better than side-by-side at 9:16). */
function Comparison({ scene, visual, colors, box }: FamilyProps) {
  const cmp = visual.compare!;
  const words = stripMarks(scene.text).split(/\s+/).filter(Boolean);
  const firstGood = words.findIndex(w => wordKey(w) === wordKey(cmp.good.split(/\s+/)[0] ?? ""));
  // The better option arrives when the narration reaches it (bounded so it never arrives too late).
  const goodAt = Math.min(Math.round(scene.durationInFrames * 0.45), firstGood >= 0 ? wordStart(scene, firstGood, words.length) : 16);
  const DIVIDER = 76;
  const cardProps = { scene, colors, neutral: cmp.neutral, width: box.width, textHeight: (box.height - KICKER_BLOCK - DIVIDER) / 2 - CARD_PAD * 2 };
  return (
    <div data-visual="compare" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0 }}>
      <div style={{ height: KICKER_BLOCK }}><Kicker text={cmp.neutral ? "PERBANDINGAN" : "BUKAN INI → TAPI INI"} colors={colors} align="left" /></div>
      <CompareCard {...cardProps} text={cmp.bad} good={false} delay={4} />
      <div style={{ height: DIVIDER, display: "flex", alignItems: "center", fontFamily: TYPE.sans, fontWeight: 800, fontSize: 26, letterSpacing: 4, color: colors.accent, paddingLeft: CARD_PAD }}>{cmp.neutral ? "VS" : <DownArrow color={colors.accent} />}</div>
      <CompareCard {...cardProps} text={cmp.good} good delay={goodAt} />
    </div>
  );
}

function formatNumber(value: number, decimals: number, prefix: string): string {
  const s = value.toLocaleString(prefix === "$" ? "en-US" : "id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return prefix ? `${prefix}${prefix === "Rp" ? " " : ""}${s}` : s;
}

/** 5. Data / product showcase: one figure (or one action) as the hero, the sentence as its context. */
function DataAction({ scene, visual, role, colors, box }: FamilyProps) {
  const text = stripMarks(scene.text);
  const p = useAppear(10, MOTION.springFirm);
  const PILL = 112;
  return (
      <div data-visual="cta" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 44 }}>
        <Kicker text={ROLE_LABELS[role]} colors={colors} align="left" />
        <Headline text={text} width={box.width} height={box.height - KICKER_BLOCK - PILL - 88} maxSize={96} minSize={48} align="left" colors={colors} focus={focusSet(visual, 1)} reveal="lines" scene={scene} />
        <div style={{ height: PILL, display: "flex", alignItems: "center", gap: 18, padding: "0 46px", borderRadius: 999, background: colors.accent, color: colors.bg1, fontFamily: TYPE.display, fontSize: 42, letterSpacing: 2, opacity: p, transform: `translateY(${(1 - p) * MOTION.rise}px)`, maxWidth: box.width, boxSizing: "border-box", whiteSpace: "nowrap" }}>
          {visual.cta ?? "MULAI"}
          <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={colors.bg1} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
      </div>
  );
}

function DataFigure({ scene, visual, role, colors, box }: FamilyProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = stripMarks(scene.text);
  const { value, decimals, prefix, suffix, label } = visual.number!;
  const count = interpolate(frame, [4, Math.min(scene.durationInFrames * 0.6, fps * 1.4)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eased = 1 - Math.pow(1 - count, 3);
  const shown = decimals ? value * eased : Math.round(value * eased);
  const finalText = formatNumber(value, decimals, prefix) + suffix;
  // Sized from the final value so the counter never reflows while it counts.
  const fig = fitText(finalText, measureFor(TYPE.display, 900), { maxWidth: box.width * 0.97, maxHeight: 260, maxSize: 240, minSize: 90, lineHeight: 1, letterSpacing: -0.03, maxLines: 1 });
  const bar = interpolate(frame, [6, fps * 1.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const p = useAppear(0, MOTION.springFirm);
  const LABEL = 44;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 36 }}>
      <Kicker text={ROLE_LABELS[role]} colors={colors} align="left" />
      <div data-visual="number"><div style={{ fontFamily: TYPE.display, fontWeight: 900, fontSize: fig.fontSize, lineHeight: 1, letterSpacing: "-0.03em", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: colors.accent, opacity: p, transform: `translateY(${(1 - p) * MOTION.rise}px)` }}>
        {formatNumber(shown, decimals, prefix) + suffix}
      </div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, height: LABEL }}>
        <div style={{ height: 8, width: 220, background: `${colors.text}25` }}><div style={{ height: "100%", width: `${bar * 100}%`, background: colors.accent }} /></div>
        {label ? <span style={{ fontFamily: TYPE.sans, fontWeight: 700, fontSize: 30, letterSpacing: 5, textTransform: "uppercase", color: colors.text, opacity: 0.8 }}>{label}</span> : null}
      </div>
      <Headline text={text} width={box.width} height={box.height - KICKER_BLOCK - fig.fontSize - LABEL - 36 * 3} maxSize={68} minSize={40} lineHeight={1.12} align="left" colors={colors}
        focus={focusSet(visual, 1)} font={TYPE.sans} weight={800} letterSpacing={-0.01} reveal="lines" scene={scene} delay={10} />
    </div>
  );
}

export function FamilyView(props: FamilyProps) {
  switch (props.family) {
    case "kinetic": return <Kinetic {...props} />;
    case "explainer": return <Explainer {...props} />;
    case "comparison": return <Comparison {...props} />;
    case "data": return props.visual.template === "cta" ? <DataAction {...props} /> : <DataFigure {...props} />;
    default: return <Editorial {...props} />;
  }
}
