// Scene images for faceless videos: the creator's own pictures behind a scene, slowly moving (Ken Burns).
// Images stay on the device: they are not uploaded, synced or saved with the session.

/** Longest side, in px, an image is reduced to. The canvas is 1080×1920 and Ken Burns zooms at most 12 %. */
export const MAX_IMAGE_SIDE = 2200;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];

/** Size an image is drawn at so that its longest side is at most `max`; never enlarged. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type KenBurns = { scale: number; x: number; y: number };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Slow camera move over a still for one scene: consecutive scenes alternate zooming in and out and
 * panning in opposite directions, so a sequence of stills never repeats the same move. Pure and
 * frame-based, so preview and render match. x/y are percentages of the image size (CSS translate).
 */
export function kenBurns(index: number, frame: number, durationInFrames: number): KenBurns {
  const t = easeInOut(Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames))));
  const zoomIn = index % 2 === 0;
  const from = zoomIn ? 1.02 : 1.12, to = zoomIn ? 1.12 : 1.02;
  const dir = index % 4 < 2 ? 1 : -1;
  // Pan stays well inside the margin the zoom creates (at 1.02 that is 1 % per side), so no edge shows.
  return { scale: from + (to - from) * t, x: dir * (t - 0.5) * 1.6, y: (zoomIn ? -1 : 1) * (t - 0.5) * 0.8 };
}

/** Indonesian message for a file that cannot be used as a scene image, or null when it can. */
export function imageProblem(file: { type: string; size: number; name: string }): string | null {
  const type = file.type || (/\.(jpe?g)$/i.test(file.name) ? "image/jpeg" : /\.png$/i.test(file.name) ? "image/png" : /\.webp$/i.test(file.name) ? "image/webp" : /\.hei[cf]$/i.test(file.name) ? "image/heic" : "");
  if (!IMAGE_TYPES.includes(type)) return "Pilih gambar JPG, PNG, WebP, atau HEIC.";
  if (file.size > MAX_IMAGE_BYTES) return "Gambar terlalu besar (maks. 25 MB).";
  return null;
}

/**
 * Decodes the picked file and re-encodes it as a JPEG no larger than MAX_IMAGE_SIDE, so a dozen phone
 * photos do not exhaust an iPad's memory during rendering. Browser only. Falls back to the original
 * file when the browser cannot re-encode it.
 */
export async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("Browser tidak dapat membuka gambar ini. Coba JPG atau PNG."); }
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    if (size.width === bitmap.width && size.height === bitmap.height && file.type === "image/jpeg") return file;
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    canvas.width = canvas.height = 0; // releases the pixels at once on Safari
    return blob ?? file;
  } finally { bitmap.close(); }
}
