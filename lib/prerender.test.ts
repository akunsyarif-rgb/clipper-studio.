import { describe, expect, it } from "vitest";
import { hasCtaWords, prerenderChecks, sceneIsTooFast, type PrerenderInput } from "./prerender";

const base: PrerenderInput = { hasMusic: true, hasVoice: false, hasSourceAudio: false, scenes: [{ text: "Kopi enak di pagi hari.", seconds: 3 }, { text: "Pesan sekarang.", seconds: 2.5 }], totalSeconds: 20, durationAdjustable: true, closesWithCta: false };
const ids = (i: PrerenderInput, level: "ok" | "warn") => prerenderChecks(i).filter(c => c.level === level).map(c => c.id);

describe("pre-render checks", () => {
  it("everything fine: four checks, all ok, no fix offered", () => {
    const c = prerenderChecks(base);
    expect(c.map(x => x.id)).toEqual(["sound", "scene-length", "cta", "length"]);
    expect(c.every(x => x.level === "ok" && !x.fix)).toBe(true);
  });
  it("no sound at all offers default music; a voice, music or the source video's own sound counts", () => {
    const none = prerenderChecks({ ...base, hasMusic: false });
    expect(none[0]).toMatchObject({ level: "warn", fix: { id: "music", label: "Tambah musik default" } });
    for (const o of [{ hasVoice: true }, { hasSourceAudio: true }]) expect(prerenderChecks({ ...base, hasMusic: false, ...o })[0].level).toBe("ok");
  });
  it("scenes that flash past are named and can be fixed only when the length is adjustable", () => {
    const fast = { ...base, scenes: [{ text: "Satu dua tiga empat lima enam tujuh delapan.", seconds: 1.3 }, { text: "Pesan sekarang.", seconds: 2.5 }] };
    const c = prerenderChecks(fast).find(x => x.id === "scene-length")!;
    expect(c).toMatchObject({ level: "warn", title: "1 adegan terlalu cepat", fix: { id: "duration", label: "Sesuaikan durasi minimal" } });
    expect(c.detail).toMatch(/Adegan 1/);
    expect(prerenderChecks({ ...fast, durationAdjustable: false }).find(x => x.id === "scene-length")!.fix).toBeUndefined();
    expect(sceneIsTooFast({ text: "Halo.", seconds: 1.2 })).toBe(true);
    expect(sceneIsTooFast({ text: "Halo.", seconds: 2 })).toBe(false);
  });
  it("a closing line without an invitation offers to add one; a cinematic film always has one", () => {
    const no = { ...base, scenes: [{ text: "Kopi enak di pagi hari.", seconds: 3 }, { text: "Seduh dengan air panas.", seconds: 3 }] };
    expect(prerenderChecks(no).find(x => x.id === "cta")).toMatchObject({ level: "warn", fix: { id: "cta", label: "Tambah ajakan di akhir" } });
    expect(prerenderChecks({ ...no, closesWithCta: true }).find(x => x.id === "cta")!.level).toBe("ok");
    expect(hasCtaWords("Follow untuk tips lainnya")).toBe(true);
    expect(hasCtaWords("Seduh dengan air panas.")).toBe(false);
  });
  it("very short and long videos get a plain note, never a block", () => {
    expect(ids({ ...base, totalSeconds: 4 }, "warn")).toEqual(["length"]);
    expect(ids({ ...base, totalSeconds: 120 }, "warn")).toEqual(["length"]);
  });
});
