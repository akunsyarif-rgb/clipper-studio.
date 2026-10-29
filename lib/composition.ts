import type { NarrativePlan, NarrativeRole } from "./narrative";
import type { SceneVisual } from "./visuals";

export type Family = "editorial" | "kinetic" | "explainer" | "comparison" | "data" | "process" | "metaphor" | "story";

export const FAMILY_LABELS: Record<Family, string> = {
  editorial: "Editorial",
  kinetic: "Kinetic type",
  explainer: "Explainer",
  comparison: "Perbandingan",
  data: "Data / produk",
  process: "Alur / proses",
  metaphor: "Metafora visual",
  story: "Story beats",
};

/** Route meaning to a visual grammar, not just to a style preset. Always retain safe fallbacks for old project JSON. */
export function chooseFamily(visual: SceneVisual, narrative?: Pick<NarrativePlan, "role" | "strategy"> & Partial<Pick<NarrativePlan, "intent">>, fallbackRole: NarrativeRole = "continuation"): Family {
  const role = narrative?.role ?? fallbackRole;
  const strategy = narrative?.strategy;
  const intent = narrative?.intent;

  // Specific data structures take precedence only when the detector supplied the data they need.
  if (visual.template === "number" && visual.number && !visual.number.year) return "data";
  if (visual.template === "cta" && role !== "hook") return "data";
  if (visual.template === "compare" && visual.compare) return "comparison";
  if (intent === "story") return "story";
  if (intent === "cause-effect" || intent === "process" || strategy === "diagram") return "process";
  if (intent === "reflection" || strategy === "metaphor") return "metaphor";
  if (visual.template === "list" || role === "explanation" || role === "application") return "explainer";
  if (role === "tension" || role === "reveal" || intent === "contrast" || intent === "insight") return "kinetic";
  if (strategy === "footage") return "editorial";
  return "editorial";
}

const CAUSE_LINK = /^(karena|sebab|sehingga|akibatnya|maka|jadi|because|so|therefore)$/i;

/** Splits a cause/effect statement without inventing either side. */
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
