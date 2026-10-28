// Pure script → timeline logic shared by the UI, the Remotion composition and unit tests.
import type { Music } from "./audio";
import type { BrandMotion, OverlayPosition } from "./overlay";
import type { Cut, SceneVisual } from "./visuals";
import type { NarrativePlan } from "./narrative";

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

export type StyleId = "hybrid" | "kinetic" | "popup" | "cinematic" | "editorial";
export type PaletteId = "violet" | "gold" | "pearl" | "forest" | "obsidian" | "ivory";

export const STYLES: { id: StyleId; label: string }[] = [
  { id: "hybrid", label: "Hybrid" },
  { id: "kinetic", label: "Kinetic typography" },
  { id: "popup", label: "Pop-up" },
  { id: "cinematic", label: "Cinematic" },
  { id: "editorial", label: "Quiet editorial" },
];

export type ContentPresetId = "cinematic-motivation" | "kinetic-social" | "education" | "business-tech" | "islamic-reflection" | "storytelling" | "quiet-editorial";

export const CONTENT_PRESETS: { id: ContentPresetId; label: string; description: string; style: StyleId; palette: PaletteId }[] = [
  { id: "cinematic-motivation", label: "Cinematic Motivation", description: "Motivasi dengan gerak halus dan atmosfer sinematik", style: "cinematic", palette: "gold" },
  { id: "kinetic-social", label: "Kinetic Social", description: "Hook cepat, tipografi dinamis untuk Shorts/Reels", style: "kinetic", palette: "violet" },
  { id: "education", label: "Education / Explainer", description: "Penjelasan bersih, kontras tinggi, mudah dibaca", style: "hybrid", palette: "pearl" },
  { id: "business-tech", label: "Business / Tech", description: "Tampilan modern untuk AI, aplikasi, dan bisnis digital", style: "kinetic", palette: "obsidian" },
  { id: "islamic-reflection", label: "Islamic Reflection", description: "Palet hutan-sage untuk refleksi dan pengingat Islami", style: "cinematic", palette: "forest" },
  { id: "storytelling", label: "Storytelling", description: "Narasi bertahap dengan suasana sinematik", style: "cinematic", palette: "violet" },
  { id: "quiet-editorial", label: "Quiet Editorial", description: "Minimalis, ruang lega, gerak tenang yang menuntun satu fokus", style: "editorial", palette: "ivory" },
];

export const PALETTES: Record<PaletteId, { label: string; bg1: string; bg2: string; accent: string; text: string }> = {
  violet: { label: "Violet / Cyan", bg1: "#15132f", bg2: "#542b79", accent: "#67f5ed", text: "#ffffff" },
  gold: { label: "Midnight / Gold", bg1: "#11151e", bg2: "#473522", accent: "#f6ce78", text: "#ffffff" },
  pearl: { label: "Pearl / Black", bg1: "#e9edf2", bg2: "#bfc8d5", accent: "#242c3a", text: "#141821" },
  forest: { label: "Forest / Sage", bg1: "#0d211d", bg2: "#24483b", accent: "#b9d7ad", text: "#f7f5eb" },
  obsidian: { label: "Obsidian / Electric", bg1: "#090d16", bg2: "#17263b", accent: "#73e0ff", text: "#f4f7ff" },
  ivory: { label: "Ivory / Forest", bg1: "#f5f2e8", bg2: "#e4e8da", accent: "#2f5d46", text: "#16251e" },
};

export type Scene = {
  text: string;
  durationInFrames: number;
  /** Template, icon and emphasis; detected from the text when absent (e.g. older project JSON). */
  visual?: SceneVisual;
  /** Explainable narrative role and suggested visual treatment; optional for backward-compatible renders. */
  narrative?: NarrativePlan;
  /** Frame (from the scene's first frame) at which each word is spoken; from a transcript. Even spread when absent. */
  wordStarts?: number[];
  /** Frame at which each word ends; captions over a source video hide in silent gaps. */
  wordEnds?: number[];
  /** Silence at the end of the scene (from a [jeda] tag); the words are spread over the frames before it. */
  pauseFrames?: number;
  /** Source-video edits only: show the speaker ("video", default) or cut to this scene's graphic ("graphic"). */
  cut?: Cut;
  /** cut "clip" only: second of the source video at which the clip starts (the clip plays on from there, muted). */
  clipFrom?: number;
  /** Faceless videos only: the creator's picture behind the scene (blob:/http(s):/data: URL, or a file name inside public/ for CLI renders). */
  image?: string;
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
  /** `seconds` is the source length; it keeps a clip from running past the end of the video. */
  video?: { src: string; seconds?: number } | null;
  /** Where animations over the speaker sit: in the space above the head (default) or just above the captions. */
  overlay?: OverlayPosition;
  /** Popular names: "simple" (default) is calm, "full" adds a small animated scene of each service. */
  brandMotion?: BrandMotion;
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

export const MIN_PAUSE_SECONDS = 0.1;
export const MAX_PAUSE_SECONDS = 10;
export const DEFAULT_PAUSE_SECONDS = 1;
/** [jeda], [jeda 1.5], [jeda 500ms], [pause 2s], also with round brackets. Never read aloud or shown. */
const PAUSE_TAG = /[[(]\s*(?:jeda|pause)(?![^\W\d])(?:\s*[:：]?\s*([^\])]*?))?\s*[\])]/giu;
/** Private-use character standing in for a tag while the script is split; it can never occur in real text. */
const MARK = "\uE000";

/** Seconds for the tag's argument; null for an invalid one (the tag is then ignored). Clamped to 0.1–10 s. */
function pauseSeconds(arg: string | undefined): number | null {
  if (arg === undefined || !arg.trim()) return DEFAULT_PAUSE_SECONDS;
  const m = /^(\d+(?:[.,]\d+)?)\s*(ms|s|dtk|detik|sec|secs|second|seconds)?$/i.exec(arg.trim());
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  const seconds = /^ms$/i.test(m[2] ?? "") ? value / 1000 : value;
  if (!(seconds > 0)) return null;
  return Math.min(MAX_PAUSE_SECONDS, Math.max(MIN_PAUSE_SECONDS, seconds));
}

/**
 * Splits a script into scene texts (tags removed) and the silence, in seconds, that follows each scene.
 * A tag after a sentence, or in the middle of one, pauses after the scene it ends; tags at the very start are ignored.
 */
export function splitScriptWithPauses(script: string): { texts: string[]; pauses: number[] } {
  const durations: number[] = [];
  const marked = script.replace(PAUSE_TAG, (_all, arg: string | undefined) => {
    const seconds = pauseSeconds(arg);
    if (seconds === null) return " ";
    durations.push(seconds);
    return ` ${MARK} `;
  });
  const texts: string[] = [];
  const pauses: number[] = [];
  let next = 0;
  for (const raw of splitScriptText(marked)) {
    let seenWord = false;
    const kept: string[] = [];
    for (const token of raw.split(/\s+/).filter(Boolean)) {
      if (token === MARK) {
        const seconds = durations[next++];
        // Before any word of this scene the silence belongs to the scene before it.
        if (seenWord) pauses[texts.length] = (pauses[texts.length] ?? 0) + seconds;
        else if (texts.length > 0) pauses[texts.length - 1] += seconds;
        continue;
      }
      seenWord = true;
      kept.push(token);
    }
    if (kept.length === 0) continue;
    texts.push(kept.join(" "));
    pauses[texts.length - 1] ??= 0;
  }
  return { texts, pauses: pauses.map(p => Math.min(MAX_PAUSE_SECONDS, p)) };
}

export function splitScript(script: string): string[] {
  return splitScriptWithPauses(script).texts;
}

/** Splits a script into scene texts: paragraphs/lines first, then sentences, then long sentences at commas/words. */
function splitScriptText(script: string): string[] {
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

/** `pauseFrames` for a scene, never more than leaves one frame of speech. */
function pauseOf(seconds: number, sceneFrames: number, fps: number): { pauseFrames?: number } {
  const frames = Math.min(Math.round(seconds * fps), Math.max(0, sceneFrames - 1));
  return frames > 0 ? { pauseFrames: frames } : {};
}

export function buildTimeline(script: string, mode: DurationMode, fps = FPS): TimelineResult {
  if (!script.trim()) return { ok: false, error: "Naskah masih kosong. Tulis minimal satu kalimat." };
  if (script.length > MAX_SCRIPT_CHARS) return { ok: false, error: `Naskah terlalu panjang (${script.length} karakter). Batas ${MAX_SCRIPT_CHARS} karakter.` };
  const { texts, pauses } = splitScriptWithPauses(script);
  if (texts.length === 0) return { ok: false, error: "Naskah tidak berisi teks yang bisa dijadikan scene." };
  if (texts.length > MAX_SCENES) return { ok: false, error: `Naskah menghasilkan ${texts.length} scene. Batas ${MAX_SCENES} scene; ringkas atau gabungkan kalimat.` };

  if (mode.kind === "scenes") {
    if (mode.seconds.length !== texts.length || mode.seconds.some(x => !Number.isFinite(x) || x <= 0)) return { ok: false, error: "Suara otomatis tidak cocok dengan naskah. Buat ulang suara." };
    const frames = mode.seconds.map(x => sceneFrames(x, fps));
    const sum = frames.reduce((a, b) => a + b, 0);
    if (sum / fps > MAX_SECONDS) return { ok: false, error: `Durasi suara ${(sum / fps).toFixed(1)} detik melebihi batas ${MAX_SECONDS} detik. Ringkas naskahnya.` };
    return { ok: true, scenes: texts.map((text, i) => ({ text, durationInFrames: frames[i], ...pauseOf(pauses[i], frames[i], fps) })), totalFrames: sum, seconds: sum / fps, warnings: [] };
  }

  const warnings: string[] = [];
  let total: number;
  if (mode.kind === "audio") {
    if (!Number.isFinite(mode.seconds) || mode.seconds <= 0) return { ok: false, error: "Durasi audio narasi tidak dapat dibaca." };
    total = mode.seconds;
  } else if (mode.kind === "target") {
    total = mode.seconds;
  } else {
    total = texts.reduce((acc, t, i) => acc + Math.min(8, Math.max(2, weight(t) / WORDS_PER_SECOND)) + pauses[i], 0);
  }
  if (total > MAX_SECONDS) {
    return { ok: false, error: mode.kind === "audio"
      ? `Audio narasi ${total.toFixed(1)} detik melebihi batas ${MAX_SECONDS} detik. Potong audionya atau bagi menjadi beberapa video.`
      : `Durasi video ${total.toFixed(1)} detik melebihi batas ${MAX_SECONDS} detik. Ringkas naskahnya.` };
  }
  const pauseTotal = pauses.reduce((a, b) => a + b, 0);
  const minTotal = texts.length * MIN_SCENE_SECONDS + pauseTotal;
  if (total < minTotal) {
    return { ok: false, error: mode.kind === "audio"
      ? `Audio narasi (${total.toFixed(1)} dtk) terlalu pendek untuk ${texts.length} scene. Minimal ${minTotal.toFixed(1)} dtk, atau kurangi kalimat.`
      : `Durasi ${total.toFixed(1)} dtk terlalu pendek untuk ${texts.length} scene (minimal ${minTotal.toFixed(1)} dtk).` };
  }

  if (mode.kind !== "audio") {
    const needed = texts.reduce((a, t) => a + weight(t) / WORDS_PER_SECOND, 0) + pauseTotal;
    if (mode.kind === "target" && needed > total * 1.25) warnings.push(`Naskah butuh sekitar ${Math.round(needed)} dtk untuk dibaca nyaman; durasi ${total} dtk akan terasa cepat.`);
  }

  // Pauses are exact; the rest is shared by reading weight, with a minimum per scene, and the sum is made exact.
  const totalFrames = Math.max(1, Math.round(total * fps));
  const minFrames = Math.ceil(MIN_SCENE_SECONDS * fps);
  const pauseFr = pauses.map(p => Math.round(p * fps));
  const weights = texts.map(weight);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const spare = totalFrames - pauseFr.reduce((a, b) => a + b, 0) - minFrames * texts.length;
  const frames = weights.map((w, i) => pauseFr[i] + minFrames + Math.floor((spare * w) / sumW));
  let rest = totalFrames - frames.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % frames.length, rest--) frames[i]++;
  const scenes = texts.map((text, i) => ({ text, durationInFrames: frames[i], ...pauseOf(pauses[i], frames[i], fps) }));
  return { ok: true, scenes, totalFrames, seconds: totalFrames / fps, warnings };
}

/** Frames for a scene of the given length (rounded up, never below the minimum scene length). */
export function sceneFrames(seconds: number, fps = FPS): number {
  return Math.max(Math.ceil(MIN_SCENE_SECONDS * fps), Math.ceil(seconds * fps - 1e-6));
}

/** A clip lasts as long as its scene, but at most this long (same limit as a graphic cutaway), so the pace stays quick. */
export const MAX_CLIP_FRAMES = 120;

/**
 * Where and how long a "clip" scene shows other footage from the source video, or null for any other scene.
 * The start is kept inside the video (never before 0, and early enough that the whole clip exists).
 */
export function clipPlan(scene: Pick<Scene, "cut" | "clipFrom" | "durationInFrames">, sourceSeconds: number | undefined, fps = FPS): { startFrame: number; lengthFrames: number } | null {
  if (scene.cut !== "clip") return null;
  const lengthFrames = Math.max(1, Math.min(scene.durationInFrames, MAX_CLIP_FRAMES));
  const latest = sourceSeconds !== undefined && Number.isFinite(sourceSeconds) ? Math.max(0, sourceSeconds - lengthFrames / fps) : Infinity;
  const from = Number.isFinite(scene.clipFrom) ? (scene.clipFrom as number) : 0;
  return { startFrame: Math.round(Math.min(Math.max(0, from), latest) * fps), lengthFrames };
}

/**
 * The scenes cut to a video that is only `videoFrames` long: a scene that would start after the video has ended is
 * dropped and the last one is shortened, so the picture never freezes on the last frame while the captions run on.
 */
export function fitScenesToVideo<T extends { durationInFrames: number }>(scenes: T[], videoFrames: number): T[] {
  if (!Number.isFinite(videoFrames) || videoFrames <= 0) return scenes;
  const out: T[] = [];
  let at = 0;
  for (const s of scenes) {
    if (at >= videoFrames) break;
    out.push(at + s.durationInFrames > videoFrames ? { ...s, durationInFrames: videoFrames - at } : s);
    at += s.durationInFrames;
  }
  return out.length ? out : scenes;
}

export function totalFrames(scenes: Scene[]): number {
  return Math.max(1, scenes.reduce((a, s) => a + s.durationInFrames, 0));
}

/** Estimated-timing highlight runs this many frames ahead of the even spread (100 ms) to cancel the observed lag. */
export const HIGHLIGHT_LEAD_FRAMES = Math.round(FPS * 0.1);

/**
 * Caption timing inside one scene: the words are spread over the scene (leaving a short tail),
 * so with narration the highlighted word follows the voice at the scene's average pace.
 */
/** Frames of a scene in which it is actually spoken (the scene without its trailing pause). */
export function spokenFrames(scene: Pick<Scene, "durationInFrames" | "pauseFrames">): number {
  return Math.max(1, scene.durationInFrames - (scene.pauseFrames ?? 0));
}

/**
 * Frame inside the scene at which word `i` (of `n`) starts being spoken: the transcript's timing when there is one,
 * otherwise the even spread the captions use (the inverse of activeWordIndex).
 */
export function wordStartFrame(scene: Pick<Scene, "wordStarts" | "durationInFrames" | "pauseFrames">, i: number, n: number): number {
  const starts = scene.wordStarts;
  if (starts && starts.length === n) return starts[Math.min(Math.max(0, i), n - 1)];
  const speaking = Math.max(1, spokenFrames(scene) * 0.9);
  return Math.max(0, Math.ceil((Math.max(0, i) * speaking) / Math.max(1, n)) - HIGHLIGHT_LEAD_FRAMES);
}

export function activeWordIndex(text: string, frameInScene: number, sceneFrames: number, wordStarts?: number[]): number {
  const n = words(text).length;
  if (n === 0) return -1;
  // Transcript timing: the last word whose start has been reached (before the first word, the first one is shown).
  if (wordStarts && wordStarts.length === n) {
    let active = 0;
    for (let i = 0; i < n; i++) if (frameInScene >= wordStarts[i]) active = i;
    return active;
  }
  // Estimated timing only: advance the marker by 3 frames (100 ms at 30 fps) to correct the observed fixed lag.
  const speaking = Math.max(1, sceneFrames * 0.9);
  return Math.min(n - 1, Math.floor(((Math.max(0, frameInScene) + HIGHLIGHT_LEAD_FRAMES) / speaking) * n));
}

/**
 * Phrase-based caption chunks for a source-video edit: at most `maxWords` words and `maxChars` characters,
 * and a chunk also ends at a comma/period. Returns the chunk that holds the active word.
 */
export function phraseChunks(text: string, maxWords = 4, maxChars = 26): { start: number; words: string[] }[] {
  const all = words(text);
  const out: { start: number; words: string[] }[] = [];
  let i = 0;
  while (i < all.length) {
    const chunk: string[] = [];
    let len = 0;
    for (let k = i; k < all.length && chunk.length < maxWords; k++) {
      const add = all[k].length + (chunk.length ? 1 : 0);
      if (chunk.length && len + add > maxChars) break;
      chunk.push(all[k]); len += add;
      if (/[,.;:!?…]["')]*$/.test(all[k])) break;
    }
    out.push({ start: i, words: chunk });
    i += chunk.length;
  }
  return out;
}

export function phraseLine(text: string, activeIndex: number, maxWords = 4, maxChars = 26): { words: string[]; activeInLine: number; firstIndex: number } {
  if (activeIndex < 0) return { words: [], activeInLine: -1, firstIndex: 0 };
  const chunk = phraseChunks(text, maxWords, maxChars).find(c => activeIndex >= c.start && activeIndex < c.start + c.words.length);
  return chunk ? { words: chunk.words, activeInLine: activeIndex - chunk.start, firstIndex: chunk.start } : { words: [], activeInLine: -1, firstIndex: 0 };
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
