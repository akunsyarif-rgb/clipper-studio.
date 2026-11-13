import { type Narration } from "@/lib/recorder";
import StartChips from "./StartChips";
import { type CaptionStyleId, type ContentPresetId, type PaletteId } from "@/lib/script";
import { type Transcript } from "@/lib/transcript";
import { type Cut } from "@/lib/visuals";
import { type Density } from "@/lib/importance";
import type { BrandMotion, OverlayPosition } from "@/lib/overlay";
import CinematicStudio from "../../CinematicStudio";
import { FlowStepNav } from "../../FlowStepper";
import type { EditPlan } from "@/lib/edit-command";
import { type CinePlan, type FxId } from "@/lib/cinematic";
import { type Edit, type EditProfile } from "@/lib/edit-profile";
import { type Trim } from "@/lib/trim";
import AffiliatePanel from "../../AffiliatePanel";
import { removeLine, type AffiliateBrief } from "@/lib/affiliate";
import type { Visual } from "@/lib/command-agent";
import type { Mode, MusicMode, SceneImageFile, VoiceMode } from "./types";
import SourceVideoSection from "./SourceVideoSection";
import TimingNotices from "./TimingNotices";
import VideoEditOptions from "./VideoEditOptions";
import TranscriptNotices from "./TranscriptNotices";
import type { Dispatch, SetStateAction, RefObject, ChangeEvent } from "react";
import type { SceneTimings } from "@/lib/transcript";
import type { TimelineResult } from "@/lib/script";

type Props = {
  activeMode: Mode;
  applyCinematic: (plan: CinePlan, visuals?: Visual[]) => void;
  applyEditPlan: (plan: EditPlan) => void;
  applyTrim: (next: Trim | null) => void;
  asrBusy: boolean;
  asrStart: number;
  brandMotion: BrandMotion;
  captionOffset: number;
  cine: { plan: CinePlan; fx: Record<string, string>; } | null;
  comedySfx: boolean;
  density: Density;
  editProfile: EditProfile;
  edits: Edit[];
  editUndo: { editProfile: EditProfile; captions: boolean; captionStyle: CaptionStyleId; overlayPos: OverlayPosition; density: Density; brandMotion: BrandMotion; queryHints: Record<string, Visual>; imageKeys: string[]; cutOverrides: Record<string, string>; } | null;
  goFlow: (n: number) => void;
  imported: Transcript | null;
  musicMode: MusicMode;
  offer: { source: string; transcript: Transcript; } | null;
  onSourceVideo: (e: ChangeEvent<HTMLInputElement>) => void;
  overlayPos: OverlayPosition;
  placeProductPhoto: (file: File, brief: AffiliateBrief, credit?: SceneImageFile["credit"]) => Promise<number>;
  rendering: boolean;
  script: string;
  setAffiliateBrief: Dispatch<SetStateAction<AffiliateBrief | null>>;
  setAsrBusy: Dispatch<SetStateAction<boolean>>;
  setAsrStart: Dispatch<SetStateAction<number>>;
  setBrandMotion: Dispatch<SetStateAction<BrandMotion>>;
  setCaptionOffset: Dispatch<SetStateAction<number>>;
  setCaptions: Dispatch<SetStateAction<boolean>>;
  setCine: Dispatch<SetStateAction<{ plan: CinePlan; fx: Record<string, string>; } | null>>;
  setClipStarts: Dispatch<SetStateAction<Record<string, number>>>;
  setComedySfx: Dispatch<SetStateAction<boolean>>;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setCutOverrides: Dispatch<SetStateAction<Record<string, Cut>>>;
  setDensity: Dispatch<SetStateAction<Density>>;
  setEditProfile: Dispatch<SetStateAction<EditProfile>>;
  setEdits: Dispatch<SetStateAction<Edit[]>>;
  setEmphasis: Dispatch<SetStateAction<{ from: number; to: number; }[]>>;
  setImported: Dispatch<SetStateAction<Transcript | null>>;
  setNarration: Dispatch<SetStateAction<Narration | null>>;
  setOffer: Dispatch<SetStateAction<{ source: string; transcript: Transcript; } | null>>;
  setOverlayPos: Dispatch<SetStateAction<OverlayPosition>>;
  setPalette: Dispatch<SetStateAction<PaletteId>>;
  setScript: Dispatch<SetStateAction<string>>;
  setSource: Dispatch<SetStateAction<{ file: File; url: string; seconds: number; } | null>>;
  setTitle: Dispatch<SetStateAction<string>>;
  setTrim: Dispatch<SetStateAction<Trim | null>>;
  setTrimNote: Dispatch<SetStateAction<string>>;
  setVideoEdit: Dispatch<SetStateAction<boolean>>;
  setVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  source: { file: File; url: string; seconds: number; } | null;
  sourceError: string;
  sourceVideo: RefObject<HTMLVideoElement | null>;
  timed: SceneTimings | null;
  timeline: TimelineResult;
  timings: SceneTimings | null;
  title: string;
  titleError: string | null;
  trim: Trim | null;
  trimNote: string;
  undoEditPlan: () => void;
  useTimingOnly: (t: Transcript) => string | null;
  videoEdit: boolean;
  voiceMode: VoiceMode;
};

export default function ScriptStep({ activeMode, applyCinematic, applyEditPlan, applyTrim, asrBusy, asrStart, brandMotion, captionOffset, cine, comedySfx, density, editProfile, edits, editUndo, goFlow, imported, musicMode, offer, onSourceVideo, overlayPos, placeProductPhoto, rendering, script, setAffiliateBrief, setAsrBusy, setAsrStart, setBrandMotion, setCaptionOffset, setCaptions, setCine, setClipStarts, setComedySfx, setContentPreset, setCutOverrides, setDensity, setEditProfile, setEdits, setEmphasis, setImported, setNarration, setOffer, setOverlayPos, setPalette, setScript, setSource, setTitle, setTrim, setTrimNote, setVideoEdit, setVoiceMode, source, sourceError, sourceVideo, timed, timeline, timings, title, titleError, trim, trimNote, undoEditPlan, useTimingOnly, videoEdit, voiceMode }: Props) {
  return (
    <section className="flow-step" data-step="1" data-testid="flow-step-1">
      <div className="step-title" data-testid="step-1"><b>1</b>{activeMode === "affiliate" ? "Produk dan naskah" : "Naskah"}</div>
      <StartChips />
      <TranscriptNotices
        imported={imported} offer={offer} setImported={setImported} setOffer={setOffer} setScript={setScript} setVoiceMode={setVoiceMode} timed={timed}
        timings={timings} videoEdit={videoEdit} />
      <VideoEditOptions
        brandMotion={brandMotion} captionOffset={captionOffset} density={density} imported={imported} overlayPos={overlayPos} setBrandMotion={setBrandMotion}
        setCaptionOffset={setCaptionOffset} setDensity={setDensity} setOverlayPos={setOverlayPos} videoEdit={videoEdit} />
      <TimingNotices imported={imported} setScript={setScript} timed={timed} voiceMode={voiceMode} />
      <SourceVideoSection
        applyEditPlan={applyEditPlan} applyTrim={applyTrim} asrBusy={asrBusy} asrStart={asrStart} comedySfx={comedySfx} editProfile={editProfile}
        edits={edits} editUndo={editUndo} imported={imported} onSourceVideo={onSourceVideo} rendering={rendering} script={script} setAsrBusy={setAsrBusy}
        setAsrStart={setAsrStart} setCaptionOffset={setCaptionOffset} setCaptions={setCaptions} setClipStarts={setClipStarts} setComedySfx={setComedySfx}
        setContentPreset={setContentPreset} setCutOverrides={setCutOverrides} setEditProfile={setEditProfile} setEdits={setEdits} setEmphasis={setEmphasis}
        setImported={setImported} setNarration={setNarration} setOffer={setOffer} setPalette={setPalette} setScript={setScript} setSource={setSource}
        setTrim={setTrim} setTrimNote={setTrimNote} setVideoEdit={setVideoEdit} setVoiceMode={setVoiceMode} source={source} sourceError={sourceError}
        sourceVideo={sourceVideo} trim={trim} trimNote={trimNote} undoEditPlan={undoEditPlan} useTimingOnly={useTimingOnly} videoEdit={videoEdit} />
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
  );
}
