import { type PlayerRef } from "@remotion/player";
import { type Mood, type Music } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import { checkBrowserRender, environmentReport, RenderFailure, renderMp4 } from "@/lib/render";
import { explainRenderError, FPS, HEIGHT, PALETTES, slug, STYLES, totalFrames, WIDTH, type PaletteId, type StyleId, type VideoProps } from "@/lib/script";
import { stripMarks } from "@/lib/visuals";
import { releaseAsr } from "@/lib/asr/client";
import { STICKER_CREDIT } from "@/lib/stickers";
import { buildStoryboard, validateExport } from "@/lib/storyboard";
import { probeRendered } from "../_components/media-probe";
import type { Generated, MusicMode, SceneImageFile, Track } from "../_components/types";
import type { Dispatch, SetStateAction, RefObject } from "react";
import type { TimelineResult } from "@/lib/script";

type Inputs = {
  abort: RefObject<AbortController | null>;
  blocker: string;
  captions: boolean;
  duck: boolean;
  generate: (seconds: number, m: Mood, s: number) => Promise<Generated | null>;
  generatedFresh: Generated | null;
  images: Record<string, SceneImageFile>;
  mood: Mood;
  music: Music | null;
  musicMode: MusicMode;
  musicTrack: Track | null;
  musicVolume: number;
  narration: Narration | null;
  palette: PaletteId;
  player: RefObject<PlayerRef | null>;
  props: VideoProps | null;
  script: string;
  seed: number;
  setErrorDetail: Dispatch<SetStateAction<string>>;
  setProgress: Dispatch<SetStateAction<number>>;
  setRenderError: Dispatch<SetStateAction<string>>;
  setRendering: Dispatch<SetStateAction<boolean>>;
  setResult: Dispatch<SetStateAction<{ url: string; name: string; size: number; } | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  source: { file: File; url: string; seconds: number; } | null;
  stickerPlan: (string | null)[];
  storyVisuals: boolean;
  style: StyleId;
  timeline: TimelineResult;
  title: string;
  uploadedMusic: Track | null;
  videoEdit: boolean;
  videoSeconds: number;
};

export default function useRenderActions({ abort, blocker, captions, duck, generate, generatedFresh, images, mood, music, musicMode, musicTrack, musicVolume, narration, palette, player, props, script, seed, setErrorDetail, setProgress, setRenderError, setRendering, setResult, setStatus, source, stickerPlan, storyVisuals, style, timeline, title, uploadedMusic, videoEdit, videoSeconds }: Inputs) {
async function render() {
    if (!props || blocker) return;
    setRenderError(""); setErrorDetail(""); setResult(null); setProgress(0);
    let renderProps = props;
    if (musicMode === "auto" && !generatedFresh) {
      setStatus("Menyiapkan backsound…");
      const g = await generate(videoSeconds, mood, seed);
      if (!g) return;
      renderProps = { ...props, music: { src: g.url, volume: musicVolume / 100, duck, loop: false } };
    }
    // A picture whose temporary URL is gone would render as an empty frame: say so before spending minutes rendering.
    const gone: string[] = [];
    for (const sc of renderProps.scenes) if (sc.image) { try { const response = await fetch(sc.image); if (!response.ok) throw new Error("image unavailable"); } catch { gone.push(stripMarks(sc.text).slice(0, 30)); } }
    if (gone.length) { setRenderError(`Gambar untuk scene "${gone.join('", "')}" tidak bisa dibaca lagi. Pilih ulang gambarnya lalu render.`); return; }
    // The speech model is no longer needed; its memory goes to the renderer.
    releaseAsr();
    const support = await checkBrowserRender(!renderProps.audioSrc && !renderProps.music && !renderProps.video && !renderProps.sfx).catch(e => String(e));
    if (support) { setRenderError(support); return; }
    player.current?.pause();
    const controller = new AbortController();
    abort.current = controller;
    setRendering(true);
    setStatus("Merender MP4 di browser… Biarkan tab ini tetap terbuka.");
    try {
      const blob = await renderMp4(renderProps, {
        signal: controller.signal,
        onProgress: p => setProgress(Math.round(p * 100)),
        onRetry: () => setStatus("Percobaan pertama gagal. Mencoba lagi dengan pengaturan encoder lain…"),
      });
      if (blob.size < 1024) throw new Error("Output MP4 kosong.");
      const facts = await probeRendered(blob);
      const bad = validateExport(buildStoryboard(renderProps.scenes, { captions, videoEdit: !!(videoEdit && source), storyVisuals }), { bytes: blob.size, ...facts }).filter(i => i.level === "error");
      if (bad.length) { setRenderError(`Hasil render gagal diperiksa: ${bad.map(b => b.message).join(" ")} Coba render ulang.`); setStatus(""); return; }
      setResult({ url: URL.createObjectURL(blob), name: `${slug(title || script.slice(0, 30))}-1080x1920.mp4`, size: blob.size });
      setStatus("MP4 selesai dirender. Simpan hasilnya sebelum menutup tab.");
    } catch (err) {
      if (controller.signal.aborted) { setStatus("Render dibatalkan."); }
      else {
        const detail = err instanceof RenderFailure ? err.detail : err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        const env = await environmentReport().catch(() => "");
        setErrorDetail(`${detail}\n\n${env}\nGaya: ${style}, palet: ${palette}, narasi: ${renderProps.audioSrc ? "ya" : "tidak"}, backsound: ${musicMode}, durasi: ${videoSeconds.toFixed(1)} dtk`);
        setRenderError(explainRenderError(detail)); setStatus("");
      }
    } finally {
      abort.current = null;
      setRendering(false);
    }
  }

  function exportProject() {
    if (!props) return;
    const project = {
      ...props,
      // Pictures are referenced by file name, like the audio: copy them into public/ for a CLI render.
      scenes: props.scenes.map(sc => sc.image ? { ...sc, image: images[sc.text]?.name ?? null } : sc),
      audioSrc: narration ? narration.file.name : null,
      music: music && musicTrack ? { ...music, src: musicTrack.file.name } : null,
      fps: FPS, width: WIDTH, height: HEIGHT, durationInFrames: props ? totalFrames(props.scenes) : 0,
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug(title || "video")}-props.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const files = [narration?.file.name, musicTrack?.file.name, ...props.scenes.map(sc => sc.image ? images[sc.text]?.name : undefined)].filter(Boolean);
    setStatus(files.length ? `Proyek diunduh. Untuk render CLI, salin ${files.map(f => `"${f}"`).join(" dan ")} ke folder public/ (unduh lewat tombol di bagian audio), lalu ikuti MOTION_STUDIO.md.` : "Proyek diunduh. Lihat MOTION_STUDIO.md untuk render lewat CLI.");
  }

  async function copyBrief() {
    const brief = [
      "MOTION GRAPHICS BRIEF", `Judul: ${title}`, `Gaya: ${STYLES.find(s => s.id === style)?.label}`, `Palet: ${PALETTES[palette].label}`,
      `Format: 9:16, ${WIDTH}x${HEIGHT}, ${FPS} fps`, `Narasi: ${narration ? narration.file.name : "tanpa narasi"}`,
      `Backsound: ${musicMode === "auto" ? `otomatis (${mood})` : musicMode === "upload" ? uploadedMusic?.file.name : "tanpa backsound"}`,
      ...(stickerPlan.some(Boolean) ? [STICKER_CREDIT] : []),
      ...(timeline.ok ? timeline.scenes.map((s, i) => `Scene ${i + 1} (${(s.durationInFrames / FPS).toFixed(1)} dtk): ${s.text}${images[s.text] ? ` [gambar: ${images[s.text].name}${images[s.text].credit ? ` — ${images[s.text].credit!.text}` : ""}]` : ""}`) : []),
    ].join("\n");
    try { await navigator.clipboard.writeText(brief); setStatus("Brief disalin ke clipboard."); }
    catch { setStatus("Browser tidak memberi izin clipboard. Gunakan Ekspor proyek JSON."); }
  }
  return { copyBrief, exportProject, render };
}
