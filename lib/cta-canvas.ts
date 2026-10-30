// Browser-only: draws the closing call to action into a transparent PNG for FFmpeg (a dark rounded label with white text), with
// the same font as the watermark so it reads the same on every device. Geometry comes from lib/cta.ts.
import { ctaBox, ctaTiming, resolveCta, type CtaSettings } from "./cta";
import { canvasMeasure } from "./watermark-canvas";
import { WATERMARK_FONT, watermarkInsets, type Watermark } from "./watermark";

/** A rounded rectangle path without `roundRect`, which Safari only has from version 16. */
function roundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r); ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
}

export type CtaImage = { data: Uint8Array; x: number; y: number; start: number; fade: number; text: string };

/**
 * The CTA picture for one clip, or null when it is switched off or the clip is too short. `content` is what the clip says (the
 * line is written from it unless the creator typed their own); `watermark` keeps the label clear of a bottom watermark.
 */
export async function renderCtaPng(
  settings: CtaSettings,
  content: { text?: string; title?: string; hook?: string },
  clipSeconds: number,
  frame: { width: number; height: number },
  watermark?: Watermark | null,
): Promise<CtaImage | null> {
  const timing = ctaTiming(clipSeconds);
  const text = resolveCta(settings, content);
  if (!timing || !text) return null;
  const measure = canvasMeasure(); // width at 100 px in the watermark font (weight 800)
  const clear = watermarkInsets(watermark, frame, measure).bottom;
  const box = ctaBox(text, frame, measure, clear);
  const canvas = document.createElement("canvas");
  canvas.width = box.width; canvas.height = box.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia di browser ini.");
  ctx.fillStyle = "rgba(10, 14, 12, 0.72)";
  roundedRect(ctx, box.width, box.height, box.radius);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${box.fontSize}px ${WATERMARK_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  box.lines.forEach((line, i) => ctx.fillText(line, box.width / 2, box.padY + box.lineHeight * (i + 0.5)));
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Gambar ajakan gagal dibuat.");
  return { data: new Uint8Array(await blob.arrayBuffer()), x: box.x, y: box.y, start: timing.start, fade: timing.fade, text };
}
