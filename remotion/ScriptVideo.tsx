import React from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { kenBurns } from "../lib/scene-image";
import { musicGain } from "../lib/audio";
import { activeWordIndex, clipPlan, phraseLine, spokenFrames, PALETTES, totalFrames, type Scene, type StyleId, type VideoProps } from "../lib/script";
import { chooseFamily } from "../lib/composition";
import { contentBox, MOTION, SAFE } from "../lib/layout";
import { detectVisual, stripMarks } from "../lib/visuals";
import { overlayWindows } from "../lib/overlay";
import { FamilyView } from "./Families";
import { VideoOverlay } from "./Overlays";
import { BottomVisual, TopVisual } from "./SceneVisuals";

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
  const active = activeWordIndex(scene.text, frame, spokenFrames(scene), starts);
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

/** Other footage from the same source video over the speaker. Muted: the speaker's own audio keeps playing underneath. */
function ClipCutaway({ src, startFrame, length }: { src: string; startFrame: number; length: number }) {
  const frame = useCurrentFrame();
  const fade = Math.min(interpolate(frame, [0, 5], [0, 1], { extrapolateRight: "clamp" }), interpolate(frame, [length - 5, length], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <AbsoluteFill style={{ background: "#000", opacity: fade }}>
      <Video src={resolveAudio(src)} trimBefore={startFrame} muted objectFit="cover" />
      {/* Darkens the caption band so white captions stay readable on any footage. */}
      <AbsoluteFill style={{ background: "linear-gradient(to top, #000000c0 0%, #00000070 22%, #0000 44%)" }} />
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

/**
 * The creator's picture behind a scene: full-bleed with a slow Ken Burns move, under a scrim in the palette's
 * own background colour so the palette's text colour keeps its contrast on any photo. Kept lighter at the
 * top so the picture reads, denser where the text sits.
 */
function SceneImage({ src, index, length, colors }: { src: string; index: number; length: number; colors: Colors }) {
  const frame = useCurrentFrame();
  const k = kenBurns(index, frame, length);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={resolveAudio(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${k.scale}) translate(${k.x}%, ${k.y}%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${colors.bg1}66 0%, ${colors.bg1}b8 34%, ${colors.bg1}d9 62%, ${colors.bg1}e6 100%)` }} />
    </AbsoluteFill>
  );
}

function SceneView({ scene, index, count, title, style, colors }: {
  scene: Scene; index: number; count: number; title: string; style: StyleId;
  colors: (typeof PALETTES)[keyof typeof PALETTES];
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = scene.durationInFrames;
  const intensity = scene.narrative?.intensity ?? "emphasis";
  const calm = style === "editorial" || intensity === "quiet";
  // Scenes are contiguous and do not overlap. Fade-in only; fading out the previous scene
  // before the next Sequence starts creates an unintended dim/blank gap between scenes.
  // The first scene is visible from frame 0 so the video thumbnail is never blank.
  const fadeIn = index === 0 ? 1 : interpolate(frame, [0, calm ? 10 : style === "cinematic" ? 14 : 6], [0, 1], { extrapolateRight: "clamp" });
  const drift = interpolate(frame, [0, d], calm ? [6, 0] : style === "cinematic" ? [24, -18] : [14, -4], { easing: Easing.bezier(0.33, 0, 0.2, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const blur = style === "cinematic" && !calm && index > 0 ? interpolate(frame, [0, 14], [10, 0], { extrapolateRight: "clamp" }) : 0;
  const popScale = style === "popup" && intensity === "impact" ? interpolate(spring({ frame, fps, config: MOTION.springFirm }), [0, 1], [0.94, 1]) : 1;

  const visual = scene.visual ?? detectVisual(scene.text);
  const role = scene.narrative?.role ?? (index === 0 ? "hook" : index === count - 1 ? "resolution" : "continuation");
  const family = chooseFamily(visual, scene.narrative, role);
  // Text scenes draw no karaoke caption (it would duplicate the headline), so no caption band is reserved.
  const box = contentBox(false);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {scene.image ? <SceneImage src={scene.image} index={index} length={d} colors={colors} /> : null}
      {/* Everything stays inside the platform safe area; the full safe box is used because text scenes carry no caption band. */}
      <div data-family={family} style={{ position: "absolute", top: box.top, left: SAFE.side, width: box.width, height: box.height, display: "flex", flexDirection: "column", justifyContent: "center", color: colors.text, transform: `translateY(${drift}px) scale(${popScale})`, filter: blur ? `blur(${blur}px)` : undefined }}>
        <FamilyView family={family} scene={scene} visual={visual} role={role} index={index} count={count} title={title} style={style} colors={colors} box={{ width: box.width, height: box.height - 12 }} />
      </div>
    </AbsoluteFill>
  );
}

export const ScriptVideo: React.FC<VideoProps> = ({ title, scenes, style, palette, audioSrc, captions, music, speech, video, overlay, brandMotion }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const colors = PALETTES[palette] ?? PALETTES.violet;
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 100], { extrapolateRight: "clamp" });
  const wash = interpolate(frame % 360, [0, 180, 359], [0.4, 1, 0.4]);
  // Deterministic, lightweight ambient particles (cinematic only, never over the speaker): no image assets, randomness, or extra dependencies.
  const quiet = style === "editorial";
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
      {!quiet && <AbsoluteFill style={{ background: `radial-gradient(circle at 80% 20%, ${colors.accent}22 0%, transparent 38%)`, opacity: wash }} />}
      {particles.map(p => <div key={p.key} aria-hidden="true" style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, borderRadius: "50%", background: colors.accent, opacity: p.opacity, transform: `translateY(${p.drift}px)`, pointerEvents: "none" }} />)}
      {!quiet && <div style={{ position: "absolute", width: 700, height: 700, border: `1px solid ${colors.accent}45`, borderRadius: "50%", right: -380, top: 250, transform: `rotate(${frame * 0.3}deg)` }} />}
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
      {/* Animations over the speaker start when the word they are about is spoken, so they sit on the timeline of the whole
          video (not inside one scene); scenes that take over the picture are drawn above them. */}
      {video ? overlayWindows(scenes, scenes.map(sc => sc.visual ?? detectVisual(sc.text)), durationInFrames).map(w => (
        <Sequence key={`overlay-${w.scene}`} from={w.from} durationInFrames={w.length} name={`Animasi ${w.scene + 1}`}>
          <VideoOverlay scene={scenes[w.scene]} visual={scenes[w.scene].visual ?? detectVisual(scenes[w.scene].text)} colors={colors} position={overlay ?? "top"} length={w.length} offset={w.offset} brandMotion={brandMotion ?? "simple"} />
        </Sequence>
      )) : null}
      {scenes.map((scene, i) => {
        const start = from;
        from += scene.durationInFrames;
        const clip = video ? clipPlan(scene, video.seconds, fps) : null;
        return (
          <Sequence key={i} from={start} durationInFrames={scene.durationInFrames} name={`Scene ${i + 1}`}>
            {video
              ? <>
                {clip && video ? <Sequence from={0} durationInFrames={clip.lengthFrames}><ClipCutaway src={video.src} startFrame={clip.startFrame} length={clip.lengthFrames} /></Sequence> : null}
                {captions ? <VideoCaption scene={scene} /> : null}
                {/* Cutaway: an opaque graphic over the speaker (at most 4 s); the video underneath keeps playing, so audio never breaks. */}
                {scene.cut === "graphic" ? <Sequence from={0} durationInFrames={Math.min(scene.durationInFrames, 120)}><Cutaway scene={scene} colors={colors} length={Math.min(scene.durationInFrames, 120)} /></Sequence> : null}
              </>
              : <SceneView scene={scene} index={i} count={scenes.length} title={title} style={style} colors={colors} />}
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", bottom: 72, left: 70, right: 70, height: quiet ? 2 : 4, background: `${colors.text}30` }}><div style={{ height: "100%", width: `${progress}%`, background: colors.accent }} /></div>
    </AbsoluteFill>
  );
};

export const calculateScriptMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: totalFrames(props.scenes),
});
