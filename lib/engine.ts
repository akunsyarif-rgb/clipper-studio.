// Browser-only FFmpeg (WebAssembly) wrapper. The core is self-hosted under /ffmpeg (copied at build time).
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { AUDIO_OUTPUT_NAME, audioArgs, ffmpegArgs, logTime, OUTPUT_NAME, type Aspect, type Fit, type Quality } from "./clip";

export const CORE_BASE = "/ffmpeg";

export class ExportCancelled extends Error {
  constructor() { super("Ekspor dibatalkan."); }
}

let engine: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let lastLogs: string[] = [];
let onLine: ((line: string) => void) | null = null;

export function isEngineLoaded() { return engine !== null; }

export function loadEngine(): Promise<FFmpeg> {
  if (engine) return Promise.resolve(engine);
  if (loading) return loading;
  loading = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    ff.on("log", ({ message }) => {
      lastLogs.push(message);
      if (lastLogs.length > 40) lastLogs.shift();
      onLine?.(message);
    });
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    engine = ff;
    return ff;
  })();
  loading.catch(() => undefined).finally(() => { loading = null; });
  return loading;
}

/** Kills the worker; the next export reloads the engine. Used for cancel. */
export function terminateEngine() {
  engine?.terminate();
  engine = null;
  loading = null;
}

export type ExportJob = {
  file: File;
  start: number;
  duration: number;
  aspect: Aspect;
  quality: Quality;
  fit: Fit;
  onProgress: (fraction: number) => void;
};

export async function exportClip(job: ExportJob): Promise<Blob> {
  const ff = await loadEngine();
  lastLogs = [];
  onLine = line => {
    const t = logTime(line);
    if (Number.isFinite(t)) job.onProgress(Math.max(0, Math.min(0.99, t / job.duration)));
  };
  const mountPoint = "/input";
  let input = "";
  let mounted = false;
  try {
    // WORKERFS reads the File lazily instead of copying the whole source into WebAssembly memory.
    try {
      const { FFFSType } = await import("@ffmpeg/ffmpeg");
      await ff.createDir(mountPoint).catch(() => undefined);
      await ff.mount(FFFSType.WORKERFS, { files: [job.file] }, mountPoint);
      mounted = true;
      input = `${mountPoint}/${job.file.name}`;
    } catch {
      const { fetchFile } = await import("@ffmpeg/util");
      input = "source-video";
      await ff.writeFile(input, await fetchFile(job.file));
    }
    const code = await ff.exec(ffmpegArgs(input, job, job.aspect, job.quality, job.fit));
    if (code !== 0) throw new Error(`FFmpeg keluar dengan kode ${code}: ${lastLogs.slice(-6).join(" | ")}`);
    const data = await ff.readFile(OUTPUT_NAME);
    if (typeof data === "string" || data.byteLength < 1024) throw new Error(`Output MP4 kosong. ${lastLogs.slice(-6).join(" | ")}`);
    job.onProgress(1);
    return new Blob([data as BlobPart], { type: "video/mp4" });
  } finally {
    onLine = null;
    if (engine === ff) {
      await ff.deleteFile(OUTPUT_NAME).catch(() => undefined);
      if (mounted) await ff.unmount(mountPoint).catch(() => undefined);
      else if (input) await ff.deleteFile(input).catch(() => undefined);
    }
  }
}

/**
 * Extracts the original audio of a range as 16 kHz mono samples (-1..1) for speech recognition.
 * Read-only: the source video and the export pipeline are untouched.
 */
export async function extractAudio(file: File, range: { start: number; duration: number }): Promise<Float32Array> {
  const ff = await loadEngine();
  lastLogs = [];
  const mountPoint = "/asr-input";
  let input = "";
  let mounted = false;
  try {
    try {
      const { FFFSType } = await import("@ffmpeg/ffmpeg");
      await ff.createDir(mountPoint).catch(() => undefined);
      await ff.mount(FFFSType.WORKERFS, { files: [file] }, mountPoint);
      mounted = true;
      input = `${mountPoint}/${file.name}`;
    } catch {
      const { fetchFile } = await import("@ffmpeg/util");
      input = "asr-source-video";
      await ff.writeFile(input, await fetchFile(file));
    }
    const code = await ff.exec(audioArgs(input, range));
    const logs = lastLogs.slice(-6).join(" | ");
    if (code !== 0 && /matches no streams|does not contain any stream/i.test(logs)) throw new Error("no audio: video tidak punya audio");
    if (code !== 0) throw new Error(`FFmpeg keluar dengan kode ${code}: ${logs}`);
    const data = await ff.readFile(AUDIO_OUTPUT_NAME);
    if (typeof data === "string" || data.byteLength < 3200) throw new Error("no audio: video tidak punya audio");
    const pcm = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength - (data.byteLength % 2)));
    const out = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
    return out;
  } finally {
    if (engine === ff) {
      await ff.deleteFile(AUDIO_OUTPUT_NAME).catch(() => undefined);
      if (mounted) await ff.unmount(mountPoint).catch(() => undefined);
      else if (input) await ff.deleteFile(input).catch(() => undefined);
    }
  }
}
