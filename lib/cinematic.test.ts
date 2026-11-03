import { describe, expect, it } from "vitest";
import { fxChoices, isFx, beatDurations, beatMap, buildCinematic, chooseFx, FX_IDS, fxFrame, parsePolish, polishCinematic, validateCinematic, type Act } from "./cinematic";
import { buildTimeline, FPS, MIN_SCENE_SECONDS, splitScript } from "./script";

const brief = { product: "Nova", tagline: "Satu ketukan untuk semuanya.", problem: "Terlalu banyak aplikasi.", features: ["Cepat dan responsif.", "Aman sejak awal.", "Ringan di perangkat apa pun."], proof: "Dipakai 10.000 tim.", cta: "Coba gratis hari ini.", tone: "keynote" as const, seconds: 30 };

describe("motion presets", () => {
  it("every preset is deterministic, finite and starts moving at frame 0 (hook within 1.5 s)", () => {
    for (const id of FX_IDS) {
      const a = fxFrame(id, 0, 90), b = fxFrame(id, 0, 90);
      expect(a).toEqual(b);
      for (const f of [0, 10, 45, 89]) Object.values(fxFrame(id, f, 90)).forEach(v => expect(Number.isFinite(v)).toBe(true));
      expect(fxFrame(id, 0, 90).opacity).toBeGreaterThanOrEqual(0);
    }
  });
  it("settles to a clean frame: no blur and full opacity after the entrance", () => {
    for (const id of FX_IDS) { const f = fxFrame(id, 60, 90); expect(f.blur).toBeCloseTo(0, 5); expect(f.opacity).toBe(1); }
  });
  it("morph starts large and blurred (continuity), keynote reveal starts small", () => {
    expect(fxFrame("morph", 0, 90)).toMatchObject({ scale: 1.35, opacity: 1 });
    expect(fxFrame("keynote-reveal", 0, 90).scale).toBeLessThan(1);
  });
});

describe("signature presets", () => {
  it("flood opens on a full black frame and contracts to nothing; page push slides in from the right and settles; mask rise reveals from a line", () => {
    expect(fxFrame("flood", 0, 90).flood).toBe(1);
    expect(fxFrame("flood", 30, 90).flood).toBe(0);
    expect(fxFrame("flood", 10, 90).flood).toBeGreaterThan(0);
    expect(fxFrame("page-push", 0, 90).x).toBe(900);
    expect(fxFrame("page-push", 40, 90).x).toBe(0);
    const r = fxFrame("blur-rise", 0, 90);
    expect(r.reveal).toBeLessThan(1); expect(r.y).toBeGreaterThan(100);
    expect(fxFrame("blur-rise", 40, 90)).toMatchObject({ reveal: 1, y: 0 });
  });
  it("no preset blurs or fades the scene in (the keynote direction); only the old ones may", () => {
    for (const id of ["keynote-reveal", "blur-rise", "page-push", "flood", "hold-cut", "liquid-glass"] as const) for (const f of [0, 3, 8, 15]) expect(fxFrame(id, f, 90).blur).toBe(0);
    expect(fxFrame("keynote-reveal", 8, 90).opacity).toBe(1);
    for (const id of ["blur-rise", "page-push", "flood", "hold-cut", "liquid-glass"] as const) expect(fxFrame(id, 0, 90).opacity).toBe(1);
  });
  it("overshoot pop: keynote reveal passes full size a little, then settles", () => {
    const peak = Math.max(...Array.from({ length: 24 }, (_, f) => fxFrame("keynote-reveal", f, 3000).scale));
    expect(peak).toBeGreaterThan(1.0); expect(peak).toBeLessThan(1.1);
  });
  it("storyboards only pick current presets; legacy ones stay valid and are kept in a picker only when used", () => {
    const p = buildCinematic(brief);
    const legacy = ["morph", "parallax-push", "light-sweep"];
    expect(p.scenes.every(s => !legacy.includes(s.fx))).toBe(true);
    expect(fxChoices().map(f => f.id)).not.toContain("morph");
    expect(fxChoices("morph").map(f => f.id)).toContain("morph");
    for (const id of legacy) expect(isFx(id)).toBe(true);
  });
});

describe("beat map and storyboard", () => {
  it("scene lengths are whole beats, fill the video, and respect the minimum scene length", () => {
    const m = beatMap(30, "sinematik");
    const d = beatDurations([1, 2, 3, 1], 30, m);
    d.forEach(x => { expect(x).toBeGreaterThanOrEqual(MIN_SCENE_SECONDS); expect(Math.abs(x / m.beat - Math.round(x / m.beat))).toBeLessThan(1e-9); });
    expect(Math.abs(d.reduce((a, b) => a + b, 0) - 30)).toBeLessThan(m.beat);
  });
  it("builds hook -> problem -> reveal -> features -> proof -> cta from a brief, deterministically", () => {
    const p = buildCinematic(brief);
    expect(p.scenes.map(s => s.act)).toEqual(["hook", "problem", "reveal", "feature", "feature", "feature", "proof", "cta"]);
    expect(buildCinematic(brief)).toEqual(p);
    expect(p.script.split("\n")).toHaveLength(p.scenes.length);
    expect(validateCinematic(p, { hasMusic: true }).filter(i => i.level === "error")).toEqual([]);
  });
  it("a product name alone still makes a complete film", () => {
    const p = buildCinematic({ product: "Nova" });
    expect(p.scenes[0].act).toBe("hook");
    expect(p.scenes.at(-1)!.act).toBe("cta");
    expect(validateCinematic(p, { hasMusic: true }).filter(i => i.level === "error")).toEqual([]);
  });
  it("never repeats a preset back to back, never morphs the first scene, and avoids glass when the concept forbids it", () => {
    const acts: Act[] = ["hook", "feature", "feature", "feature", "feature", "feature", "cta"];
    const fx = chooseFx(acts, true);
    fx.forEach((f, i) => { if (i > 0) expect(f).not.toBe(fx[i - 1]); });
    expect(fx[0]).not.toBe("morph");
    expect(chooseFx(acts, false)).not.toContain("liquid-glass");
  });
  it("its script becomes a real timeline whose scenes match the plan (fixed exact lengths)", () => {
    const p = buildCinematic(brief);
    const t = buildTimeline(p.script, { kind: "scenes", seconds: p.scenes.map(s => s.seconds), exact: true }, FPS);
    expect(t.ok).toBe(true);
    expect(splitScript(p.script)).toEqual(p.scenes.map(s => s.text));
    if (t.ok) {
      expect(t.scenes.map(s => s.text)).toEqual(p.scenes.map(s => s.text));
      expect(validateCinematic(p, { hasMusic: true, frames: t.scenes.map(s => s.durationInFrames) }).filter(i => /meleset/.test(i.message)).length).toBeLessThanOrEqual(p.scenes.length);
    }
  });
});

describe("validation", () => {
  it("flags a missing cta, a first-scene morph, repeated glass and no music", () => {
    const p = buildCinematic(brief);
    const bad = { ...p, scenes: p.scenes.slice(0, -1).map((s, i) => i === 0 ? { ...s, fx: "morph" as const } : s) };
    const msgs = validateCinematic(bad).map(i => i.message).join(" | ");
    expect(msgs).toMatch(/ditutup dengan ajakan/);
    expect(msgs).toMatch(/Morph tidak bisa/);
    expect(msgs).toMatch(/Belum ada musik/);
    const glass = { ...p, scenes: p.scenes.map(s => ({ ...s, fx: "liquid-glass" as const })) };
    expect(validateCinematic(glass, { hasMusic: true }).map(i => i.message).join(" ")).toMatch(/Tiga adegan kaca/);
  });
});

describe("AI polish (wording only)", () => {
  const p = buildCinematic(brief);
  const reply = (lines: string[]) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lines }) }] } }] }), { status: 200 });
  const opts = (fn: typeof fetch) => ({ apiKey: "k".repeat(30), model: "m", language: "id", fetchImpl: fn, retryDelaysMs: [] as number[] });
  it("keeps structure, presets and lengths; only the lines change", async () => {
    const out = await polishCinematic(p, opts((async () => reply(p.scenes.map((_, i) => `Baris baru ${i}`))) as unknown as typeof fetch));
    expect(out.scenes.map(s => [s.act, s.fx, s.seconds])).toEqual(p.scenes.map(s => [s.act, s.fx, s.seconds]));
    expect(out.scenes[0].text).toBe("Baris baru 0");
    expect(out.fxByText["Baris baru 3"]).toBe(p.scenes[3].fx);
  });
  it("rejects a wrong number of lines, so the deterministic plan stays", async () => {
    expect(() => parsePolish({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lines: ["a"] }) }] } }] }, 3)).toThrow();
    await expect(polishCinematic(p, opts((async () => reply(["x"])) as unknown as typeof fetch))).rejects.toMatchObject({ kind: "format" });
  });
});

describe("saving a plan with the session", () => {
  it("restores the same storyboard, presets and lengths from what was saved", async () => {
    const { restoreCine, saveCine } = await import("./cinematic");
    const p = buildCinematic(brief);
    const back = restoreCine(JSON.parse(JSON.stringify(saveCine({ plan: p, fx: p.fxByText }))))!;
    expect(back).not.toBeNull();
    expect(back.plan.scenes.map(s => [s.text, s.fx, s.seconds])).toEqual(p.scenes.map(s => [s.text, s.fx, s.seconds]));
    expect(back.plan.map.bpm).toBe(p.map.bpm);
    expect(back.plan.brief).toEqual(p.brief);
    expect(back.plan.scenes.map(s => s.act)).toEqual(p.scenes.map(s => s.act));
  });
  it("restores legacy sessions that predate full brief and act persistence", async () => {
    const { restoreCine, saveCine } = await import("./cinematic");
    const p = buildCinematic(brief);
    const legacy = saveCine({ plan: p, fx: p.fxByText });
    delete legacy.brief;
    delete legacy.acts;
    const back = restoreCine(JSON.parse(JSON.stringify(legacy)))!;
    expect(back.plan.brief.product).toBe("");
    expect(back.plan.scenes.map(s => s.act)).toEqual(p.scenes.map((s, i) => i === 0 ? "hook" : i === p.scenes.length - 1 ? "cta" : "feature"));
  });
  it("refuses a saved plan that no longer fits its script", async () => {
    const { restoreCine, saveCine } = await import("./cinematic");
    const p = buildCinematic(brief);
    expect(restoreCine({ ...saveCine({ plan: p, fx: p.fxByText }), seconds: [3] })).toBeNull();
  });
});
