import React from "react";
import { Video } from "@remotion/media";
import { AbsoluteFill, Freeze, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderEdit } from "../lib/edit-profile";

/**
 * The picture-only edits of the music and comedy profiles, drawn over the base video: a held frame (the sound keeps playing
 * underneath), a small muted replay of the punchline during the reaction, and a short white flash. The zoom of punch-ins and
 * pulses is applied to the base video itself (see `zoomAt`). Nothing here changes the audio or the length of the video.
 */
export function EditLayers({ edits, src, trimStart, zoom }: { edits: RenderEdit[]; src: string; trimStart: number; zoom: (t: number) => number }) {
  const { fps } = useVideoConfig();
  return <>
    {edits.map((e, i) => {
      const from = Math.round(e.at * fps), length = Math.max(1, Math.round(e.duration * fps));
      if (e.kind === "freeze") return (
        <Sequence key={i} from={from} durationInFrames={length} name="Bekukan gambar">
          <AbsoluteFill style={{ transform: `scale(${zoom(e.at)})`, transformOrigin: "50% 40%" }}>
            <Freeze frame={0}><Video src={src} trimBefore={Math.round((trimStart + e.at) * fps)} muted objectFit="cover" /></Freeze>
          </AbsoluteFill>
        </Sequence>
      );
      if (e.kind === "replay") return (
        <Sequence key={i} from={from} durationInFrames={length} name="Ulang punchline"><Replay src={src} startFrame={Math.round((e.from ?? 0) * fps)} length={length} /></Sequence>
      );
      if (e.kind === "flash") return <Sequence key={i} from={from} durationInFrames={length} name="Kilat"><Flash length={length} /></Sequence>;
      return null;
    })}
  </>;
}

function Replay({ src, startFrame, length }: { src: string; startFrame: number; length: number }) {
  const frame = useCurrentFrame();
  const show = Math.min(interpolate(frame, [0, 5], [0, 1], { extrapolateRight: "clamp" }), interpolate(frame, [length - 5, length], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-start", padding: "260px 70px 0 0" }}>
      <div data-edit="replay" style={{ position: "relative", width: 380, height: 676, borderRadius: 26, overflow: "hidden", border: "6px solid #fff", boxShadow: "0 18px 50px #000a", opacity: show, transform: `scale(${0.9 + 0.1 * show})` }}>
        <Video src={src} trimBefore={startFrame} muted objectFit="cover" />
        <div style={{ position: "absolute", left: 16, top: 14, padding: "4px 14px", borderRadius: 999, background: "#ff3b30", color: "#fff", font: "800 30px Arial, sans-serif", letterSpacing: 1 }}>ULANG</div>
      </div>
    </AbsoluteFill>
  );
}

function Flash({ length }: { length: number }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill data-edit="flash" style={{ background: "#fff", opacity: interpolate(frame, [0, Math.max(1, length)], [0.75, 0], { extrapolateRight: "clamp" }) }} />;
}
