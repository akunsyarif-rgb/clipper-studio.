// Browser-only MP4 rendering with @remotion/web-renderer (WebCodecs). Nothing is uploaded or rendered on a server.
import { ScriptVideo } from "../remotion/ScriptVideo";
import { FPS, HEIGHT, totalFrames, WIDTH, type VideoProps } from "./script";

const LICENSE_KEY = process.env.NEXT_PUBLIC_REMOTION_LICENSE_KEY || null;

export async function checkBrowserRender(muted: boolean): Promise<string | null> {
  if (typeof VideoEncoder === "undefined") return "Browser ini belum mendukung WebCodecs (VideoEncoder). Gunakan Chrome/Edge terbaru atau Safari 17+, atau render lewat CLI.";
  const { canRenderMediaOnWeb } = await import("@remotion/web-renderer");
  const res = await canRenderMediaOnWeb({ width: WIDTH, height: HEIGHT, container: "mp4", videoCodec: "h264", audioCodec: muted ? null : "aac", muted });
  if (res.canRender) return null;
  return res.issues.filter(i => i.severity === "error").map(i => i.message).join(" ") || "Browser ini tidak dapat merender MP4.";
}

export async function renderMp4(props: VideoProps, opts: { signal: AbortSignal; onProgress: (fraction: number) => void }): Promise<Blob> {
  const { renderMediaOnWeb } = await import("@remotion/web-renderer");
  const muted = !props.audioSrc;
  const result = await renderMediaOnWeb({
    composition: { id: "ScriptVideo", component: ScriptVideo, width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: totalFrames(props.scenes), defaultProps: props },
    inputProps: props,
    container: "mp4",
    videoCodec: "h264",
    audioCodec: muted ? null : "aac",
    muted,
    signal: opts.signal,
    onProgress: p => opts.onProgress(Math.max(0, Math.min(1, p.progress))),
    licenseKey: LICENSE_KEY,
    logLevel: "error",
  });
  return result.getBlob();
}
