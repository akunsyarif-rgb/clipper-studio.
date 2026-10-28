// Picks one of five composition families for a scene from its narrative role, visual strategy and
// detected visual. Pure and deterministic, so the choice can be shown in the UI and unit tested.
import type { NarrativePlan, NarrativeRole } from "./narrative";
import type { SceneVisual } from "./visuals";

export type Family = "editorial" | "kinetic" | "explainer" | "comparison" | "data";

export const FAMILY_LABELS: Record<Family, string> = {
  editorial: "Editorial",
  kinetic: "Kinetic type",
  explainer: "Explainer",
  comparison: "Perbandingan",
  data: "Data / produk",
};

/**
 * Data first (a number or call-to-action needs its own stage), then a real two-sided comparison,
 * then structure (steps, cause → effect, applied actions), then contrast/insight beats as selective
 * kinetic emphasis. Hooks, reflections and conclusions stay editorial.
 */
export function chooseFamily(visual: SceneVisual, narrative?: Pick<NarrativePlan, "role" | "strategy">, fallbackRole: NarrativeRole = "continuation"): Family {
  const role = narrative?.role ?? fallbackRole;
  const strategy = narrative?.strategy;
  if (visual.template === "number" && visual.number && !visual.number.year) return "data";
  if (visual.template === "cta" && role !== "hook") return "data";
  if (visual.template === "compare" && visual.compare) return "comparison";
  if (visual.template === "list" || strategy === "diagram" || role === "explanation" || role === "application") return "explainer";
  if (role === "tension" || role === "reveal") return "kinetic";
  return "editorial";
}

const CAUSE_LINK = /^(karena|sebab|sehingga|akibatnya|maka|jadi|because|so|therefore)$/i;

/**
 * Splits "A karena B" / "A sehingga B" into two blocks for a cause → effect diagram.
 * Returns null unless both sides keep at least two words, so the diagram never shows fragments.
 */
export function splitCause(text: string): { before: string; link: string; after: string } | null {
  const words = text.split(/\s+/).filter(Boolean);
  for (let i = 2; i < words.length - 1; i++) {
    const w = words[i].replace(/[,.;:]$/, "");
    if (!CAUSE_LINK.test(w)) continue;
    const before = words.slice(0, i).join(" ").replace(/[,;:]$/, "");
    const after = words.slice(i + 1).join(" ");
    if (words.length - i - 1 >= 2) return { before, link: w.toLowerCase(), after };
  }
  return null;
}

/**
 * Editorial scenes are not one template: the layout follows the scene's job. A hook or impact beat
 * gets oversized type with no furniture; calm beats are quiet, and adjacent calm beats alternate
 * between a centred and an offset layout so a run of reflective lines never repeats the same picture.
 */
export type Layout = "standard" | "impact" | "quiet-center" | "quiet-offset";

export function planLayouts(scenes: { family: Family; role: NarrativeRole; intensity?: NarrativePlan["intensity"] }[]): Layout[] {
  const out: Layout[] = [];
  scenes.forEach((s, i) => {
    if (s.family !== "editorial") { out.push("standard"); return; }
    if (s.role === "hook" || s.intensity === "impact") { out.push("impact"); return; }
    if (s.role === "resolution") { out.push("quiet-center"); return; }
    out.push(out[i - 1] === "quiet-center" ? "quiet-offset" : "quiet-center");
  });
  return out;
}
