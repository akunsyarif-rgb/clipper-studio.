"use client";

import { Player, type PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_MUSIC_VOLUME, type Mood } from "@/lib/audio";
import { NarrationRecorder, type Narration } from "@/lib/recorder";
import { type CaptionStyleId, FPS, HEIGHT, totalFrames, WIDTH, type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import { type DirectionOverrides } from "@/lib/voice-director";
import { ClipCache } from "@/lib/tts/clip-cache";
import { type TtsLang } from "@/lib/tts/supertonic";
import { type Transcript } from "@/lib/transcript";
import { type Cut, type VisualOverride } from "@/lib/visuals";
import { type Density } from "@/lib/importance";
import type { BrandMotion, OverlayPosition } from "@/lib/overlay";
import { ScriptVideo } from "@/remotion/ScriptVideo";
import AppNav from "../AppNav";
import AiSetupCard from "../AiSetupCard";
import QuickStart from "../QuickStart";
import PreRenderChecklist from "../PreRenderChecklist";
import { type CaptionPos } from "@/lib/caption-box";
import { setCustomIconEntrance } from "@/lib/visuals";
import type { Entrance } from "@/lib/icon-motion";
import { type CinePlan } from "@/lib/cinematic";
import { type SeoSeed } from "../SeoPanel";
import { type Edit, type EditProfile } from "@/lib/edit-profile";
import { type Trim } from "@/lib/trim";
import { type StickerMode } from "@/lib/stickers";
import { type SfxMode } from "@/lib/sfx";
import { DEFAULT_TYPE_PACK, resolveTypePack, type TypePackId } from "@/lib/fonts";
import { ensureFonts } from "../../remotion/fonts";
import { DEFAULT_WATERMARK, loadWatermark, saveWatermark, type Watermark } from "@/lib/watermark";
import { emptyHistory, type History } from "@/lib/revision";
import { type AffiliateBrief } from "@/lib/affiliate";
import CloudAccount from "../CloudAccount";
import type { SceneScore } from "@/lib/gemini";
import { MODE_KEY, SAMPLE } from "./_components/constants";
import type { AiNarration, DirectorSnap, Generated, Mode, MusicMode, SceneImageFile, Track, VoiceMode, VoiceProgress } from "./_components/types";
import useStudioFlow from "./_hooks/useStudioFlow";
import useRenderActions from "./_hooks/useRenderActions";
import useDirector from "./_hooks/useDirector";
import useEditActions from "./_hooks/useEditActions";
import useSceneImages from "./_hooks/useSceneImages";
import useNarrationActions from "./_hooks/useNarrationActions";
import useBacksound from "./_hooks/useBacksound";
import useProductionHistory from "./_hooks/useProductionHistory";
import useStoryboardChecks from "./_hooks/useStoryboardChecks";
import useSessionPersistence from "./_hooks/useSessionPersistence";
import useSceneComposition from "./_hooks/useSceneComposition";
import useTimeline from "./_hooks/useTimeline";
import useSourceVideo from "./_hooks/useSourceVideo";
import VoiceStep from "./_components/VoiceStep";
import ImagesStep from "./_components/ImagesStep";
import ScriptStep from "./_components/ScriptStep";
import RemotionNote from "./_components/RemotionNote";
import ModeSwitch from "./_components/ModeSwitch";
import StudioPanelHeader from "./_components/StudioPanelHeader";
import StyleStep from "./_components/StyleStep";
import RenderStep from "./_components/RenderStep";
import PreviewColumn from "./_components/PreviewColumn";
import "./motion.css";


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

  const {
    applyTrim, autosave, cloudUser, handoffNote, onSourceVideo, saved, savedCloud, savedSource, setAutosave, setCloudUser, setHandoffNote, setSaved, setSavedCloud, setSavedSource,
  } = useSourceVideo({
    abort, aiNarration, generated, imagesRef, imported, manualNarration, moodTouched, recorder, result, script, setCaptionOffset, setCaptions, setContentPreset, setCutOverrides, setEdits, setEmphasis, setImported, setMood, setNarration, setOffer, setPalette, setScript, setSource, setSourceError, setTitle, setTrim, setTrimNote, setVideoEdit, setVoiceMode, source, style, trim, uploadedMusic,
  });

  const {
    aiFresh, autoDirections, cineActive, generatedFresh, mode, music, musicTrack, narration, recording, timed, timeline, timings, titleError, videoSeconds, voiceBusy, voiceDirections, voiceKey, voiceScript, voiceSegmentKeys,
  } = useTimeline({
    aiNarration, captionOffset, cine, duck, generated, imported, manualNarration, mood, musicMode, musicVolume, recordingSeconds, script, seed, source, target, title, trim, ttsLang, ttsSpeed, ttsVoice, uploadedMusic, videoEdit, voiceDirectionOverrides, voiceMode, voiceProgress,
  });
  /** Grabbing a subtitle slider: stop, and show a moment of the first scene where a subtitle is on screen, so the change is visible as it is made. */
  function showCaptionFrame() {
    const pl = player.current; if (!pl || !timeline.ok) return;
    try { pl.pause(); pl.seekTo(Math.max(0, Math.min(timeline.scenes[0].durationInFrames - 1, Math.round(timeline.scenes[0].durationInFrames * 0.4)))); } catch { /* not on screen */ }
  }

  const {
    animationPlan, narrativePlan, planned, props, sceneContext, sceneList, sceneVisuals, stickerPlan, usedIcons,
  } = useSceneComposition({
    aiFresh, aiScores, backdrop, brandMotion, captionPos, captions, captionStyle, cine, clipStarts, comedySfx, customIcons, cutOverrides, density, editProfile, edits, emphasis, grain, images, music, narration, overlayPos, overrides, palette, sfxMode, source, stickerMode, stickerOverrides, storyVisuals, style, timed, timeline, title, trim, typography, videoEdit, watermark,
  });
  const {
    discardSession, restoreSession, useTimingOnly,
  } = useSessionPersistence({
    asrBusy, autosave, backdrop, brandMotion, captionOffset, captionPos, captions, captionStyle, chooseEntrance, cine, clipStarts, cloudUser, comedySfx, contentPreset, customIcons, cutOverrides, density, editProfile, edits, emphasis, grain, iconEntrance, imported, overlayPos, overrides, palette, rendering, saved, savedSource, script, setAutosave, setBackdrop, setBrandMotion, setCaptionOffset, setCaptionPos, setCaptions, setCaptionStyle, setCine, setClipStarts, setComedySfx, setContentPreset, setCustomIcons, setCutOverrides, setDensity, setEditProfile, setEdits, setEmphasis, setGrain, setImported, setMood, setMoodTouched, setMusicMode, setNarration, setOverlayPos, setOverrides, setPalette, setSaved, setSavedCloud, setSavedSource, setScript, setSfxMode, setSource, setStickerMode, setStickerOverrides, setStoryVisuals, setStyle, setTarget, setTitle, setTrim, setTtsLang, setTtsSpeed, setTtsVoice, setTypography, setVideoEdit, setVoiceMode, sfxMode, source, stickerMode, stickerOverrides, storyVisuals, style, target, title, trim, ttsLang, ttsSpeed, ttsVoice, typography, usedIcons, videoEdit, voiceMode,
  });

  const {
    blocker, srtUrl, storyErrors, storyIssues, storyboard,
  } = useStoryboardChecks({
    aiFresh, aiNarration, captionPos, captions, captionStyle, duck, mode, musicMode, musicTrack, musicVolume, narration, palette, recording, result, sceneList, script, setResult, source, storyVisuals, style, target, timeline, title, titleError, videoEdit, voiceMode, watermark,
  });

  const { base, entrySeo, historyId, onSeoResult } = useProductionHistory({ result, script, setContentPreset, setHandoffNote, setScript, setTitle, title, videoSeconds });

  const { generate } = useBacksound({ generatedFresh, mood, musicBusy, musicMode, seed, setGenerated, setMusicBusy, setMusicError, timeline, videoSeconds });

  const {
    cancelRecording, cancelVoice, generateVoice, onAudio, onMusic, startRecording, stopRecording,
  } = useNarrationActions({
    clipCache, musicVolume, player, recorder, script, setAiNarration, setAudioError, setMusicError, setMusicMode, setMusicVolume, setNarration, setNarrationBusy, setRecordingSeconds, setStatus, setUploadedMusic, setVoiceError, setVoiceProgress, ttsLang, ttsSpeed, ttsVoice, voiceActive, voiceBusy, voiceDirections, voiceKey, voiceRun, voiceScript,
  });

  const {
    onSceneImage, placeProductPhoto, putPixabayPhoto, putPixabayVideo, putStockPhoto, removeSceneImage,
  } = useSceneImages({
    setCutOverrides, setImageError, setImages, source, timeline, videoEdit,
  });

  const {
    applyCinematic, applyEditPlan, applyIcon, asrStart, autoPhotos, editUndo, queryHints, setAsrStart, undoEditPlan,
  } = useEditActions({
    brandMotion, captions, captionStyle, cutOverrides, density, editProfile, images, overlayPos, removeSceneImage, setBackdrop, setBrandMotion, setCaptions, setCaptionStyle, setCine, setContentPreset, setCustomIcons, setCutOverrides, setDensity, setEditProfile, setEdits, setEmphasis, setGrain, setMood, setMoodTouched, setMusicMode, setNarration, setOverlayPos, setOverrides, setPalette, setScript, setSfxMode, setStickerMode, setStyle, setTitle, setTypography, setVoiceMode, timeline,
  });
  const {
    applyDirector, manualChoice, redoDirector, undoDirector,
  } = useDirector({
    aiScores, backdrop, captionStyle, contentPreset, cutOverrides, directorHistory, directorInfo, directorNote, grain, overrides, palette, setAiScores, setBackdrop, setCaptionStyle, setContentPreset, setCutOverrides, setDirectorHistory, setDirectorInfo, setDirectorNote, setGrain, setOverrides, setPalette, setSfxMode, setStickerMode, setStickerOverrides, setStyle, setTypography, sfxMode, source, stickerMode, stickerOverrides, style, timeline, typography, videoEdit,
  });

  const {
    copyBrief, exportProject, render,
  } = useRenderActions({
    abort, blocker, captions, duck, generate, generatedFresh, images, mood, music, musicMode, musicTrack, musicVolume, narration, palette, player, props, script, seed, setErrorDetail, setProgress, setRenderError, setRendering, setResult, setStatus, source, stickerPlan, storyVisuals, style, timeline, title, uploadedMusic, videoEdit, videoSeconds,
  });

  const {
    activeMode, advancedOpen, applyFix, busy, colors, flowStep, goFlow, goSave, goSeo, makeAnother, preChecks, rememberStyle, saveOpen, setAdvancedOpen, styleUndo, tryOtherStyle, undoStyle, videoMode,
  } = useStudioFlow({
    cine, cineActive, contentMode, contentPreset, handoffNote, mode, musicMode, narration, narrationBusy, offer, palette, recording, rendering, replayPreview, result, saved, script, setContentPreset, setMood, setMusicMode, setPalette, setScript, setStatus, setStyle, setTarget, source, style, timeline, title, videoEdit, voiceBusy, voiceMode,
  });
  const studioGrid = (
  <div className="studio-grid flow" data-flow-step={flowStep}>
    <section className="studio-panel flow-steps" data-mode={activeMode}>
      <StudioPanelHeader
        activeMode={activeMode} cloudUser={cloudUser} discardSession={discardSession} flowStep={flowStep} goFlow={goFlow} handoffNote={handoffNote}
        rendering={rendering} restoreSession={restoreSession} saved={saved} savedCloud={savedCloud} savedSource={savedSource} setCloudUser={setCloudUser}
        setContentPreset={setContentPreset} setScript={setScript} setSeoSeed={setSeoSeed} setTitle={setTitle} videoMode={videoMode} />
    <ScriptStep
      activeMode={activeMode} applyCinematic={applyCinematic} applyEditPlan={applyEditPlan} applyTrim={applyTrim} asrBusy={asrBusy} asrStart={asrStart}
      brandMotion={brandMotion} captionOffset={captionOffset} cine={cine} comedySfx={comedySfx} density={density} editProfile={editProfile} edits={edits}
      editUndo={editUndo} goFlow={goFlow} imported={imported} musicMode={musicMode} offer={offer} onSourceVideo={onSourceVideo} overlayPos={overlayPos}
      placeProductPhoto={placeProductPhoto} rendering={rendering} script={script} setAffiliateBrief={setAffiliateBrief} setAsrBusy={setAsrBusy}
      setAsrStart={setAsrStart} setBrandMotion={setBrandMotion} setCaptionOffset={setCaptionOffset} setCaptions={setCaptions} setCine={setCine}
      setClipStarts={setClipStarts} setComedySfx={setComedySfx} setContentPreset={setContentPreset} setCutOverrides={setCutOverrides}
      setDensity={setDensity} setEditProfile={setEditProfile} setEdits={setEdits} setEmphasis={setEmphasis} setImported={setImported}
      setNarration={setNarration} setOffer={setOffer} setOverlayPos={setOverlayPos} setPalette={setPalette} setScript={setScript} setSource={setSource}
      setTitle={setTitle} setTrim={setTrim} setTrimNote={setTrimNote} setVideoEdit={setVideoEdit} setVoiceMode={setVoiceMode} source={source}
      sourceError={sourceError} sourceVideo={sourceVideo} timed={timed} timeline={timeline} timings={timings} title={title} titleError={titleError}
      trim={trim} trimNote={trimNote} undoEditPlan={undoEditPlan} useTimingOnly={useTimingOnly} videoEdit={videoEdit} voiceMode={voiceMode} />
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
  return (
    <main className="motion-shell">
      <header className="motion-header">
        <Link className="brand" href="/"><span className="logo">c</span><span>clipper<span className="light">studio</span></span></Link>
      </header>
      <AppNav current="studio" />

      <ModeSwitch activeMode={activeMode} chooseMode={chooseMode} videoMode={videoMode} />


      {activeMode === "normal" && <>
        <CloudAccount onUser={setCloudUser} />
        <AiSetupCard />
        <QuickStart onApply={applyCinematic} preview={quickPreview} checklist={timeline.ok ? <PreRenderChecklist checks={preChecks} onFix={applyFix} prefix="quick" disabled={rendering} /> : null} renderSeconds={videoSeconds} onSave={goSave} onAnother={() => tryOtherStyle()} onSeo={goSeo} onRender={() => void render()} onCancelRender={() => abort.current?.abort()} rendering={rendering} progress={progress} result={result} renderError={renderError} blocker={blocker ?? ""} onOpenAdvanced={() => { setAdvancedOpen(true); setTimeout(() => document.querySelector("[data-testid=advanced-settings]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
      </>}
      {activeMode === "normal"
        ? <details className="fold advanced-settings" open={advancedOpen} onToggle={e => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)} data-testid="advanced-settings"><summary><b>Pengaturan lanjutan</b> <small>naskah, tampilan, suara, musik, AI, dan semua pilihan detail</small></summary>{studioGrid}</details>
        : studioGrid}

      <RemotionNote  />
    </main>
  );
}
