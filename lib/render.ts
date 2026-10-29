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

/**
 * Encoder settings tried in order. Browsers differ in which H.264 encoders they expose (Safari: hardware
 * VideoToolbox only; Linux Chromium: software only), so every attempt is checked with
 * VideoEncoder.isConfigSupported first and skipped when the browser says it cannot run it.
 */
const ATTEMPTS = [
  { label: "default", hardwareAcceleration: "no-preference" as const, videoBitrate: "medium" as const, checkBitrate: 8_000_000, keyframeIntervalInSeconds: 5 },
  { label: "hardware", hardwareAcceleration: "prefer-hardware" as const, videoBitrate: 8_000_000, checkBitrate: 8_000_000, keyframeIntervalInSeconds: 2 },
  { label: "software", hardwareAcceleration: "prefer-software" as const, videoBitrate: 6_000_000, checkBitrate: 6_000_000, keyframeIntervalInSeconds: 2 },
];

async function encoderSupports(hardwareAcceleration: HardwareAcceleration, bitrate: number): Promise<boolean> {
  try {
    const res = await VideoEncoder.isConfigSupported({ codec: "avc1.640028", width: WIDTH, height: HEIGHT, bitrate, framerate: FPS, hardwareAcceleration });
    return res.supported === true;
  } catch { return false; }
}

export class RenderFailure extends Error {
  constructor(message: string, readonly detail: string) { super(message); this.name = "RenderFailure"; }
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}${err.stack ? "\n" + err.stack.split("\n").slice(0, 4).join("\n") : ""}`;
  return String(err);
}

export async function renderMp4(props: VideoProps, opts: { signal: AbortSignal; onProgress: (fraction: number) => void; onRetry?: () => void }): Promise<Blob> {
  const { renderMediaOnWeb } = await import("@remotion/web-renderer");
  // Fonts first: text is fitted with their real metrics, and the first frame must not be drawn in a fallback face.
  const { ensureFonts } = await import("../remotion/fonts");
  const { resolveTypePack } = await import("./fonts");
  await ensureFonts(resolveTypePack(props.typography));
  const muted = !props.audioSrc && !props.music && !props.video && !props.sfx;
  const failures: string[] = [];
  let tried = 0;
  for (const attempt of ATTEMPTS) {
    // The default attempt always runs (the renderer picks its own codec profile); alternatives only if supported.
    if (attempt.label !== "default" && !(await encoderSupports(attempt.hardwareAcceleration, attempt.checkBitrate))) {
      failures.push(`[${attempt.label}] skipped: encoder configuration not supported by this browser`);
      continue;
    }
    if (tried++ > 0) { opts.onRetry?.(); opts.onProgress(0); }
    try {
      const result = await renderMediaOnWeb({
        composition: { id: "ScriptVideo", component: ScriptVideo, width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: totalFrames(props.scenes), defaultProps: props },
        inputProps: props,
        container: "mp4",
        videoCodec: "h264",
        audioCodec: muted ? null : "aac",
        muted,
        hardwareAcceleration: attempt.hardwareAcceleration,
        videoBitrate: attempt.videoBitrate,
        keyframeIntervalInSeconds: attempt.keyframeIntervalInSeconds,
        signal: opts.signal,
        onProgress: p => opts.onProgress(Math.max(0, Math.min(1, p.progress))),
        licenseKey: LICENSE_KEY,
        logLevel: "error",
      });
      return await result.getBlob();
    } catch (err) {
      if (opts.signal.aborted) throw err;
      failures.push(`[${attempt.label}] ${describe(err)}`);
    }
  }
  throw new RenderFailure(failures.find(f => !f.includes("skipped")) ?? failures[0] ?? "Render gagal", failures.join("\n\n"));
}

/** Browser/encoder facts to include in bug reports; contains no user content. */
export async function environmentReport(): Promise<string> {
  const lines = [`UA: ${navigator.userAgent}`, `WebCodecs: VideoEncoder=${typeof VideoEncoder !== "undefined"} AudioEncoder=${typeof AudioEncoder !== "undefined"}`];
  if (typeof VideoEncoder !== "undefined") {
    for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42001f"]) {
      try {
        const s = await VideoEncoder.isConfigSupported({ codec, width: WIDTH, height: HEIGHT, bitrate: 8_000_000, framerate: FPS });
        lines.push(`${codec} ${WIDTH}x${HEIGHT}: ${s.supported ? "supported" : "not supported"}`);
      } catch (e) { lines.push(`${codec}: ${describe(e)}`); }
    }
  }
  if (typeof VideoEncoder !== "undefined") {
    for (const a of ATTEMPTS.slice(1)) lines.push(`avc1.640028 ${a.label}: ${(await encoderSupports(a.hardwareAcceleration, a.checkBitrate)) ? "supported" : "not supported"}`);
  }
  return lines.join("\n");
}
