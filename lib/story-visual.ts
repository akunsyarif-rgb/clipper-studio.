// Which 3D-style accent object (from the Story Motion Lab) suits a scene, decided from what the scene is for. Pure and
// deterministic, so the choice can be shown in the storyboard and unit tested. No object is chosen when the scene already
// carries its own picture, a pinned icon, or the editing happens over a source video.
import type { Family, Layout } from "./composition";

export type StoryVisualKind = "orb" | "steps" | "orbit" | "converge";

export const STORY_VISUAL_LABELS: Record<StoryVisualKind, string> = {
  orb: "Titik fokus melayang",
  steps: "Langkah bertumbuh",
  orbit: "Sistem orbit",
  converge: "Satu titik tujuan",
};

export type StoryVisualInput = {
  family: Family;
  layout: Layout;
  role: string;
  template: string;
  /** A picture behind the scene, a pinned icon, or a source video: the scene already has its visual. */
  occupied: boolean;
  /** Process scenes that split into cause and effect already draw their own two-stage diagram. */
  causeEffect: boolean;
};

/**
 * Hook / impact beat → a floating focal point (tension before the idea). A single ordered step → rising steps.
 * A calm reflective beat → an orbit (sustained motion). A resolution or the closing call to action → one point everything
 * converges on. Everything else keeps its own composition untouched.
 */
export function chooseStoryVisual(i: StoryVisualInput): StoryVisualKind | null {
  if (i.occupied) return null;
  if (i.family === "data") return i.template === "cta" ? "converge" : null;
  if (i.family === "process") return i.causeEffect ? null : "steps";
  if (i.family !== "editorial") return null;
  if (i.layout === "impact") return "orb";
  if (i.role === "resolution") return "converge";
  if (i.layout === "quiet-center") return "orbit";
  return null;
}
