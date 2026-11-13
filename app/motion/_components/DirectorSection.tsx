import { FPS, type StyleId, type PaletteId, type TimelineResult } from "@/lib/script";
import { type Cut, type VisualOverride } from "@/lib/visuals";
import { type Transcript } from "@/lib/transcript";
import { type History } from "@/lib/revision";
import type { AffiliateBrief } from "@/lib/affiliate";
import type { DirectorPlan } from "@/lib/director";
import AiDirector from "../../AiDirector";
import type { DirectorSnap, Mode } from "./types";

type Props = {
  activeMode: Mode;
  affiliateBrief: AffiliateBrief | null;
  applyDirector: (plan: DirectorPlan, label: string) => void;
  cutOverrides: Record<string, Cut>;
  directorHistory: History<DirectorSnap>;
  directorInfo: Record<string, { reason: string; imageIdea?: string; imageQuery?: string }>;
  directorNote: string;
  imported: Transcript | null;
  overrides: Record<string, VisualOverride>;
  palette: PaletteId;
  redoDirector: () => void;
  source: { file: File; url: string; seconds: number } | null;
  style: StyleId;
  timeline: TimelineResult;
  undoDirector: () => void;
  videoEdit: boolean;
};

/** "Sutradara AI" (plans the scenes, the look and the picture keywords). It sits in the Gambar step, before the picture tools that use its keywords, and before the manual look settings it would otherwise overwrite. */
export default function DirectorSection({ activeMode, affiliateBrief, applyDirector, cutOverrides, directorHistory, directorInfo, directorNote, imported, overrides, palette, redoDirector, source, style, timeline, undoDirector, videoEdit }: Props) {
  return (
    <>
        {timeline.ok && <AiDirector language={imported?.language === "english" || imported?.language === "en" ? "en" : "id"} active={Object.keys(directorInfo).length > 0} note={directorNote} onPlan={applyDirector} onUndo={undoDirector} onRedo={redoDirector} canRedo={directorHistory.future.length > 0} versions={directorHistory.past.length}
          input={{ scenes: timeline.scenes.map(sc => ({ text: sc.text, seconds: sc.durationInFrames / FPS })), videoEdit: !!(videoEdit && source), style, palette, affiliate: activeMode === "affiliate" && affiliateBrief ? { product: affiliateBrief.product } : undefined,
            current: timeline.scenes.map(sc => ({ template: overrides[sc.text]?.template, icon: overrides[sc.text]?.icon, cut: cutOverrides[sc.text] })) }} />}
    </>
  );
}
