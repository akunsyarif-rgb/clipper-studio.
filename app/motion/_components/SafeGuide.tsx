import { HEIGHT, WIDTH } from "@/lib/script";
import { CAPTION_BOTTOM, contentBox, SAFE, SQUARE_CROP } from "@/lib/layout";

/** Safe-zone guide drawn over the preview only (percentages of the 1080×1920 frame); never part of the rendered video. */
export default function SafeGuide() {
  const x = (v: number) => `${(v / WIDTH) * 100}%`, y = (v: number) => `${(v / HEIGHT) * 100}%`;
  const box = contentBox(false);
  const shade = { position: "absolute" as const, background: "rgba(255,60,60,0.22)" };
  return (
    <div data-testid="safe-guide" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ ...shade, left: 0, right: 0, top: 0, height: y(SAFE.top) }} />
      <div style={{ ...shade, left: 0, right: 0, bottom: 0, height: y(SAFE.bottom) }} />
      <div style={{ ...shade, left: 0, width: x(SAFE.side), top: y(SAFE.top), bottom: y(SAFE.bottom) }} />
      <div style={{ ...shade, right: 0, width: x(SAFE.side), top: y(SAFE.top), bottom: y(SAFE.bottom) }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: y(SQUARE_CROP.top), height: y(SQUARE_CROP.bottom - SQUARE_CROP.top), border: "1px dashed #59b7ff" }} />
      <div style={{ position: "absolute", left: x(SAFE.side), right: x(SAFE.side), top: y(box.top), height: y(box.height), border: "1px dashed #ffffffcc" }} />
      <div style={{ position: "absolute", left: x(SAFE.side), right: x(SAFE.side), top: y(HEIGHT - CAPTION_BOTTOM), borderTop: "2px solid #ffe066" }} />
    </div>
  );
}
