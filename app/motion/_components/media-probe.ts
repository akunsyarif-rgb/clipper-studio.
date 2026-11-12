import { decodeToMono } from "@/lib/recorder";

/** Size and length of a finished MP4 as the browser reads them; undefined where this browser cannot say (checked then skipped). */
export async function probeRendered(blob: Blob): Promise<{ width?: number; height?: number; seconds?: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise(resolve => {
      const v = document.createElement("video");
      const done = (r: { width?: number; height?: number; seconds?: number }) => { v.removeAttribute("src"); v.load(); resolve(r); };
      const t = setTimeout(() => done({}), 5000);
      v.preload = "metadata"; v.muted = true;
      v.onloadedmetadata = () => { clearTimeout(t); done({ width: v.videoWidth || undefined, height: v.videoHeight || undefined, seconds: Number.isFinite(v.duration) ? v.duration : undefined }); };
      v.onerror = () => { clearTimeout(t); done({}); };
      v.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

/** Reads an audio file's duration, decoding it when the media element cannot (e.g. some WAV/OGG on Safari). */
export async function audioDuration(file: File, url: string): Promise<number> {
  const fromElement = await new Promise<number>(resolve => {
    const el = new Audio();
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => resolve(NaN);
    el.src = url;
  });
  if (Number.isFinite(fromElement) && fromElement > 0) return fromElement;
  return (await decodeToMono(file)).seconds;
}
