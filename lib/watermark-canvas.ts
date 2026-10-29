// Browser-only: measures watermark text and draws it into a transparent PNG for FFmpeg. Uses the same fonts,
// geometry and shadow as the Remotion composition (lib/watermark.ts), so preview and file agree.
import { isWatermarkActive, cleanWatermarkText, watermarkBox, WATERMARK_FONT, WATERMARK_PNG_PAD, WATERMARK_SHADOW, WATERMARK_WEIGHT, type TextMeasure, type Watermark } from "./watermark";

function context(): CanvasRenderingContext2D {
  const c = document.createElement("canvas").getContext("2d");
  if (!c) throw new Error("Canvas tidak tersedia di browser ini.");
  return c;
}

/** Width of text at 100 px in the watermark font, as the browser will draw it. */
export function canvasMeasure(): TextMeasure {
  const ctx = context();
  ctx.font = `${WATERMARK_WEIGHT} 100px ${WATERMARK_FONT}`;
  return text => ctx.measureText(text).width;
}

export type WatermarkImage = { data: Uint8Array; x: number; y: number };

/** The watermark as a PNG plus where it goes in an output frame of `frame` size; null when nothing should be drawn. */
export async function renderWatermarkPng(w: Watermark | null | undefined, frame: { width: number; height: number }): Promise<WatermarkImage | null> {
  if (!isWatermarkActive(w)) return null;
  const text = cleanWatermarkText(w.text);
  const box = watermarkBox(w, frame, canvasMeasure());
  const pad = WATERMARK_PNG_PAD;
  const canvas = document.createElement("canvas");
  canvas.width = box.width + pad * 2;
  canvas.height = box.height + pad * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia di browser ini.");
  ctx.globalAlpha = w.opacity;
  ctx.font = `${WATERMARK_WEIGHT} ${box.fontSize}px ${WATERMARK_FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = box.align;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = WATERMARK_SHADOW.color;
  ctx.shadowBlur = WATERMARK_SHADOW.blur;
  ctx.shadowOffsetY = WATERMARK_SHADOW.offsetY;
  ctx.fillText(text, box.align === "right" ? pad + box.width : pad, pad + box.height / 2);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Gambar watermark gagal dibuat.");
  return { data: new Uint8Array(await blob.arrayBuffer()), x: box.x - pad, y: box.y - pad };
}
