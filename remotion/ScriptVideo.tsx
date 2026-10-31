import React from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { kenBurns } from "../lib/scene-image";
import { musicGain } from "../lib/audio";
import { type CaptionStyleId, activeWordIndex, clipPlan, HEIGHT, phraseLine, spokenFrames, PALETTES, totalFrames, WIDTH, type Scene, type StyleId, type VideoProps } from "../lib/script";
import { chooseFamily, planLayouts, type Layout } from "../lib/composition";
import { CAPTION_BOTTOM, CONTENT_WIDTH, contentBox, MOTION, SAFE, setActiveType, TYPE } from "../lib/layout";
import { detectVisual, stripMarks } from "../lib/visuals";
import { overlayWindows } from "../lib/overlay";
import { watermarkInsets } from "../lib/watermark";
import { resolveTypePack } from "../lib/fonts";
import { useFonts } from "./fonts";
import { GrainOverlay, Glow, MeshBackdrop } from "./Backdrops";
import { measureWatermark, WatermarkLayer } from "./Watermark";
import { FamilyView } from "./Families";
import { VideoOverlay } from "./Overlays";
import { BottomVisual, TopVisual } from "./SceneVisuals";
import { EditLayers } from "./EditEffects";
import { zoomAt } from "../lib/edit-profile";

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

/** Hard outline around text without relying on -webkit-text-stroke (eight shadows draw the same in every engine). */
function outlineShadow(px: number, color = "#000"): string {
  const d = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  return d.map(([x, y]) => `${(x * px).toFixed(1)}px ${(y * px).toFixed(1)}px 0 ${color}`).join(", ") + `, 0 ${px * 1.6}px ${px * 3}px #000a`;
}

/** Caption over the speaker (source-video edits): short phrase, spoken word highlighted, stable layout. */
function VideoCaption({ scene, captionStyle, colors, emphasis }: { scene: Scene; captionStyle: CaptionStyleId; colors: Colors; /** Comedy: punchline ranges (output seconds) and where this scene starts (frame). */ emphasis?: { ranges: { from: number; to: number }[]; sceneStart: number } }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const punch = !!emphasis && emphasis.ranges.some(r => (emphasis.sceneStart + frame) / fps >= r.from && (emphasis.sceneStart + frame) / fps <= r.to + 0.3);
  const state = captionState(scene, frame);
  if (!state) return null;
  const pop = Math.min(1, spring({ frame: state.since, fps, config: { damping: 16, stiffness: 220, mass: 0.5 } }));
  const words = state.line.words, activeIn = state.line.activeInLine;
  const wrap = { maxWidth: CONTENT_WIDTH, textAlign: "center" as const, lineHeight: 1.12, opacity: Math.min(1, 0.2 + pop), transform: `translateY(${(1 - pop) * 18}px) scale(${0.94 + 0.06 * pop})` };
  const base = { classic: { fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 76, letterSpacing: -1 }, pop: { fontFamily: TYPE.display, fontWeight: 900, fontSize: 88, letterSpacing: TYPE.tracking }, outline: { fontFamily: TYPE.sans, fontWeight: 800, fontSize: 74, letterSpacing: -0.5 }, box: { fontFamily: TYPE.display, fontWeight: 800, fontSize: 72, letterSpacing: TYPE.tracking } }[captionStyle];
  const cap = (captionStyle === "pop" || captionStyle === "box") && TYPE.caps;
  const text = (w: string) => (cap ? w.toLocaleUpperCase("id") : w);
  const gap = (i: number) => (i < words.length - 1 ? " " : "");
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: CAPTION_BOTTOM }}>
      <div data-caption-style={captionStyle} data-punch={punch ? "1" : undefined} style={{ ...wrap, ...base, ...(punch ? { fontSize: Math.round(base.fontSize * 1.18), transform: `${wrap.transform} rotate(-2deg)` } : {}), color: "#fff", textShadow: captionStyle === "classic" ? "0 4px 22px #000d, 0 0 3px #000c" : captionStyle === "box" ? "0 3px 14px #000c" : outlineShadow(captionStyle === "pop" ? 6 : 4) }}>
        {words.map((w, i) => {
          const on = i === activeIn;
          if (captionStyle === "classic") return <span key={i} style={{ color: on ? "#ffe066" : "#fff" }}>{w}{gap(i)}</span>;
          if (captionStyle === "outline") return <span key={i} style={{ color: on ? "#ffe066" : "#fff" }}>{w}{gap(i)}</span>;
          if (captionStyle === "pop") return <span key={i} style={{ display: "inline-block", color: on ? colors.accent : "#fff", transform: on ? "scale(1.12)" : undefined, marginRight: i < words.length - 1 ? "0.25em" : 0 }}>{text(w)}</span>;
          // box: the spoken word sits on an accent-coloured rounded box, dark text for contrast.
          return <span key={i} style={{ display: "inline-block", padding: "0 0.18em", margin: "0 0.04em", borderRadius: "0.22em", background: on ? colors.accent : "transparent", color: on ? colors.bg1 : "#fff", textShadow: on ? "none" : undefined }}>{text(w)}</span>;
        })}
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
function Cutaway({ scene, colors, length, index }: { scene: Scene; colors: Colors; length: number; index: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const visual = scene.visual ?? detectVisual(scene.text);
  const state = captionState(scene, frame);
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 140, mass: 0.6 } });
  const fade = Math.min(interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }), interpolate(frame, [length - 6, length], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const bottom = visual.template === "compare" || visual.template === "cta" || (visual.template === "statement" && !!visual.icon);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(145deg, ${colors.bg1} 0%, ${colors.bg2} 100%)`, opacity: fade }}>
      {scene.videoSrc ? <SceneImage src={scene.videoSrc} video index={index} length={length} colors={colors} /> : scene.image ? <SceneImage src={scene.image} index={index} length={length} colors={colors} /> : null}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${SAFE.side}px`, color: colors.text, transform: `scale(${0.92 + 0.08 * Math.min(1, enter)})` }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", width: "100%" }}>
          {bottom ? <div style={{ transform: "scale(1.35)", margin: "0 0 40px" }}><BottomVisual visual={{ ...visual, template: visual.template }} colors={colors} /></div> : <TopVisual visual={visual} colors={colors} sceneFrames={length} />}
          <div style={{ minHeight: 190, display: "flex", alignItems: "center", justifyContent: "center", maxWidth: CONTENT_WIDTH, fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 72, lineHeight: 1.12, letterSpacing: -1, marginTop: bottom ? 30 : 10 }}>
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
function SceneImage({ src, video, index, length, colors }: { src: string; video?: boolean; index: number; length: number; colors: Colors }) {
  const frame = useCurrentFrame();
  const k = kenBurns(index, frame, length);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {video ? <Video src={resolveAudio(src)} muted objectFit="cover" /> : <Img src={resolveAudio(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${k.scale}) translate(${k.x}%, ${k.y}%)` }} />}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${colors.bg1}66 0%, ${colors.bg1}b8 34%, ${colors.bg1}d9 62%, ${colors.bg1}e6 100%)` }} />
    </AbsoluteFill>
  );
}

function SceneView({ scene, index, count, title, style, colors, layout, insets, storyVisuals }: {
  layout: Layout; insets: { top: number; bottom: number }; storyVisuals: boolean; scene: Scene; index: number; count: number; title: string; style: StyleId;
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
  // Narrative intensity is meaningful across presets: impact scenes get a restrained spring entrance even in cinematic/kinetic styles.
  const popScale = intensity === "impact" ? interpolate(spring({ frame, fps, config: MOTION.springFirm }), [0, 1], [0.94, 1]) : 1;

  const visual = scene.visual ?? detectVisual(scene.text);
  const role = scene.narrative?.role ?? (index === 0 ? "hook" : index === count - 1 ? "resolution" : "continuation");
  const family = chooseFamily(visual, scene.narrative, role);
  // Text scenes draw no karaoke caption (it would duplicate the headline), so no caption band is reserved.
  const box = contentBox(false, insets);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {scene.image ? <SceneImage src={scene.image} index={index} length={d} colors={colors} /> : null}
      {/* Everything stays inside the platform safe area; the full safe box is used because text scenes carry no caption band. */}
      <div data-family={family} style={{ position: "absolute", top: box.top, left: SAFE.side, width: box.width, height: box.height, display: "flex", flexDirection: "column", justifyContent: "center", color: colors.text, transform: `translateY(${drift}px) scale(${popScale})`, filter: blur ? `blur(${blur}px)` : undefined }}>
        <FamilyView family={family} scene={scene} visual={visual} role={role} index={index} count={count} title={title} style={style} colors={colors} layout={layout} storyVisuals={storyVisuals} box={{ width: box.width, height: box.height - 12 }} />
      </div>
    </AbsoluteFill>
  );
}

export const ScriptVideo: React.FC<VideoProps> = ({ title, scenes, style, palette, audioSrc, captions, music, speech, video, overlay, brandMotion, watermark, storyVisuals, typography, captionStyle, backdrop, grain, sfx, edits, captionEmphasis }) => {
  // The type pack is set before anything below draws or measures text, and the frame waits for its fonts.
  const pack = resolveTypePack(typography);
  setActiveType(pack);
  useFonts(pack);
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
  // One layout per scene, planned across the whole timeline so adjacent calm scenes alternate.
  const layouts = planLayouts(scenes.map((sc, i) => {
    const role = sc.narrative?.role ?? (i === 0 ? "hook" : i === scenes.length - 1 ? "resolution" : "continuation");
    return { family: chooseFamily(sc.visual ?? detectVisual(sc.text), sc.narrative, role), role, intensity: sc.narrative?.intensity };
  }));
  // A watermark reserves its own strip, so scenes and overlays keep clear of it (nothing reserved when it is off or empty).
  const insets = watermarkInsets(watermark, { width: WIDTH, height: HEIGHT }, measureWatermark());
  let from = 0;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(145deg, ${colors.bg1} 0%, ${colors.bg2} 100%)`, overflow: "hidden" }}>
      {!quiet && <AbsoluteFill><Glow cx={WIDTH * 0.8} cy={HEIGHT * 0.2} radius={670} color={colors.accent} alpha="22" opacity={wash} /></AbsoluteFill>}
      {particles.map(p => <div key={p.key} aria-hidden="true" style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, borderRadius: "50%", background: colors.accent, opacity: p.opacity, transform: `translateY(${p.drift}px)`, pointerEvents: "none" }} />)}
      {!quiet && <div style={{ position: "absolute", width: 700, height: 700, border: `1px solid ${colors.accent}45`, borderRadius: "50%", right: -380, top: 250, transform: `rotate(${frame * 0.3}deg)` }} />}
      {backdrop === "mesh" && !video ? <MeshBackdrop colors={colors} /> : null}
      {video ? (video.audioOnly ? <Audio src={resolveAudio(video.src)} trimBefore={Math.round((video.trimStart ?? 0) * fps)} /> : <AbsoluteFill style={edits?.length ? { transform: `scale(${zoomAt(edits, frame / fps)})`, transformOrigin: "50% 40%" } : undefined}><Video src={resolveAudio(video.src)} trimBefore={Math.round((video.trimStart ?? 0) * fps)} objectFit="cover" /></AbsoluteFill>) : null}
      {video && !video.audioOnly && edits?.length ? <EditLayers edits={edits} src={resolveAudio(video.src)} trimStart={video.trimStart ?? 0} zoom={t => zoomAt(edits, t)} /> : null}
      {audioSrc ? <Audio src={resolveAudio(audioSrc)} /> : null}
      {sfx ? <Audio src={resolveAudio(sfx.src)} volume={sfx.volume} /> : null}
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
          <VideoOverlay scene={scenes[w.scene]} visual={scenes[w.scene].visual ?? detectVisual(scenes[w.scene].text)} colors={colors} position={overlay ?? "top"} length={w.length} offset={w.offset} brandMotion={brandMotion ?? "simple"} topInset={insets.top} />
        </Sequence>
      )) : null}
      {scenes.map((scene, i) => {
        const start = from;
        from += scene.durationInFrames;
        // Another part of the same footage only exists when there is footage: an audio file has no picture to cut away to.
        const clip = video && !video.audioOnly ? clipPlan(scene, video.seconds, fps) : null;
        return (
          <Sequence key={i} from={start} durationInFrames={scene.durationInFrames} name={`Scene ${i + 1}`}>
            {video
              ? <>
                {clip && video ? <Sequence from={0} durationInFrames={clip.lengthFrames}><ClipCutaway src={video.src} startFrame={clip.startFrame} length={clip.lengthFrames} /></Sequence> : null}
                {captions ? <VideoCaption scene={scene} captionStyle={captionStyle ?? "classic"} colors={colors} emphasis={captionEmphasis?.length ? { ranges: captionEmphasis, sceneStart: start } : undefined} /> : null}
                {/* Cutaway: an opaque graphic over the speaker (at most 4 s); the video underneath keeps playing, so audio never breaks. */}
                {scene.cut === "graphic" ? <Sequence from={0} durationInFrames={Math.min(scene.durationInFrames, 120)}><Cutaway scene={scene} colors={colors} length={Math.min(scene.durationInFrames, 120)} index={i} /></Sequence> : null}
              </>
              : <SceneView scene={scene} index={i} count={scenes.length} title={title} style={style} colors={colors} layout={layouts[i]} insets={insets} storyVisuals={storyVisuals !== false} />}
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", bottom: 72, left: 70, right: 70, height: quiet ? 2 : 4, background: `${colors.text}30` }}><div style={{ height: "100%", width: `${progress}%`, background: colors.accent }} /></div>
      {grain && !video ? <GrainOverlay /> : null}
      <WatermarkLayer watermark={watermark} />
    </AbsoluteFill>
  );
};

export const calculateScriptMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: totalFrames(props.scenes),
});
