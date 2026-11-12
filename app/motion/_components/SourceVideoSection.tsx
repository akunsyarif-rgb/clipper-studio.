import { type Narration } from "@/lib/recorder";
import { type CaptionStyleId, FPS, splitScript, type ContentPresetId, type PaletteId } from "@/lib/script";
import { allWords, scriptFromTranscript, type Transcript } from "@/lib/transcript";
import { type Cut } from "@/lib/visuals";
import { type Density } from "@/lib/importance";
import type { BrandMotion, OverlayPosition } from "@/lib/overlay";
import TranscriptPanel from "../../TranscriptPanel";
import EditCommandPanel from "../../EditCommandPanel";
import type { EditPlan } from "@/lib/edit-command";
import EditProfilePanel from "../../EditProfilePanel";
import { type Edit, type EditProfile } from "@/lib/edit-profile";
import { absoluteWords, clampTrim, trimSeconds, type Trim } from "@/lib/trim";
import type { Visual } from "@/lib/command-agent";
import { isAudioFile, SOURCE_ACCEPT } from "@/lib/clip";
import { AUDIO_ONLY, SAMPLE, VIDEO_ONLY } from "./constants";
import type { VoiceMode } from "./types";
import type { Dispatch, SetStateAction, RefObject, ChangeEvent } from "react";

type Props = {
  applyEditPlan: (plan: EditPlan) => void;
  applyTrim: (next: Trim | null) => void;
  asrBusy: boolean;
  asrStart: number;
  comedySfx: boolean;
  editProfile: EditProfile;
  edits: Edit[];
  editUndo: { editProfile: EditProfile; captions: boolean; captionStyle: CaptionStyleId; overlayPos: OverlayPosition; density: Density; brandMotion: BrandMotion; queryHints: Record<string, Visual>; imageKeys: string[]; cutOverrides: Record<string, string>; } | null;
  imported: Transcript | null;
  onSourceVideo: (e: ChangeEvent<HTMLInputElement>) => void;
  rendering: boolean;
  script: string;
  setAsrBusy: Dispatch<SetStateAction<boolean>>;
  setAsrStart: Dispatch<SetStateAction<number>>;
  setCaptionOffset: Dispatch<SetStateAction<number>>;
  setCaptions: Dispatch<SetStateAction<boolean>>;
  setClipStarts: Dispatch<SetStateAction<Record<string, number>>>;
  setComedySfx: Dispatch<SetStateAction<boolean>>;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setCutOverrides: Dispatch<SetStateAction<Record<string, Cut>>>;
  setEditProfile: Dispatch<SetStateAction<EditProfile>>;
  setEdits: Dispatch<SetStateAction<Edit[]>>;
  setEmphasis: Dispatch<SetStateAction<{ from: number; to: number; }[]>>;
  setImported: Dispatch<SetStateAction<Transcript | null>>;
  setNarration: Dispatch<SetStateAction<Narration | null>>;
  setOffer: Dispatch<SetStateAction<{ source: string; transcript: Transcript; } | null>>;
  setPalette: Dispatch<SetStateAction<PaletteId>>;
  setScript: Dispatch<SetStateAction<string>>;
  setSource: Dispatch<SetStateAction<{ file: File; url: string; seconds: number; } | null>>;
  setTrim: Dispatch<SetStateAction<Trim | null>>;
  setTrimNote: Dispatch<SetStateAction<string>>;
  setVideoEdit: Dispatch<SetStateAction<boolean>>;
  setVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  source: { file: File; url: string; seconds: number; } | null;
  sourceError: string;
  sourceVideo: RefObject<HTMLVideoElement | null>;
  trim: Trim | null;
  trimNote: string;
  undoEditPlan: () => void;
  useTimingOnly: (t: Transcript) => string | null;
  videoEdit: boolean;
};

export default function SourceVideoSection({ applyEditPlan, applyTrim, asrBusy, asrStart, comedySfx, editProfile, edits, editUndo, imported, onSourceVideo, rendering, script, setAsrBusy, setAsrStart, setCaptionOffset, setCaptions, setClipStarts, setComedySfx, setContentPreset, setCutOverrides, setEditProfile, setEdits, setEmphasis, setImported, setNarration, setOffer, setPalette, setScript, setSource, setTrim, setTrimNote, setVideoEdit, setVoiceMode, source, sourceError, sourceVideo, trim, trimNote, undoEditPlan, useTimingOnly, videoEdit }: Props) {
  return (
    <>
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
</>
  );
}
