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
import AppNav from "../AppNav";
import CinematicStudio from "../CinematicStudio";
import IconifyPanel from "../IconifyPanel";
import PixabayAutoPanel from "../PixabayAutoPanel";
import EditCommandPanel from "../EditCommandPanel";
import AiSetupCard from "../AiSetupCard";
import QuickStart from "../QuickStart";
import PreRenderChecklist from "../PreRenderChecklist";
import { FlowStepNav, FlowStepperBar } from "../FlowStepper";
import StylePicker from "../StylePicker";
import PostRenderActions from "../PostRenderActions";
import CaptionPosPanel from "../CaptionPosPanel";
import { normalizeCaptionPos, type CaptionPos } from "@/lib/caption-box";
import HeavyWorkNotice from "../HeavyWorkNotice";
import { useWakeLock } from "../useWakeLock";
import { prerenderChecks, type FixId } from "@/lib/prerender";
import { suggestCta } from "@/lib/cta";
import type { EditPlan } from "@/lib/edit-command";
import { registerIcon, setCustomIconEntrance } from "@/lib/visuals";
import type { Entrance } from "@/lib/icon-motion";
import type { LoadedIcon } from "@/lib/iconify";
import { conceptFor, restoreCine, saveCine, type CinePlan, type FxId } from "@/lib/cinematic";
import SeoPanel, { type SeoSeed } from "../SeoPanel";
import TrendStart from "../TrendStart";
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
import type { Visual } from "@/lib/command-agent";
import { planToOverrides, type DirectorPlan } from "@/lib/director";
import CloudAccount from "../CloudAccount";
import SaveToHub from "../SaveToHub";
import { cloud } from "@/lib/cloud";
import type { SceneScore } from "@/lib/gemini";
import { isAudioFile, probeVideo, SOURCE_ACCEPT, validateFile } from "@/lib/clip";
import { imageProblem, prepareImage } from "@/lib/scene-image";
import "./motion.css";
import { AUDIO_ONLY, CONFIDENCE_LABELS, MODE_KEY, MOTION_INTENSITY_LABELS, NARRATIVE_INTENT_LABELS, NARRATIVE_ROLE_LABELS, SAMPLE, VIDEO_ONLY, VISUAL_STRATEGY_LABELS } from "./_components/constants";
import { audioDuration, probeRendered } from "./_components/media-probe";
import SafeGuide from "./_components/SafeGuide";
import SceneVisualControls from "./_components/SceneVisualControls";
import type { AiNarration, DirectorSnap, Generated, Mode, MusicMode, SceneImageFile, Track, VoiceMode, VoiceProgress } from "./_components/types"; import FxFold from "./_components/FxFold"; import DurationFold from "./_components/DurationFold"; import MusicFold from "./_components/MusicFold"; import ManualVoicePanel from "./_components/ManualVoicePanel"; import AiVoicePanel from "./_components/AiVoicePanel"; import VoiceStep from "./_components/VoiceStep"; import SceneItem from "./_components/SceneItem"; import ImagesStep from "./_components/ImagesStep";
import StyleStep from "./_components/StyleStep";
import LookFold from "./_components/LookFold";
import RenderStep from "./_components/RenderStep";
import StoryboardFold from "./_components/StoryboardFold";
import PreviewColumn from "./_components/PreviewColumn";


export default function MotionStudio() {
  const player = useRef<PlayerRef>(null);
  const quickPlayer = useRef<PlayerRef>(null);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A new style or palette is shown moving: the preview restarts from the first frame and plays a few seconds (a still frame hides what a style changes). Called from the tap itself so the browser allows playback. */
  function replayPreview() {
    for (const r of [player, quickPlayer]) { try { r.current?.seekTo(0); r.current?.play(); } catch { /* a player that is not on screen */ } }
    if (replayTimer.current) clearTimeout(replayTimer.current);
    replayTimer.current = setTimeout(() => { for (const r of [player, quickPlayer]) { try { r.current?.pause(); } catch { /* not on screen */ } } }, 3200);
  }
  useEffect(() => () => { if (replayTimer.current) clearTimeout(replayTimer.current); }, []);
  /** Grabbing a subtitle slider: stop, and show a moment of the first scene where a subtitle is on screen, so the change is visible as it is made. */
  function showCaptionFrame() {
    const pl = player.current; if (!pl || !timeline.ok) return;
    try { pl.pause(); pl.seekTo(Math.max(0, Math.min(timeline.scenes[0].durationInFrames - 1, Math.round(timeline.scenes[0].durationInFrames * 0.4)))); } catch { /* not on screen */ }
  }
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
  // Cinematic Studio: the applied plan (motion preset per scene text + beat-aligned lengths); it stays valid only while the script is unchanged.
  // Icons from Iconify used by scenes (also stored in the session, so they return without the network).
  const [iconEntrance, setIconEntranceState] = useState<Entrance>("pop");
  const chooseEntrance = (e: Entrance) => { setCustomIconEntrance(e); setIconEntranceState(e); };
  const [customIcons, setCustomIcons] = useState<Record<string, { label: string; node: [string, Record<string, string>][] }>>({});
  const [cine, setCine] = useState<{ plan: CinePlan; fx: Record<string, string> } | null>(null);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleId>("classic");
  /** Subtitle position and size over a source video (percent of the frame); undefined = the usual place and size. */
  const [captionPos, setCaptionPos] = useState<CaptionPos | undefined>(undefined);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!source) return; const url = source.url; return () => URL.revokeObjectURL(url); }, [source]);
  /** The clip arrives as the base video with its subtitles, ready to edit (same state as "use the transcript" after uploading here). */
  const [handoffNote, setHandoffNote] = useState("");
  function applyClipHandoff(h: ClipHandoff) {
    const file = new File([h.blob], h.name, { type: h.type || "video/mp4" });
    // The clip comes with a few seconds of footage on each side: it starts on the clip itself, and the trim can reach into the rest.
    const around = handoffTrim(h.padStart ?? 0, h.padEnd ?? 0, h.seconds);
    setSource({ file, url: URL.createObjectURL(file), seconds: (h.padStart ?? 0) + h.seconds + (h.padEnd ?? 0) });
    setTrim(around); setTrimNote(""); setEdits([]); setEmphasis([]);
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
      setSource({ file: f, url, seconds: probe.duration }); setTrim(null); setTrimNote(""); setEdits([]); setEmphasis([]); makeSourceBase(f);
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
  const cineActive = !!cine && cine.plan.script === script && !aiFresh && !narration && !(videoEdit && source);
  const mode: DurationMode = aiFresh ? { kind: "scenes", seconds: aiFresh.sceneSeconds }
    : cineActive ? { kind: "scenes", seconds: cine!.plan.scenes.map(x => x.seconds), exact: true }
    : timed ? { kind: "scenes", seconds: timed.seconds, exact: true }
    : narration ? { kind: "audio", seconds: narration.seconds }
    // Editing over a video whose captions have no usable timing: the scenes still span exactly the video, never more or less.
    : videoEdit && source && splitScript(script).length * MIN_SCENE_SECONDS <= trimSeconds(trim, source.seconds) ? { kind: "target", seconds: trimSeconds(trim, source.seconds) }
    : target === "auto" || voiceMode === "ai" ? { kind: "auto" } : { kind: "target", seconds: Number(target) };
  const voiceBusy = voiceProgress !== null;
  const timeline = useMemo(() => buildTimeline(script, mode, FPS), [script, mode.kind, mode.kind === "target" ? mode.seconds : null, cineActive, cine?.plan, aiFresh, narration?.seconds, target, timed]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sceneList = timeline.ok ? (videoEdit && source ? (list: typeof timeline.scenes) => fitScenesToVideo(list, Math.round(trimSeconds(trim, source.seconds) * FPS)) : (list: typeof timeline.scenes) => list)(timeline.scenes).map((sc, i) => ({
    ...sc, visual: sceneVisuals[i], narrative: narrativePlan[i], ...(timed && !aiFresh ? { wordStarts: timed.wordStarts[i], wordEnds: timed.wordEnds[i], pauseFrames: undefined } : {}),
    ...(videoEdit && source ? { cut: cutOverrides[sc.text] ?? planned[i], ...(cutOverrides[sc.text] === "clip" ? { clipFrom: clipStarts[sc.text] ?? (trim?.start ?? 0) } : {}) } : {}),
    ...(images[sc.text]?.mediaType === "video" ? { videoSrc: images[sc.text].url } : images[sc.text] ? { image: images[sc.text].url } : {}),
    ...(stickerPlan[i] ? { sticker: stickerPlan[i]! } : {}),
    ...(cine?.fx[sc.text] && !(videoEdit && source) ? { fx: cine.fx[sc.text] } : {}),
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
    music, speech: narration?.speech ?? null, ...(isWatermarkActive(watermark) ? { watermark } : {}), ...(storyVisuals ? {} : { storyVisuals: false }), ...(typography !== DEFAULT_TYPE_PACK ? { typography } : {}), ...(captionStyle !== "classic" ? { captionStyle } : {}), ...(captionPos ? { captionPos } : {}), ...(backdrop === "mesh" ? { backdrop } : {}), ...(grain ? { grain } : {}), ...(sfxSrc ? { sfx: { src: sfxSrc, volume: SFX_VOLUME } } : {}),
  } : null;
  const usedIcons = (() => { const ids = new Set(Object.values(overrides).map(o => o.icon).filter((x): x is string => !!x && x in customIcons)); return ids.size ? { icons: Object.fromEntries([...ids].map(id => [id, customIcons[id]])) } : {}; })();
  const snapshot = useMemo<SessionData>(() => ({
    v: SESSION_VERSION, savedAt: 0, script, title, style, palette, contentPreset, target, captions, overrides, cutOverrides, clipStarts, videoEdit, captionOffset, overlay: overlayPos, density, brandMotion, ...(storyVisuals ? {} : { storyVisuals: false }), ...(typography !== DEFAULT_TYPE_PACK ? { typography } : {}), ...(captionStyle !== "classic" ? { captionStyle } : {}), ...(captionPos ? { captionPos } : {}), ...(trim ? { trim } : {}), ...(editProfile !== "standard" ? { edit: { profile: editProfile, edits, emphasis, sfx: comedySfx } } : {}), ...(backdrop === "mesh" ? { backdrop } : {}), ...(grain ? { grain } : {}), ...(cine ? { cine: saveCine(cine) } : {}), ...usedIcons, ...(iconEntrance !== "pop" ? { iconMotion: iconEntrance } : {}), ...(stickerMode !== "off" ? { stickerMode } : {}), ...(Object.keys(stickerOverrides).length ? { stickerOverrides } : {}), ...(sfxMode !== "off" ? { sfx: sfxMode } : {}), imported,
    voiceMode: voiceMode === "ai" ? "ai" : "none", ttsLang, ttsVoice, ttsSpeed,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [script, title, style, palette, contentPreset, target, captions, overrides, cutOverrides, clipStarts, videoEdit, captionOffset, overlayPos, density, brandMotion, storyVisuals, typography, captionStyle, backdrop, grain, stickerMode, stickerOverrides, sfxMode, cine, customIcons, iconEntrance, imported, voiceMode, ttsLang, ttsVoice, ttsSpeed, trim, editProfile, edits, emphasis, comedySfx, captionPos]);
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
      // The offer sits above the script box: showing it while a field is focused would push the page down mid-typing. Wait until typing stops.
      const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
      while (alive && typing()) await new Promise(r => setTimeout(r, 500));
      if (!alive) return;
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
    chooseEntrance(s.iconMotion ?? "pop");
    for (const [id, i] of Object.entries(s.icons ?? {})) registerIcon(id, i.label, i.node as never);
    setCustomIcons(s.icons ?? {});
    setOverrides(s.overrides); setCutOverrides(s.cutOverrides); setClipStarts(s.clipStarts); setCaptionOffset(s.captionOffset); setOverlayPos(s.overlay ?? "top"); setDensity(s.density ?? "balanced"); setBrandMotion(s.brandMotion ?? "simple"); setStoryVisuals(s.storyVisuals !== false); setTypography(s.typography ?? DEFAULT_TYPE_PACK); setCaptionStyle(s.captionStyle ?? "classic"); setCaptionPos(normalizeCaptionPos(s.captionPos)); setBackdrop(s.backdrop ?? "plain"); setGrain(s.grain === true); setStickerMode(s.stickerMode ?? "off"); setStickerOverrides(s.stickerOverrides ?? {}); setSfxMode(s.sfx ?? "off"); setCine(s.cine ? restoreCine(s.cine) : null); setImported(s.imported);
    if (s.cine) { setMoodTouched(true); setMood(conceptFor(s.cine.tone).mood); setMusicMode("auto"); }
    setVoiceMode(s.voiceMode); setTtsLang(s.ttsLang); setTtsVoice(s.ttsVoice); setTtsSpeed(s.ttsSpeed);
    const rec = savedSource ? await loadSource() : null;
    if (rec) {
      const file = rec.blob instanceof File ? rec.blob : new File([rec.blob], rec.name, { type: rec.type, lastModified: rec.lastModified });
      setSource({ file, url: URL.createObjectURL(file), seconds: rec.seconds });
      setTrim(s.trim ?? null); 
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
  const storyIssues: Issue[] = useMemo(() => validateStoryboard(storyboard, { audioSeconds: mode.kind === "audio" ? narration?.seconds : undefined }), [storyboard, mode.kind, narration?.seconds]);
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
  useEffect(() => { setResult(null); }, [script, title, style, palette, target, captions, narration, musicMode, musicTrack, musicVolume, duck, watermark, captionStyle, captionPos]);

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

  function applyIcon(text: string, icon: LoadedIcon) {
    registerIcon(icon.id, icon.label, icon.node);
    setCustomIcons(prev => ({ ...prev, [icon.id]: { label: icon.label, node: icon.node as [string, Record<string, string>][] } }));
    setOverrides(prev => ({ ...prev, [text]: { ...prev[text], icon: icon.id } }));
  }
  /** Words from a command (one per scene, in turn) that say what each scene's picture should show; with them the photos are filled in once. */
  const [queryHints, setQueryHints] = useState<Record<string, Visual>>({});
  const [autoPhotos, setAutoPhotos] = useState(0);
  /** The edit assistant's last change: what to put back, and which pictures it added. */
  const [editUndo, setEditUndo] = useState<{ editProfile: EditProfile; captions: boolean; captionStyle: CaptionStyleId; overlayPos: OverlayPosition; density: Density; brandMotion: BrandMotion; queryHints: Record<string, Visual>; imageKeys: string[]; cutOverrides: Record<string, string> } | null>(null);
  const [asrStart, setAsrStart] = useState(0);
  function applyEditPlan(plan: EditPlan) {
    setEditUndo({ editProfile, captions, captionStyle, overlayPos, density, brandMotion, queryHints, imageKeys: Object.keys(images), cutOverrides });
    if (plan.profile) { setEditProfile(plan.profile); setEdits([]); setEmphasis([]); }
    if (plan.captions !== undefined) setCaptions(plan.captions);
    if (plan.captionStyle) setCaptionStyle(plan.captionStyle);
    if (plan.overlayPos) setOverlayPos(plan.overlayPos);
    if (plan.density) setDensity(plan.density);
    if (plan.brandMotion) setBrandMotion(plan.brandMotion);
    if (plan.inserts) {
      const v = plan.inserts.visuals;
      setQueryHints(Object.fromEntries(timeline.ok ? timeline.scenes.map((sc, i) => [sc.text, v[i % v.length]]) : []));
      setAutoPhotos(n => n + 1);
    }
  }
  function undoEditPlan() {
    const u = editUndo; if (!u) return;
    setEditProfile(u.editProfile); setEdits([]); setEmphasis([]); setCaptions(u.captions); setCaptionStyle(u.captionStyle); setOverlayPos(u.overlayPos); setDensity(u.density); setBrandMotion(u.brandMotion); setQueryHints(u.queryHints);
    for (const k of Object.keys(images)) if (!u.imageKeys.includes(k)) removeSceneImage(k);
    setCutOverrides(u.cutOverrides as typeof cutOverrides);
    setEditUndo(null);
  }
  function applyCinematic(plan: CinePlan, visuals?: Visual[]) {
    const c = plan.concept;
    if (visuals?.length) {
      setQueryHints(Object.fromEntries(plan.scenes.map((sc, i) => [sc.text, visuals[i % visuals.length]])));
      setAutoPhotos(n => n + 1);
    }
    setScript(plan.script); setTitle(plan.brief.product.slice(0, 60)); setContentPreset("custom");
    setStyle(c.style); setPalette(c.palette); setTypography(c.typography); setBackdrop(c.backdrop); setGrain(c.grain); setSfxMode(c.sfx);
    setMoodTouched(true); setMood(c.mood); setMusicMode("auto"); setCaptions(false); setVoiceMode("none"); setNarration(null);
    setOverrides({}); setCutOverrides({}); setStickerMode("off");
    setCine({ plan, fx: plan.fxByText });
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
  useWakeLock(rendering);
  const preChecks = timeline.ok ? prerenderChecks({
    hasMusic: musicMode !== "none", hasVoice: !!narration, hasSourceAudio: !!(videoEdit && source),
    scenes: timeline.scenes.map(sc => ({ text: sc.text, seconds: sc.durationInFrames / FPS })), totalSeconds: timeline.seconds,
    durationAdjustable: mode.kind === "target" && !(videoEdit && source) && voiceMode !== "ai",
    closesWithCta: cineActive && cine!.plan.scenes.at(-1)?.act === "cta",
  }) : [];
  function applyFix(id: FixId) {
    if (id === "music") { setMusicMode("auto"); setMood(moodForStyle(style)); }
    else if (id === "duration") setTarget("auto");
    else if (id === "cta") {
      const line = suggestCta({ text: script, title }).text.slice(0, 100);
      if (line && !splitScript(script).includes(line)) setScript(prev => `${prev.replace(/\s+$/, "")}\n${line}`.slice(0, 3000));
    }
  }
  /** The five steps of the advanced settings; on a phone one at a time. */
  const [flowStep, setFlowStep] = useState(1);
  const goFlow = (n: number) => { setFlowStep(Math.min(5, Math.max(1, n))); setTimeout(() => document.querySelector("[data-testid=advanced-settings]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); };
  const [styleUndo, setStyleUndo] = useState<{ style: StyleId; palette: PaletteId; contentPreset: ContentPresetId | "custom" } | null>(null);
  const rememberStyle = () => setStyleUndo({ style, palette, contentPreset });
  /** The next combination of animation style and colours (the style moves every time, the colours every other time), so one tap always shows something new. */
  function tryOtherStyle() {
    rememberStyle();
    const styles = STYLES.map(x => x.id), palettes = Object.keys(PALETTES) as PaletteId[];
    const si = (styles.indexOf(style) + 1) % styles.length, pi = (palettes.indexOf(palette) + (si === 0 ? 1 : 2)) % palettes.length;
    setStyle(styles[si]); setPalette(palettes[pi]); setContentPreset("custom"); replayPreview();
  }
  function undoStyle() { if (!styleUndo) return; setStyle(styleUndo.style); setPalette(styleUndo.palette); setContentPreset(styleUndo.contentPreset); setStyleUndo(null); replayPreview(); }
  const [saveOpen, setSaveOpen] = useState(false);
  useEffect(() => { setSaveOpen(false); }, [result]);
  const openAdvanced = (then: () => void) => { setAdvancedOpen(true); setTimeout(then, 60); };
  function goSave() { setSaveOpen(true); openAdvanced(() => { setFlowStep(5); setTimeout(() => document.querySelector("[data-testid=hub-open]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); }); }
  function makeAnother() {
    tryOtherStyle(); setStatus("Gaya diganti. Atur seperlunya lalu tekan Render untuk membuat versi baru.");
    openAdvanced(() => { setFlowStep(4); document.querySelector("[data-testid=step-4]")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }
  function goSeo() {
    openAdvanced(() => { setFlowStep(5); const f = document.querySelector<HTMLDetailsElement>("[data-testid=fold-seo]"); if (f) { f.open = true; f.scrollIntoView({ behavior: "smooth", block: "start" }); } });
  }
  const studioGrid = (
  <div className="studio-grid flow" data-flow-step={flowStep}>
    <section className="studio-panel flow-steps" data-mode={activeMode}>
      <div className="panel-heading"><div><small>PENGATURAN LANJUTAN</small><h2>Atur video</h2></div><span className="local-tag">{cloudUser ? "Tersinkron · tanpa media" : "Lokal · tanpa server"}</span></div>
      {activeMode !== "normal" && <CloudAccount onUser={setCloudUser} />}
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
      <FlowStepperBar step={flowStep} onGo={goFlow} />
    <section className="flow-step" data-step="1" data-testid="flow-step-1">
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
          <button className="text-button" disabled={asrBusy} onClick={() => { setSource(null); setTrim(null); setTrimNote(""); setEdits([]); setEmphasis([]); setEditProfile("standard"); setImported(null); setVideoEdit(false); setCutOverrides({}); setClipStarts({}); if (script === VIDEO_ONLY || script === AUDIO_ONLY) { setScript(SAMPLE); setCaptions(true); } }}>Ganti video ({source.file.name})</button>
          {trimNote && <div className="notice normal-only" role="status" data-testid="trim-note">{trimNote}</div>}
          {videoEdit && <EditProfilePanel file={source.file} url={source.url} seconds={source.seconds} trim={trim} words={imported ? absoluteWords(allWords(imported), trim?.start ?? 0) : null} video={sourceVideo}
            profile={editProfile} onProfile={setEditProfile} edits={edits} onEdits={setEdits} onEmphasis={setEmphasis} comedySfx={comedySfx} onComedySfx={setComedySfx}
            onTrim={t => applyTrim(clampTrim(t, source.seconds))} audioOnly={isAudioFile(source.file)} disabled={asrBusy || rendering} />}
          <EditCommandPanel seconds={trimSeconds(trim, source.seconds)} hasTranscript={!!imported} lines={splitScript(script)} disabled={asrBusy || rendering} onApply={applyEditPlan} onUndo={undoEditPlan} canUndo={!!editUndo} onStartTranscript={() => setAsrStart(n => n + 1)} />
          <TranscriptPanel startNonce={asrStart} key={`${source.url}:${trim?.start ?? 0}:${trim?.end ?? 0}`} file={source.file} video={sourceVideo} range={{ start: trim?.start ?? 0, duration: trimSeconds(trim, source.seconds) }} locked={false} onWorking={setAsrBusy} onCopy={setScript} onUseTiming={useTimingOnly} preciseTiming={!!imported && imported.granularity !== "word" && videoEdit}
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
      <CinematicStudio active={cine} hasMusic={musicMode !== "none"} frames={timeline.ok ? timeline.scenes.map(x => x.durationInFrames) : []} onApply={applyCinematic} onClear={() => setCine(null)}
        onFx={(text, fx: FxId) => setCine(c => c ? { ...c, fx: { ...c.fx, [text]: fx }, plan: { ...c.plan, scenes: c.plan.scenes.map(x => x.text === text ? { ...x, fx } : x), fxByText: { ...c.plan.fxByText, [text]: fx } } } : c)} />
      <FlowStepNav step={1} onGo={goFlow} />
    </section>
    <ImagesStep
      animationPlan={animationPlan} applyIcon={applyIcon} autoPhotos={autoPhotos} chooseEntrance={chooseEntrance} clipStarts={clipStarts}
      cutOverrides={cutOverrides} directorInfo={directorInfo} goFlow={goFlow} iconEntrance={iconEntrance} imageError={imageError} images={images}
      manualChoice={manualChoice} musicMode={musicMode} narrativePlan={narrativePlan} onSceneImage={onSceneImage} overrides={overrides} palette={palette}
      pickerFor={pickerFor} pickerSource={pickerSource} planned={planned} player={player} putPixabayPhoto={putPixabayPhoto}
      putPixabayVideo={putPixabayVideo} putStockPhoto={putStockPhoto} queryHints={queryHints} removeSceneImage={removeSceneImage} rendering={rendering}
      sceneContext={sceneContext} sceneList={sceneList} sceneVisuals={sceneVisuals} setClipStarts={setClipStarts} setCutOverrides={setCutOverrides}
      setMood={setMood} setMusicMode={setMusicMode} setOverrides={setOverrides} setPickerFor={setPickerFor} setPickerSource={setPickerSource}
      setStickerOverrides={setStickerOverrides} source={source} sourceVideo={sourceVideo} stickerMode={stickerMode} stickerOverrides={stickerOverrides}
      style={style} timeline={timeline} videoEdit={videoEdit} />
    <VoiceStep
      aiFresh={aiFresh} aiNarration={aiNarration} audioError={audioError} audioInput={audioInput} autoDirections={autoDirections} busy={busy}
      cancelRecording={cancelRecording} cancelVoice={cancelVoice} captions={captions} captionStyle={captionStyle} duck={duck}
      generatedFresh={generatedFresh} generateVoice={generateVoice} goFlow={goFlow} mood={mood} musicBusy={musicBusy} musicError={musicError}
      musicInput={musicInput} musicMode={musicMode} musicVolume={musicVolume} narration={narration} narrationBusy={narrationBusy} onAudio={onAudio}
      onMusic={onMusic} recording={recording} recordingSeconds={recordingSeconds} rendering={rendering} setCaptions={setCaptions}
      setCaptionStyle={setCaptionStyle} setDuck={setDuck} setMood={setMood} setMoodTouched={setMoodTouched} setMusicMode={setMusicMode}
      setMusicVolume={setMusicVolume} setNarration={setNarration} setSeed={setSeed} setSfxMode={setSfxMode} setStickerMode={setStickerMode}
      setTarget={setTarget} setTtsLang={setTtsLang} setTtsSpeed={setTtsSpeed} setTtsVoice={setTtsVoice}
      setVoiceDirectionOverrides={setVoiceDirectionOverrides} setVoiceMode={setVoiceMode} sfxMode={sfxMode} source={source} startRecording={startRecording}
      stickerMode={stickerMode} stopRecording={stopRecording} target={target} timeline={timeline} ttsLang={ttsLang} ttsSpeed={ttsSpeed} ttsVoice={ttsVoice}
      uploadedMusic={uploadedMusic} videoEdit={videoEdit} videoSeconds={videoSeconds} voiceBusy={voiceBusy}
      voiceDirectionOverrides={voiceDirectionOverrides} voiceDirections={voiceDirections} voiceError={voiceError} voiceMode={voiceMode}
      voiceProgress={voiceProgress} voiceSegmentKeys={voiceSegmentKeys} />
    <StyleStep
      activeMode={activeMode} affiliateBrief={affiliateBrief} applyDirector={applyDirector} backdrop={backdrop} captionPos={captionPos} captions={captions}
      contentPreset={contentPreset} cutOverrides={cutOverrides} directorHistory={directorHistory} directorInfo={directorInfo} directorNote={directorNote}
      goFlow={goFlow} grain={grain} imported={imported} overrides={overrides} palette={palette} redoDirector={redoDirector} rememberStyle={rememberStyle}
      rendering={rendering} replayPreview={replayPreview} setBackdrop={setBackdrop} setCaptionPos={setCaptionPos} setContentPreset={setContentPreset}
      setGrain={setGrain} setPalette={setPalette} setStoryVisuals={setStoryVisuals} setStyle={setStyle} setTypography={setTypography}
      setWatermark={setWatermark} showCaptionFrame={showCaptionFrame} source={source} storyVisuals={storyVisuals} style={style} styleUndo={styleUndo}
      timeline={timeline} tryOtherStyle={tryOtherStyle} typography={typography} undoDirector={undoDirector} undoStyle={undoStyle} videoEdit={videoEdit}
      watermark={watermark} />
    <RenderStep
      abort={abort} applyFix={applyFix} base={base} blocker={blocker} copyBrief={copyBrief} entrySeo={entrySeo} errorDetail={errorDetail}
      exportProject={exportProject} goFlow={goFlow} goSave={goSave} goSeo={goSeo} historyId={historyId} imported={imported} makeAnother={makeAnother}
      musicBusy={musicBusy} narrationBusy={narrationBusy} onSeoResult={onSeoResult} preChecks={preChecks} progress={progress} props={props} render={render}
      renderError={renderError} rendering={rendering} result={result} saveOpen={saveOpen} seoSeed={seoSeed} setStatus={setStatus} srtUrl={srtUrl}
      status={status} storyboard={storyboard} storyErrors={storyErrors} storyIssues={storyIssues} timeline={timeline} title={title}
      videoSeconds={videoSeconds} voiceBusy={voiceBusy} />
    </section>

    <PreviewColumn blocker={blocker} colors={colors} guide={guide} player={player} props={props} setGuide={setGuide} />
  </div>
  );
  const quickPreview = props ? <Player ref={quickPlayer} component={ScriptVideo} inputProps={props} durationInFrames={totalFrames(props.scenes)} fps={FPS} compositionWidth={WIDTH} compositionHeight={HEIGHT} controls style={{ width: "100%", aspectRatio: "9 / 16" }} acknowledgeRemotionLicense /> : null;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Anything that needs the full controls (a clip handed over, a saved session, a chosen video) opens them by itself.
  useEffect(() => { if (handoffNote || saved || source || offer) setAdvancedOpen(true); }, [handoffNote, saved, source, offer]);

  return (
    <main className="motion-shell">
      <header className="motion-header">
        <Link className="brand" href="/"><span className="logo">c</span><span>clipper<span className="light">studio</span></span></Link>
      </header>
      <AppNav current="studio" />

      <section className="motion-intro compact">
        <div className="seg two mode-switch" role="radiogroup" aria-label="Jenis konten">
          <button role="radio" aria-checked={activeMode === "normal"} className={activeMode === "normal" ? "active" : ""} onClick={() => chooseMode("normal")} data-testid="mode-normal">Konten biasa</button>
          <button role="radio" aria-checked={activeMode === "affiliate"} className={activeMode === "affiliate" ? "active" : ""} disabled={videoMode} onClick={() => chooseMode("affiliate")} data-testid="mode-affiliate">Affiliate</button>
        </div>
        <p className="mode-hint" data-testid="mode-hint">{videoMode ? "Affiliate tidak tersedia saat mengedit di atas video sumber. Lepas videonya (Ganti video) untuk memakainya."
          : activeMode === "affiliate" ? "Isi data produk, AI menulis naskah dari data itu, dan klaim berisiko ditandai. Naskah dan pengaturan tetap ada saat Anda pindah ke Konten biasa."
          : "Tulis naskah sendiri, atau mulai dari video sumber. Naskah dan pengaturan tetap ada saat Anda pindah ke Affiliate."}</p>
      </section>


      {activeMode === "normal" && <>
        <CloudAccount onUser={setCloudUser} />
        <AiSetupCard />
        <QuickStart onApply={applyCinematic} preview={quickPreview} checklist={timeline.ok ? <PreRenderChecklist checks={preChecks} onFix={applyFix} prefix="quick" disabled={rendering} /> : null} renderSeconds={videoSeconds} onSave={goSave} onAnother={() => tryOtherStyle()} onSeo={goSeo} onRender={() => void render()} onCancelRender={() => abort.current?.abort()} rendering={rendering} progress={progress} result={result} renderError={renderError} blocker={blocker ?? ""} onOpenAdvanced={() => { setAdvancedOpen(true); setTimeout(() => document.querySelector("[data-testid=advanced-settings]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
      </>}
      {activeMode === "normal"
        ? <details className="fold advanced-settings" open={advancedOpen} onToggle={e => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)} data-testid="advanced-settings"><summary><b>Pengaturan lanjutan</b> <small>naskah, tampilan, suara, musik, AI, dan semua pilihan detail</small></summary>{studioGrid}</details>
        : studioGrid}

      <section className="remotion-note"><span className="remotion-icon">R</span><div><b>Render di browser, tanpa biaya server</b><p>MP4 dibuat di perangkat Anda dengan Remotion Web Renderer (WebCodecs). Naskah, rekaman, dan musik tidak diunggah. Hasil MP4 baru dikirim ke Perpustakaan (penyimpanan cloud privat) jika Anda memilih dan menyetujuinya. Backsound otomatis disintesis di perangkat dengan Tone.js.</p></div><span className="status-chip">NO PAID RENDER</span></section>
      <footer className="motion-footer"><span>CLIPPER STUDIO / MOTION LAB</span><span>Built with Remotion</span></footer>
    </main>
  );
}
