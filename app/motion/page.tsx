"use client";

import { Player, type PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DEFAULT_MUSIC_VOLUME, encodeWav, MAX_RECORDING_SECONDS, MOODS, moodForStyle, normalize, speechEnvelope, type Mood, type Music } from "@/lib/audio";
import { analyseNarration, decodeToMono, explainMicError, NarrationRecorder, recordingSupported, type Narration } from "@/lib/recorder";
import { checkBrowserRender, environmentReport, RenderFailure, renderMp4 } from "@/lib/render";
import {
  buildTimeline, CONTENT_PRESETS, explainRenderError, fitScenesToVideo, FPS, HEIGHT, MAX_SECONDS, MIN_SCENE_SECONDS, PALETTES, slug, splitScript, splitScriptWithPauses, STYLES, totalFrames, validateAudioFile, validateTitle, WIDTH,
  type ContentPresetId, type DurationMode, type PaletteId, type StyleId, type VideoProps,
} from "@/lib/script";
import { explainVoiceError, loadVoiceEngine, MODEL_BYTES, VOICES } from "@/lib/tts/browser";
import { assembleNarration, clipKey, SPEEDS } from "@/lib/tts/narration";
import { spokenText } from "@/lib/tts/numbers";
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
import GeminiJudge from "../GeminiJudge";
import AiDirector from "../AiDirector";
import PexelsPanel from "../PexelsPanel";
import AffiliatePanel from "../AffiliatePanel";
import { removeLine, scenesForProductPhoto, type AffiliateBrief } from "@/lib/affiliate";
import ScenePhotoPicker from "../ScenePhotoPicker";
import { creditText, type PexelsPhoto } from "@/lib/pexels";
import { planToOverrides, type DirectorPlan } from "@/lib/director";
import CloudAccount from "../CloudAccount";
import { cloud } from "@/lib/cloud";
import type { SceneScore } from "@/lib/gemini";
import { probeVideo, validateFile } from "@/lib/clip";
import { imageProblem, prepareImage } from "@/lib/scene-image";
import "./motion.css";

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

type Mode = "normal" | "affiliate";
const MODE_KEY = "clipper:motion:mode:v1";

type Track = { file: File; url: string; seconds: number };
/** A scene picture kept in memory only (never uploaded or saved with the session). */
type SceneImageFile = { url: string; name: string; /** Set for stock photos: who to credit and where. */ credit?: { text: string; href: string } };
type Generated = Track & { mood: Mood; seed: number };
type MusicMode = "none" | "auto" | "upload";
type VoiceMode = "ai" | "manual" | "none";
type AiNarration = { key: string; narration: Narration; sceneSeconds: number[] };
type VoiceProgress = { phase: "download" | "synth"; loaded: number; total: number; label: string };

/** Reads an audio file's duration, decoding it when the media element cannot (e.g. some WAV/OGG on Safari). */
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
  const clipCache = useRef(new Map<string, Float32Array>());
  const voiceCancel = useRef(false);
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
  const [captionOffset, setCaptionOffset] = useState(0);
  // Where animations drawn over the speaker sit: the empty space above the head, or just above the captions.
  const [overlayPos, setOverlayPos] = useState<OverlayPosition>("top");
  // How many scenes get an animation, and how elaborate a popular name's animation is.
  const [density, setDensity] = useState<Density>("balanced");
  // Gemini's opinion per sentence (by its text); optional, kept for this visit only.
  const [aiScores, setAiScores] = useState<Record<string, SceneScore>>({});
  const [brandMotion, setBrandMotion] = useState<BrandMotion>("simple");
  const [cutOverrides, setCutOverrides] = useState<Record<string, Cut>>({});
  // Scene pictures for faceless videos, keyed by scene text like the other per-scene choices.
  const [images, setImages] = useState<Record<string, SceneImageFile>>({});
  const [imageError, setImageError] = useState("");
  // The last "Sutradara AI" pass: why each scene looks as it does (by scene text), and what to restore on undo.
  const [directorInfo, setDirectorInfo] = useState<Record<string, { reason: string; imageIdea?: string; imageQuery?: string }>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // Set while the affiliate panel holds a complete product brief: this is then a selling video.
  const [affiliateBrief, setAffiliateBrief] = useState<AffiliateBrief | null>(null);
  // Which kind of content this is: ordinary, or a selling (affiliate) video. The last choice is remembered on this device.
  const [contentMode, setContentMode] = useState<Mode>("normal");
  useEffect(() => { try { if (localStorage.getItem(MODE_KEY) === "affiliate") setContentMode("affiliate"); } catch { /* storage blocked: starts as ordinary content */ } }, []);
  function chooseMode(m: Mode) { setContentMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* not remembered */ } }
  const [directorNote, setDirectorNote] = useState("");
  const [beforeDirector, setBeforeDirector] = useState<{ style: StyleId; palette: PaletteId; contentPreset: ContentPresetId | "custom"; overrides: Record<string, VisualOverride>; cutOverrides: Record<string, Cut> } | null>(null);
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
    setSource({ file, url: URL.createObjectURL(file), seconds: h.seconds });
    // A clip the browser cannot read is reported at once, instead of showing a black player.
    void probeVideo(file).then(p => { if (!p.ok) { setSource(null); setVideoEdit(false); setHandoffNote(`Klip yang diterima tidak bisa diputar di browser ini. Kembali ke Clipper lalu ekspor ulang klipnya, atau pilih video langsung di sini. (Detail: ${p.detail})`); } });
    if (h.title) setTitle(h.title.slice(0, 48).trim());
    if (h.transcript && h.transcript.segments.length > 0) {
      setScript(scriptFromTranscript(h.transcript, FPS)); setImported(h.transcript);
      setVoiceMode("none"); setNarration(null); setVideoEdit(true); setCaptionOffset(0); setPalette("pearl"); setContentPreset("custom"); setOffer(null);
      setHandoffNote(h.transcript.granularity === "word"
        ? "Klip dari Clipper dimuat dengan subtitlenya."
        : "Klip dari Clipper dimuat. Subtitle berasal dari AI dengan waktu per kalimat. Untuk waktu yang paling presisi, ketuk \"Presisikan waktu subtitle\" di panel Transkrip (satu ketukan, dibuat di perangkat; teks tidak berubah).");
    } else setHandoffNote("Klip dari Clipper dimuat. Belum ada subtitle: buat transkrip di panel Transkrip, atau tulis naskah.");
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
      if (!Number.isFinite(probe.duration) || probe.duration <= 0) { URL.revokeObjectURL(url); return setSourceError("Durasi video tidak dapat dibaca. Coba MP4 (H.264)."); }
      if (probe.duration > MAX_SECONDS) { URL.revokeObjectURL(url); return setSourceError(`Video ${Math.round(probe.duration)} detik melebihi batas ${MAX_SECONDS} detik (3 menit). Potong dulu di Clipper Studio.`); }
      setSource({ file: f, url, seconds: probe.duration });
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setSourceError("Browser tidak dapat memutar video ini. Coba MP4 (H.264)."); };
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
  const voiceKey = useMemo(() => JSON.stringify([splitScriptWithPauses(script), ttsLang, ttsVoice, ttsSpeed]), [script, ttsLang, ttsVoice, ttsSpeed]);
  const aiFresh = voiceMode === "ai" && aiNarration?.key === voiceKey ? aiNarration : null;
  const narration = voiceMode === "ai" ? aiFresh?.narration ?? null : voiceMode === "manual" ? manualNarration : null;
  // Transcript timing applies while the script still matches the transcript words and the narration is the original audio.
  const timings = useMemo(() => imported ? sceneTimings(splitScript(script), shiftWords(allWords(imported), captionOffset), FPS, imported.duration) : null, [imported, script, captionOffset]);
  const timed = voiceMode !== "ai" && timings && (!narration || Math.abs(narration.seconds - imported!.duration) <= 1) ? timings : null;
  const mode: DurationMode = aiFresh ? { kind: "scenes", seconds: aiFresh.sceneSeconds }
    : timed ? { kind: "scenes", seconds: timed.seconds, exact: true }
    : narration ? { kind: "audio", seconds: narration.seconds }
    // Editing over a video whose captions have no usable timing: the scenes still span exactly the video, never more or less.
    : videoEdit && source && splitScript(script).length * MIN_SCENE_SECONDS <= source.seconds ? { kind: "target", seconds: source.seconds }
    : target === "auto" || voiceMode === "ai" ? { kind: "auto" } : { kind: "target", seconds: Number(target) };
  const voiceBusy = voiceProgress !== null;
  const timeline = useMemo(() => buildTimeline(script, mode, FPS), [script, mode.kind, aiFresh, narration?.seconds, target, timed]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const sceneList = timeline.ok ? (videoEdit && source ? (list: typeof timeline.scenes) => fitScenesToVideo(list, Math.round(source.seconds * FPS)) : (list: typeof timeline.scenes) => list)(timeline.scenes).map((sc, i) => ({
    ...sc, visual: sceneVisuals[i], narrative: narrativePlan[i], ...(timed && !aiFresh ? { wordStarts: timed.wordStarts[i], wordEnds: timed.wordEnds[i], pauseFrames: undefined } : {}),
    ...(videoEdit && source ? { cut: cutOverrides[sc.text] ?? planned[i], ...(cutOverrides[sc.text] === "clip" ? { clipFrom: clipStarts[sc.text] ?? 0 } : {}) } : {}),
    ...(!(videoEdit && source) && images[sc.text] ? { image: images[sc.text].url } : {}),
  })) : [];
  const props: VideoProps | null = timeline.ok ? {
    title: title.trim(), scenes: sceneList, style, palette, audioSrc: narration?.url ?? null, captions, video: videoEdit && source ? { src: source.url, seconds: source.seconds } : null, overlay: overlayPos, brandMotion,
    music, speech: narration?.speech ?? null,
  } : null;
  const snapshot = useMemo<SessionData>(() => ({
    v: SESSION_VERSION, savedAt: 0, script, title, style, palette, contentPreset, target, captions, overrides, cutOverrides, clipStarts, videoEdit, captionOffset, overlay: overlayPos, density, brandMotion, imported,
    voiceMode: voiceMode === "ai" ? "ai" : "none", ttsLang, ttsVoice, ttsSpeed,
  }), [script, title, style, palette, contentPreset, target, captions, overrides, cutOverrides, clipStarts, videoEdit, captionOffset, overlayPos, density, brandMotion, imported, voiceMode, ttsLang, ttsVoice, ttsSpeed]);
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
    setOverrides(s.overrides); setCutOverrides(s.cutOverrides); setClipStarts(s.clipStarts); setCaptionOffset(s.captionOffset); setOverlayPos(s.overlay ?? "top"); setDensity(s.density ?? "balanced"); setBrandMotion(s.brandMotion ?? "simple"); setImported(s.imported);
    setVoiceMode(s.voiceMode); setTtsLang(s.ttsLang); setTtsVoice(s.ttsVoice); setTtsSpeed(s.ttsSpeed);
    const rec = savedSource ? await loadSource() : null;
    if (rec) {
      const file = rec.blob instanceof File ? rec.blob : new File([rec.blob], rec.name, { type: rec.type, lastModified: rec.lastModified });
      setSource({ file, url: URL.createObjectURL(file), seconds: rec.seconds });
      setVideoEdit(s.videoEdit);
    } else setVideoEdit(false); // editing over the video needs the video itself
    setSaved(null); setSavedCloud(false); setAutosave(true);
  }
  /** A transcript's timing, with the creator's own script kept: used after a local (Whisper) transcript of the clip. */
  function useTimingOnly(t: Transcript): string | null {
    const words = shiftWords(allWords(t), captionOffset);
    if (!sceneTimings(splitScript(script), words, FPS, t.duration)) return "Naskah terlalu berbeda dari hasil ini, jadi waktunya tidak bisa dipakai. Pilih \"Pakai transkrip\" untuk mengganti naskah dengan hasil ini.";
    setScript(mergeShortScenes(script, allWords(t), FPS, t.duration));
    setImported(t); setVoiceMode("none"); setNarration(null); setVideoEdit(true);
    return null;
  }
  async function discardSession() { await clearSession(); setSavedCloud(false); setSaved(null); setSavedSource(null); setAutosave(true); }

  const blocker = !timeline.ok ? timeline.error : titleError
    ?? (recording ? "Selesaikan perekaman narasi terlebih dahulu." : null)
    ?? (voiceMode === "ai" && !aiFresh ? (aiNarration ? "Naskah, bahasa, suara, atau kecepatan berubah. Ketuk “Buat suara otomatis” lagi." : "Ketuk “Buat suara otomatis” untuk membuat voice over dari naskah.") : null);

  // Inputs changed after a render: the downloaded file no longer matches the preview.
  // Subtitle file for the current script, offered once an MP4 exists; revoked when the script changes.
  const srtText = result && timeline.ok && captions && !videoEdit ? scenesToSrt(sceneList) : null;
  const srtUrl = useMemo(() => srtText ? URL.createObjectURL(new Blob([srtText], { type: "text/plain;charset=utf-8" })) : null, [srtText]);
  useEffect(() => () => { if (srtUrl) URL.revokeObjectURL(srtUrl); }, [srtUrl]);
  useEffect(() => { setResult(null); }, [script, title, style, palette, target, captions, narration, musicMode, musicTrack, musicVolume, duck]);

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

  async function generateVoice() {
    if (voiceBusy) return;
    const { texts, pauses } = splitScriptWithPauses(script);
    const check = buildTimeline(script, { kind: "auto" }, FPS);
    if (!check.ok) return setVoiceError(check.error);
    setVoiceError(""); voiceCancel.current = false;
    player.current?.pause();
    const key = voiceKey;
    try {
      setVoiceProgress({ phase: "download", loaded: 0, total: MODEL_BYTES, label: "Menyiapkan model suara…" });
      const engine = await loadVoiceEngine((loaded, total) => setVoiceProgress({ phase: "download", loaded, total, label: "Mengunduh model suara (sekali saja)…" }));
      const clips: Float32Array[] = [];
      for (const [i, text] of texts.entries()) {
        if (voiceCancel.current) throw new Error("cancelled");
        // Digits are spoken as words ("1.300" → "seribu tiga ratus"); the screen keeps the digits.
        const spoken = spokenText(stripMarks(text), ttsLang);
        const k = clipKey(spoken, ttsLang, ttsVoice, ttsSpeed);
        let clip = clipCache.current.get(k);
        if (!clip) {
          clip = await engine.synthesize(spoken, ttsLang, ttsVoice, {
            speed: ttsSpeed,
            onStep: async (step, total) => {
              setVoiceProgress({ phase: "synth", loaded: i * total + step, total: texts.length * total, label: `Membuat suara scene ${i + 1}/${texts.length}…` });
              // Let the browser paint progress between model steps.
              await new Promise(r => setTimeout(r, 0));
              if (voiceCancel.current) throw new Error("cancelled");
            },
          });
          clipCache.current.set(k, clip);
        }
        clips.push(clip);
      }
      const { samples, sceneSeconds } = assembleNarration(clips, engine.sampleRate, FPS, pauses);
      normalize(samples, 0.9, 3);
      const file = new File([encodeWav([samples], engine.sampleRate)], `suara-otomatis-${ttsLang}.wav`, { type: "audio/wav" });
      setAiNarration({
        key, sceneSeconds,
        narration: { file, url: URL.createObjectURL(file), seconds: samples.length / engine.sampleRate, speech: speechEnvelope(samples, engine.sampleRate, FPS), recorded: false },
      });
      setStatus(`Suara otomatis ${(samples.length / engine.sampleRate).toFixed(1)} dtk siap. Durasi tiap scene mengikuti ucapannya.`);
    } catch (err) {
      if (err instanceof Error && err.message === "cancelled") setStatus("Pembuatan suara dibatalkan.");
      else setVoiceError(explainVoiceError(err));
    } finally { setVoiceProgress(null); }
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

  /** Applies one pass of the AI director as ordinary choices; the previous state is kept so the whole pass can be undone. */
  function applyDirector(plan: DirectorPlan) {
    if (!timeline.ok) return;
    const texts = timeline.scenes.map(sc => sc.text);
    const { overrides: ov, cuts } = planToOverrides(plan, texts);
    setBeforeDirector(prev => prev && Object.keys(directorInfo).length ? prev : { style, palette, contentPreset, overrides, cutOverrides });
    if (plan.style) setStyle(plan.style);
    if (plan.palette) setPalette(plan.palette);
    if (plan.style || plan.palette) setContentPreset("custom");
    setOverrides(prev => ({ ...prev, ...ov }));
    if (videoEdit && source) setCutOverrides(prev => ({ ...prev, ...cuts }));
    const info: Record<string, { reason: string; imageIdea?: string; imageQuery?: string }> = {};
    plan.scenes.forEach((s, i) => { if (s) info[texts[i]] = { reason: s.reason, imageIdea: s.imageIdea, imageQuery: s.imageQuery }; });
    setDirectorInfo(info);
    setDirectorNote(plan.note);
  }
  function undoDirector() {
    if (!beforeDirector) return;
    setStyle(beforeDirector.style); setPalette(beforeDirector.palette); setContentPreset(beforeDirector.contentPreset);
    setOverrides(beforeDirector.overrides); setCutOverrides(beforeDirector.cutOverrides);
    setDirectorInfo({}); setDirectorNote(""); setBeforeDirector(null);
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
  }
  /** The creator's own product photo behind every scene that names the product, and the last one; resolves with how many. */
  async function placeProductPhoto(file: File, brief: AffiliateBrief): Promise<number> {
    if (!timeline.ok) return 0;
    const problem = imageProblem(file);
    if (problem) throw new Error(problem);
    const blob = await prepareImage(file); // reduced once, then shared by every scene
    const prepared = new File([blob], file.name, { type: blob.type || "image/jpeg" });
    const texts = timeline.scenes.map(sc => sc.text);
    const targets = scenesForProductPhoto(texts, brief.product);
    for (const i of targets) await putSceneImage(texts[i], prepared);
    return targets.length;
  }
  const putStockPhoto = (text: string, file: File, photo: PexelsPhoto) => putSceneImage(text, file, { text: creditText(photo), href: photo.pexelsUrl || photo.photographerUrl || "https://www.pexels.com" });
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
    // The speech model is no longer needed; its memory goes to the renderer.
    releaseAsr();
    const support = await checkBrowserRender(!renderProps.audioSrc && !renderProps.music && !renderProps.video).catch(e => String(e));
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
      ...(timeline.ok ? timeline.scenes.map((s, i) => `Scene ${i + 1} (${(s.durationInFrames / FPS).toFixed(1)} dtk): ${s.text}${images[s.text] && !(videoEdit && source) ? ` [gambar: ${images[s.text].name}${images[s.text].credit ? ` — ${images[s.text].credit!.text}` : ""}]` : ""}`) : []),
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
        <Link className="back-link" href="/">← Clipper Studio</Link>
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
          {videoEdit && timeline.ok && <GeminiJudge scenes={timeline.scenes.map(sc => ({ text: sc.text, seconds: sc.durationInFrames / FPS }))} language={imported?.language === "english" || imported?.language === "en" ? "en" : "id"}
            active={timeline.scenes.filter(sc => aiScores[sc.text]).length} onScores={setAiScores} onClear={() => setAiScores({})} />}
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
          <div className="field-label normal-only">Video sumber <span className="field-hint">opsional · unggah video, ucapannya jadi naskah &amp; subtitle otomatis (maks. 3 menit)</span></div>
          {!source
            ? <label className="upload-source normal-only"><input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" onChange={onSourceVideo} data-testid="source-video" /></label>
            : <div className="normal-only">
              <video ref={sourceVideo} src={source.url} controls playsInline preload="metadata" style={{ width: "100%", maxHeight: 220, borderRadius: 10, background: "#000" }} />
              <button className="text-button" disabled={asrBusy} onClick={() => { setSource(null); setImported(null); setVideoEdit(false); setCutOverrides({}); setClipStarts({}); }}>Ganti video ({source.file.name})</button>
              <TranscriptPanel key={source.url} file={source.file} video={sourceVideo} range={{ start: 0, duration: source.seconds }} locked={false} onWorking={setAsrBusy} onCopy={setScript} onUseTiming={useTimingOnly} preciseTiming={!!imported && imported.granularity !== "word" && videoEdit}
                onUse={t => { setScript(scriptFromTranscript(t, FPS)); setImported(t); setVoiceMode("none"); setNarration(null); setVideoEdit(true); setCaptionOffset(0); setPalette("pearl"); setContentPreset("custom"); setOffer(null); }} />
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
                <select id="tts-voice" data-testid="tts-voice" value={ttsVoice} disabled={voiceBusy} onChange={e => setTtsVoice(Number(e.target.value))}>{VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></div>
            </div>
            <label className="field-label" htmlFor="tts-speed">Kecepatan bicara</label>
            <select id="tts-speed" data-testid="tts-speed" value={ttsSpeed} disabled={voiceBusy} onChange={e => setTtsSpeed(Number(e.target.value))}>{SPEEDS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            {voiceProgress ? <div className="render-progress" data-testid="voice-progress">
              <div><span>{voiceProgress.label}</span><b>{voiceProgress.phase === "download" ? `${(voiceProgress.loaded / 1e6).toFixed(0)} / ${(voiceProgress.total / 1e6).toFixed(0)} MB` : `${Math.round((voiceProgress.loaded / voiceProgress.total) * 100)}%`}</b></div>
              <i><em style={{ width: Math.min(100, (voiceProgress.loaded / Math.max(1, voiceProgress.total)) * 100) + "%" }} /></i>
              <button className="motion-secondary" onClick={() => { voiceCancel.current = true; }} disabled={voiceProgress.phase === "download"}>Batal</button>
            </div> : <button className="motion-primary" onClick={() => void generateVoice()} disabled={busy || !timeline.ok && !aiNarration} data-testid="voice-generate">{aiFresh ? "↻ Buat ulang suara" : "🤖 Buat suara otomatis"}</button>}
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
          {result && <div className="render-result" data-testid="result"><b>✓ MP4 siap</b><small>{WIDTH}×{HEIGHT} · {videoSeconds.toFixed(1)} dtk · {(result.size / 1024 ** 2).toFixed(1)} MB</small><a className="motion-primary" href={result.url} download={result.name} data-testid="download">Simpan MP4 ↓</a>{srtUrl && <a className="text-link" href={srtUrl} download={result.name.replace(/\.mp4$/i, "") + ".srt"} data-testid="download-srt">Unduh subtitle (.srt)</a>}</div>}
          {status && <p className="motion-status" role="status" data-testid="status">{status}</p>}
        </section>

        <section className="preview-column">
          <div className="panel-heading"><div><small>02 / PRATINJAU</small><h2>Preview video</h2></div><span className="preview-badge"><i /> {props ? `${(totalFrames(props.scenes) / FPS).toFixed(1)}s · 9:16` : "—"}</span></div>
          <div className="player-wrap" style={{ background: `linear-gradient(145deg, ${colors.bg1}, ${colors.bg2})` }}>
            {props ? <Player ref={player} component={ScriptVideo} inputProps={props} durationInFrames={props ? totalFrames(props.scenes) : 1} fps={FPS} compositionWidth={WIDTH} compositionHeight={HEIGHT} controls style={{ width: "100%", aspectRatio: "9 / 16" }} acknowledgeRemotionLicense />
              : <div className="player-empty">{blocker}</div>}
          </div>
          <p className="preview-disclaimer">Pratinjau memakai komposisi yang sama dengan hasil render, jadi teks, durasi scene, narasi, dan backsound identik dengan MP4.</p>
          {timeline.ok && <AiDirector language={imported?.language === "english" || imported?.language === "en" ? "en" : "id"} active={Object.keys(directorInfo).length > 0} note={directorNote} onPlan={applyDirector} onUndo={undoDirector}
            input={{ scenes: timeline.scenes.map(sc => ({ text: sc.text, seconds: sc.durationInFrames / FPS })), videoEdit: !!(videoEdit && source), style, palette, affiliate: activeMode === "affiliate" && affiliateBrief ? { product: affiliateBrief.product } : undefined,
              current: timeline.scenes.map(sc => ({ template: overrides[sc.text]?.template, icon: overrides[sc.text]?.icon, cut: cutOverrides[sc.text] })) }} />}
          {timeline.ok && !(videoEdit && source) && <PexelsPanel disabled={rendering} onApply={putStockPhoto}
            scenes={timeline.scenes.map(sc => ({ text: sc.text, query: directorInfo[sc.text]?.imageQuery, hasImage: !!images[sc.text] }))} />}
          <div className="timeline-heading"><h3>Timeline scene</h3><span>{timeline.ok ? `${timeline.scenes.length} scene · maks. ${MAX_SECONDS} dtk` : ""}</span></div>
          <div className="scene-list" data-testid="scenes">{timeline.ok && (() => { let t = 0; return timeline.scenes.map((s, i) => { const from = t; t += s.durationInFrames; return (
            <div className="scene-item" key={i} data-testid="scene-item">
              <button className="scene-row" onClick={() => player.current?.seekTo(from)}>
                <span className="scene-index">{String(i + 1).padStart(2, "0")}</span>
                <div className="scene-info"><b>{stripMarks(s.text)}</b><small className="narrative-hint">{NARRATIVE_ROLE_LABELS[narrativePlan[i]?.role ?? ""] ?? "Lanjutan"} · {VISUAL_STRATEGY_LABELS[narrativePlan[i]?.strategy ?? ""] ?? "Minimal"} · {MOTION_INTENSITY_LABELS[narrativePlan[i]?.intensity ?? ""] ?? "Tenang"}{!(videoEdit && source) && sceneVisuals[i] ? <> · <span className="scene-family" data-testid="scene-family">{FAMILY_LABELS[chooseFamily(sceneVisuals[i], narrativePlan[i])]}</span></> : null}</small><small className="narrative-reason">{narrativePlan[i]?.reason}</small>{videoEdit && source && animationPlan.judgements[i] ? <small className="narrative-reason" data-testid="scene-importance">{cutOverrides[s.text] ? "Diatur manual" : explainScene(animationPlan.judgements[i], planned[i] === "overlay")}</small> : null}<small className="narrative-continuity"><b>Penghubung:</b> {narrativePlan[i]?.continuityCue}</small>{directorInfo[s.text]?.reason ? <small className="narrative-reason director-reason" data-testid="scene-director"><b>Pilihan AI:</b> {directorInfo[s.text].reason}</small> : null}{!(videoEdit && source) && directorInfo[s.text]?.imageIdea ? <small className="narrative-reason director-reason" data-testid="scene-image-idea"><b>Ide gambar:</b> {directorInfo[s.text].imageIdea}</small> : null}</div>
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
              {!(videoEdit && source) && <div className="scene-image" data-testid="scene-image">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: thumbnail, nothing for next/image to optimise */}
                {images[s.text] ? <img src={images[s.text].url} alt="" className="scene-thumb" /> : null}
                <label className="text-link">
                  {images[s.text] ? "Ganti gambar" : "+ Gambar latar"}
                  <input type="file" accept="image/*" hidden disabled={rendering} data-testid="scene-image-input" onChange={e => void onSceneImage(s.text, e)} />
                </label>
                <button type="button" className="text-link" disabled={rendering} onClick={() => setPickerFor(pickerFor === s.text ? null : s.text)} data-testid="scene-image-pexels">Cari di Pexels</button>
                {images[s.text] ? <button type="button" className="text-link" disabled={rendering} onClick={() => removeSceneImage(s.text)} data-testid="scene-image-remove">Hapus</button> : null}
                {images[s.text]?.credit ? <small className="scene-credit" data-testid="scene-credit"><a href={images[s.text].credit!.href} target="_blank" rel="noreferrer noopener">{images[s.text].credit!.text}</a></small> : null}
              </div>}
              {!(videoEdit && source) && pickerFor === s.text && <ScenePhotoPicker initialQuery={directorInfo[s.text]?.imageQuery ?? ""} onChoose={(file, photo) => putStockPhoto(s.text, file, photo)} onClose={() => setPickerFor(null)} />}
            </div>); }); })()}</div>
          {!(videoEdit && source) && timeline.ok && <p className="preview-disclaimer" data-testid="image-note">{imageError ? <span className="scene-image-error" data-testid="image-error">{imageError} </span> : null}Gambar latar hanya dipakai di perangkat ini dan tidak ikut tersimpan atau tersinkron; pilih lagi setelah memuat ulang halaman. Pakai gambar milik Anda, foto Pexels, atau yang boleh dipakai ulang: gambar dari internet (mis. Pinterest) belum tentu bebas hak cipta.</p>}
        </section>
      </div>

      <section className="remotion-note"><span className="remotion-icon">R</span><div><b>Render di browser, tanpa biaya server</b><p>MP4 dibuat di perangkat Anda dengan Remotion Web Renderer (WebCodecs). Naskah, rekaman, dan musik tidak diunggah. Backsound otomatis disintesis di perangkat dengan Tone.js.</p></div><span className="status-chip">NO PAID RENDER</span></section>
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
