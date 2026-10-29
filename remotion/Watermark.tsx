// Custom watermark layer: the last thing drawn, over scenes, captions and overlays. Geometry comes from lib/watermark.ts,
// the same function the clipper's PNG uses, so preview, rendered MP4 and clipper export agree.
import React from "react";
import { AbsoluteFill } from "remotion";
import { HEIGHT, WIDTH } from "../lib/script";
import { cleanWatermarkText, isWatermarkActive, watermarkBox, WATERMARK_FONT, WATERMARK_SHADOW, WATERMARK_WEIGHT, type Watermark } from "../lib/watermark";
import { measureFor } from "./Families";

export function measureWatermark() { return measureFor(WATERMARK_FONT, WATERMARK_WEIGHT); }

export function WatermarkLayer({ watermark }: { watermark?: Watermark }) {
  if (!isWatermarkActive(watermark)) return null;
  const box = watermarkBox(watermark, { width: WIDTH, height: HEIGHT }, measureWatermark());
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div data-testid="watermark" data-position={watermark.position} style={{
        position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height, display: "flex", alignItems: "center",
        justifyContent: box.align === "right" ? "flex-end" : "flex-start", whiteSpace: "nowrap", overflow: "visible",
        fontFamily: WATERMARK_FONT, fontWeight: WATERMARK_WEIGHT, fontSize: box.fontSize, lineHeight: 1, color: "#ffffff",
        opacity: watermark.opacity, textShadow: `0 ${WATERMARK_SHADOW.offsetY}px ${WATERMARK_SHADOW.blur}px ${WATERMARK_SHADOW.color}`,
      }}>{cleanWatermarkText(watermark.text)}</div>
    </AbsoluteFill>
  );
}
