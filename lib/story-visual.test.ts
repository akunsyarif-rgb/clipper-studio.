import { describe, expect, it } from "vitest";
import { chooseStoryVisual, STORY_VISUAL_LABELS, type StoryVisualInput } from "./story-visual";
import { buildStoryboard } from "./storyboard";
import { planNarrative } from "./narrative";
import { buildTimeline, type Scene } from "./script";

const base: StoryVisualInput = { family: "editorial", layout: "standard", role: "continuation", template: "statement", occupied: false, causeEffect: false };
const pick = (over: Partial<StoryVisualInput>) => chooseStoryVisual({ ...base, ...over });

describe("chooseStoryVisual", () => {
  it("gives each kind of beat the object that suits its job", () => {
    expect(pick({ layout: "impact", role: "hook" })).toBe("orb");
    expect(pick({ family: "process" })).toBe("steps");
    expect(pick({ layout: "quiet-center" })).toBe("orbit");
    expect(pick({ layout: "quiet-center", role: "resolution" })).toBe("converge");
    expect(pick({ family: "data", template: "cta", role: "application" })).toBe("converge");
  });
  it("leaves the rest of the compositions alone", () => {
    expect(pick({ family: "comparison", template: "compare" })).toBeNull();
    expect(pick({ family: "kinetic" })).toBeNull();
    expect(pick({ family: "explainer" })).toBeNull();
    expect(pick({ family: "data", template: "number" })).toBeNull();
    expect(pick({ layout: "quiet-offset" })).toBeNull();
    expect(pick({ family: "process", causeEffect: true })).toBeNull();
  });
  it("steps aside when the scene already has its own picture or pinned icon", () => {
    expect(pick({ layout: "impact", role: "hook", occupied: true })).toBeNull();
    expect(pick({ family: "process", occupied: true })).toBeNull();
  });
  it("has a label for every kind (shown in the storyboard)", () => {
    for (const k of ["orb", "steps", "orbit", "converge"] as const) expect(STORY_VISUAL_LABELS[k].length).toBeGreaterThan(3);
  });
});

describe("accent objects in the storyboard", () => {
  const texts = ["Jangan tunggu semangat datang.", "Mulailah, meski langkahmu kecil.", "Disiplin membuatmu tetap bergerak.", "Satu langkah hari ini lebih baik dari rencana sempurna.", "Mulai sekarang."];
  const scenes = (): Scene[] => {
    const t = buildTimeline(texts.join(" "), { kind: "target", seconds: 20 });
    if (!t.ok) throw new Error(t.error);
    const n = planNarrative(t.scenes.map(s => s.text));
    return t.scenes.map((s, i) => ({ ...s, narrative: n[i] }));
  };
  it("plans the five-scene sample: focal point, none, orbit, none, converging point", () => {
    expect(buildStoryboard(scenes()).scenes.map(s => s.accent)).toEqual(["orb", null, "orbit", null, "converge"]);
  });
  it("plans none when switched off, over a source video, or for a scene with a picture", () => {
    expect(buildStoryboard(scenes(), { storyVisuals: false }).scenes.every(s => s.accent === null)).toBe(true);
    expect(buildStoryboard(scenes(), { videoEdit: true }).scenes.every(s => s.accent === null)).toBe(true);
    const withPicture = scenes(); withPicture[0] = { ...withPicture[0], image: "blob:x" };
    expect(buildStoryboard(withPicture).scenes[0].accent).toBeNull();
  });
});
