"use client";

import { Player, type PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DEFAULT_MUSIC_VOLUME, encodeWav, MAX_RECORDING_SECONDS, MOODS, moodForStyle, normalize, speechEnvelope, type Mood, type Music } from "@/lib/audio";
import { analyseNarration, decodeToMono, explainMicError, NarrationRecorder, recordingSupported, type Narration } from "@/lib/recorder";
import { checkBrowserRender, environmentReport, RenderFailure, renderMp4 } from "@/lib/render";
import {
  type CaptionStyleId, buildTimeline, CONTENT_PRESETS, explainRenderError, fitScenesToVideo, FPS, HEIGHT, MAX_SECONDS, MIN_SCENE_SECONDS, CAPTION_STYLES, PALETTES, slug, splitScript, splitScriptWithPauses, STYLES, totalFrames, validateAudioFile, validateTitle, WIDTH,
  type ContentPresetId, type DurationMode, type PaletteId, type StyleId, type VideoProps,
} from "@/lib/script";
import { explainVoiceError, loadVoiceEngine, MODEL_BYTES, VOICE_PROFILES, VOICES } from "@/lib/tts/browser";
import { assembleNarration, SPEEDS } from "@/lib/tts/narration";
import { spokenText } from "@/lib/tts/numbers";
import { analyzeVoiceScript, applyOverrides, narrationKey, scenePause, segmentKeys, spokenForDirection, type DirectionOverrides } from "@/lib/voice-director";
import VoiceDirectorPanel from "../VoiceDirectorPanel";
import { ClipCache } from "@/lib/tts/clip-cache";
import { SynthesisCancelled, synthesizeDirected } from "@/lib/tts/direct-synthesis";
import { TTS_LANGS, type TtsLang } from "@/lib/tts/supertonic";
import { allWords, shiftWords, HANDOFF_KEY, parseHandoff, sceneTimings, scriptFromTranscript, mergeShortScenes, type Transcript } from "@/lib/transcript";
import { ICONS, resolveVisual, sceneTopics, type Cut, stripMarks, TEMPLATES, type Template, type VisualOverride } from "@/lib/visuals";
import { chooseFamily, FAMILY_LABELS } from "@/lib/composition";
import { planNarrative } from "@/lib/narrative";
import { releaseAsr } from "@/lib/asr/client";
import { DENSITIES, explainScene, planAnimations, type Density } from "@/lib/importance";
import type { BrandMotion, OverlayPosition } from "@/lib/overlay";
import { isPristine, SESSION_VERSION, type SessionData } from "@/lib/session";
import { clearSession, deleteSource, loadSession, loadSource, saveSession, saveSource, takeClipHandoff, type ClipHandoff } from "@/lib/session-store";
import { scenesToSrt } from "@/lib/srt";
import { ScriptVideo } from "@/remotion/ScriptVideo";
import TranscriptPanel from "../TranscriptPanel";
import AiDirector from "../AiDirector";
import SeoPanel, { type SeoSeed } from "../SeoPanel";
import TrendStart from "../TrendStart";
import TrimPanel from "../TrimPanel";
import EditProfilePanel from "../EditProfilePanel";
import { isEdit, toRenderEdits, type Edit, type EditProfile } from "@/lib/edit-profile";
import { absoluteWords, clampTrim, handoffTrim, reslice, trimSeconds, type Trim } from "@/lib/trim";
import { logDownload, logRender, logSeo, logTrend, scriptId, type HistoryEntry } from "@/lib/history";
import { loadHistory, onHistoryChange, startHistorySync, updateHistory } from "@/lib/history-store";
import type { SeoPlatform, SeoResult } from "@/lib/seo";
import { planStickers, STICKERS, STICKER_BY_ID, STICKER_CREDIT, matchSticker, type StickerMode } from "@/lib/stickers";
import { planSfx, SFX_LABELS, SFX_MODES, SFX_VOLUME, type SfxMode } from "@/lib/sfx";
import { sfxWav } from "@/lib/sfx-synth";
import { DEFAULT_TYPE_PACK, resolveTypePack, TYPE_PACK_IDS, TYPE_PACKS, type TypePackId } from "@/lib/fonts";
import { ensureFonts } from "../../remotion/fonts";
import WatermarkPanel from "../WatermarkPanel";
import { DEFAULT_WATERMARK, isWatermarkActive, loadWatermark, saveWatermark, type Watermark } from "@/lib/watermark";
import { CAPTION_BOTTOM, contentBox, SAFE, SQUARE_CROP } from "@/lib/layout";
import { STORY_VISUAL_LABELS } from "@/lib/story-visual";
import { buildStoryboard, validateExport, validateStoryboard, type Issue } from "@/lib/storyboard";
import { emptyHistory, record, redo, undo, type History } from "@/lib/revision";
import PexelsPanel from "../PexelsPanel";
import AffiliatePanel from "../AffiliatePanel";
import { removeLine, scenesForProductPhoto, type AffiliateBrief } from "@/lib/affiliate";
import ScenePhotoPicker from "../ScenePhotoPicker";
import PixabayPhotoPicker from "../PixabayPhotoPicker";
import PixabayVideoPicker from "../PixabayVideoPicker";
import type { PixabayPhoto, PixabayVideo } from "@/lib/pixabay";
import { pixabayCredit, pixabayVideoCredit } from "@/lib/pixabay";
import { creditText, type PexelsPhoto } from "@/lib/pexels";
import { planToOverrides, type DirectorPlan } from "@/lib/director";
import CloudAccount from "../CloudAccount";
import SaveToHub from "../SaveToHub";
import { cloud } from "@/lib/cloud";
import type { SceneScore } from "@/lib/gemini";
import { isAudioFile, probeVideo, SOURCE_ACCEPT, validateFile } from "@/lib/clip";
import { imageProblem, prepareImage } from "@/lib/scene-image";
import "./motion.css";

const VIDEO_ONLY = "Video Anda";
const AUDIO_ONLY = "Audio Anda";
const SAMPLE = "Jangan tunggu semangat datang.\nMulailah, meski langkahmu kecil.\nDisiplin membuatmu tetap bergerak.\nSatu langkah hari ini lebih baik dari rencana sempurna.\nMulai sekarang.";

const NARRATIVE_ROLE_LABELS: Record<string, string> = {
  hook: "Pembuka", tension: "Konflik", explanation: "Penjelasan", reveal: "Insight",
  application: "Penerapan", resolution: "Kesimpulan", continuation: "Lanjutan",
};
const VISUAL_STRATEGY_LABELS: Record<string, string> = {
  typography: "Tipografi", comparison: "Perbandingan", diagram: "Diagram",
  metaphor: "Metafora", footage: "Footage", minimal: "Minimal",
};
const MOTION_INTENSITY_LABELS: Record<string, string> = {
  quiet: "Tenang", emphasis: "Penekanan", impact: "Dampak kuat",
};
const NARRATIVE_INTENT_LABELS: Record<string, string> = {
  question: "Pertanyaan", contrast: "Kontras", "cause-effect": "Sebab-akibat", process: "Proses", evidence: "Bukti", insight: "Insight", instruction: "Instruksi", story: "Cerita", reflection: "Refleksi", statement: "Pernyataan", resolution: "Kesimpulan",
};
const CONFIDENCE_LABELS: Record<string, string> = { low: "sinyal lemah", medium: "sinyal sedang", high: "sinyal kuat" };

type Mode = "normal" | "affiliate";
const MODE_KEY = "clipper:motion:mode:v1";

type Track = { file: File; url: string; seconds: number };
/** A scene picture kept in memory only (never uploaded or saved with the session). */
type SceneImageFile = { url: string; name: string; mediaType?: "image" | "video"; /** Set for stock media: contributor and source page. */ credit?: { text: string; href: string } };
type Generated = Track & { mood: Mood; seed: number };
type MusicMode = "none" | "auto" | "upload";
type VoiceMode = "ai" | "manual" | "none";
type AiNarration = { key: string; narration: Narration; sceneSeconds: number[] };
type VoiceProgress = { phase: "download" | "synth"; loaded: number; total: number; label: string };

/** Reads an audio file's duration, decoding it when the media element cannot (e.g. some WAV/OGG on Safari). */
/** Safe-zone guide drawn over the preview only (percentages of the 1080×1920 frame); never part of the rendered video. */
function SafeGuide() {
  const x = (v: number) => `${(v / WIDTH) * 100}%`, y = (v: number) => `${(v / HEIGHT) * 100}%`;
  const box = contentBox(false);
  const shade = { position: "absolute" as const, background: "rgba(255,60,60,0.22)" };
  return (
    <div data-testid="safe-guide" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ ...shade, left: 0, right: 0, top: 0, height: y(SAFE.top) }} />
      <div style={{ ...shade, left: 0, right: 0, bottom: 0, height: y(SAFE.bottom) }} />
      <div style={{ ...shade, left: 0, width: x(SAFE.side), top: y(SAFE.top), bottom: y(SAFE.bottom) }} />
      <div style={{ ...shade, right: 0, width: x(SAFE.side), top: y(SAFE.top), bottom: y(SAFE.bottom) }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: y(SQUARE_CROP.top), height: y(SQUARE_CROP.bottom - SQUARE_CROP.top), border: "1px dashed #59b7ff" }} />
      <div style={{ position: "absolute", left: x(SAFE.side), right: x(SAFE.side), top: y(box.top), height: y(box.height), border: "1px dashed #ffffffcc" }} />
      <div style={{ position: "absolute", left: x(SAFE.side), right: x(SAFE.side), top: y(HEIGHT - CAPTION_BOTTOM), borderTop: "2px solid #ffe066" }} />
    </div>
  );
}

/** Size and length of a finished MP4 as the browser reads them; undefined where this browser cannot say (checked then skipped). */
async function probeRendered(blob: Blob): Promise<{ width?: number; height?: number; seconds?: number }> {
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

async function audioDuration(file: File, url: string): Promise<number> {
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

export default function MotionStudio() {
  const player = useRef<PlayerRef>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const recorder = useRef<NarrationRecorder | null>(null);
  const clipCache = useRef(new ClipCache());
  /** Each voice run takes a number; a run is current only while no newer run or cancel has moved the counter (no shared flag to reset). */
  const voiceRun = useRef(0);
  const voiceActive = useRef(false);
  const [script, setScript] = useState(SAMPLE);
  const [title, setTitle] = useState("Sebuah pengingat");
  const [style, setStyle] = useState<StyleId>("hybrid");
  const [palette, setPalette] = useState<PaletteId>("violet");
  const [contentPreset, setContentPreset] = useState<ContentPresetId | "custom">("custom");
  const [target, setTarget] = useState("auto");
  const [captions, setCaptions] = useState(true);
  const [manualNarration, setNarration] = useState<Narration | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ai");
  const [ttsLang, setTtsLang] = useState<TtsLang>("id");
  const [ttsVoice, setTtsVoice] = useState(0);
  const [ttsSpeed, setTtsSpeed] = useState(1.05);
  const [voiceDirectionOverrides, setVoiceDirectionOverrides] = useState<DirectionOverrides>({});
  const [aiNarration, setAiNarration] = useState<AiNarration | null>(null);
  const [voiceProgress, setVoiceProgress] = useState<VoiceProgress | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [musicMode, setMusicMode] = useState<MusicMode>("none");
  const [mood, setMood] = useState<Mood>("tenang");
  const [moodTouched, setMoodTouched] = useState(false);
  const [seed, setSeed] = useState(1);
  const [musicVolume, setMusicVolume] = useState(Math.round(DEFAULT_MUSIC_VOLUME * 100));
  const [duck, setDuck] = useState(true);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [uploadedMusic, setUploadedMusic] = useState<Track | null>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState("");
  const [status, setStatus] = useState("");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [renderError, setRenderError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  /** Manual visual corrections, keyed by scene text so they survive edits to other sentences. */
  const [overrides, setOverrides] = useState<Record<string, VisualOverride>>({});
  // Transcript handed over from the clipper: `offer` is waiting in sessionStorage, `imported` was applied to the script.
  const [offer, setOffer] = useState<{ source: string; transcript: Transcript } | null>(null);
  const [imported, setImported] = useState<Transcript | null>(null);
  // Source video for automatic transcript (uploaded right here); its own audio becomes the narration so captions match.
  const sourceVideo = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<{ file: File; url: string; seconds: number } | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [asrBusy, setAsrBusy] = useState(false);
  // Edit mode: the uploaded video is the base layer (with its own audio); scenes become captions or cutaway graphics.
  const [videoEdit, setVideoEdit] = useState(false);
  // The part of the source video that is used (null = all of it) and the range a Clipper clip came with.
  const [trim, setTrim] = useState<Trim | null>(null);
  const [clipperTrim, setClipperTrim] = useState<Trim | null>(null);
  const [trimNote, setTrimNote] = useState("");
  // Editing profile over a source video (music / comedy): reviewable picture-only edits and the punchlines' caption emphasis, in file time.
  const [editProfile, setEditProfile] = useState<EditProfile>("standard");
  const [edits, setEdits] = useState<Edit[]>([]);
  const [emphasis, setEmphasis] = useState<{ from: number; to: number }[]>([]);
  const [comedySfx, setComedySfx] = useState(false);
  const [captionOffset, setCaptionOffset] = useState(0);
  // Where animations drawn over the speaker sit: the empty space above the head, or just above the captions.
  const [overlayPos, setOverlayPos] = useState<OverlayPosition>("top");
  // How many scenes get an animation, and how elaborate a popular name's animation is.
  const [density, setDensity] = useState<Density>("balanced");
  // Gemini's opinion per sentence (by its text); optional, kept for this visit only.
  const [aiScores, setAiScores] = useState<Record<string, SceneScore>>({});
  const [brandMotion, setBrandMotion] = useState<BrandMotion>("simple");
  const [storyVisuals, setStoryVisuals] = useState(true);
  const [stickerMode, setStickerMode] = useState<StickerMode>("off");
  const [stickerOverrides, setStickerOverrides] = useState<Record<string, string>>({});
  const [sfxMode, setSfxMode] = useState<SfxMode>("off");
  const [backdrop, setBackdrop] = useState<"plain" | "mesh">("plain");
  const [grain, setGrain] = useState(false);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleId>("classic");
  const [typography, setTypography] = useState<TypePackId>(DEFAULT_TYPE_PACK);
  // Fonts of the chosen pack are fetched as soon as it is chosen, so the preview never shows a fallback face for long.
  useEffect(() => { void ensureFonts(resolveTypePack(typography)); }, [typography]);
  const [cutOverrides, setCutOverrides] = useState<Record<string, Cut>>({});
  // Scene pictures for faceless videos, keyed by scene text like the other per-scene choices.
  const [images, setImages] = useState<Record<string, SceneImageFile>>({});
  const [imageError, setImageError] = useState("");
  // The last "Sutradara AI" pass: why each scene looks as it does (by scene text), and what to restore on undo.
  const [directorInfo, setDirectorInfo] = useState<Record<string, { reason: string; imageIdea?: string; imageQuery?: string }>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerSource, setPickerSource] = useState<"pexels" | "pixabay" | "pixabay-video">("pexels");
  // Set while the affiliate panel holds a complete product brief: this is then a selling video.
  const [affiliateBrief, setAffiliateBrief] = useState<AffiliateBrief | null>(null);
  // Which kind of content this is: ordinary, or a selling (affiliate) video. The last choice is remembered on this device.
  const [contentMode, setContentMode] = useState<Mode>("normal");
  const [seoSeed, setSeoSeed] = useState<SeoSeed | null>(null);
  useEffect(() => { try { if (localStorage.getItem(MODE_KEY) === "affiliate") setContentMode("affiliate"); } catch { /* storage blocked: starts as ordinary content */ } }, []);
  function chooseMode(m: Mode) { setContentMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* not remembered */ } }
  const [directorNote, setDirectorNote] = useState("");
  type DirectorSnap = { stickerMode: StickerMode; stickerOverrides: Record<string, string>; sfxMode: SfxMode; typography: TypePackId; backdrop: "plain" | "mesh"; grain: boolean; captionStyle: CaptionStyleId; style: StyleId; palette: PaletteId; contentPreset: ContentPresetId | "custom"; overrides: Record<string, VisualOverride>; cutOverrides: Record<string, Cut>; info: Record<string, { reason: string; imageIdea?: string; imageQuery?: string }>; aiScores: Record<string, SceneScore>; note: string };
  const [guide, setGuide] = useState(false);
  // Watermark: remembered for this editing session, so it is back for every re-render (and shared with the clipper).
  const [watermark, setWatermarkState] = useState<Watermark>(DEFAULT_WATERMARK);
  useEffect(() => { setWatermarkState(loadWatermark()); }, []);
  const setWatermark = (w: Watermark) => { setWatermarkState(w); saveWatermark(w); };
  const [directorHistory, setDirectorHistory] = useState<History<DirectorSnap>>(emptyHistory());
  const imagesRef = useRef(images);
  imagesRef.current = images;
  // Where in the source video a "clip" scene starts (seconds), per scene text.
  const [clipStarts, setClipStarts] = useState<Record<string, number>>({});

  // What this device remembers (never leaves it): offered after a refresh, saved automatically while editing.
  const [saved, setSaved] = useState<SessionData | null>(null);
  const [savedSource, setSavedSource] = useState<{ name: string; seconds: number } | null>(null);
  const [autosave, setAutosave] = useState(false);
  const [cloudUser, setCloudUser] = useState<string | null>(null);
  const [savedCloud, setSavedCloud] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      // A clip sent from the clipper comes first: it is the work in hand, so no older session is offered over it.
      const handed = await takeClipHandoff();
      if (!alive) return;
      if (handed) { applyClipHandoff(handed); setAutosave(true); return; }
      const [s, src] = await Promise.all([loadSession(), loadSource()]);
      if (!alive) return;
      if (s && !isPristine(s, SAMPLE, !!src)) { setSaved(s); setSavedSource(src ? { name: src.name, seconds: src.seconds } : null); }
      else setAutosave(true);
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (!source) return; const url = source.url; return () => URL.revokeObjectURL(url); }, [source]);
  /** The clip arrives as the base video with its subtitles, ready to edit (same state as "use the transcript" after uploading here). */
  const [handoffNote, setHandoffNote] = useState("");
  function applyClipHandoff(h: ClipHandoff) {
    const file = new File([h.blob], h.name, { type: h.type || "video/mp4" });
    // The clip comes with a few seconds of footage on each side: it starts on the clip itself, and the trim can reach into the rest.
    const around = handoffTrim(h.padStart ?? 0, h.padEnd ?? 0, h.seconds);
    setSource({ file, url: URL.createObjectURL(file), seconds: (h.padStart ?? 0) + h.seconds + (h.padEnd ?? 0) });
    setTrim(around); setClipperTrim(around); setTrimNote(""); setEdits([]); setEmphasis([]);
    // A clip the browser cannot read is reported at once, instead of showing a black player.
    void probeVideo(file).then(p => { if (!p.ok) { setSource(null); setVideoEdit(false); setHandoffNote(`Klip yang diterima tidak bisa diputar di browser ini. Kembali ke Clipper lalu ekspor ulang klipnya, atau pilih video langsung di sini. (Detail: ${p.detail})`); } });
    if (h.opening?.trim() || h.title) setTitle((h.opening?.trim() || h.title).slice(0, 60).trim());
    if (h.transcript && h.transcript.segments.length > 0) {
      setScript(scriptFromTranscript(h.transcript, FPS)); setImported(h.transcript);
      setVoiceMode("none"); setNarration(null); setVideoEdit(true); setCaptionOffset(0); setPalette("pearl"); setContentPreset("custom"); setOffer(null);
      setHandoffNote(h.transcript.granularity === "word"
        ? "Klip dari Clipper dimuat dengan subtitlenya."
        : "Klip dari Clipper dimuat. Subtitle berasal dari AI dengan waktu per kalimat. Untuk waktu yang paling presisi, ketuk \"Presisikan waktu subtitle\" di panel Transkrip (satu ketukan, dibuat di perangkat; teks tidak berubah).");
    } else { makeSourceBase(file); setHandoffNote("Klip dari Clipper dimuat dan jadi dasar video (tampil di preview). Belum ada subtitle: buat transkrip di panel Transkrip, atau tulis naskah."); }
  }
  /** Moves the start or end of the video. A transcript made for the old range is cut to the new one when it fits inside it. */
  function applyTrim(next: Trim | null) {
    if (!source) return;
    const old = trim ?? { start: 0, end: source.seconds }, to = next ?? { start: 0, end: source.seconds };
    setTrim(next); setTrimNote("");
    if (!imported) return;
    const r = reslice(imported, old, to, script, FPS);
    if (r.outcome === "same") return;
    setImported(r.transcript);
    if (r.outcome === "lost") { setTrimNote("Potongan melewati bagian yang sudah punya transkrip, jadi subtitle perlu dibuat lagi untuk potongan baru (ketuk Buat transkrip di bawah). Sementara itu waktu subtitle hanya perkiraan."); return; }
    if (r.script) setScript(r.script);
    else if (script !== scriptFromTranscript(imported, FPS)) setTrimNote("Naskah sudah Anda ubah, jadi tidak diganti. Kalimat yang berada di luar potongan baru bisa dihapus dari naskah.");
  }
  /**
   * A chosen video (or audio) becomes the base of the video at once, so the preview shows it and the render uses it, even
   * before there is a transcript. With the untouched sample script (or none) it plays as it is, without subtitles, until a
   * transcript is made; with a script the creator already wrote, the lines are spread over it (their timing is only an estimate).
   */
  function makeSourceBase(file: File) {
    setVideoEdit(true); setVoiceMode("none"); setNarration(null); setCaptionOffset(0); setPalette("pearl"); setContentPreset("custom");
    const plain = isAudioFile(file) ? AUDIO_ONLY : VIDEO_ONLY;
    if (!script.trim() || script === SAMPLE || script === VIDEO_ONLY || script === AUDIO_ONLY) {
      setScript(plain); setCaptions(false); setCutOverrides({ [plain]: "video" }); setImported(null);
    }
  }
  function onSourceVideo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const check = validateFile(f);
    if (!check.ok) return setSourceError(check.error);
    setSourceError("");
    const url = URL.createObjectURL(f);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (!Number.isFinite(probe.duration) || probe.duration <= 0) { URL.revokeObjectURL(url); return setSourceError("Durasi berkas tidak dapat dibaca. Coba MP4 (H.264) atau audio MP3/M4A."); }
      if (probe.duration > MAX_SECONDS) { URL.revokeObjectURL(url); return setSourceError(`Video ${Math.round(probe.duration)} detik melebihi batas ${MAX_SECONDS} detik (3 menit). Potong dulu di Clipper Studio.`); }
      setSource({ file: f, url, seconds: probe.duration }); setTrim(null); setClipperTrim(null); setTrimNote(""); setEdits([]); setEmphasis([]); makeSourceBase(f);
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setSourceError("Browser tidak dapat memutar berkas ini. Coba MP4 (H.264) atau audio MP3/M4A/WAV."); };
    probe.src = url;
  }
  useEffect(() => { try { setOffer(parseHandoff(sessionStorage.getItem(HANDOFF_KEY))); } catch { /* storage blocked: no offer */ } }, []);

  useEffect(() => { if (!manualNarration) return; const url = manualNarration.url; return () => URL.revokeObjectURL(url); }, [manualNarration]);
  useEffect(() => { if (!aiNarration) return; const url = aiNarration.narration.url; return () => URL.revokeObjectURL(url); }, [aiNarration]);
  useEffect(() => { if (!generated) return; const url = generated.url; return () => URL.revokeObjectURL(url); }, [generated]);
  useEffect(() => { if (!uploadedMusic) return; const url = uploadedMusic.url; return () => URL.revokeObjectURL(url); }, [uploadedMusic]);
  useEffect(() => { if (!result) return; const url = result.url; return () => URL.revokeObjectURL(url); }, [result]);
  useEffect(() => () => { abort.current?.abort(); recorder.current?.cancel(); Object.values(imagesRef.current).forEach(im => URL.revokeObjectURL(im.url)); }, []);
  // The mood follows the animation style until the user picks one.
  useEffect(() => { if (!moodTouched) setMood(moodForStyle(style)); }, [style, moodTouched]);

  // Automatic voice over is valid only for the exact sentences, language, voice and speed it was made from.
  const voiceScript = useMemo(() => splitScriptWithPauses(script), [script]);
  const autoDirections = useMemo(() => analyzeVoiceScript(voiceScript.texts, ttsLang), [voiceScript, ttsLang]);
  const voiceSegmentKeys = useMemo(() => segmentKeys(voiceScript.texts), [voiceScript]);
  const voiceDirections = useMemo(() => applyOverrides(autoDirections, voiceSegmentKeys, voiceDirectionOverrides), [autoDirections, voiceSegmentKeys, voiceDirectionOverrides]);
  // Only what changes the sound (tempo, pause) can make a generated narration out of date; emotion, style, intonation and emphasis cannot.
  const voiceKey = useMemo(() => narrationKey(voiceScript, ttsLang, ttsVoice, ttsSpeed, voiceDirections), [voiceScript, ttsLang, ttsVoice, ttsSpeed, voiceDirections]);
  const aiFresh = voiceMode === "ai" && aiNarration?.key === voiceKey ? aiNarration : null;
  const narration = voiceMode === "ai" ? aiFresh?.narration ?? null : voiceMode === "manual" ? manualNarration : null;
  // Transcript timing applies while the script still matches the transcript words and the narration is the original audio.
  const timings = useMemo(() => imported ? sceneTimings(splitScript(script), shiftWords(allWords(imported), captionOffset), FPS, imported.duration) : null, [imported, script, captionOffset]);
  const timed = voiceMode !== "ai" && timings && (!narration || Math.abs(narration.seconds - imported!.duration) <= 1) ? timings : null;
  const mode: DurationMode = aiFresh ? { kind: "scenes", seconds: aiFresh.sceneSeconds }
    : timed ? { kind: "scenes", seconds: timed.seconds, exact: true }
    : narration ? { kind: "audio", seconds: narration.seconds }
    // Editing over a video whose captions have no usable timing: the scenes still span exactly the video, never more or less.
    : videoEdit && source && splitScript(script).length * MIN_SCENE_SECONDS <= trimSeconds(trim, source.seconds) ? { kind: "target", seconds: trimSeconds(trim, source.seconds) }
    : target === "auto" || voiceMode === "ai" ? { kind: "auto" } : { kind: "target", seconds: Number(target) };
  const voiceBusy = voiceProgress !== null;
  const timeline = useMemo(() => buildTimeline(script, mode, FPS), [script, mode.kind, mode.kind === "target" ? mode.seconds : null, aiFresh, narration?.seconds, target, timed]); // eslint-disable-line react-hooks/exhaustive-deps
  const videoSeconds = timeline.ok ? timeline.seconds : 0;
  const titleError = validateTitle(title);
  const recording = recordingSeconds !== null;

  const generatedFresh = generated && generated.mood === mood && generated.seed === seed && Math.abs(generated.seconds - videoSeconds) < 0.05 ? generated : null;
  const musicTrack: Track | null = musicMode === "auto" ? generatedFresh : musicMode === "upload" ? uploadedMusic : null;
  const music: Music | null = musicTrack ? { src: musicTrack.url, volume: musicVolume / 100, duck, loop: musicMode === "upload" } : null;

  const sceneContext = timeline.ok ? sceneTopics(timeline.scenes.map(sc => sc.text)) : [];
  const sceneVisuals = timeline.ok ? timeline.scenes.map((sc, i) => resolveVisual(sc.text, overrides[sc.text], sceneContext[i])) : [];
  const narrativePlan = timeline.ok ? planNarrative(timeline.scenes.map(sc => sc.text)) : [];
  // Which scenes deserve an animation: judged on what they say, not on whether an icon exists for a word.
  const animationPlan = timeline.ok
    ? planAnimations(timeline.scenes.map((sc, i) => ({ text: sc.text, visual: sceneVisuals[i], seconds: sc.durationInFrames / FPS })), density, timeline.scenes.map(sc => aiScores[sc.text]))
    : { cuts: [], judgements: [] };
  const planned = animationPlan.cuts;
  const stickerPlan = timeline.ok && !(videoEdit && source) ? planStickers(timeline.scenes.map(sc => sc.text), { mode: stickerMode, overrides: stickerOverrides }) : [];
  const sceneList = timeline.ok ? (videoEdit && source ? (list: typeof timeline.scenes) => fitScenesToVideo(list, Math.round(trimSeconds(trim, source.seconds) * FPS)) : (list: typeof timeline.scenes) => list)(timeline.scenes).map((sc, i) => ({
    ...sc, visual: sceneVisuals[i], narrative: narrativePlan[i], ...(timed && !aiFresh ? { wordStarts: timed.wordStarts[i], wordEnds: timed.wordEnds[i], pauseFrames: undefined } : {}),
    ...(videoEdit && source ? { cut: cutOverrides[sc.text] ?? planned[i], ...(cutOverrides[sc.text] === "clip" ? { clipFrom: clipStarts[sc.text] ?? (trim?.start ?? 0) } : {}) } : {}),
    ...(images[sc.text]?.mediaType === "video" ? { videoSrc: images[sc.text].url } : images[sc.text] ? { image: images[sc.text].url } : {}),
    ...(stickerPlan[i] ? { sticker: stickerPlan[i]! } : {}),
  })) : [];
  // Sound effects: planned from the scenes, synthesised on the device into one small WAV that plays in the preview and the MP4.
  const outLength = timeline.ok ? totalFrames(sceneList) / FPS : 0;
  const editActive = !!(videoEdit && source) && editProfile !== "standard";
  const renderEdits = editActive ? toRenderEdits(edits, trim?.start ?? 0, outLength) : [];
  const renderEmphasis = editActive && editProfile === "comedy" ? emphasis.map(r => ({ from: r.from - (trim?.start ?? 0), to: r.to - (trim?.start ?? 0) })).filter(r => r.to > 0 && r.from < outLength) : [];
  const sfxPlan = [...planSfx(sceneList, sfxMode, { videoEdit: !!(videoEdit && source) }),
    // Comedy: a small pop on each punch-in (switched on by the creator; off by default).
    ...(editActive && editProfile === "comedy" && comedySfx ? renderEdits.filter(e => e.kind === "punch").map(e => ({ frame: Math.round(e.at * FPS), kind: "pop" as const, gain: 0.5 })) : [])].sort((a, b) => a.frame - b.frame);
  // Keyed by what the track contains (not by array identity, which changes every render): the same effects keep the same WAV.
  const sfxFrames = totalFrames(sceneList);
  const sfxKey = JSON.stringify([sfxPlan, sfxFrames]);
  const sfxBytes = useMemo(() => sfxPlan.length ? sfxWav(sfxPlan, sfxFrames, FPS) : null, [sfxKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The WAV gets its address in the same render as the plan, so a render started right after a change always has the matching sound.
  const sfxSrc = useMemo(() => sfxBytes ? URL.createObjectURL(new Blob([sfxBytes], { type: "audio/wav" })) : null, [sfxBytes]);
  useEffect(() => () => { if (sfxSrc) URL.revokeObjectURL(sfxSrc); }, [sfxSrc]);
  const props: VideoProps | null = timeline.ok ? {
    title: title.trim(), scenes: sceneList, style, palette, audioSrc: narration?.url ?? null, captions, video: videoEdit && source ? { src: source.url, seconds: source.seconds, ...(trim ? { trimStart: trim.start } : {}), ...(isAudioFile(source.file) ? { audioOnly: true } : {}) } : null, ...(renderEdits.length ? { edits: renderEdits } : {}), ...(renderEmphasis.length ? { captionEmphasis: renderEmphasis } : {}), overlay: overlayPos, brandMotion,
    music, speech: narration?.speech ?? null, ...(isWatermarkActive(watermark) ? { watermark } : {}), ...(storyVisuals ? {} : { storyVisuals: false }), ...(typography !== DEFAULT_TYPE_PACK ? { typography } : {}), ...(captionStyle !== "classic" ? { captionStyle } : {}), ...(backdrop === "mesh" ? { backdrop } : {}), ...(grain ? { grain } : {}), ...(sfxSrc ? { sfx: { src: sfxSrc, volume: SFX_VOLUME } } : {}),
  } : null;
  const snapshot = useMemo<SessionData>(() => ({
    v: SESSION_VERSION, savedAt: 0, script, title, style, palette, contentPreset, target, captions, overrides, cutOverrides, clipStarts, videoEdit, captionOffset, overlay: overlayPos, density, brandMotion, ...(storyVisuals ? {} : { storyVisuals: false }), ...(typography !== DEFAULT_TYPE_PACK ? { typography } : {}), ...(captionStyle !== "classic" ? { captionStyle } : {}), ...(trim ? { trim } : {}), ...(editProfile !== "standard" ? { edit: { profile: editProfile, edits, emphasis, sfx: comedySfx } } : {}), ...(backdrop === "mesh" ? { backdrop } : {}), ...(grain ? { grain } : {}), ...(stickerMode !== "off" ? { stickerMode } : {}), ...(Object.keys(stickerOverrides).length ? { stickerOverrides } : {}), ...(sfxMode !== "off" ? { sfx: sfxMode } : {}), imported,
    voiceMode: voiceMode === "ai" ? "ai" : "none", ttsLang, ttsVoice, ttsSpeed,
  }), [script, title, style, palette, contentPreset, target, captions, overrides, cutOverrides, clipStarts, videoEdit, captionOffset, overlayPos, density, brandMotion, storyVisuals, typography, captionStyle, backdrop, grain, stickerMode, stickerOverrides, sfxMode, imported, voiceMode, ttsLang, ttsVoice, ttsSpeed, trim, editProfile, edits, emphasis, comedySfx]);
  useEffect(() => {
    if (!autosave || isPristine(snapshot, SAMPLE, !!source)) return;
    const t = setTimeout(() => { const s = { ...snapshot, savedAt: Date.now() }; void saveSession(s); void cloud.pushSession(s); }, 1000);
    return () => clearTimeout(t);
  }, [autosave, snapshot, source]);
  // Signed in: a session saved from another device that is newer than this one is offered like a local one.
  useEffect(() => {
    if (!cloudUser) return;
    let alive = true;
    void (async () => {
      const [remote, local] = await Promise.all([cloud.pullSession(), loadSession()]);
      if (!alive || !remote || isPristine(remote, SAMPLE, false)) return;
      if (remote.savedAt <= (local?.savedAt ?? 0)) return;
      setSaved(remote); setSavedCloud(true); setSavedSource(null);
    })();
    return () => { alive = false; };
  }, [cloudUser]);
  useEffect(() => {
    // Writing a large video to storage competes for memory with transcription and rendering; wait until they are done.
    if (!autosave || asrBusy || rendering) return;
    if (!source) { void deleteSource(); return; }
    void saveSource({ blob: source.file, name: source.file.name, type: source.file.type, lastModified: source.file.lastModified, seconds: source.seconds });
  }, [autosave, source, asrBusy, rendering]);
  async function restoreSession() {
    const s = saved;
    if (!s) return;
    setScript(s.script); setTitle(s.title); setStyle(s.style); setPalette(s.palette); setContentPreset(s.contentPreset); setTarget(s.target); setCaptions(s.captions);
    setOverrides(s.overrides); setCutOverrides(s.cutOverrides); setClipStarts(s.clipStarts); setCaptionOffset(s.captionOffset); setOverlayPos(s.overlay ?? "top"); setDensity(s.density ?? "balanced"); setBrandMotion(s.brandMotion ?? "simple"); setStoryVisuals(s.storyVisuals !== false); setTypography(s.typography ?? DEFAULT_TYPE_PACK); setCaptionStyle(s.captionStyle ?? "classic"); setBackdrop(s.backdrop ?? "plain"); setGrain(s.grain === true); setStickerMode(s.stickerMode ?? "off"); setStickerOverrides(s.stickerOverrides ?? {}); setSfxMode(s.sfx ?? "off"); setImported(s.imported);
    setVoiceMode(s.voiceMode); setTtsLang(s.ttsLang); setTtsVoice(s.ttsVoice); setTtsSpeed(s.ttsSpeed);
    const rec = savedSource ? await loadSource() : null;
    if (rec) {
      const file = rec.blob instanceof File ? rec.blob : new File([rec.blob], rec.name, { type: rec.type, lastModified: rec.lastModified });
      setSource({ file, url: URL.createObjectURL(file), seconds: rec.seconds });
      setTrim(s.trim ?? null); setClipperTrim(null);
      setEditProfile(s.edit?.profile ?? "standard"); setEdits((s.edit?.edits ?? []).filter(isEdit)); setEmphasis(s.edit?.emphasis ?? []); setComedySfx(!!s.edit?.sfx);
      setVideoEdit(s.videoEdit);
    } else setVideoEdit(false); // editing over the video needs the video itself
    setSaved(null); setSavedCloud(false); setAutosave(true);
  }
  /** A transcript's timing, with the creator's own script kept: used after a local (Whisper) transcript of the clip. */
  function useTimingOnly(t: Transcript): string | null {
    const words = shiftWords(allWords(t), captionOffset);
    if (!sceneTimings(splitScript(script), words, FPS, t.duration)) return "Naskah terlalu berbeda dari hasil ini, jadi waktunya tidak bisa dipakai. Pilih \"Pakai transkrip\" untuk mengganti naskah dengan hasil ini.";
    setScript(mergeShortScenes(script, allWords(t), FPS, t.duration));
    setImported(t); setVoiceMode("none"); setNarration(null); setVideoEdit(true); setCaptions(true);
    return null;
  }
  async function discardSession() { await clearSession(); setSavedCloud(false); setSaved(null); setSavedSource(null); setAutosave(true); }

  // Structured plan the renderer will draw, checked before render (lib/storyboard.ts).
  const storyboard = useMemo(() => buildStoryboard(sceneList, { captions, videoEdit: !!(videoEdit && source), storyVisuals }), [sceneList, captions, videoEdit, source, storyVisuals]);
  const storyIssues: Issue[] = useMemo(() => validateStoryboard(storyboard, { audioSeconds: mode.kind === "audio" ? narration?.seconds : undefined }), [storyboard, mode.kind, narration?.seconds]); // eslint-disable-line react-hooks/exhaustive-deps
  const storyErrors = storyIssues.filter(i => i.level === "error");

  const blocker = !timeline.ok ? timeline.error : titleError
    ?? (recording ? "Selesaikan perekaman narasi terlebih dahulu." : null)
    ?? (storyErrors[0]?.message ?? null)
    ?? (voiceMode === "ai" && !aiFresh ? (aiNarration ? "Naskah, bahasa, suara, kecepatan, atau tempo/jeda per kalimat berubah. Ketuk “Buat suara otomatis” lagi (hanya kalimat yang berubah dibuat ulang)." : "Ketuk “Buat suara otomatis” untuk membuat voice over dari naskah.") : null);

  // Inputs changed after a render: the downloaded file no longer matches the preview.
  // Subtitle file for the current script, offered once an MP4 exists; revoked when the script changes.
  const srtText = result && timeline.ok && captions && !videoEdit ? scenesToSrt(sceneList) : null;
  const srtUrl = useMemo(() => srtText ? URL.createObjectURL(new Blob([srtText], { type: "text/plain;charset=utf-8" })) : null, [srtText]);
  useEffect(() => () => { if (srtUrl) URL.revokeObjectURL(srtUrl); }, [srtUrl]);
  useEffect(() => { setResult(null); }, [script, title, style, palette, target, captions, narration, musicMode, musicTrack, musicVolume, duck, watermark]);

  // Production history (text only, on this device): renders and downloads are logged, and the SEO packs of the video being
  // worked on are restored when its script is back, so making many videos and downloading them loses nothing.
  const [historyId, setHistoryId] = useState(() => scriptId(script));
  useEffect(() => { const t = setTimeout(() => setHistoryId(scriptId(script)), 800); return () => clearTimeout(t); }, [script]);
  useEffect(() => { startHistorySync(); }, []);
  const [entrySeo, setEntrySeo] = useState<HistoryEntry["seo"]>({});
  useEffect(() => {
    let alive = true;
    const load = () => { void loadHistory().then(list => { if (alive) setEntrySeo(list.find(e => e.id === historyId)?.seo ?? {}); }); };
    load();
    const off = onHistoryChange(load);
    return () => { alive = false; off(); };
  }, [historyId]);
  const base = () => ({ id: scriptId(script), kind: "motion" as const, title, script, now: Date.now() });
  useEffect(() => {
    if (!result) return;
    void updateHistory(l => logRender(l, base(), { name: result.name, size: result.size, label: `${WIDTH}×${HEIGHT} · ${videoSeconds.toFixed(0)} dtk` }));
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSeoResult = (platform: SeoPlatform, r: SeoResult) => { void updateHistory(l => logSeo(l, base(), platform, r)); };
  // "Buka di studio" from the history page leaves the script here.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("clipper:history:open");
      if (!raw) return;
      sessionStorage.removeItem("clipper:history:open");
      const o = JSON.parse(raw) as { script?: unknown; title?: unknown };
      if (typeof o.script === "string" && o.script.trim()) { setScript(o.script.slice(0, 3000)); setTitle(typeof o.title === "string" ? o.title.slice(0, 60) : ""); setContentPreset("custom"); setHistoryId(scriptId(o.script)); setHandoffNote("Naskah dibuka dari Riwayat. Atur tampilan, render ulang, atau lihat paket SEO yang tersimpan."); }
    } catch { /* storage blocked: nothing to open */ }
  }, []);

  const generate = useCallback(async (seconds: number, m: Mood, s: number): Promise<Generated | null> => {
    setMusicBusy(true); setMusicError("");
    try {
      const { generateBacksound } = await import("@/lib/backsound");
      const file = await generateBacksound(m, seconds, s);
      const g = { file, url: URL.createObjectURL(file), seconds, mood: m, seed: s };
      setGenerated(g);
      return g;
    } catch (err) {
      setMusicError(`Backsound otomatis gagal dibuat: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally { setMusicBusy(false); }
  }, []);

  // Regenerate the automatic backsound (debounced) whenever the video length, mood or variation changes.
  useEffect(() => {
    if (musicMode !== "auto" || !timeline.ok || generatedFresh || musicBusy) return;
    const id = setTimeout(() => { void generate(videoSeconds, mood, seed); }, 600);
    return () => clearTimeout(id);
  }, [musicMode, timeline.ok, videoSeconds, mood, seed, generatedFresh, musicBusy, generate]);

  async function loadNarrationFile(f: File) {
    setAudioError(""); setNarrationBusy(true);
    const url = URL.createObjectURL(f);
    try {
      const analysed = await analyseNarration(f);
      const seconds = analysed.seconds ?? await audioDuration(f, url);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("no duration");
      setNarration({ file: f, url, seconds, speech: analysed.speech, recorded: false });
    } catch {
      URL.revokeObjectURL(url);
      setAudioError("Browser tidak dapat membaca audio ini. Coba MP3, M4A, atau WAV.");
    } finally { setNarrationBusy(false); }
  }

  function onAudio(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const err = validateAudioFile(f);
    if (err) return setAudioError(err);
    void loadNarrationFile(f);
  }

  function cancelVoice() {
    voiceRun.current++; // the running synthesis sees it is no longer current and stops at its next step
    voiceActive.current = false;
    setVoiceProgress(null);
    setStatus("Pembuatan suara dibatalkan. Suara yang sudah jadi tetap tersimpan untuk percobaan berikutnya.");
  }

  async function generateVoice() {
    if (voiceBusy || voiceActive.current) return;
    const { texts, pauses } = voiceScript;
    const check = buildTimeline(script, { kind: "auto" }, FPS);
    if (!check.ok) return setVoiceError(check.error);
    const directions = voiceDirections, key = voiceKey, lang = ttsLang, voice = ttsVoice, baseSpeed = ttsSpeed; // one consistent snapshot for the whole run
    const run = ++voiceRun.current;
    voiceActive.current = true;
    const current = () => voiceRun.current === run;
    setVoiceError("");
    player.current?.pause();
    try {
      setVoiceProgress({ phase: "download", loaded: 0, total: MODEL_BYTES, label: "Menyiapkan model suara…" });
      const engine = await loadVoiceEngine((loaded, total) => { if (current()) setVoiceProgress({ phase: "download", loaded, total, label: "Mengunduh model suara (sekali saja)…" }); });
      // Digits are spoken as words ("1.300" → "seribu tiga ratus"); the screen keeps the digits.
      const spoken = texts.map((t, i) => spokenForDirection(spokenText(stripMarks(t), lang), directions[i]));
      const { clips } = await synthesizeDirected({
        spoken, directions, baseSpeed, lang, voice, cache: clipCache.current, isCancelled: () => !current(),
        synth: (text, speed, onStep) => engine.synthesize(text, lang, voice, { speed, onStep }),
        onProgress: async ({ index, count, step, steps }) => {
          if (current()) setVoiceProgress({ phase: "synth", loaded: index * steps + step, total: count * steps, label: `Membuat suara scene ${index + 1}/${count}…` });
          await new Promise(r => setTimeout(r, 0)); // let the browser paint progress between model steps
        },
      });
      if (!current()) return;
      const directedPauses = pauses.map((pause, i) => scenePause(pause, directions[i]));
      const { samples, sceneSeconds } = assembleNarration(clips, engine.sampleRate, FPS, directedPauses);
      normalize(samples, 0.9, 3);
      const file = new File([encodeWav([samples], engine.sampleRate)], `suara-otomatis-${lang}.wav`, { type: "audio/wav" });
      // The previous narration is replaced only now, when the new one is complete.
      setAiNarration({
        key, sceneSeconds,
        narration: { file, url: URL.createObjectURL(file), seconds: samples.length / engine.sampleRate, speech: speechEnvelope(samples, engine.sampleRate, FPS), recorded: false },
      });
      setStatus(`Suara otomatis ${(samples.length / engine.sampleRate).toFixed(1)} dtk siap. Durasi tiap scene mengikuti ucapannya.`);
    } catch (err) {
      if (!current() || err instanceof SynthesisCancelled) return; // cancelled or replaced: the cancel handler already said so
      setVoiceError(explainVoiceError(err));
    } finally {
      if (current()) { voiceActive.current = false; setVoiceProgress(null); }
    }
  }

  async function startRecording() {
    setAudioError("");
    if (!recordingSupported()) return setAudioError("Browser ini tidak mendukung perekaman audio. Gunakan Safari/Chrome terbaru, atau unggah rekaman.");
    player.current?.pause();
    const rec = new NarrationRecorder();
    recorder.current = rec;
    try {
      await rec.start(s => setRecordingSeconds(s), () => { void stopRecording(); });
      setRecordingSeconds(0);
      setStatus("Merekam… Bacakan naskah, lalu ketuk Selesai.");
    } catch (err) {
      rec.cancel(); recorder.current = null;
      setAudioError(explainMicError(err));
    }
  }

  async function stopRecording() {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setRecordingSeconds(null); setNarrationBusy(true);
    try {
      const n = await rec.stop();
      setNarration(n);
      setStatus(`Rekaman ${n.seconds.toFixed(1)} dtk siap. Durasi scene mengikuti rekaman.`);
    } catch (err) {
      setAudioError(`Rekaman gagal diproses: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("");
    } finally { setNarrationBusy(false); }
  }

  function cancelRecording() {
    recorder.current?.cancel(); recorder.current = null;
    setRecordingSeconds(null); setStatus("Perekaman dibatalkan.");
  }

  async function onMusic(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMusicError("");
    const err = validateAudioFile(f);
    if (err) return setMusicError(err);
    const url = URL.createObjectURL(f);
    try {
      const seconds = await audioDuration(f, url);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("no duration");
      setUploadedMusic({ file: f, url, seconds });
      setMusicMode("upload");
      if (musicVolume === Math.round(DEFAULT_MUSIC_VOLUME * 100)) setMusicVolume(30);
    } catch {
      URL.revokeObjectURL(url);
      setMusicError("Browser tidak dapat membaca musik ini. Coba MP3, M4A, atau WAV.");
    }
  }

  const directorSnap = (): DirectorSnap => ({ stickerMode, stickerOverrides, sfxMode, typography, backdrop, grain, captionStyle, style, palette, contentPreset, overrides, cutOverrides, info: directorInfo, aiScores, note: directorNote });
  function restoreDirector(v: DirectorSnap) {
    setStyle(v.style); setPalette(v.palette); setContentPreset(v.contentPreset); setStickerMode(v.stickerMode); setStickerOverrides(v.stickerOverrides); setSfxMode(v.sfxMode); setTypography(v.typography); setBackdrop(v.backdrop); setGrain(v.grain); setCaptionStyle(v.captionStyle);
    setOverrides(v.overrides); setCutOverrides(v.cutOverrides);
    setDirectorInfo(v.info); setAiScores(v.aiScores); setDirectorNote(v.note);
  }
  /** Applies one revision of the AI director as ordinary choices; the state before it is kept as a version so it can be undone and redone. */
  function applyDirector(plan: DirectorPlan, label: string) {
    if (!timeline.ok) return;
    const texts = timeline.scenes.map(sc => sc.text);
    const { overrides: ov, cuts, stickers: stk } = planToOverrides(plan, texts);
    setDirectorHistory(h => record(h, label, directorSnap()));
    if (plan.style) setStyle(plan.style);
    if (plan.palette) setPalette(plan.palette);
    if (plan.typography) setTypography(plan.typography);
    if (plan.backdrop) setBackdrop(plan.backdrop);
    if (plan.grain !== undefined) setGrain(plan.grain);
    if (plan.captionStyle) setCaptionStyle(plan.captionStyle);
    if (plan.sfx) setSfxMode(plan.sfx);
    if (plan.stickers) setStickerMode(plan.stickers);
    if (Object.keys(stk).length) { setStickerOverrides(prev => ({ ...prev, ...stk })); if (!plan.stickers) setStickerMode("auto"); }
    if (plan.style || plan.palette) setContentPreset("custom");
    setOverrides(prev => ({ ...prev, ...ov }));
    if (videoEdit && source) setCutOverrides(prev => ({ ...prev, ...cuts }));
    const info: Record<string, { reason: string; imageIdea?: string; imageQuery?: string }> = { ...directorInfo };
    plan.scenes.forEach((s, i) => { if (s) info[texts[i]] = { reason: s.reason, imageIdea: s.imageIdea, imageQuery: s.imageQuery }; });
    setDirectorInfo(info);
    const scores: Record<string, SceneScore> = { ...aiScores };
    plan.scenes.forEach((scene, i) => { if (scene?.importanceScore !== undefined) scores[texts[i]] = { score: scene.importanceScore, reason: scene.importanceReason ?? "" }; });
    setAiScores(scores);
    setDirectorNote(plan.note);
  }
  function undoDirector() {
    const r = undo(directorHistory, directorSnap());
    if (!r) return;
    setDirectorHistory(r.history); restoreDirector(r.state);
  }
  function redoDirector() {
    const r = redo(directorHistory, directorSnap());
    if (!r) return;
    setDirectorHistory(r.history); restoreDirector(r.state);
  }
  /** A choice made by hand replaces the AI's reason for that scene; the picture idea stays. */
  function manualChoice(text: string) {
    setDirectorInfo(prev => prev[text]?.reason ? { ...prev, [text]: { ...prev[text], reason: "" } } : prev);
  }

  async function onSceneImage(text: string, e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const problem = imageProblem(f);
    if (problem) { setImageError(problem); return; }
    setImageError("");
    try { await putSceneImage(text, f); }
    catch (err) { setImageError(err instanceof Error ? err.message : String(err)); }
  }
  /** Reduces the picture for memory and sets it behind the scene, replacing any earlier one. */
  async function putSceneImage(text: string, file: File, credit?: SceneImageFile["credit"]) {
    const blob = await prepareImage(file);
    const url = URL.createObjectURL(blob);
    setImages(prev => { if (prev[text]) URL.revokeObjectURL(prev[text].url); return { ...prev, [text]: { url, name: file.name, credit } }; });
    // Over a source video a picture can only be seen as a full-screen cutaway, so choosing one makes the scene a cutaway.
    if (videoEdit && source) setCutOverrides(prev => prev[text] === "graphic" ? prev : { ...prev, [text]: "graphic" });
  }
  /** The creator's own product photo behind every scene that names the product, and the last one; resolves with how many. */
  async function placeProductPhoto(file: File, brief: AffiliateBrief, credit?: SceneImageFile["credit"]): Promise<number> {
    if (!timeline.ok) return 0;
    const problem = imageProblem(file);
    if (problem) throw new Error(problem);
    const blob = await prepareImage(file); // reduced once, then shared by every scene
    const prepared = new File([blob], file.name, { type: blob.type || "image/jpeg" });
    const texts = timeline.scenes.map(sc => sc.text);
    const targets = scenesForProductPhoto(texts, brief.product);
    for (const i of targets) await putSceneImage(texts[i], prepared, credit);
    return targets.length;
  }
  const putStockPhoto = (text: string, file: File, photo: PexelsPhoto) => putSceneImage(text, file, { text: creditText(photo), href: photo.pexelsUrl || photo.photographerUrl || "https://www.pexels.com" });
  const putPixabayPhoto = (text: string, file: File, photo: PixabayPhoto) => putSceneImage(text, file, pixabayCredit(photo));
  function putPixabayVideo(text: string, video: PixabayVideo) {
    setImages(prev => { if (prev[text]?.url.startsWith("blob:")) URL.revokeObjectURL(prev[text].url); return { ...prev, [text]: { url: video.url, name: `pixabay-video-${video.id}.mp4`, mediaType: "video", credit: pixabayVideoCredit(video) } }; });
    if (videoEdit && source) setCutOverrides(prev => prev[text] === "graphic" ? prev : { ...prev, [text]: "graphic" });
  }
  function removeSceneImage(text: string) {
    setImages(prev => { if (!prev[text]) return prev; URL.revokeObjectURL(prev[text].url); const next = { ...prev }; delete next[text]; return next; });
  }

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

  const busy = rendering || recording || narrationBusy || voiceBusy;
  // Editing over a source video is ordinary content only; the chosen mode comes back when the video is removed.
  const videoMode = videoEdit && !!source;
  const activeMode: Mode = videoMode ? "normal" : contentMode;
  const colors = PALETTES[palette];
  return (
    <main className="motion-shell">
      <header className="motion-header">
        <Link className="motion-brand" href="/"><span className="motion-logo">✳</span> clipper<span>studio</span></Link>
        <span><Link className="back-link" href="/hub" data-testid="link-hub">Content Hub</Link> · <Link className="back-link" href="/">← Clipper Studio</Link></span>
      </header>

      <section className="motion-intro compact">
        <div className="seg two mode-switch" role="radiogroup" aria-label="Jenis konten">
          <button role="radio" aria-checked={activeMode === "normal"} className={activeMode === "normal" ? "active" : ""} onClick={() => chooseMode("normal")} data-testid="mode-normal">Konten biasa</button>
          <button role="radio" aria-checked={activeMode === "affiliate"} className={activeMode === "affiliate" ? "active" : ""} disabled={videoMode} onClick={() => chooseMode("affiliate")} data-testid="mode-affiliate">Affiliate</button>
        </div>
        <p className="mode-hint" data-testid="mode-hint">{videoMode ? "Affiliate tidak tersedia saat mengedit di atas video sumber. Lepas videonya (Ganti video) untuk memakainya."
          : activeMode === "affiliate" ? "Isi data produk, AI menulis naskah dari data itu, dan klaim berisiko ditandai. Naskah dan pengaturan tetap ada saat Anda pindah ke Konten biasa."
          : "Tulis naskah sendiri, atau mulai dari video sumber. Naskah dan pengaturan tetap ada saat Anda pindah ke Affiliate."}</p>
      </section>

      <div className="studio-grid">
        <section className="studio-panel" data-mode={activeMode}>
          <div className="panel-heading"><div><small>01 / NASKAH & AUDIO</small><h2>Atur video</h2></div><span className="local-tag">{cloudUser ? "Tersinkron · tanpa media" : "Lokal · tanpa server"}</span></div>
          <CloudAccount onUser={setCloudUser} />
          {handoffNote && <div className="notice" role="status" data-testid="handoff-note">{handoffNote}</div>}
          {saved && <div className="notice" data-testid="restore-offer">
            Sesi terakhir ditemukan: <strong>{saved.title || "tanpa judul"}</strong> · {splitScript(saved.script).length} scene{savedSource ? ` · video ${savedSource.name}` : ""}. {savedCloud ? "Dari akun Anda (perangkat lain); pilih lagi videonya setelah Lanjutkan." : "Disimpan di perangkat ini saja."}{" "}
            <button className="text-button" data-testid="restore-session" onClick={() => void restoreSession()}>Lanjutkan</button>{" "}
            <button className="text-button" data-testid="restore-discard" onClick={() => void discardSession()}>Mulai baru</button>
          </div>}
          <TrendStart disabled={rendering || videoMode} onUse={(text, t, b) => {
            setScript(text.slice(0, 3000)); if (t) setTitle(t.slice(0, 60)); setContentPreset("custom");
            void updateHistory(l => logTrend(l, { id: scriptId(text), kind: "motion", title: t, script: text, now: Date.now() }, { platform: b.platform, niche: b.niche, audience: b.audience, trend: b.trend }));
            setSeoSeed({ platform: b.platform, niche: b.niche, audience: b.audience, trends: b.trend.slice(0, 300), nonce: Date.now() });
          }} />
          <div className="step-title" data-testid="step-1"><b>1</b>{activeMode === "affiliate" ? "Produk dan naskah" : "Naskah"}</div>
          {offer && !imported && <div className="notice normal-only" data-testid="transcript-offer">
            Transkrip dari Clipper tersedia: <strong>{offer.source}</strong> ({allWords(offer.transcript).length} kata, {Math.round(offer.transcript.duration)} dtk).{" "}
            <button className="text-button" data-testid="transcript-import" onClick={() => { setScript(scriptFromTranscript(offer.transcript, FPS)); setImported(offer.transcript); setVoiceMode("manual"); setOffer(null); }}>Impor ke naskah</button>
          </div>}
          {imported && <div className="notice normal-only" data-testid="transcript-status">
            {timed ? (videoEdit ? "Mode edit video: video asli (dengan suaranya) jadi dasar; subtitle mengikuti waktu kata, dan scene dengan kata kunci/angka berganti ke grafis. Atur per scene lewat \"Layar\"." : "Subtitle mengikuti waktu kata dari transkrip. Unggah audio asli video pada Voice over → Rekam / unggah agar suara dan subtitle sama.")
              : timings ? "Audio yang dipilih tidak sama panjang dengan transkrip, jadi waktu dibagi otomatis. Unggah audio asli klip yang sama."
              : "Naskah sudah diubah dari transkrip, jadi waktu kata tidak dipakai lagi. Subtitle dibagi otomatis."}
          </div>}
          {imported && videoEdit && <label className="field-label">Geser waktu subtitle: {captionOffset > 0 ? "+" : ""}{captionOffset.toFixed(1)} dtk <span className="field-hint">kurangi jika teks muncul terlambat, tambah jika terlalu cepat</span>
            <input type="range" min={-1} max={1} step={0.1} value={captionOffset} onChange={e => setCaptionOffset(Number(e.target.value))} data-testid="caption-offset" />
          </label>}
          {videoEdit && <label className="field-label" htmlFor="overlay-position">Posisi animasi di atas video <span className="field-hint">atas = di ruang kosong di atas kepala; bawah = tepat di atas subtitle</span>
            <select id="overlay-position" value={overlayPos} onChange={e => setOverlayPos(e.target.value as OverlayPosition)} data-testid="overlay-position">
              <option value="top">Atas (di atas kepala)</option>
              <option value="lower">Bawah (di atas subtitle)</option>
            </select>
          </label>}
          {videoEdit && <label className="field-label" htmlFor="animation-density">Berapa banyak animasi <span className="field-hint">{DENSITIES.find(d => d.id === density)?.hint}</span>
            <select id="animation-density" value={density} onChange={e => setDensity(e.target.value as Density)} data-testid="animation-density">
              {DENSITIES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>}
          {videoEdit && <small className="field-hint" data-testid="unified-importance-note">Penilaian kepentingan scene kini dilakukan bersamaan dengan Sutradara AI, lalu digabung dengan aturan lokal. Tidak ada permintaan Gemini Judge terpisah.</small>}
          {videoEdit && <label className="field-label" htmlFor="brand-motion">Gaya animasi istilah populer <span className="field-hint">sederhana = ikon dan nama dengan satu denyut halus; lengkap = adegan kecil khas tiap layanan</span>
            <select id="brand-motion" value={brandMotion} onChange={e => setBrandMotion(e.target.value as BrandMotion)} data-testid="brand-motion">
              <option value="simple">Sederhana (elegan)</option>
              <option value="full">Lengkap (meriah)</option>
            </select>
          </label>}
          {imported && !timed && voiceMode !== "ai" && <div className="notice notice-error normal-only" data-testid="timing-lost">
            Naskah sudah berbeda terlalu jauh dari transkrip, sehingga waktu subtitle memakai <b>perkiraan</b> (bukan waktu ucapan sebenarnya) dan video bisa lebih panjang dari sumbernya.{" "}
            <button className="text-button" data-testid="timing-restore" onClick={() => setScript(scriptFromTranscript(imported, FPS))}>Kembalikan naskah dari transkrip</button>
          </div>}
          {timed && timed.aligned && <div className="notice normal-only" data-testid="aligned-notice">Naskah sudah diedit setelah transkripsi; kata-katanya diselaraskan dengan ucapan asli, jadi waktu caption mungkin bergeser sedikit di bagian yang diubah.</div>}
          {timed && timed.tooShort > 0 && <div className="notice normal-only" data-testid="short-warning">{timed.tooShort} scene lebih pendek dari {MIN_SCENE_SECONDS} dtk. Waktu subtitle tetap tepat dengan ucapan, tetapi teks scene itu tampil sebentar saja. Gabungkan barisnya di kolom Naskah (kata-katanya tidak diubah) bila ingin lebih nyaman dibaca.</div>}
          <div className="field-label normal-only">Video sumber <span className="field-hint">opsional · unggah video atau audio saja, ucapannya jadi naskah &amp; subtitle otomatis (maks. 3 menit)</span></div>
          {!source
            ? <label className="upload-source normal-only"><input type="file" accept={SOURCE_ACCEPT} onChange={onSourceVideo} data-testid="source-video" /></label>
            : <div className="normal-only">
              <video ref={sourceVideo} src={source.url} controls playsInline preload="metadata" style={{ width: "100%", maxHeight: 220, borderRadius: 10, background: "#000" }} data-testid={isAudioFile(source.file) ? "source-audio-only" : undefined} />
              {isAudioFile(source.file) && <small className="field-hint" data-testid="audio-only-note">Audio saja: suaranya dipakai apa adanya, gambarnya latar studio dengan subtitle dan animasi.</small>}
              <button className="text-button" disabled={asrBusy} onClick={() => { setSource(null); setTrim(null); setClipperTrim(null); setTrimNote(""); setEdits([]); setEmphasis([]); setEditProfile("standard"); setImported(null); setVideoEdit(false); setCutOverrides({}); setClipStarts({}); if (script === VIDEO_ONLY || script === AUDIO_ONLY) { setScript(SAMPLE); setCaptions(true); } }}>Ganti video ({source.file.name})</button>
              <TrimPanel duration={source.seconds} trim={trim} onChange={applyTrim} video={sourceVideo} words={imported ? absoluteWords(allWords(imported), trim?.start ?? 0) : null} original={clipperTrim} disabled={asrBusy || rendering} />
              {trimNote && <div className="notice normal-only" role="status" data-testid="trim-note">{trimNote}</div>}
              {videoEdit && <EditProfilePanel file={source.file} url={source.url} seconds={source.seconds} trim={trim} words={imported ? absoluteWords(allWords(imported), trim?.start ?? 0) : null} video={sourceVideo}
                profile={editProfile} onProfile={setEditProfile} edits={edits} onEdits={setEdits} onEmphasis={setEmphasis} comedySfx={comedySfx} onComedySfx={setComedySfx}
                onTrim={t => applyTrim(clampTrim(t, source.seconds))} audioOnly={isAudioFile(source.file)} disabled={asrBusy || rendering} />}
              <TranscriptPanel key={`${source.url}:${trim?.start ?? 0}:${trim?.end ?? 0}`} file={source.file} video={sourceVideo} range={{ start: trim?.start ?? 0, duration: trimSeconds(trim, source.seconds) }} locked={false} onWorking={setAsrBusy} onCopy={setScript} onUseTiming={useTimingOnly} preciseTiming={!!imported && imported.granularity !== "word" && videoEdit}
                onUse={t => { setScript(scriptFromTranscript(t, FPS)); setImported(t); setVoiceMode("none"); setNarration(null); setVideoEdit(true); setCaptions(true); setCaptionOffset(0); setPalette("pearl"); setContentPreset("custom"); setOffer(null); }} />
            </div>}
          {sourceError && <p className="field-error normal-only" role="alert">{sourceError}</p>}
          <AffiliatePanel script={script} disabled={rendering} onBrief={setAffiliateBrief} onProductPhoto={placeProductPhoto}
            onUseScript={(text, t) => { setScript(text); if (t) setTitle(t.slice(0, 60)); setContentPreset("custom"); }} onRemoveLine={i => setScript(removeLine(script, i))} />
          <label className="field-label" htmlFor="motion-script">Naskah <span className="field-hint">satu baris/kalimat = satu scene · *kata* untuk menonjolkan</span></label>
          <textarea id="motion-script" data-testid="script" value={script} onChange={e => setScript(e.target.value)} rows={7} placeholder="Tulis naskah video…" />
          <div className="char-count">{script.length} / 3000</div>
          <small className="field-hint" data-testid="pause-hint">Jeda: tulis <code>[jeda 1s]</code> setelah kalimat (0,1–10 dtk). Tidak dibacakan dan tidak tampil.</small>
          <label className="field-label" htmlFor="motion-title">Judul / teks pembuka</label>
          <input id="motion-title" data-testid="title" value={title} onChange={e => setTitle(e.target.value)} maxLength={60} />
          {titleError && <p className="field-error">{titleError}</p>}
          <details className="fold" data-testid="fold-look"><summary><b>2 · Tampilan</b> <small>{STYLES.find(x => x.id === style)?.label} · {PALETTES[palette].label}{contentPreset !== "custom" ? ` · ${CONTENT_PRESETS.find(p => p.id === contentPreset)?.label}` : ""}</small></summary>
          <label className="field-label" htmlFor="motion-preset">Template konten</label>
          <select id="motion-preset" data-testid="content-preset" value={contentPreset} onChange={e => {
            const id = e.target.value as ContentPresetId | "custom";
            setContentPreset(id);
            const preset = CONTENT_PRESETS.find(p => p.id === id);
            if (preset) { setStyle(preset.style); setPalette(preset.palette); }
          }}>
            <option value="custom">Kustom · atur sendiri</option>
            {CONTENT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <p className="field-hint preset-hint">{CONTENT_PRESETS.find(p => p.id === contentPreset)?.description ?? "Pilih gaya animasi dan palet warna secara manual."}</p>
          <div className="field-row">
            <div><label className="field-label" htmlFor="motion-style">Gaya animasi</label><select id="motion-style" data-testid="style" value={style} onChange={e => { setStyle(e.target.value as StyleId); setContentPreset("custom"); }}>{STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
            <div><label className="field-label" htmlFor="motion-palette">Palet warna</label><select id="motion-palette" data-testid="palette" value={palette} onChange={e => { setPalette(e.target.value as PaletteId); setContentPreset("custom"); }}>{(Object.keys(PALETTES) as PaletteId[]).map(p => <option key={p} value={p}>{PALETTES[p].label}</option>)}</select></div>
          </div>
          
            <label className="field-label" htmlFor="typography">Tipografi <span className="field-hint">{resolveTypePack(typography).description}</span>
              <select id="typography" value={typography} onChange={e => setTypography(e.target.value as TypePackId)} data-testid="typography">
                {TYPE_PACK_IDS.map(id => <option key={id} value={id}>{TYPE_PACKS[id].label}</option>)}
              </select>
            </label>
            {!(videoEdit && source) && <>
              <label className="field-label" htmlFor="backdrop">Latar <span className="field-hint">mesh: bidang warna palet yang bergeser pelan</span>
                <select id="backdrop" value={backdrop} onChange={e => setBackdrop(e.target.value as "plain" | "mesh")} data-testid="backdrop">
                  <option value="plain">Polos (gradasi palet)</option>
                  <option value="mesh">Mesh bergerak</option>
                </select>
              </label>
              <label className="check-row" data-testid="grain-toggle"><input type="checkbox" checked={grain} onChange={e => setGrain(e.target.checked)} data-testid="grain" /> Tekstur film (grain halus)</label>
            </>}
            {!(videoEdit && source) && <label className="check-row" data-testid="story-visuals-toggle"><input type="checkbox" checked={storyVisuals} onChange={e => setStoryVisuals(e.target.checked)} data-testid="story-visuals" /> Objek visual 3D di atas teks <span className="field-hint">titik fokus untuk pembuka, langkah bertumbuh, orbit untuk renungan, satu titik untuk penutup; tanpa teks tambahan</span></label>}
          </details>

          <div className="step-title" data-testid="step-3"><b>3</b>Suara dan musik</div>
          <label className="field-label">Voice over / narasi</label>
          <div className="seg" role="radiogroup" aria-label="Voice over">
            {([["ai", "🤖 Otomatis"], ["manual", "🎙 Rekam / unggah"], ["none", "Tanpa"]] as [VoiceMode, string][]).map(([id, label]) =>
              <button key={id} role="radio" aria-checked={voiceMode === id} className={voiceMode === id ? "active" : ""} disabled={busy} data-testid={"voice-" + id} onClick={() => setVoiceMode(id)}>{label}</button>)}
          </div>
          {voiceMode === "ai" && <div className="audio-box" data-testid="ai-voice">
            <div className="field-row tight">
              <div><label className="field-label" htmlFor="tts-lang">Bahasa</label>
                <select id="tts-lang" data-testid="tts-lang" value={ttsLang} disabled={voiceBusy} onChange={e => setTtsLang(e.target.value as TtsLang)}>{TTS_LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>
              <div><label className="field-label" htmlFor="tts-voice">Suara</label>
                <select id="tts-voice" data-testid="tts-voice" value={ttsVoice} disabled={voiceBusy} onChange={e => setTtsVoice(Number(e.target.value))}>{VOICE_PROFILES.map(p => <optgroup key={p.id} label={p.label}>{p.ids.map(id => <option key={id} value={id}>{VOICES[id].label}{id === p.suggested ? " ★" : ""}</option>)}</optgroup>)}</select></div>
            </div>
            <small className="field-hint" data-testid="voice-hint">★ = titik awal yang disarankan dari ukuran nada (paling dinamis di profilnya). Kualitas suara belum dinilai dengan mendengar: pilih dengan telinga Anda.</small>
            <label className="field-label" htmlFor="tts-speed">Kecepatan bicara</label>
            <select id="tts-speed" data-testid="tts-speed" value={ttsSpeed} disabled={voiceBusy} onChange={e => setTtsSpeed(Number(e.target.value))}>{SPEEDS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <VoiceDirectorPanel directions={voiceDirections} auto={autoDirections} keys={voiceSegmentKeys} overrides={voiceDirectionOverrides} onChange={setVoiceDirectionOverrides} baseSpeed={ttsSpeed} disabled={voiceBusy} />
            {voiceProgress ? <div className="render-progress" data-testid="voice-progress">
              <div><span>{voiceProgress.label}</span><b>{voiceProgress.phase === "download" ? `${(voiceProgress.loaded / 1e6).toFixed(0)} / ${(voiceProgress.total / 1e6).toFixed(0)} MB` : `${Math.round((voiceProgress.loaded / voiceProgress.total) * 100)}%`}</b></div>
              <i><em style={{ width: Math.min(100, (voiceProgress.loaded / Math.max(1, voiceProgress.total)) * 100) + "%" }} /></i>
              <button className="motion-secondary" onClick={cancelVoice} disabled={voiceProgress.phase === "download"}>Batal</button>
            </div> : <button className="motion-primary" onClick={() => void generateVoice()} disabled={busy || !timeline.ok && !aiNarration} data-testid="voice-generate">{aiFresh ? "↻ Buat ulang suara" : "🤖 Buat suara otomatis"}</button>}
            {!aiFresh && aiNarration && voiceMode === "ai" && <div className="audio-previous" data-testid="ai-previous">
              <small>Versi sebelumnya (belum sesuai pengaturan sekarang; dipakai lagi bila perubahan dibatalkan, diganti setelah suara baru jadi)</small>
              <audio src={aiNarration.narration.url} controls preload="none" data-testid="ai-audio-previous" />
            </div>}
            {aiFresh && <>
              <audio src={aiFresh.narration.url} controls preload="metadata" data-testid="ai-audio" />
              <div className="audio-meta"><b>Suara otomatis · {TTS_LANGS.find(l => l.id === ttsLang)?.label} · {VOICES[ttsVoice]?.label}</b><small>{aiFresh.narration.seconds.toFixed(1)} dtk · durasi tiap scene mengikuti ucapannya</small></div>
              <a className="text-link" href={aiFresh.narration.url} download={aiFresh.narration.file.name}>Unduh suara (WAV)</a>
            </>}
            <small>Dibuat di perangkat dengan model Supertonic 3 (gratis, tanpa server). Unduhan pertama ±{Math.round(MODEL_BYTES / 1e6)} MB, lalu tersimpan di browser. Ini suara buatan AI: jangan dipakai untuk meniru orang lain, dan sebutkan bahwa suaranya buatan AI.</small>
            {voiceError && <p className="field-error" role="alert" data-testid="voice-error">{voiceError}</p>}
          </div>}
          {voiceMode === "manual" && <div className="audio-box">
            <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" onChange={onAudio} className="file-hidden" data-testid="audio-input" />
            {recording ? <div className="rec-live" data-testid="recording">
              <span className="rec-dot" /><b>Merekam {recordingSeconds!.toFixed(1)} dtk</b><small>maks. {MAX_RECORDING_SECONDS} dtk</small>
              <div className="rec-actions"><button className="motion-primary" onClick={() => void stopRecording()} data-testid="record-stop">■ Selesai</button><button className="motion-secondary" onClick={cancelRecording}>Batal</button></div>
            </div> : narration ? <>
              <audio src={narration.url} controls preload="metadata" />
              <div className="audio-meta"><b>{narration.recorded ? "Rekaman mikrofon" : narration.file.name}</b><small>{narration.seconds.toFixed(1)} dtk · durasi video mengikuti narasi{narration.speech ? "" : " · ducking memakai level tetap (audio tidak dapat dianalisis)"}</small></div>
              <div className="rec-actions">
                <button className="motion-secondary" onClick={() => setNarration(null)} disabled={busy} data-testid="audio-remove">Hapus</button>
                <button className="motion-secondary" onClick={() => void startRecording()} disabled={busy}>🎙 Rekam ulang</button>
                {narration.recorded && <a className="motion-secondary as-button" href={narration.url} download={narration.file.name}>Unduh WAV</a>}
              </div>
            </> : <>
              <div className="rec-actions">
                <button className="motion-primary" onClick={() => void startRecording()} disabled={busy} data-testid="record-start">🎙 Rekam narasi</button>
                <button className="motion-secondary" onClick={() => audioInput.current?.click()} disabled={busy}>＋ Unggah audio</button>
              </div>
              <small>Rekam langsung dari mikrofon iPad sambil membaca naskah, atau unggah MP3/M4A/WAV. Audio diproses di perangkat dan tidak diunggah.</small>
            </>}
            {narrationBusy && <small data-testid="narration-busy">Memproses audio…</small>}
            {audioError && <p className="field-error" role="alert" data-testid="audio-error">{audioError}</p>}
          </div>}

          <details className="fold" data-testid="fold-music"><summary><b>Backsound</b> <small>{musicMode === "none" ? "Tanpa" : musicMode === "auto" ? `Otomatis · ${MOODS.find(m => m.id === mood)?.label}` : "Unggahan Anda"}</small></summary>
          <div className="audio-box">
            <input ref={musicInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" onChange={e => void onMusic(e)} className="file-hidden" data-testid="music-input" />
            <div className="seg" role="radiogroup" aria-label="Backsound">
              {([["none", "Tanpa"], ["auto", "Otomatis"], ["upload", "Unggah"]] as [MusicMode, string][]).map(([id, label]) =>
                <button key={id} role="radio" aria-checked={musicMode === id} className={musicMode === id ? "active" : ""} disabled={rendering} data-testid={"music-" + id}
                  onClick={() => { if (id === "upload" && !uploadedMusic) musicInput.current?.click(); else setMusicMode(id); }}>{label}</button>)}
            </div>
            {musicMode === "auto" && <>
              <div className="field-row tight">
                <div><label className="field-label" htmlFor="motion-mood">Mood</label>
                  <select id="motion-mood" data-testid="mood" value={mood} onChange={e => { setMood(e.target.value as Mood); setMoodTouched(true); }}>{MOODS.map(m => <option key={m.id} value={m.id}>{m.label} · {m.hint}</option>)}</select></div>
                <div><label className="field-label">&nbsp;</label><button className="motion-secondary full" onClick={() => setSeed(s => s + 1)} disabled={musicBusy || rendering}>↻ Variasi lain</button></div>
              </div>
              <small data-testid="music-status">{musicBusy ? "Membuat backsound di perangkat…" : generatedFresh ? `Backsound ${generatedFresh.seconds.toFixed(1)} dtk siap · dibuat di perangkat, bebas royalti.` : timeline.ok ? "Menunggu…" : "Lengkapi naskah dulu."}</small>
              {generatedFresh && <a className="text-link" href={generatedFresh.url} download={generatedFresh.file.name}>Unduh backsound (WAV)</a>}
            </>}
            {musicMode === "upload" && uploadedMusic && <>
              <div className="audio-meta"><b>{uploadedMusic.file.name}</b><small>{uploadedMusic.seconds.toFixed(1)} dtk · {uploadedMusic.seconds < videoSeconds ? "diulang (loop) sampai video selesai" : "dipotong sesuai durasi video"}, fade in/out otomatis</small></div>
              <button className="motion-secondary" onClick={() => musicInput.current?.click()} disabled={rendering}>Ganti musik</button>
              <small>Pastikan Anda punya izin memakai musik ini (mis. Pixabay Music, YouTube Audio Library).</small>
            </>}
            {musicMode !== "none" && <>
              <label className="field-label" htmlFor="motion-music-volume">Volume backsound <span className="field-hint">{musicVolume}%</span></label>
              <input id="motion-music-volume" type="range" min={0} max={100} step={5} value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} data-testid="music-volume" />
              <label className="check-row"><input type="checkbox" checked={duck} onChange={e => setDuck(e.target.checked)} /><span>Kecilkan otomatis saat narasi berbicara (ducking){narration ? "" : " · aktif jika ada narasi"}</span></label>
            </>}
            {musicError && <p className="field-error" role="alert" data-testid="music-error">{musicError}</p>}
          </div>
          </details>

          <details className="fold" data-testid="fold-duration"><summary><b>Durasi dan subtitle</b> <small>{narration ? "Ikuti narasi" : voiceMode === "ai" ? "Ikuti suara otomatis" : target === "auto" ? "Otomatis" : `${target} detik`} · {captions ? "Subtitle tampil" : "Tanpa subtitle"}</small></summary>
          {videoEdit && source && <label className="field-label" htmlFor="caption-style">Gaya subtitle <span className="field-hint">{CAPTION_STYLES.find(c => c.id === captionStyle)?.description}</span>
            <select id="caption-style" value={captionStyle} onChange={e => setCaptionStyle(e.target.value as CaptionStyleId)} data-testid="caption-style">
              {CAPTION_STYLES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>}
          <div className="field-row">
            <div><label className="field-label" htmlFor="motion-duration">Durasi</label>
              <select id="motion-duration" data-testid="duration" value={narration ? "audio" : voiceMode === "ai" ? "auto" : target} disabled={!!narration || voiceMode === "ai"} onChange={e => setTarget(e.target.value)}>
                {narration ? <option value="audio">Ikuti narasi ({narration.seconds.toFixed(1)} dtk)</option> : voiceMode === "ai" ? <option value="auto">Ikuti suara otomatis</option> : <>
                  <option value="auto">Otomatis (kecepatan baca)</option><option value="15">15 detik</option><option value="30">30 detik</option><option value="45">45 detik</option><option value="60">60 detik</option>
                </>}
              </select></div>
            <div><label className="field-label" htmlFor="motion-captions">Subtitle</label>
              <select id="motion-captions" value={captions ? "on" : "off"} onChange={e => setCaptions(e.target.value === "on")}><option value="on">Tampilkan, sorot kata</option><option value="off">Tanpa subtitle</option></select></div>
          </div>
          </details>

          <details className="fold" data-testid="fold-watermark"><summary><b>Watermark video</b> <small>{isWatermarkActive(watermark) ? `${watermark.text} · ${watermark.position.replace("-", " ")}` : "Nonaktif"}</small></summary>
            <WatermarkPanel value={watermark} onChange={setWatermark} disabled={rendering} note="Terlihat langsung di pratinjau." />
          </details>

          <details className="fold" data-testid="fold-fx"><summary><b>Efek suara &amp; stiker</b> <small>{SFX_LABELS[sfxMode]} · {stickerMode === "auto" ? "stiker otomatis" : "tanpa stiker"}</small></summary>
            <label className="field-label" htmlFor="sfx-mode">Efek suara <span className="field-hint">whoosh saat pindah scene, pop saat stiker muncul, dentang di ajakan; dibuat di perangkat, di bawah suara narasi</span>
              <select id="sfx-mode" value={sfxMode} onChange={e => setSfxMode(e.target.value as SfxMode)} data-testid="sfx-mode">
                {SFX_MODES.map(m => <option key={m} value={m}>{SFX_LABELS[m]}</option>)}
              </select>
            </label>
            {!(videoEdit && source) && <label className="field-label" htmlFor="sticker-mode">Stiker <span className="field-hint">emoji kecil yang muncul di atas teks sesuai makna kalimat (maksimal 60% scene); bisa diganti per scene di daftar scene</span>
              <select id="sticker-mode" value={stickerMode} onChange={e => setStickerMode(e.target.value as StickerMode)} data-testid="sticker-mode">
                <option value="off">Mati</option>
                <option value="auto">Otomatis (sesuai makna)</option>
              </select>
            </label>}
            {stickerMode === "auto" && !(videoEdit && source) && <small className="field-hint" data-testid="sticker-credit">{STICKER_CREDIT}. Sebutkan kredit ini di deskripsi video Anda.</small>}
          </details>

          <div className="step-title" data-testid="step-4"><b>4</b>Render</div>
          {blocker && <p className="field-error" role="alert" data-testid="blocker">{blocker}</p>}
          {timeline.ok && timeline.warnings.map(w => <p className="field-warning" key={w}>{w}</p>)}

          <div className="panel-actions">
            {rendering
              ? <button className="motion-cancel" onClick={() => abort.current?.abort()} data-testid="cancel">Batalkan render</button>
              : <button className="motion-primary" onClick={() => void render()} disabled={!!blocker || narrationBusy || musicBusy || voiceBusy} data-testid="render">Render MP4 <span>↓</span></button>}
            <button className="motion-secondary" onClick={exportProject} disabled={!props}>Proyek JSON</button>
          </div>
          <button className="text-link" onClick={copyBrief} disabled={!timeline.ok}>Salin brief teks</button>
          {rendering && <div className="render-progress" data-testid="progress"><div><span>Merender di browser…</span><b>{progress}%</b></div><i><em style={{ width: progress + "%" }} /></i></div>}
          {renderError && <p className="field-error" role="alert" data-testid="render-error">{renderError}</p>}
          {errorDetail && <details className="error-details" open><summary>Detail teknis (kirimkan saat melapor)</summary><code data-testid="error-detail">{errorDetail}</code><button className="text-link" onClick={() => navigator.clipboard?.writeText(errorDetail).then(() => setStatus("Detail teknis disalin."), () => setStatus("Salin manual teks di atas."))}>Salin detail teknis</button></details>}
          {result && <div className="render-result" data-testid="result"><b>✓ MP4 siap</b><small>{WIDTH}×{HEIGHT} · {videoSeconds.toFixed(1)} dtk · {(result.size / 1024 ** 2).toFixed(1)} MB</small><a className="motion-primary" href={result.url} download={result.name} data-testid="download" onClick={() => { void updateHistory(l => logDownload(l, base(), { name: result.name, size: result.size, label: `${WIDTH}×${HEIGHT} · ${videoSeconds.toFixed(0)} dtk` })); }}>Simpan MP4 ↓</a>{srtUrl && <a className="text-link" href={srtUrl} download={result.name.replace(/\.mp4$/i, "") + ".srt"} data-testid="download-srt">Unduh subtitle (.srt)</a>}</div>}
          {result && <SaveToHub key={result.url} tone="dark" getBlob={() => fetch(result.url).then(r => r.blob())} fileName={result.name} title={title.trim() || result.name.replace(/\.[^.]+$/, "")} source="motion" seconds={videoSeconds} width={WIDTH} height={HEIGHT} historyId={base().id} />}
          {status && <p className="motion-status" role="status" data-testid="status">{status}</p>}
          {timeline.ok && <SeoPanel seed={seoSeed} stored={entrySeo} storedId={historyId} onResult={onSeoResult} transcript={timeline.scenes.map(sc => stripMarks(sc.text)).join(" ")} topic={title.trim()} language={imported?.language === "english" || imported?.language === "en" ? "en" : "id"} />}
        </section>

        <section className="preview-column">
          <div className="panel-heading"><div><small>02 / PRATINJAU</small><h2>Preview video</h2></div><span className="preview-badge"><i /> {props ? `${(totalFrames(props.scenes) / FPS).toFixed(1)}s · 9:16` : "—"}</span></div>
          <div className="player-wrap" style={{ position: "relative", background: `linear-gradient(145deg, ${colors.bg1}, ${colors.bg2})` }}>
            {props ? <Player ref={player} component={ScriptVideo} inputProps={props} durationInFrames={props ? totalFrames(props.scenes) : 1} fps={FPS} compositionWidth={WIDTH} compositionHeight={HEIGHT} controls style={{ width: "100%", aspectRatio: "9 / 16" }} acknowledgeRemotionLicense />
              : <div className="player-empty">{blocker}</div>}
            {guide && props ? <SafeGuide /> : null}
          </div>
          <label className="check-row" data-testid="safe-guide-toggle"><input type="checkbox" checked={guide} onChange={e => setGuide(e.target.checked)} /> Tampilkan panduan area aman (hanya di pratinjau, tidak ikut ke MP4)</label>
          {guide ? <p className="preview-disclaimer" data-testid="safe-guide-legend">Merah: tertutup tampilan aplikasi (tab, deskripsi, tombol kanan). Putus-putus putih: area konten utama 1200 px. Biru: kotak 1080×1080 yang tersisa bila dipotong 1:1. Kuning: baris dasar subtitle.</p> : null}
          <p className="preview-disclaimer">Pratinjau memakai komposisi yang sama dengan hasil render, jadi teks, durasi scene, narasi, dan backsound identik dengan MP4.</p>
          {timeline.ok && <AiDirector language={imported?.language === "english" || imported?.language === "en" ? "en" : "id"} active={Object.keys(directorInfo).length > 0} note={directorNote} onPlan={applyDirector} onUndo={undoDirector} onRedo={redoDirector} canRedo={directorHistory.future.length > 0} versions={directorHistory.past.length}
            input={{ scenes: timeline.scenes.map(sc => ({ text: sc.text, seconds: sc.durationInFrames / FPS })), videoEdit: !!(videoEdit && source), style, palette, affiliate: activeMode === "affiliate" && affiliateBrief ? { product: affiliateBrief.product } : undefined,
              current: timeline.scenes.map(sc => ({ template: overrides[sc.text]?.template, icon: overrides[sc.text]?.icon, cut: cutOverrides[sc.text] })) }} />}
          {timeline.ok && <PexelsPanel disabled={rendering} onApply={putStockPhoto}
            // Over a source video a picture only appears in a full-screen cutaway, so automatic filling covers just those scenes.
            scenes={timeline.scenes.map((sc, i) => ({ text: sc.text, query: directorInfo[sc.text]?.imageQuery, hasImage: !!images[sc.text] || (!!(videoEdit && source) && sceneList[i]?.cut !== "graphic") }))} />}
          <div className="timeline-heading"><h3>Timeline scene</h3><span>{timeline.ok ? `${timeline.scenes.length} scene · maks. ${MAX_SECONDS} dtk` : ""}</span></div>
          {timeline.ok && <details className="fold storyboard" data-testid="storyboard">
            <summary>Storyboard {storyIssues.length ? `· ${storyErrors.length} masalah, ${storyIssues.length - storyErrors.length} saran` : "· siap render"}</summary>
            <ol>{storyboard.scenes.map(sc => <li key={sc.id} data-testid="storyboard-scene"><b>{sc.order + 1}.</b> {FAMILY_LABELS[sc.family]} · {sc.layout} · {sc.timing.seconds} dtk · {sc.continuity === "continues" ? "lanjutan visual" : sc.continuity === "start" ? "pembuka" : "visual baru"}{sc.sticker && STICKER_BY_ID[sc.sticker] ? ` · stiker: ${STICKER_BY_ID[sc.sticker].emoji} ${STICKER_BY_ID[sc.sticker].label}` : sc.accent ? ` · objek 3D: ${STORY_VISUAL_LABELS[sc.accent]}` : ""}{sc.captionPolicy === "suppressed-duplicate" ? " · tanpa subtitle ganda" : ""}</li>)}</ol>
            {storyIssues.map((i, n) => <small key={n} className={i.level === "error" ? "notice notice-error" : "narrative-reason"} role={i.level === "error" ? "alert" : "status"} data-testid="storyboard-issue">{i.level === "error" ? "Perlu diperbaiki: " : "Saran: "}{i.message}</small>)}
          </details>}
          <div className="scene-list" data-testid="scenes">{timeline.ok && (() => { let t = 0; return timeline.scenes.map((s, i) => { const from = t; t += s.durationInFrames; return (
            <div className="scene-item" key={i} data-testid="scene-item">
              <button className="scene-row" onClick={() => player.current?.seekTo(from)}>
                <span className="scene-index">{String(i + 1).padStart(2, "0")}</span>
                <div className="scene-info"><b>{stripMarks(s.text)}</b><small className="narrative-hint">{NARRATIVE_ROLE_LABELS[narrativePlan[i]?.role ?? ""] ?? "Lanjutan"} · {NARRATIVE_INTENT_LABELS[narrativePlan[i]?.intent ?? "statement"] ?? "Pernyataan"} · {VISUAL_STRATEGY_LABELS[narrativePlan[i]?.strategy ?? ""] ?? "Minimal"} · {MOTION_INTENSITY_LABELS[narrativePlan[i]?.intensity ?? ""] ?? "Tenang"}{!(videoEdit && source) && sceneVisuals[i] ? <> · <span className="scene-family" data-testid="scene-family">{FAMILY_LABELS[chooseFamily(sceneVisuals[i], narrativePlan[i])]}</span></> : null}</small><small className="narrative-reason">{narrativePlan[i]?.reason}</small><small className="narrative-reason" data-testid="scene-visual-cue"><b>Brief visual:</b> {narrativePlan[i]?.visualCue} · {CONFIDENCE_LABELS[narrativePlan[i]?.confidence ?? "low"]}</small>{videoEdit && source && animationPlan.judgements[i] ? <small className="narrative-reason" data-testid="scene-importance">{cutOverrides[s.text] ? "Diatur manual" : explainScene(animationPlan.judgements[i], planned[i] === "overlay")}</small> : null}<small className="narrative-continuity"><b>Penghubung:</b> {narrativePlan[i]?.continuityCue}</small>{narrativePlan[i]?.reviewFlags?.length ? <small className="narrative-reason" data-testid="scene-review-flags"><b>Perlu diperiksa:</b> {narrativePlan[i]?.reviewFlags?.join(" ")}</small> : null}{directorInfo[s.text]?.reason ? <small className="narrative-reason director-reason" data-testid="scene-director"><b>Pilihan AI:</b> {directorInfo[s.text].reason}</small> : null}{!(videoEdit && source) && directorInfo[s.text]?.imageIdea ? <small className="narrative-reason director-reason" data-testid="scene-image-idea"><b>Ide gambar:</b> {directorInfo[s.text].imageIdea}</small> : null}</div>
                <div className="scene-meta"><b>{(from / FPS).toFixed(1)}–{(t / FPS).toFixed(1)}s</b><small>{(s.durationInFrames / FPS).toFixed(1)} dtk</small></div>
              </button>
              <SceneVisualControls text={s.text} topics={sceneContext[i]} override={overrides[s.text]} disabled={rendering} cut={videoEdit ? { value: cutOverrides[s.text], auto: planned[i], clipFrom: clipStarts[s.text] } : undefined}
                onCut={c => {
                  manualChoice(s.text);
                  setCutOverrides(prev => { const next = { ...prev }; if (c) next[s.text] = c; else delete next[s.text]; return next; });
                  // Choosing "other footage" starts at wherever the source player is now.
                  if (c === "clip" && clipStarts[s.text] === undefined) setClipStarts(prev => ({ ...prev, [s.text]: Math.min(sourceVideo.current?.currentTime ?? 0, source?.seconds ?? 0) }));
                }}
                onClipHere={() => setClipStarts(prev => ({ ...prev, [s.text]: Math.min(sourceVideo.current?.currentTime ?? 0, source?.seconds ?? 0) }))}
                onClipSeek={t => { if (sourceVideo.current) { sourceVideo.current.currentTime = t; } }}
                onChange={o => { manualChoice(s.text); setOverrides(prev => { const next = { ...prev }; if (o.template || o.icon) next[s.text] = o; else delete next[s.text]; return next; }); }} />
              {stickerMode === "auto" && !(videoEdit && source) && <label className="scene-sticker" data-testid="scene-sticker-row"><span>Stiker</span>
                <select value={stickerOverrides[s.text] ?? "auto"} onChange={e => setStickerOverrides(prev => { const next = { ...prev }; if (e.target.value === "auto") delete next[s.text]; else next[s.text] = e.target.value; return next; })} data-testid="scene-sticker">
                  <option value="auto">{matchSticker(s.text) ? `Otomatis · ${matchSticker(s.text)!.emoji} ${matchSticker(s.text)!.label}` : "Otomatis · tanpa"}</option>
                  <option value="none">Tanpa stiker</option>
                  {STICKERS.map(st => <option key={st.id} value={st.id}>{st.emoji} {st.label}</option>)}
                </select></label>}
              {<div className="scene-image" data-testid="scene-image">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: thumbnail, nothing for next/image to optimise */}
                {images[s.text] ? <img src={images[s.text].url} alt="" className="scene-thumb" /> : null}
                <label className="text-link">
                  {images[s.text] ? "Ganti gambar" : "+ Gambar latar"}
                  <input type="file" accept="image/*" hidden disabled={rendering} data-testid="scene-image-input" onChange={e => void onSceneImage(s.text, e)} />
                </label>
                <button type="button" className="text-link" disabled={rendering} onClick={() => { setPickerSource("pexels"); setPickerFor(pickerFor === s.text && pickerSource === "pexels" ? null : s.text); }} data-testid="scene-image-pexels">Cari di Pexels</button>
                <button type="button" className="text-link" disabled={rendering} onClick={() => { setPickerSource("pixabay"); setPickerFor(pickerFor === s.text && pickerSource === "pixabay" ? null : s.text); }} data-testid="scene-image-pixabay">Cari gambar Pixabay</button>\n                <button type="button" className="text-link" disabled={rendering} onClick={() => { setPickerSource("pixabay-video"); setPickerFor(pickerFor === s.text && pickerSource === "pixabay-video" ? null : s.text); }} data-testid="scene-video-pixabay">Cari video Pixabay</button>
                {images[s.text] ? <button type="button" className="text-link" disabled={rendering} onClick={() => removeSceneImage(s.text)} data-testid="scene-image-remove">Hapus</button> : null}
                {images[s.text]?.credit ? <small className="scene-credit" data-testid="scene-credit"><a href={images[s.text].credit!.href} target="_blank" rel="noreferrer noopener">{images[s.text].credit!.text}</a></small> : null}
              </div>}
              {pickerFor === s.text && pickerSource === "pexels" && <ScenePhotoPicker initialQuery={directorInfo[s.text]?.imageQuery ?? ""} onChoose={(file, photo) => putStockPhoto(s.text, file, photo)} onClose={() => setPickerFor(null)} />}
              {pickerFor === s.text && pickerSource === "pixabay" && <PixabayPhotoPicker initialQuery={directorInfo[s.text]?.imageQuery ?? ""} onChoose={(file, photo) => putPixabayPhoto(s.text, file, photo)} onClose={() => setPickerFor(null)} />}
              {pickerFor === s.text && pickerSource === "pixabay-video" && <PixabayVideoPicker initialQuery={directorInfo[s.text]?.imageQuery ?? ""} onChoose={video => putPixabayVideo(s.text, video)} onClose={() => setPickerFor(null)} />}
            </div>); }); })()}</div>
          {timeline.ok && <p className="preview-disclaimer" data-testid="image-note">{imageError ? <span className="scene-image-error" data-testid="image-error">{imageError} </span> : null}{videoEdit && source ? "Di video sumber, gambar tampil sebagai layar penuh (maks. 4 detik) pada scene itu, dan pembicara kembali setelahnya. " : null}Gambar latar hanya dipakai di perangkat ini dan tidak ikut tersimpan atau tersinkron; pilih lagi setelah memuat ulang halaman. Pakai gambar milik Anda, foto Pexels/Pixabay, atau yang boleh dipakai ulang: gambar dari internet (mis. Pinterest) belum tentu bebas hak cipta.</p>}
        </section>
      </div>

      <section className="remotion-note"><span className="remotion-icon">R</span><div><b>Render di browser, tanpa biaya server</b><p>MP4 dibuat di perangkat Anda dengan Remotion Web Renderer (WebCodecs). Naskah, rekaman, dan musik tidak diunggah. Hasil MP4 baru dikirim ke Content Hub (penyimpanan cloud privat) jika Anda memilih dan menyetujuinya. Backsound otomatis disintesis di perangkat dengan Tone.js.</p></div><span className="status-chip">NO PAID RENDER</span></section>
      <footer className="motion-footer"><span>CLIPPER STUDIO / MOTION LAB</span><span>Built with Remotion</span></footer>
    </main>
  );
}

/** 83.4 → "1:23.4" */
function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** Per-scene visual correction: template and icon, each "Otomatis" unless the user picks one. */
function SceneVisualControls({ text, topics, override, disabled, onChange, cut, onCut, onClipHere, onClipSeek }: { text: string; topics?: ReadonlySet<string>; override?: VisualOverride; disabled: boolean; onChange: (o: VisualOverride) => void; cut?: { value?: Cut; auto: Cut; clipFrom?: number }; onCut: (c: Cut | undefined) => void; onClipHere: () => void; onClipSeek: (seconds: number) => void }) {
  const auto = resolveVisual(text, undefined, topics);
  const current = resolveVisual(text, override, topics);
  const autoIcon = auto.icon ? ICONS[auto.icon]?.label : "tanpa ikon";
  return (
    <div className="scene-visual">
      {cut && <label>
        <span>Layar</span>
        <select value={cut.value ?? ""} disabled={disabled} data-testid="scene-cut" onChange={e => onCut((e.target.value || undefined) as Cut | undefined)}>
          <option value="">Otomatis · {cut.auto === "graphic" ? "Grafis penuh" : cut.auto === "overlay" ? "Video + animasi" : "Video + subtitle"}</option>
          <option value="video">Video + subtitle</option>
          <option value="overlay">Video + animasi</option>
          <option value="graphic">Grafis penuh (ganti layar)</option>
          <option value="clip">Potongan lain dari video</option>
        </select>
      </label>}
      {cut && cut.value === "clip" && <div className="clip-pick" data-testid="clip-pick">
        <span>Mulai di <b data-testid="clip-from">{formatClock(cut.clipFrom ?? 0)}</b> (maks. 4 dtk, tanpa suara)</span>
        <button type="button" className="text-link" disabled={disabled} onClick={() => onClipSeek(cut.clipFrom ?? 0)} data-testid="clip-seek">Lihat</button>
        <button type="button" className="text-link" disabled={disabled} onClick={onClipHere} data-testid="clip-here">Pakai posisi pemutar</button>
      </div>}
      <label>
        <span>Tampilan</span>
        <select value={override?.template ?? ""} disabled={disabled} data-testid="scene-template"
          onChange={e => onChange({ ...override, template: (e.target.value || undefined) as Template | undefined })}>
          <option value="">Otomatis · {TEMPLATES.find(x => x.id === auto.template)?.label}</option>
          {TEMPLATES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <label>
        <span>Ikon</span>
        <select value={override?.icon ?? ""} disabled={disabled || current.template === "compare" || current.template === "cta"} data-testid="scene-icon"
          onChange={e => onChange({ ...override, icon: e.target.value || undefined })}>
          <option value="">Otomatis · {autoIcon}</option>
          <option value="none">Tanpa ikon</option>
          {Object.entries(ICONS).sort((a, b) => a[1].label.localeCompare(b[1].label, "id")).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}
        </select>
      </label>
    </div>
  );
}
