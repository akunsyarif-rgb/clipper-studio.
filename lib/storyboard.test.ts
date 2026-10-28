import { describe, expect, it } from "vitest";
import { buildStoryboard, validateExport, validateStoryboard } from "./storyboard";
import { planNarrative } from "./narrative";
import { buildTimeline, type Scene } from "./script";

const FIVE = ["Jangan tunggu semangat datang.", "Mulailah, meski langkahmu kecil.", "Disiplin membuatmu tetap bergerak.", "Satu langkah hari ini lebih baik dari rencana sempurna.", "Mulai sekarang."];
function scenes(texts: string[]): Scene[] {
  const t = buildTimeline(texts.join(" "), { kind: "target", seconds: 20 });
  if (!t.ok) throw new Error(t.error);
  const n = planNarrative(t.scenes.map(s => s.text));
  return t.scenes.map((s, i) => ({ ...s, narrative: n[i] }));
}

describe("storyboard for the five-scene sample", () => {
  const sb = buildStoryboard(scenes(FIVE), { captions: true });
  it("keeps narration whole and maps each scene to a purposeful composition", () => {
    expect(sb.scenes.map(s => s.narrationText)).toEqual(FIVE);
    expect(sb.scenes.map(s => `${s.family}/${s.layout}`)).toEqual(["editorial/impact", "editorial/quiet-center", "editorial/quiet-offset", "comparison/standard", "data/standard"]);
    expect(sb.scenes.map(s => s.continuity)).toEqual(["start", "reset", "reset", "reset", "reset"]);
  });
  it("never adds a second caption bar to text scenes", () => {
    expect(new Set(sb.scenes.map(s => s.captionPolicy))).toEqual(new Set(["suppressed-duplicate"]));
    expect(buildStoryboard(scenes(FIVE), { captions: true, videoEdit: true }).scenes[0].captionPolicy).toBe("phrase");
  });
  it("passes validation, with matching audio length", () => {
    expect(validateStoryboard(sb)).toEqual([]);
    expect(validateStoryboard(sb, { audioSeconds: sb.totalFrames / sb.fps })).toEqual([]);
  });
});

describe("validateStoryboard", () => {
  const base = (texts: string[]) => buildStoryboard(scenes(texts));
  const codes = (texts: string[]) => validateStoryboard(base(texts)).map(i => i.code);
  it("flags production notes that would be spoken", () => {
    expect(codes(["Halo semua.", "[musik naik pelan] Kita mulai.", "Scene 3: tampilkan logo."])).toEqual(["PRODUCTION_NOTE"]);
  });
  it("flags repeated narration", () => {
    expect(codes(["Mulai hari ini.", "Terus bergerak.", "Mulai hari ini!"])).toContain("DUPLICATE_NARRATION");
  });
  it("flags identical composition three times and total lack of variation", () => {
    const c = codes(["Satu hal penting.", "Dua hal baik.", "Tiga hal tenang.", "Empat hal lama."]);
    expect(c).toContain("REPEATED_COMPOSITION");
  });
  it("flags a missing picture and an audio mismatch", () => {
    const sc = scenes(FIVE); sc[1] = { ...sc[1], image: "blob:gone" };
    const sb = buildStoryboard(sc, { missingImages: new Set(["blob:gone"]) });
    const issues = validateStoryboard(sb, { audioSeconds: 30 });
    expect(issues.map(i => i.code)).toEqual(expect.arrayContaining(["MISSING_ASSET", "DURATION_MISMATCH"]));
    expect(issues.every(i => i.level === "error")).toBe(true);
  });
  it("only suggests, never blocks, for a short scene that exact timing produced", () => {
    const sc = scenes(FIVE); sc[4] = { ...sc[4], durationInFrames: 34 };
    const issues = validateStoryboard(buildStoryboard(sc));
    expect(issues.map(i => [i.code, i.level])).toEqual([["TOO_SHORT", "warning"]]);
  });
  it("reports no scenes", () => { expect(validateStoryboard(buildStoryboard([]))[0].code).toBe("NO_SCENES"); });
});

describe("validateExport", () => {
  const sb = buildStoryboard(scenes(FIVE));
  it("accepts a correct file and rejects empty, wrong-size and wrong-length output", () => {
    const secs = sb.totalFrames / sb.fps;
    expect(validateExport(sb, { bytes: 10, width: 1080, height: 1920, seconds: secs })).toEqual([]);
    expect(validateExport(sb, { bytes: 0 }).map(i => i.code)).toEqual(["EXPORT_EMPTY"]);
    expect(validateExport(sb, { bytes: 1, width: 720, height: 1280 }).map(i => i.code)).toEqual(["EXPORT_SIZE"]);
    expect(validateExport(sb, { bytes: 1, seconds: secs + 3 }).map(i => i.code)).toEqual(["EXPORT_DURATION"]);
  });
});
