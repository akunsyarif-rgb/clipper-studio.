// Pure clip logic shared by the UI and unit tests. No browser APIs here.

export const MAX_BYTES = 1024 ** 3;
export const MAX_SOURCE_SECONDS = 60 * 60;
export const MAX_CLIP_SECONDS = 5 * 60;
export const MIN_CLIP_SECONDS = 0.5;

export type Aspect = "9:16" | "16:9" | "1:1";
export type Quality = "1080" | "720" | "480";
export type Fit = "pad" | "blur" | "crop";

export const ASPECTS: { id: Aspect; label: string; hint: string }[] = [
  { id: "9:16", label: "9:16", hint: "Shorts, Reels, TikTok" },
  { id: "16:9", label: "16:9", hint: "YouTube, lanskap" },
  { id: "1:1", label: "1:1", hint: "Feed persegi" },
];
export const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: "1080", label: "1080p", hint: "Paling tajam, paling lambat" },
  { id: "720", label: "720p", hint: "Seimbang (disarankan)" },
  { id: "480", label: "480p", hint: "Tercepat, file kecil" },
];
export const FITS: { id: Fit; label: string; hint: string }[] = [
  { id: "pad", label: "Latar hitam", hint: "Seluruh gambar tampil" },
  { id: "blur", label: "Latar blur", hint: "Latar buram dari video" },
  { id: "crop", label: "Isi bingkai", hint: "Potong tepi, tanpa latar" },
];

/** Output size in pixels; the short side equals the quality, both sides even. */
export function outputSize(aspect: Aspect, quality: Quality): { width: number; height: number } {
  const short = Number(quality);
  const long = even((short * 16) / 9);
  if (aspect === "9:16") return { width: short, height: long };
  if (aspect === "16:9") return { width: long, height: short };
  return { width: short, height: short };
}

function even(n: number) {
  return Math.round(n / 2) * 2;
}

/** Accepts "ss", "mm:ss" or "hh:mm:ss", each optionally with decimals (e.g. "1:02.5"). */
export function parseTime(value: string): number {
  const parts = value.trim().replace(",", ".").split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return NaN;
  const nums = parts.map(Number);
  // Only the last field may carry decimals, and minute/second fields must be < 60.
  if (nums.slice(0, -1).some(n => !Number.isInteger(n))) return NaN;
  if (nums.length > 1 && nums.slice(1).some(n => n >= 60)) return NaN;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const whole = Math.floor(safe);
  const tenths = Math.round((safe - whole) * 10);
  const s = tenths === 10 ? whole + 1 : whole;
  const label = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(v => String(v).padStart(2, "0")).join(":");
  return tenths > 0 && tenths < 10 ? `${label}.${tenths}` : label;
}

export function formatBytes(n: number): string {
  return n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + " GB" : (n / 1024 ** 2).toFixed(1) + " MB";
}

export type FileCheck = { ok: true } | { ok: false; error: string };

/** What a "source" picker accepts: a video, or just audio (a recording, a podcast, a voice note). */
export const SOURCE_ACCEPT = "video/*,audio/*,.mp4,.mov,.m4v,.webm,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac";
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|aif|aiff|caf|amr)$/i;

/** True for an audio-only file. A video type or video extension always wins (.webm and .mp4 can be either; they count as video). */
export function isAudioFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith("video/")) return false;
  if (file.type.startsWith("audio/")) return true;
  return AUDIO_EXTENSIONS.test(file.name);
}

export function validateFile(file: { name: string; type: string; size: number }): FileCheck {
  // iOS sometimes reports an empty MIME type for camera-roll videos, so fall back to the extension.
  const looksLikeVideo = file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i.test(file.name);
  const audio = isAudioFile(file);
  if (!looksLikeVideo && !audio) return { ok: false, error: "Pilih berkas video (MP4, MOV, WebM, M4V) atau audio (MP3, M4A, WAV, OGG)." };
  const what = audio ? "audio" : "video";
  if (file.size <= 0) return { ok: false, error: `Berkas ${what} kosong.` };
  if (file.size > MAX_BYTES) return { ok: false, error: `Ukuran ${what} ${formatBytes(file.size)} melebihi batas 1 GB.` };
  return { ok: true };
}

export type RangeCheck = { ok: true; start: number; end: number; duration: number } | { ok: false; error: string };

export function validateRange(startText: string, endText: string, sourceDuration: number): RangeCheck {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return { ok: false, error: "Durasi video belum terbaca." };
  if (sourceDuration > MAX_SOURCE_SECONDS) return { ok: false, error: "Durasi video melebihi batas 60 menit." };
  const start = parseTime(startText);
  const end = parseTime(endText);
  if (!Number.isFinite(start)) return { ok: false, error: "Format waktu mulai tidak valid. Gunakan jj:mm:dd, mm:dd, atau detik." };
  if (!Number.isFinite(end)) return { ok: false, error: "Format waktu selesai tidak valid. Gunakan jj:mm:dd, mm:dd, atau detik." };
  if (start >= sourceDuration) return { ok: false, error: `Waktu mulai melewati durasi video (${formatTime(sourceDuration)}).` };
  if (end > sourceDuration + 0.05) return { ok: false, error: `Waktu selesai melewati durasi video (${formatTime(sourceDuration)}).` };
  if (end <= start) return { ok: false, error: "Waktu selesai harus setelah waktu mulai." };
  const duration = Math.min(end, sourceDuration) - start;
  if (duration < MIN_CLIP_SECONDS) return { ok: false, error: "Klip terlalu pendek (minimal 0,5 detik)." };
  if (duration > MAX_CLIP_SECONDS) return { ok: false, error: "Klip terlalu panjang. Batas satu klip adalah 5 menit agar aman di memori browser." };
  return { ok: true, start, end: start + duration, duration };
}

export function videoFilter(aspect: Aspect, quality: Quality, fit: Fit): string {
  const { width: w, height: h } = outputSize(aspect, quality);
  if (fit === "crop") return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  if (fit === "pad") return `scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
  // Blur at quarter resolution, then upscale: far cheaper than blurring the full frame in WebAssembly.
  const bw = even(w / 4), bh = even(h / 4);
  return [
    "split=2[bg][fg]",
    `[bg]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=8:2,scale=${w}:${h}[blurred]`,
    `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2[front]`,
    "[blurred][front]overlay=(W-w)/2:(H-h)/2,setsar=1",
  ].join(";");
}

export const OUTPUT_NAME = "clipper-export.mp4";

/** A watermark image (second input, file name inside FFmpeg's file system) laid over the finished frame at x, y. */
export type WatermarkOverlay = { file: string; x: number; y: number };
/** The closing call-to-action picture (see lib/cta.ts): fades in at `start` seconds and stays to the end of the clip. */
export type CtaOverlay = { file: string; x: number; y: number; start: number; fade: number };

/** FFmpeg input arguments and filter graph for a CTA, optionally after a watermark. `base` is the label of the finished frame so far. */
function ctaGraph(base: string, firstExtra: number, watermark: WatermarkOverlay | null | undefined, cta: CtaOverlay): { inputs: string[]; graph: string } {
  const inputs = [...(watermark ? ["-i", watermark.file] : []), "-loop", "1", "-framerate", "30", "-i", cta.file];
  const ci = firstExtra + (watermark ? 1 : 0);
  const stages = [
    ...(watermark ? [`[${base}][${firstExtra}:v]overlay=${watermark.x}:${watermark.y}:format=auto[withwm]`] : []),
    `[${ci}:v]format=rgba,fade=t=in:st=${cta.start.toFixed(3)}:d=${cta.fade.toFixed(3)}:alpha=1[ctaf]`,
    `[${watermark ? "withwm" : base}][ctaf]overlay=${cta.x}:${cta.y}:format=auto,format=yuv420p[out]`,
  ];
  return { inputs, graph: stages.join(";") };
}

/** Backdrop of an MP4 made from audio only (dark, like the studio's own backgrounds). */
export const AUDIO_ONLY_BACKDROP = "0x10131c";

/**
 * Audio-only source: the picture is a plain dark frame of the output size (so the result is an ordinary 9:16 / 16:9 / 1:1 MP4
 * that plays everywhere and can go on to the motion studio), with the audio of the chosen range and the watermark if any.
 */
function audioOnlyArgs(input: string, range: { start: number; duration: number }, aspect: Aspect, quality: Quality, watermark?: WatermarkOverlay | null, cta?: CtaOverlay | null): string[] {
  const { width: w, height: h } = outputSize(aspect, quality);
  const withCta = cta ? ctaGraph("1:v", 2, watermark, cta) : null;
  const picture = withCta
    ? [...withCta.inputs, "-t", range.duration.toFixed(3), "-filter_complex", withCta.graph, "-map", "[out]", "-map", "0:a:0"]
    : watermark
    ? ["-i", watermark.file, "-t", range.duration.toFixed(3), "-filter_complex", `[1:v][2:v]overlay=${watermark.x}:${watermark.y}:format=auto,format=yuv420p[out]`, "-map", "[out]", "-map", "0:a:0"]
    : ["-t", range.duration.toFixed(3), "-map", "1:v:0", "-map", "0:a:0"];
  return [
    "-ss", range.start.toFixed(3),
    "-i", input,
    "-f", "lavfi", "-i", `color=c=${AUDIO_ONLY_BACKDROP}:s=${w}x${h}:r=30`,
    ...picture,
    "-r", "30",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    "-movflags", "+faststart",
    "-y", OUTPUT_NAME,
  ];
}

export function ffmpegArgs(input: string, range: { start: number; duration: number }, aspect: Aspect, quality: Quality, fit: Fit, watermark?: WatermarkOverlay | null, audioOnly = false, cta?: CtaOverlay | null): string[] {
  if (audioOnly) return audioOnlyArgs(input, range, aspect, quality, watermark, cta);
  const withCta = cta ? ctaGraph("base", 1, watermark, cta) : null;
  const picture = withCta
    ? [...withCta.inputs, "-t", range.duration.toFixed(3), "-filter_complex", `[0:v:0]${videoFilter(aspect, quality, fit)}[base];${withCta.graph}`, "-map", "[out]", "-map", "0:a:0?"]
    : watermark
    ? ["-i", watermark.file, "-t", range.duration.toFixed(3),
      "-filter_complex", `[0:v:0]${videoFilter(aspect, quality, fit)}[base];[base][1:v]overlay=${watermark.x}:${watermark.y}:format=auto,format=yuv420p[out]`,
      "-map", "[out]", "-map", "0:a:0?"]
    : ["-t", range.duration.toFixed(3), "-map", "0:v:0", "-map", "0:a:0?", "-vf", videoFilter(aspect, quality, fit)];
  return [
    "-ss", range.start.toFixed(3),
    "-i", input,
    ...picture,
    "-r", "30",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    "-movflags", "+faststart",
    "-y", OUTPUT_NAME,
  ];
}

export const AUDIO_OUTPUT_NAME = "clipper-audio.pcm";

/** Decodes just the audio of a range to raw 16 kHz mono signed 16-bit PCM, the input format of the speech model. */
export function audioArgs(input: string, range: { start: number; duration: number }): string[] {
  return [
    "-ss", range.start.toFixed(3),
    "-i", input,
    "-t", range.duration.toFixed(3),
    "-vn", "-map", "0:a:0",
    "-ac", "1", "-ar", "16000",
    "-f", "s16le", "-acodec", "pcm_s16le",
    "-y", AUDIO_OUTPUT_NAME,
  ];
}

export type VideoProbe = { ok: boolean; /** Plain facts for the creator (and for finding the cause): size, type and the player's own error. */ detail: string };

/** Can this browser read the video's header and play it? A browser that never answers is given the benefit of the doubt. */
export function probeVideo(blob: Blob, timeoutMs = 10_000): Promise<VideoProbe> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    const facts = () => `${(blob.size / 1048576).toFixed(1)} MB, ${blob.type || "tanpa tipe"}, ${v.error ? `kode galat pemutar ${v.error.code}${v.error.message ? ` (${v.error.message})` : ""}` : "pemutar tanpa galat"}`;
    const done = (ok: boolean, why = "") => { clearTimeout(timer); const detail = `${why}${facts()}`; v.onerror = null; v.removeAttribute("src"); URL.revokeObjectURL(url); resolve({ ok, detail }); };
    const timer = setTimeout(() => done(true, "tidak ada jawaban dari pemutar (dianggap baik); "), timeoutMs);
    v.preload = "metadata"; v.muted = true; v.playsInline = true;
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0, `durasi ${v.duration}; `);
    v.onerror = () => done(false);
    v.src = url;
  });
}

/**
 * Checks a cut clip before it is handed on. If the browser cannot play it as it is, the bytes are copied into a fresh blob
 * and tried again (a blob that is backed by odd memory is the usual culprit); the copy is returned when it plays.
 */
export async function checkedVideo(blob: Blob): Promise<{ blob: Blob; probe: VideoProbe; copied: boolean }> {
  const first = await probeVideo(blob);
  if (first.ok) return { blob, probe: first, copied: false };
  try {
    const copy = new Blob([await blob.arrayBuffer()], { type: "video/mp4" });
    const second = await probeVideo(copy);
    if (second.ok) return { blob: copy, probe: second, copied: true };
  } catch { /* the copy itself failed: report the first result */ }
  return { blob, probe: first, copied: false };
}

export const MP3_OUTPUT_NAME = "clipper-audio.mp3";

/** A range of the audio as a small mono MP3 (32 kbps, about 1 MB for four minutes) to send to an AI service that listens. */
export function mp3Args(input: string, range: { start: number; duration: number }): string[] {
  return [
    "-ss", range.start.toFixed(3),
    "-i", input,
    "-t", range.duration.toFixed(3),
    "-vn", "-map", "0:a:0",
    "-ac", "1", "-ar", "16000",
    "-c:a", "libmp3lame", "-b:a", "32k", "-f", "mp3",
    "-y", MP3_OUTPUT_NAME,
  ];
}

/** Reads "time=00:00:05.12" from an FFmpeg log line; returns seconds or NaN. */
export function logTime(message: string): number {
  const m = /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(message);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

export function exportFileName(sourceName: string, aspect: Aspect, quality: Quality, start: number): string {
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "clip";
  return `${base}-${aspect.replace(":", "x")}-${quality}p-${Math.floor(start)}s.mp4`;
}

/** Human-readable explanation for common FFmpeg / WebAssembly failures. */
export function explainError(detail: string): string {
  if (/memory|OOM|Out of bounds|RangeError|allocation/i.test(detail)) return "Memori browser tidak cukup. Coba klip lebih pendek atau resolusi lebih rendah.";
  if (/Invalid data|moov atom|could not find codec|Decoder .* not found|does not contain any stream/i.test(detail)) return "Format atau codec video tidak dapat dibaca. Coba ekspor ulang video sebagai MP4 (H.264).";
  if (/fetch|network|Failed to load|import/i.test(detail)) return "Mesin video gagal dimuat. Periksa koneksi internet lalu coba lagi.";
  return "Ekspor gagal. Coba lagi, gunakan klip lebih pendek, atau pilih resolusi lebih rendah.";
}

export type YouTubeRef = { id: string; start: number };

/** Parses a YouTube URL for a preview-only embed. Returns null for anything else. */
export function parseYouTube(url: string): YouTubeRef | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id = "";
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
    else { const m = /^\/(shorts|embed|live)\/([^/]+)/.exec(u.pathname); id = m ? m[2] : ""; }
  }
  if (!/^[\w-]{11}$/.test(id)) return null;
  const t = u.searchParams.get("t") || u.searchParams.get("start") || "0";
  const start = /^\d+$/.test(t) ? Number(t) : (() => { const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t); return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0; })();
  return { id, start };
}
