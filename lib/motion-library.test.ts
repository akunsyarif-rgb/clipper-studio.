import { beforeEach, describe, expect, it } from "vitest";
import { buildCinematic } from "./cinematic";
import { applyPresetToPlan, builtInPresets, loadPresets, parsePresets, presetFromPlan, savePresets, MAX_PRESETS } from "./motion-library";

const plan = buildCinematic({ product: "Nova", tagline: "Satu ketukan untuk semuanya.", problem: "Terlalu banyak aplikasi.", features: ["Cepat dan responsif.", "Aman sejak awal."], proof: "Dipakai 10.000 tim.", cta: "Coba gratis hari ini.", tone: "keynote", seconds: 30 });
const store: Record<string, string> = {};
beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } }; });

describe("motion library", () => {
  it("offers 2 motion sets, the 4 tones and the 7 content templates", () => {
    const b = builtInPresets(plan.concept);
    expect(b).toHaveLength(13);
    expect(b.filter(p => p.id.startsWith("move:"))).toHaveLength(2);
    expect(b.filter(p => p.id.startsWith("content:"))).toHaveLength(7);
  });
  it("a saved preset applied to another storyboard restores its look and its motion per act", () => {
    const mine = presetFromPlan("Gaya saya", { ...plan, concept: { ...plan.concept, palette: "gold" }, scenes: plan.scenes.map(s => s.act === "feature" ? { ...s, fx: "light-sweep" as const } : s) });
    const other = buildCinematic({ product: "Lain", tone: "energetic", seconds: 30 });
    const out = applyPresetToPlan(other, mine);
    expect(out.concept.palette).toBe("gold");
    expect(out.scenes.filter(s => s.act === "feature").every(s => s.fx === "light-sweep")).toBe(true);
    expect(out.scenes.map(s => s.text)).toEqual(other.scenes.map(s => s.text));
    expect(out.scenes.map(s => s.seconds)).toEqual(other.scenes.map(s => s.seconds));
    expect(Object.keys(out.fxByText)).toHaveLength(out.scenes.length);
  });
  it("a built-in look keeps the storyboard's own motion; morph never opens a film", () => {
    const out = applyPresetToPlan(plan, builtInPresets(plan.concept).find(p => p.id === "content:business-tech")!);
    expect(out.scenes.map(s => s.fx)).toEqual(plan.scenes.map(s => s.fx));
    const morphHook = { id: "mine:x", name: "m", concept: plan.concept, fxByAct: { hook: "morph" as const } };
    expect(applyPresetToPlan(plan, morphHook).scenes[0].fx).toBe("hold-cut");
  });
  it("stores locally, reads back only valid presets, and caps the list", () => {
    const p = presetFromPlan("  Gaya   saya  ", plan);
    expect(p.name).toBe("Gaya saya");
    expect(savePresets([p])).toBe(true);
    expect(loadPresets()).toEqual([p]);
    store["clipper:motion-library:v1"] = JSON.stringify([p, { id: "x", name: "bad" }, { ...p, id: "mine:y", concept: { ...p.concept, palette: "nope" } }, { ...p, id: "mine:z", fxByAct: { hook: "wow" } }]);
    const back = loadPresets();
    expect(back.map(x => x.id)).toEqual([p.id, "mine:z"]);
    expect(back[1].fxByAct).toEqual({});
    expect(parsePresets(Array.from({ length: 50 }, (_, i) => ({ ...p, id: "mine:" + i })))).toHaveLength(MAX_PRESETS);
    store["clipper:motion-library:v1"] = "not json";
    expect(loadPresets()).toEqual([]);
  });
});
