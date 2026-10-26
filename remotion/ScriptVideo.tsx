import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { musicGain } from "../lib/audio";
import { activeWordIndex, captionLine, PALETTES, totalFrames, type Scene, type StyleId, type VideoProps } from "../lib/script";
import { detectVisual, stripMarks, wordKey } from "../lib/visuals";
import { BottomVisual, TopVisual } from "./SceneVisuals";

const FONT = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";

function resolveAudio(src: string): string {
  // Browser renders pass blob:/http(s):/data: URLs; CLI renders pass a file name inside public/.
  return /^(blob:|https?:|data:)/.test(src) ? src : staticFile(src);
}

function SceneView({ scene, index, count, title, style, colors, captions }: {
  scene: Scene; index: number; count: number; title: string; style: StyleId;
  colors: (typeof PALETTES)[keyof typeof PALETTES]; captions: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = scene.durationInFrames;
  const enter = spring({ frame, fps, config: style === "popup" ? { damping: 8, stiffness: 170, mass: 0.6 } : { damping: 14, stiffness: 110, mass: 0.7 } });
  const fadeOut = interpolate(frame, [d - 8, d], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // The first scene is visible from frame 0 so the video thumbnail is never blank.
  const fadeIn = index === 0 ? 1 : interpolate(frame, [0, style === "cinematic" ? 14 : 6], [0, 1], { extrapolateRight: "clamp" });
  const drift = interpolate(frame, [0, d], style === "cinematic" ? [40, -30] : [24, -6], { extrapolateRight: "clamp" });
  const scale = style === "popup" ? interpolate(enter, [0, 1], [0.6, 1]) : interpolate(enter, [0, 1], [0.86, 1]);
  const blur = style === "cinematic" && index > 0 ? interpolate(frame, [0, 14], [14, 0], { extrapolateRight: "clamp" }) : 0;

  const visual = scene.visual ?? detectVisual(scene.text);
  const emphasis = new Set(visual.emphasis);
  const all = stripMarks(scene.text).split(/\s+/).filter(Boolean);
  const active = activeWordIndex(scene.text, frame, d);
  // Kinetic/hybrid reveal the headline word by word in step with the narration; others show it at once.
  const revealWords = style === "kinetic" || style === "hybrid";
  const hasTop = ["list", "question", "number", "quote"].includes(visual.template) && (visual.template !== "number" || !!visual.number);
  const baseSize = all.length <= 6 ? 108 : all.length <= 12 ? 86 : all.length <= 20 ? 68 : 54;
  // Leave room for the large visual above the headline and the cards below it.
  const big = Math.round(baseSize * (hasTop ? 0.82 : 1) * (visual.template === "compare" ? 0.85 : 1));
  const line = captionLine(stripMarks(scene.text), active);

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 92px", color: colors.text, transform: `translateY(${drift}px)`, filter: blur ? `blur(${blur}px)` : undefined }}>
        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 26, letterSpacing: 6, fontWeight: 700, color: colors.accent, marginBottom: 40, textTransform: "uppercase" }}>
          {index === 0 && title ? title : `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`}
        </div>
        <TopVisual visual={visual} colors={colors} sceneFrames={d} />
        <div style={{ fontFamily: FONT, fontSize: big, lineHeight: 1.04, letterSpacing: -2, fontWeight: 900, transform: `scale(${scale})`, transformOrigin: "left center", textShadow: "0 8px 40px #0004", overflowWrap: "break-word" }}>
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
              <span key={i} style={{ position: "relative", display: "inline-block", whiteSpace: "nowrap", marginRight: "0.25em", opacity: shown ? 1 : 0.14, transform: `translateY(${(1 - pop) * 30}px)`, color: emph || (revealWords && i === active) ? colors.accent : undefined }}>
                {w}
                {emph && <span style={{ position: "absolute", left: 0, bottom: "-0.08em", height: "0.09em", width: `${underline}%`, borderRadius: 6, background: colors.accent }} />}
              </span>
            );
          })}
        </div>
        <div style={{ height: 8, width: interpolate(enter, [0, 1], [0, 125]), background: colors.accent, marginTop: 40, boxShadow: `0 0 24px ${colors.accent}` }} />
        <BottomVisual visual={visual} colors={colors} />
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

export const ScriptVideo: React.FC<VideoProps> = ({ title, scenes, style, palette, audioSrc, captions, music, speech }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const colors = PALETTES[palette] ?? PALETTES.violet;
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 100], { extrapolateRight: "clamp" });
  const wash = interpolate(frame % 360, [0, 180, 359], [0.4, 1, 0.4]);
  let from = 0;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(145deg, ${colors.bg1} 0%, ${colors.bg2} 100%)`, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 80% 20%, ${colors.accent}22 0%, transparent 38%)`, opacity: wash }} />
      <div style={{ position: "absolute", width: 700, height: 700, border: `1px solid ${colors.accent}45`, borderRadius: "50%", right: -380, top: 250, transform: `rotate(${frame * 0.3}deg)` }} />
      <div style={{ position: "absolute", left: 70, right: 70, top: 72, display: "flex", justifyContent: "space-between", color: `${colors.accent}cc`, font: "bold 18px monospace", letterSpacing: 3 }}><span>CLIPPER / MOTION</span><span>30 FPS</span></div>
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
            <SceneView scene={scene} index={i} count={scenes.length} title={title} style={style} colors={colors} captions={captions} />
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
