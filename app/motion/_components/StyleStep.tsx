import { type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import { FlowStepNav } from "../../FlowStepper";
import StylePicker from "../../StylePicker";
import CaptionPosPanel from "../../CaptionPosPanel";
import { type CaptionPos } from "@/lib/caption-box";
import { type TypePackId } from "@/lib/fonts";
import WatermarkPanel from "../../WatermarkPanel";
import { isWatermarkActive, type Watermark } from "@/lib/watermark";
import LookFold from "./LookFold";
import type { Dispatch, SetStateAction, ReactNode } from "react";

type Props = {
  /** The optional "Sutradara AI" panel, first in this step: it plans the look from the finished script, before the manual settings below. */
  director: ReactNode;
  backdrop: "plain" | "mesh";
  captionPos: CaptionPos | undefined;
  captions: boolean;
  contentPreset: ContentPresetId | "custom";
  goFlow: (n: number) => void;
  grain: boolean;
  palette: PaletteId;
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
  tryOtherStyle: () => void;
  typography: TypePackId;
  undoStyle: () => void;
  videoEdit: boolean;
  watermark: Watermark;
};

export default function StyleStep({ director, backdrop, captionPos, captions, contentPreset, goFlow, grain, palette, rememberStyle, rendering, replayPreview, setBackdrop, setCaptionPos, setContentPreset, setGrain, setPalette, setStoryVisuals, setStyle, setTypography, setWatermark, showCaptionFrame, source, storyVisuals, style, styleUndo, tryOtherStyle, typography, undoStyle, videoEdit, watermark }: Props) {
  return (
    <section className="flow-step" data-step="2" data-testid="flow-step-2">
      <div className="step-title" data-testid="step-2"><b>2</b>Sutradara dan gaya</div>
      {director}
      <StylePicker style={style} palette={palette} onStyle={s => { rememberStyle(); setStyle(s); setContentPreset("custom"); replayPreview(); }} onPalette={pl => { rememberStyle(); setPalette(pl); setContentPreset("custom"); replayPreview(); }} onTryOther={tryOtherStyle} onUndo={undoStyle} canUndo={!!styleUndo} disabled={rendering} />
      <CaptionPosPanel value={captionPos} onChange={setCaptionPos} active={!!(videoEdit && source)} captionsOn={captions} disabled={rendering} onTouch={showCaptionFrame} />
      <LookFold
        backdrop={backdrop} contentPreset={contentPreset} grain={grain} palette={palette} replayPreview={replayPreview} setBackdrop={setBackdrop}
        setContentPreset={setContentPreset} setGrain={setGrain} setPalette={setPalette} setStoryVisuals={setStoryVisuals} setStyle={setStyle}
        setTypography={setTypography} source={source} storyVisuals={storyVisuals} style={style} typography={typography} videoEdit={videoEdit} />
      <details className="fold" data-testid="fold-watermark"><summary><b>Watermark video</b> <small>{isWatermarkActive(watermark) ? `${watermark.text} · ${watermark.position.replace("-", " ")}` : "Nonaktif"}</small></summary>
        <WatermarkPanel value={watermark} onChange={setWatermark} disabled={rendering} note="Terlihat langsung di pratinjau." />
      </details>
      <FlowStepNav step={2} onGo={goFlow} />
    </section>
  );
}
