// Browser-only microphone recording and narration analysis. Audio never leaves the device.
import { encodeWav, MAX_RECORDING_SECONDS, normalize, speechEnvelope } from "./audio";
import { FPS } from "./script";

type AudioContextCtor = typeof AudioContext;

function audioContext(): AudioContext {
  const Ctor: AudioContextCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio API tidak tersedia di browser ini.");
  return new Ctor();
}

/** Decodes any browser-supported audio file to mono samples. */
export async function decodeToMono(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number; seconds: number }> {
  const ctx = audioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / decoded.numberOfChannels;
    }
    return { samples: mono, sampleRate: decoded.sampleRate, seconds: decoded.duration };
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

export type Narration = { file: File; url: string; seconds: number; speech: number[] | null; recorded: boolean };

/** Uploaded narration: keep the original file, analyse it for ducking when the browser can decode it. */
export async function analyseNarration(file: File): Promise<{ seconds: number | null; speech: number[] | null }> {
  try {
    const { samples, sampleRate, seconds } = await decodeToMono(file);
    return { seconds, speech: speechEnvelope(samples, sampleRate, FPS) };
  } catch {
    return { seconds: null, speech: null };
  }
}

export function recordingSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export function explainMicError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Izin mikrofon ditolak. Di iPad: Pengaturan › Safari › Mikrofon › Izinkan, lalu muat ulang halaman.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Mikrofon tidak ditemukan.";
  if (name === "NotReadableError") return "Mikrofon sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
  return "Perekaman gagal dimulai. Coba muat ulang halaman.";
}

/**
 * Records from the microphone. Safari records AAC in MP4, Chromium Opus in WebM; both are decoded and
 * re-encoded to WAV so every browser and the renderer get the same, seekable format with a known duration.
 */
export class NarrationRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  async start(onTick: (seconds: number) => void, onLimit: () => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(t => MediaRecorder.isTypeSupported?.(t));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = e => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.start(250);
    this.startedAt = performance.now();
    this.timer = setInterval(() => {
      const s = (performance.now() - this.startedAt) / 1000;
      onTick(s);
      if (s >= MAX_RECORDING_SECONDS) onLimit();
    }, 200);
  }

  private release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  async stop(): Promise<Narration> {
    const rec = this.recorder;
    if (!rec) throw new Error("Perekaman belum dimulai.");
    const done = new Promise<void>(resolve => { rec.onstop = () => resolve(); });
    if (rec.state !== "inactive") rec.stop();
    await done;
    this.release();
    const raw = new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
    if (raw.size === 0) throw new Error("Rekaman kosong.");
    const { samples, sampleRate, seconds } = await decodeToMono(raw);
    if (seconds < 0.5) throw new Error("Rekaman terlalu pendek.");
    normalize(samples);
    const wav = new File([encodeWav([samples], sampleRate)], "narasi-rekaman.wav", { type: "audio/wav" });
    return { file: wav, url: URL.createObjectURL(wav), seconds, speech: speechEnvelope(samples, sampleRate, FPS), recorded: true };
  }

  cancel() {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.release();
    this.recorder = null;
  }
}
