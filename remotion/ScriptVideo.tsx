import React from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { musicGain } from "../lib/audio";
import { activeWordIndex, captionLine, phraseLine, PALETTES, totalFrames, type Scene, type StyleId, type VideoProps } from "../lib/script";
import { detectVisual, stripMarks, wordKey } from "../lib/visuals";
import { BottomVisual, TopVisual } from "./SceneVisuals";

const FONT = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";

function resolveAudio(src: string): string {
  // Browser renders pass blob:/http(s):/data: URLs; CLI renders pass a file name inside public/.
  return /^(blob:|https?:|data:)/.test(src) ? src : staticFile(src);
}

type Colors = (typeof PALETTES)[keyof typeof PALETTES];

/** What the caption shows at `frame`: the phrase chunk holding the spoken word, or nothing in a silent gap. */
function captionState(scene: Scene, frame: number) {
  const text = stripMarks(scene.text);
  const starts = scene.wordStarts, ends = scene.wordEnds;
  if (starts && ends && starts.length) {
    // Silent gap: before the first word (minus a short lead-in) or well after the last one.
    if (frame < starts[0] - 3 || frame > ends[ends.length - 1] + 12) return null;
  }
  const active = activeWordIndex(scene.text, frame, scene.durationInFrames, starts);
  const line = phraseLine(text, active);
  if (line.words.length === 0) return null;
  // Frame at which this chunk appeared, for its entrance animation.
  const since = frame - (starts ? starts[line.firstIndex] ?? 0 : 0);
  return { line, since };
}

/** Caption over the speaker (source-video edits): short phrase, spoken word highlighted, stable layout. */
function VideoCaption({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const state = captionState(scene, frame);
  if (!state) return null;
  const pop = spring({ frame: state.since, fps, config: { damping: 16, stiffness: 220, mass: 0.5 } });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 400 }}>
      <div style={{ maxWidth: 880, textAlign: "center", fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 76, lineHeight: 1.12, letterSpacing: -1, color: "#fff", textShadow: "0 4px 22px #000d, 0 0 3px #000c", opacity: Math.min(1, 0.2 + pop), transform: `translateY(${(1 - Math.min(1, pop)) * 18}px) scale(${0.94 + 0.06 * Math.min(1, pop)})` }}>
        {state.line.words.map((w, i) => <span key={i} style={{ color: i === state.line.activeInLine ? "#ffe066" : "#fff" }}>{w}{i < state.line.words.length - 1 ? " " : ""}</span>)}
      </div>
    </AbsoluteFill>
  );
}

/** Graphic cutaway over the speaker: centred visual for the scene's template/icon with the phrase caption beneath. */
function Cutaway({ scene, colors, length }: { scene: Scene; colors: Colors; length: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const visual = scene.visual ?? detectVisual(scene.text);
  const state = captionState(scene, frame);
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 140, mass: 0.6 } });
  const fade = Math.min(interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }), interpolate(frame, [length - 6, length], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const bottom = visual.template === "compare" || visual.template === "cta" || (visual.template === "statement" && !!visual.icon);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(145deg, ${colors.bg1} 0%, ${colors.bg2} 100%)`, opacity: fade }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 80px", color: colors.text, transform: `scale(${0.92 + 0.08 * Math.min(1, enter)})` }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", width: "100%" }}>
          {bottom ? <div style={{ transform: "scale(1.35)", margin: "0 0 40px" }}><BottomVisual visual={{ ...visual, template: visual.template }} colors={colors} /></div> : <TopVisual visual={visual} colors={colors} sceneFrames={length} />}
          <div style={{ minHeight: 190, display: "flex", alignItems: "center", justifyContent: "center", maxWidth: 880, fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 72, lineHeight: 1.12, letterSpacing: -1, marginTop: bottom ? 30 : 10 }}>
            {state?.line.words.map((w, i) => <span key={i} style={{ color: i === state.line.activeInLine ? colors.accent : colors.text }}>{w}{i < state.line.words.length - 1 ? "\u00a0" : ""}</span>)}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function SceneView({ scene, index, count, title, style, colors, captions }: {
  scene: Scene; index: number; count: number; title: string; style: StyleId;
  colors: (typeof PALETTES)[keyof typeof PALETTES]; captions: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = scene.durationInFrames;
  const intensity = scene.narrative?.intensity ?? "emphasis";
  const enter = spring({ frame, fps, config: intensity === "quiet" ? { damping: 22, stiffness: 80, mass: 0.8 } : intensity === "impact" && style === "popup" ? { damping: 8, stiffness: 170, mass: 0.6 } : { damping: 14, stiffness: 110, mass: 0.7 } });
  const fadeOut = interpolate(frame, [d - 8, d], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // The first scene is visible from frame 0 so the video thumbnail is never blank.
  const fadeIn = index === 0 ? 1 : interpolate(frame, [0, intensity === "quiet" ? 8 : style === "cinematic" ? 14 : 6], [0, 1], { extrapolateRight: "clamp" });
  const drift = interpolate(frame, [0, d], intensity === "quiet" ? [8, 0] : style === "cinematic" ? [40, -30] : [24, -6], { extrapolateRight: "clamp" });
  const scale = intensity === "quiet" ? interpolate(enter, [0, 1], [0.98, 1]) : style === "popup" && intensity === "impact" ? interpolate(enter, [0, 1], [0.6, 1]) : interpolate(enter, [0, 1], [0.86, 1]);
  const blur = style === "cinematic" && intensity !== "quiet" && index > 0 ? interpolate(frame, [0, 14], [14, 0], { extrapolateRight: "clamp" }) : 0;

  const visual = scene.visual ?? detectVisual(scene.text);
  const role = scene.narrative?.role ?? (index === 0 ? "hook" : index === count - 1 ? "resolution" : "continuation");
  const strategy = scene.narrative?.strategy ?? "typography";
  const emphasis = new Set(visual.emphasis);
  const all = stripMarks(scene.text).split(/\\s+/).filter(Boolean);
  const active = activeWordIndex(scene.text, frame, d, scene.wordStarts);
  // A role changes the actual composition; presets only tune the motion language.
  const revealWords = intensity !== "quiet" && (style === "kinetic" || style === "hybrid" || role === "hook");
  const hasTop = ["list", "question", "number", "quote"].includes(visual.template) && (visual.template !== "number" || !!visual.number);
  const baseSize = all.length <= 6 ? 108 : all.length <= 12 ? 86 : all.length <= 20 ? 68 : 54;
  const big = Math.round(baseSize * (hasTop ? 0.82 : 1) * (visual.template === "compare" ? 0.85 : 1) * (role === "hook" ? 1.16 : role === "resolution" ? 0.92 : 1));
  const line = captionLine(stripMarks(scene.text), active);
  const centered = role === "hook" || role === "reveal" || role === "resolution";
  const textAlign = centered ? "center" as const : "left" as const;
  const alignItems = centered ? "center" as const : "flex-start" as const;
  const roleLabel: Record<string, string> = { hook: "PEMBUKA", tension: "KONFLIK", explanation: "PENJELASAN", reveal: "INTI TEMUAN", application: "LANGKAH NYATA", resolution: "KESIMPULAN", continuation: "LANJUTAN" };

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <AbsoluteFill style={{ justifyContent: "center", padding: role === "hook" ? "0 70px" : role === "resolution" ? "0 112px" : "0 92px", color: colors.text, transform: `translateY(${drift}px)`, filter: blur ? `blur(${blur}px)` : undefined, alignItems }}>
        {role === "hook" ? <div style={{ position: "absolute", top: 250, left: 80, right: 80, height: 3, background: colors.accent, transform: `scaleX(${interpolate(enter, [0, 1], [0, 1])})`, transformOrigin: "left" }} /> : null}
        <div style={{ width: "100%", fontFamily: "Arial, sans-serif", fontSize: 22, letterSpacing: 5, fontWeight: 700, color: colors.accent, marginBottom: role === "hook" ? 26 : 32, textTransform: "uppercase", textAlign }}>
          {role === "hook" && title ? title : roleLabel[role] ?? `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`}
        </div>
        {role === "tension" && strategy === "comparison" ? <div style={{ alignSelf: "stretch", height: 7, marginBottom: 28, background: `linear-gradient(90deg, ${colors.text} 0 46%, transparent 46% 54%, ${colors.accent} 54% 100%)` }} /> : null}
        {role !== "hook" && role !== "resolution" ? <TopVisual visual={visual} colors={colors} sceneFrames={d} /> : null}
        {role === "explanation" && strategy === "diagram" ? <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 26, color: colors.accent, fontSize: 20, fontWeight: 800, letterSpacing: 2 }}><span style={{ border: `2px solid ${colors.accent}`, padding: "12px 16px" }}>SEBAB</span><span style={{ fontSize: 32 }}>→</span><span style={{ border: `2px solid ${colors.accent}`, padding: "12px 16px" }}>AKIBAT</span></div> : null}
        {role === "reveal" ? <div style={{ width: 150, height: 6, background: colors.accent, marginBottom: 28, transform: `scaleX(${interpolate(enter, [0, 1], [0, 1])})` }} /> : null}
        <div style={{ width: "100%", maxWidth: role === "resolution" ? 850 : 920, fontFamily: FONT, fontSize: big, lineHeight: role === "hook" ? 0.96 : 1.04, letterSpacing: role === "hook" ? -4 : -2, fontWeight: 900, textAlign, transform: `scale(${scale})`, transformOrigin: centered ? "center center" : "left center", textShadow: role === "hook" ? `0 10px 48px ${colors.accent}33` : "0 8px 40px #0004", overflowWrap: "break-word" }}>
          {all.map((w, i) => {
            const shown = !revealWords || i <= active;
            const pop = revealWords ? spring({ frame: frame - Math.floor((i / all.length) * d * 0.9), fps, config: { damping: 12, stiffness: 200 } }) : 1;
            const key = wordKey(w);
            const emph = emphasis.has(key);
            // Emphasised words turn accent-coloured and get an underline that grows once they are spoken.
            const said = !revealWords || i <= active;
            const sinceSaid = frame - Math.floor((i / all.length) * d * 0.9);
            const underline = emph && said ? interpolate(revealWords ? sinceSaid : frame - 10, [0, 10], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
            return (
              <span key={i} style={{ position: "relative", display: "inline-block", whiteSpace: "nowrap", marginRight: "0.25em", opacity: shown ? 1 : 0.14, transform: `translateY(${(1 - pop) * (style === "kinetic" ? 42 : 30)}px) rotate(${style === "kinetic" && intensity === "impact" ? (i % 2 === 0 ? -3 : 3) * (1 - pop) : 0}deg) scale(${style === "kinetic" && intensity !== "quiet" ? 0.94 + 0.06 * pop : 1})`, color: emph || (revealWords && i === active) ? colors.accent : undefined, textShadow: style === "kinetic" && intensity === "impact" && (emph || (revealWords && i === active)) ? `0 0 28px ${colors.accent}55` : undefined }}>
                {w}
                {emph && <span style={{ position: "absolute", left: 0, bottom: "-0.08em", height: "0.09em", width: `${underline}%`, borderRadius: 6, background: colors.accent }} />}
              </span>
            );
          })}
        </div>
        {role === "resolution" ? <div style={{ width: 110, height: 4, background: colors.accent, marginTop: 30, transform: `scaleX(${interpolate(enter, [0, 1], [0, 1])})` }} /> : <div style={{ height: role === "hook" ? 4 : 6, width: interpolate(enter, [0, 1], [0, role === "tension" ? 220 : 125]), background: colors.accent, marginTop: role === "application" ? 24 : 34, boxShadow: role === "hook" ? "none" : `0 0 18px ${colors.accent}55` }} />}
        {role !== "resolution" && role !== "hook" ? <BottomVisual visual={visual} colors={colors} /> : null}
        {role === "application" ? <div style={{ marginTop: 24, borderLeft: `4px solid ${colors.accent}`, paddingLeft: 18, fontSize: 22, letterSpacing: 3, fontWeight: 800, color: colors.accent }}>LAKUKAN SATU HAL</div> : null}
      </AbsoluteFill>
      {captions && line.words.length > 0 && (
        <div style={{ position: "absolute", left: 70, right: 70, bottom: 190, display: "flex", justifyContent: "center" }}>
          <div style={{ background: "#000000a8", borderRadius: 18, padding: "18px 28px", fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 46, lineHeight: 1.25, color: "#fff", textAlign: "center" }}>
            {line.words.map((w, i) => <span key={i} style={{ color: i === line.activeInLine ? "#ffe066" : "#fff" }}>{w}{i < line.words.length - 1 ? " " : ""}</span>)}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}

export const ScriptVideo: React.FC<VideoProps> = ({ title, scenes, style, palette, audioSrc, captions, music, speech, video }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const colors = PALETTES[palette] ?? PALETTES.violet;
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 100], { extrapolateRight: "clamp" });
  const wash = interpolate(frame % 360, [0, 180, 359], [0.4, 1, 0.4]);
  // Deterministic, lightweight ambient particles (cinematic only, never over the speaker): no image assets, randomness, or extra dependencies.
  const particles = style === "cinematic" && !video ? Array.from({ length: 16 }, (_, i) => {
    const x = (i * 37 + 11) % 100;
    const y = (i * 61 + 7) % 100;
    const phase = (frame + i * 19) % 180;
    const drift = interpolate(phase, [0, 179], [22, -22]);
    const opacity = 0.12 + (Math.sin((frame + i * 23) / 18) + 1) * 0.09;
    const size = i % 4 === 0 ? 4 : 2;
    return { x, y, drift, opacity, size, key: i };
  }) : [];
  let from = 0;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(145deg, ${colors.bg1} 0%, ${colors.bg2} 100%)`, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 80% 20%, ${colors.accent}22 0%, transparent 38%)`, opacity: wash }} />
      {particles.map(p => <div key={p.key} aria-hidden="true" style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, borderRadius: "50%", background: colors.accent, opacity: p.opacity, transform: `translateY(${p.drift}px)`, pointerEvents: "none" }} />)}
      <div style={{ position: "absolute", width: 700, height: 700, border: `1px solid ${colors.accent}45`, borderRadius: "50%", right: -380, top: 250, transform: `rotate(${frame * 0.3}deg)` }} />
      {!video && <div style={{ position: "absolute", left: 70, right: 70, top: 72, display: "flex", justifyContent: "space-between", color: `${colors.accent}cc`, font: "bold 18px monospace", letterSpacing: 3 }}><span>CLIPPER / MOTION</span><span>30 FPS</span></div>}
      {video ? <AbsoluteFill><Video src={resolveAudio(video.src)} objectFit="cover" /></AbsoluteFill> : null}
      {audioSrc ? <Audio src={resolveAudio(audioSrc)} /> : null}
      {music ? (
        <Audio
          src={resolveAudio(music.src)}
          loop={music.loop}
          loopVolumeCurveBehavior="extend"
          // Without an analysed narration envelope, duck for the whole video whenever there is narration.
          volume={f => musicGain(f, durationInFrames, fps, music, speech ?? (audioSrc ? [1] : null))}
        />
      ) : null}
      {scenes.map((scene, i) => {
        const start = from;
        from += scene.durationInFrames;
        return (
          <Sequence key={i} from={start} durationInFrames={scene.durationInFrames} name={`Scene ${i + 1}`}>
            {video
              ? <>
                {captions ? <VideoCaption scene={scene} /> : null}
                {/* Cutaway: an opaque graphic over the speaker (at most 4 s); the video underneath keeps playing, so audio never breaks. */}
                {scene.cut === "graphic" ? <Sequence from={0} durationInFrames={Math.min(scene.durationInFrames, 120)}><Cutaway scene={scene} colors={colors} length={Math.min(scene.durationInFrames, 120)} /></Sequence> : null}
              </>
              : <SceneView scene={scene} index={i} count={scenes.length} title={title} style={style} colors={colors} captions={captions} />}
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", bottom: 72, left: 70, right: 70, height: 4, background: `${colors.text}30` }}><div style={{ height: "100%", width: `${progress}%`, background: colors.accent }} /></div>
    </AbsoluteFill>
  );
};

export const calculateScriptMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: totalFrames(props.scenes),
});
