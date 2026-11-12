import { FAMILY_LABELS } from "@/lib/composition";
import { STICKER_BY_ID } from "@/lib/stickers";
import { STORY_VISUAL_LABELS } from "@/lib/story-visual";
import { type Issue } from "@/lib/storyboard";
import type { Storyboard } from "@/lib/storyboard";
import type { TimelineResult } from "@/lib/script";

type Props = {
  storyboard: Storyboard;
  storyErrors: Issue[];
  storyIssues: Issue[];
  timeline: TimelineResult;
};

export default function StoryboardFold({ storyboard, storyErrors, storyIssues, timeline }: Props) {
  return (
    <>
{timeline.ok && <details className="fold storyboard" data-testid="storyboard">
        <summary>Urutan adegan {storyIssues.length ? `· ${storyErrors.length} masalah, ${storyIssues.length - storyErrors.length} saran` : "· siap render"}</summary>
        <ol>{storyboard.scenes.map(sc => <li key={sc.id} data-testid="storyboard-scene"><b>{sc.order + 1}.</b> {FAMILY_LABELS[sc.family]} · {sc.layout} · {sc.timing.seconds} dtk · {sc.continuity === "continues" ? "lanjutan visual" : sc.continuity === "start" ? "pembuka" : "visual baru"}{sc.sticker && STICKER_BY_ID[sc.sticker] ? ` · stiker: ${STICKER_BY_ID[sc.sticker].emoji} ${STICKER_BY_ID[sc.sticker].label}` : sc.accent ? ` · objek 3D: ${STORY_VISUAL_LABELS[sc.accent]}` : ""}{sc.captionPolicy === "suppressed-duplicate" ? " · tanpa subtitle ganda" : ""}</li>)}</ol>
        {storyIssues.map((i, n) => <small key={n} className={i.level === "error" ? "notice notice-error" : "narrative-reason"} role={i.level === "error" ? "alert" : "status"} data-testid="storyboard-issue">{i.level === "error" ? "Perlu diperbaiki: " : "Saran: "}{i.message}</small>)}
      </details>}
</>
  );
}
