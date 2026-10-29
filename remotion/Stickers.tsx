// A sticker pop: a Twemoji graphic (self-hosted SVG, CC-BY 4.0; credit in the UI and the brief) that springs in with a little
// overshoot and tilt, then floats gently. Frame-driven, no text. Drawn with <Img>, which the browser MP4 renderer waits for.
import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { STICKER_BY_ID } from "../lib/stickers";

function stickerUrl(file: string): string {
  try { return staticFile(`stickers/${file}`); } catch { return `/stickers/${file}`; }
}

export function StickerPop({ id, size }: { id: string; size: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sticker = STICKER_BY_ID[id];
  if (!sticker) return null;
  const pop = spring({ frame: frame - 3, fps, config: { damping: 9, stiffness: 140, mass: 0.6 } });
  const tilt = interpolate(pop, [0, 1], [-24, -8]);
  const float = Math.sin(frame / 14) * (size * 0.025);
  return (
    <div data-sticker={id} style={{ width: size, height: size, opacity: Math.max(0.2, Math.min(1, pop * 1.4)), transform: `translateY(${float}px) rotate(${tilt}deg) scale(${Math.max(0.01, pop)})`, filter: "drop-shadow(0 10px 18px #0006)" }}>
      <Img src={stickerUrl(sticker.file)} alt="" style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
