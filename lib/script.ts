// Pure script → timeline logic shared by the UI, the Remotion composition and unit tests.
import type { Music } from "./audio";
import type { Cut, SceneVisual } from "./visuals";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const MAX_SECONDS = 180;
export const MAX_SCENES = 20;
export const MAX_SCRIPT_CHARS = 3000;
export const MAX_SCENE_CHARS = 140;
export const MIN_SCENE_SECONDS = 1.2;
/** Average narration speed used when there is no audio to measure (Indonesian, ~150 wpm). */
export const WORDS_PER_SECOND = 2.5;

export type StyleId = "hybrid" | "kinetic" | "popup" | "cinematic";
export type PaletteId = "violet" | "gold" | "pearl";

export const STYLES: { id: StyleId; label: string }[] = [
  { id: "hybrid", label: "Hybrid" },
  { id: "kinetic", label: "Kinetic typography" },
  { id: "popup", label: "Pop-up" },
  { id: "cinematic", label: "Cinematic" },
];

export const PALETTES: Record<PaletteId, { label: string; bg1: string; bg2: string; accent: string; text: string }> = {
  violet: { label: "Violet / Cyan", bg1: "#15132f", bg2: "#542b79", accent: "#67f5ed", text: "#ffffff" },
  gold: { label: "Midnight / Gold", bg1: "#11151e", bg2: "#473522", accent: "#f6ce78", text: "#ffffff" },
  pearl: { label: "Pearl / Black", bg1: "#e9edf2", bg2: "#bfc8d5", accent: "#242c3a", text: "#141821" },
};

export type Scene = {
  text: string;
  durationInFrames: number;
  /** Template, icon and emphasis; detected from the text when absent (e.g. older project JSON). */
  visual?: SceneVisual;
  /** Frame (from the scene's first frame) at which each word is spoken; from a transcript. Even spread when absent. */
  wordStarts?: number[];
  /** Source-video edits only: show the speaker ("video", default) or cut to this scene's graphic ("graphic"). */
  cut?: Cut;
};

export type VideoProps = {
  title: string;
  scenes: Scene[];
  style: StyleId;
  palette: PaletteId;
  /** blob:/http(s):/data: URL in the browser, or a file name inside public/ for CLI renders. */
  audioSrc: string | null;
  captions: boolean;
  /** Background music, mixed under the narration. */
  music: Music | null;
  /** Narration speech activity per frame (0..1) for ducking; null when unknown. */
  speech: number[] | null;
  /** Source video edit: the video (with its own audio) is the base layer and scenes become overlays or cutaways. */
  video?: { src: string } | null;
};

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Splits a line into sentences at . ! ? … — except a "." between two digits, which is a thousands or decimal
 * separator ("17.000", "3.5"), not the end of a sentence.
 */
export function splitSentences(line: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (!/[.!?…]/.test(c)) continue;
    if (c === "." && /\d/.test(line[i - 1] ?? "") && /\d/.test(line[i + 1] ?? "")) continue;
    let end = i + 1;
    while (end < line.length && /[.!?…]/.test(line[end])) end++;
    while (end < line.length && /["'”’)]/.test(line[end])) end++;
    // A sentence ends at the terminator only when what follows is a space or the end of the line.
    if (end < line.length && line[end] !== " ") { i = end - 1; continue; }
    out.push(line.slice(start, end));
    start = end;
    i = end - 1;
  }
  if (start < line.length) out.push(line.slice(start));
  return out;
}

/** Splits a script into scene texts: paragraphs/lines first, then sentences, then long sentences at commas/words. */
export function splitScript(script: string): string[] {
  const out: string[] = [];
  for (const line of script.replace(/\r/g, "").split(/\n+/)) {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const sentences = splitSentences(clean);
    for (const raw of sentences) {
      const sentence = raw.trim();
      if (!sentence) continue;
      if (sentence.length <= MAX_SCENE_CHARS) { out.push(sentence); continue; }
      let chunk = "";
      for (const part of sentence.split(/(?<=[,;:])\s+/)) {
        for (const w of words(part)) {
          if ((chunk + " " + w).trim().length > MAX_SCENE_CHARS && chunk) { out.push(chunk.trim()); chunk = ""; }
          chunk += " " + w;
        }
      }
      if (chunk.trim()) out.push(chunk.trim());
    }
  }
  // Merge one-word fragments into the previous scene so nothing flashes by unreadably.
  const merged: string[] = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && words(s).length <= 1 && (prev + " " + s).length <= MAX_SCENE_CHARS) merged[merged.length - 1] = prev + " " + s;
    else merged.push(s);
  }
  return merged;
}

/** Reading weight of a scene: words plus a small pause per scene. */
function weight(text: string) { return words(text).length + 1.5; }

export type DurationMode =
  | { kind: "audio"; seconds: number }
  | { kind: "target"; seconds: number }
  | { kind: "auto" }
  /** One duration per scene, e.g. from per-scene synthesized speech. */
  | { kind: "scenes"; seconds: number[] };

export type TimelineResult =
  | { ok: true; scenes: Scene[]; totalFrames: number; seconds: number; warnings: string[] }
  | { ok: false; error: string };

export function buildTimeline(script: string, mode: DurationMode, fps = FPS): TimelineResult {
  if (!script.trim()) return { ok: false, error: "Naskah masih kosong. Tulis minimal satu kalimat." };
  if (script.length > MAX_SCRIPT_CHARS) return { ok: false, error: `Naskah terlalu panjang (${script.length} karakter). Batas ${MAX_SCRIPT_CHARS} karakter.` };
  const texts = splitScript(script);
  if (texts.length === 0) return { ok: false, error: "Naskah tidak berisi teks yang bisa dijadikan scene." };
  if (texts.length > MAX_SCENES) return { ok: false, error: `Naskah menghasilkan ${texts.length} scene. Batas ${MAX_SCENES} scene; ringkas atau gabungkan kalimat.` };

  if (mode.kind === "scenes") {
    if (mode.seconds.length !== texts.length || mode.seconds.some(x => !Number.isFinite(x) || x <= 0)) return { ok: false, error: "Suara otomatis tidak cocok dengan naskah. Buat ulang suara." };
    const frames = mode.seconds.map(x => sceneFrames(x, fps));
    const sum = frames.reduce((a, b) => a + b, 0);
    if (sum / fps > MAX_SECONDS) return { ok: false, error: `Durasi suara ${(sum / fps).toFixed(1)} detik melebihi batas ${MAX_SECONDS} detik. Ringkas naskahnya.` };
    return { ok: true, scenes: texts.map((text, i) => ({ text, durationInFrames: frames[i] })), totalFrames: sum, seconds: sum / fps, warnings: [] };
  }

  const warnings: string[] = [];
  let total: number;
  if (mode.kind === "audio") {
    if (!Number.isFinite(mode.seconds) || mode.seconds <= 0) return { ok: false, error: "Durasi audio narasi tidak dapat dibaca." };
    total = mode.seconds;
  } else if (mode.kind === "target") {
    total = mode.seconds;
  } else {
    total = texts.reduce((acc, t) => acc + Math.min(8, Math.max(2, weight(t) / WORDS_PER_SECOND)), 0);
  }
  if (total > MAX_SECONDS) {
    return { ok: false, error: mode.kind === "audio"
      ? `Audio narasi ${total.toFixed(1)} detik melebihi batas ${MAX_SECONDS} detik. Potong audionya atau bagi menjadi beberapa video.`
      : `Durasi video ${total.toFixed(1)} detik melebihi batas ${MAX_SECONDS} detik. Ringkas naskahnya.` };
  }
  const minTotal = texts.length * MIN_SCENE_SECONDS;
  if (total < minTotal) {
    return { ok: false, error: mode.kind === "audio"
      ? `Audio narasi (${total.toFixed(1)} dtk) terlalu pendek untuk ${texts.length} scene. Minimal ${minTotal.toFixed(1)} dtk, atau kurangi kalimat.`
      : `Durasi ${total.toFixed(1)} dtk terlalu pendek untuk ${texts.length} scene (minimal ${minTotal.toFixed(1)} dtk).` };
  }

  if (mode.kind !== "audio") {
    const needed = texts.reduce((a, t) => a + weight(t) / WORDS_PER_SECOND, 0);
    if (mode.kind === "target" && needed > total * 1.25) warnings.push(`Naskah butuh sekitar ${Math.round(needed)} dtk untuk dibaca nyaman; durasi ${total} dtk akan terasa cepat.`);
  }

  // Distribute frames proportionally to reading weight, with a minimum per scene, and make the sum exact.
  const totalFrames = Math.max(1, Math.round(total * fps));
  const minFrames = Math.ceil(MIN_SCENE_SECONDS * fps);
  const weights = texts.map(weight);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const spare = totalFrames - minFrames * texts.length;
  const frames = weights.map(w => minFrames + Math.floor((spare * w) / sumW));
  let rest = totalFrames - frames.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % frames.length, rest--) frames[i]++;
  const scenes = texts.map((text, i) => ({ text, durationInFrames: frames[i] }));
  return { ok: true, scenes, totalFrames, seconds: totalFrames / fps, warnings };
}

/** Frames for a scene of the given length (rounded up, never below the minimum scene length). */
export function sceneFrames(seconds: number, fps = FPS): number {
  return Math.max(Math.ceil(MIN_SCENE_SECONDS * fps), Math.ceil(seconds * fps - 1e-6));
}

export function totalFrames(scenes: Scene[]): number {
  return Math.max(1, scenes.reduce((a, s) => a + s.durationInFrames, 0));
}

/**
 * Caption timing inside one scene: the words are spread over the scene (leaving a short tail),
 * so with narration the highlighted word follows the voice at the scene's average pace.
 */
export function activeWordIndex(text: string, frameInScene: number, sceneFrames: number, wordStarts?: number[]): number {
  const n = words(text).length;
  if (n === 0) return -1;
  // Transcript timing: the last word whose start has been reached (before the first word, the first one is shown).
  if (wordStarts && wordStarts.length === n) {
    let active = 0;
    for (let i = 0; i < n; i++) if (frameInScene >= wordStarts[i]) active = i;
    return active;
  }
  const speaking = Math.max(1, sceneFrames * 0.9);
  return Math.min(n - 1, Math.floor((Math.max(0, frameInScene) / speaking) * n));
}

/** Groups words into short caption lines (max ~4 words) and returns the line holding the active word. */
export function captionLine(text: string, activeIndex: number, maxWords = 4): { words: string[]; activeInLine: number } {
  const all = words(text);
  if (all.length === 0 || activeIndex < 0) return { words: [], activeInLine: -1 };
  const lineStart = Math.floor(activeIndex / maxWords) * maxWords;
  return { words: all.slice(lineStart, lineStart + maxWords), activeInLine: activeIndex - lineStart };
}

export function validateTitle(title: string): string | null {
  if (title.length > 48) return "Judul maksimal 48 karakter.";
  return null;
}

export const MAX_AUDIO_BYTES = 50 * 1024 ** 2;

export function validateAudioFile(file: { name: string; type: string; size: number }): string | null {
  const looksLikeAudio = file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(file.name);
  if (!looksLikeAudio) return "Pilih berkas audio (MP3, M4A, WAV, OGG).";
  if (file.size <= 0) return "Berkas audio kosong.";
  if (file.size > MAX_AUDIO_BYTES) return "Berkas audio melebihi batas 50 MB.";
  return null;
}

export function explainRenderError(detail: string): string {
  if (/abort/i.test(detail)) return "Render dibatalkan.";
  if (/webcodecs|VideoEncoder|AudioEncoder|codec/i.test(detail)) return "Browser ini tidak mendukung encoder video yang dibutuhkan (WebCodecs H.264). Gunakan Chrome/Edge terbaru atau Safari 17+, atau render lewat CLI.";
  if (/audio|decode|EncodingError/i.test(detail)) return "Audio narasi tidak dapat dibaca. Coba konversi ke MP3 atau WAV lalu unggah ulang.";
  if (/memory|allocation|RangeError/i.test(detail)) return "Memori browser tidak cukup. Tutup tab lain atau kurangi durasi video.";
  return "Render gagal. Coba lagi; jika tetap gagal, unduh proyek JSON dan render lewat CLI.";
}

export function slug(s: string): string {
  return s.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 40) || "video";
}
