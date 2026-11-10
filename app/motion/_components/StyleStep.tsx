import { FPS, type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import { type Transcript } from "@/lib/transcript";
import { type Cut, type VisualOverride } from "@/lib/visuals";
import AiDirector from "../../AiDirector";
import { FlowStepNav } from "../../FlowStepper";
import StylePicker from "../../StylePicker";
import CaptionPosPanel from "../../CaptionPosPanel";
import { type CaptionPos } from "@/lib/caption-box";
import { type TypePackId } from "@/lib/fonts";
import WatermarkPanel from "../../WatermarkPanel";
import { isWatermarkActive, type Watermark } from "@/lib/watermark";
import { type History } from "@/lib/revision";
import { type AffiliateBrief } from "@/lib/affiliate";
import { type DirectorPlan } from "@/lib/director";
import type { DirectorSnap, Mode } from "./types";
import LookFold from "./LookFold";
import type { Dispatch, SetStateAction } from "react";
import type { TimelineResult } from "@/lib/script";

type Props = {
  activeMode: Mode;
  affiliateBrief: AffiliateBrief | null;
  applyDirector: (plan: DirectorPlan, label: string) => void;
  backdrop: "plain" | "mesh";
  captionPos: CaptionPos | undefined;
  captions: boolean;
  contentPreset: ContentPresetId | "custom";
  cutOverrides: Record<string, Cut>;
  directorHistory: History<DirectorSnap>;
  directorInfo: Record<string, { reason: string; imageIdea?: string; imageQuery?: string; }>;
  directorNote: string;
  goFlow: (n: number) => void;
  grain: boolean;
  imported: Transcript | null;
  overrides: Record<string, VisualOverride>;
  palette: PaletteId;
  redoDirector: () => void;
  rememberStyle: () => void;
  rendering: boolean;
  replayPreview: () => void;
  setBackdrop: Dispatch<SetStateAction<"plain" | "mesh">>;
  setCaptionPos: Dispatch<SetStateAction<CaptionPos | undefined>>;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setGrain: Dispatch<SetStateAction<boolean>>;
  setPalette: Dispatch<SetStateAction<PaletteId>>;
  setStoryVisuals: Dispatch<SetStateAction<boolean>>;
  setStyle: Dispatch<SetStateAction<StyleId>>;
  setTypography: Dispatch<SetStateAction<TypePackId>>;
  setWatermark: (w: Watermark) => void;
  showCaptionFrame: () => void;
  source: { file: File; url: string; seconds: number; } | null;
  storyVisuals: boolean;
  style: StyleId;
  styleUndo: { style: StyleId; palette: PaletteId; contentPreset: ContentPresetId | "custom"; } | null;
  timeline: TimelineResult;
  tryOtherStyle: () => void;
  typography: TypePackId;
  undoDirector: () => void;
  undoStyle: () => void;
  videoEdit: boolean;
  watermark: Watermark;
};

export default function StyleStep({ activeMode, affiliateBrief, applyDirector, backdrop, captionPos, captions, contentPreset, cutOverrides, directorHistory, directorInfo, directorNote, goFlow, grain, imported, overrides, palette, redoDirector, rememberStyle, rendering, replayPreview, setBackdrop, setCaptionPos, setContentPreset, setGrain, setPalette, setStoryVisuals, setStyle, setTypography, setWatermark, showCaptionFrame, source, storyVisuals, style, styleUndo, timeline, tryOtherStyle, typography, undoDirector, undoStyle, videoEdit, watermark }: Props) {
  return (
    <section className="flow-step" data-step="4" data-testid="flow-step-4">
      <div className="step-title" data-testid="step-4"><b>4</b>Gaya</div>
      <StylePicker style={style} palette={palette} onStyle={s => { rememberStyle(); setStyle(s); setContentPreset("custom"); replayPreview(); }} onPalette={pl => { rememberStyle(); setPalette(pl); setContentPreset("custom"); replayPreview(); }} onTryOther={tryOtherStyle} onUndo={undoStyle} canUndo={!!styleUndo} disabled={rendering} />
      <CaptionPosPanel value={captionPos} onChange={setCaptionPos} active={!!(videoEdit && source)} captionsOn={captions} disabled={rendering} onTouch={showCaptionFrame} />
      <LookFold
        backdrop={backdrop} contentPreset={contentPreset} grain={grain} palette={palette} replayPreview={replayPreview} setBackdrop={setBackdrop}
        setContentPreset={setContentPreset} setGrain={setGrain} setPalette={setPalette} setStoryVisuals={setStoryVisuals} setStyle={setStyle}
        setTypography={setTypography} source={source} storyVisuals={storyVisuals} style={style} typography={typography} videoEdit={videoEdit} />
      {timeline.ok && <AiDirector language={imported?.language === "english" || imported?.language === "en" ? "en" : "id"} active={Object.keys(directorInfo).length > 0} note={directorNote} onPlan={applyDirector} onUndo={undoDirector} onRedo={redoDirector} canRedo={directorHistory.future.length > 0} versions={directorHistory.past.length}
        input={{ scenes: timeline.scenes.map(sc => ({ text: sc.text, seconds: sc.durationInFrames / FPS })), videoEdit: !!(videoEdit && source), style, palette, affiliate: activeMode === "affiliate" && affiliateBrief ? { product: affiliateBrief.product } : undefined,
          current: timeline.scenes.map(sc => ({ template: overrides[sc.text]?.template, icon: overrides[sc.text]?.icon, cut: cutOverrides[sc.text] })) }} />}
      <details className="fold" data-testid="fold-watermark"><summary><b>Watermark video</b> <small>{isWatermarkActive(watermark) ? `${watermark.text} · ${watermark.position.replace("-", " ")}` : "Nonaktif"}</small></summary>
        <WatermarkPanel value={watermark} onChange={setWatermark} disabled={rendering} note="Terlihat langsung di pratinjau." />
      </details>
      <FlowStepNav step={4} onGo={goFlow} />
    </section>
  );
}
