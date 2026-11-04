import { describe, expect, it } from "vitest";
import { describePlan, editPrompt, MAX_AGENT_SECONDS, parseEditPlan, planEdit, planIsEmpty } from "./edit-command";
import { resetAiGuards } from "./gemini";

const wrap = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const reply = (obj: unknown) => new Response(JSON.stringify(wrap(obj)), { status: 200 });
const opts = (fn: unknown) => ({ apiKey: "k".repeat(30), model: "openrouter/free", language: "id", fetchImpl: fn as typeof fetch, retryDelaysMs: [] as number[] });
const ctx = { hasTranscript: false, lines: ["Halo semua", "Ini tipsnya"], seconds: 60 };

describe("edit command", () => {
  it("keeps only options that exist and ignores everything else", () => {
    const p = parseEditPlan(wrap({ profile: "komedi", captions: "yes", captionStyle: "pop", overlayPos: "left", density: "rich", brandMotion: "full", unsupported: ["ganti latar"] }));
    expect(p).toMatchObject({ captionStyle: "pop", density: "rich", brandMotion: "full", unsupported: ["ganti latar"] });
    expect(p.profile).toBeUndefined();
    expect(p.captions).toBeUndefined();
    expect(p.overlayPos).toBeUndefined();
  });
  it("needs a transcript when the wish depends on what is said (comedy, animation density, inserts), not for captions alone", () => {
    expect(parseEditPlan(wrap({ captionStyle: "box" })).needsTranscript).toBe(false);
    expect(parseEditPlan(wrap({ profile: "comedy" })).needsTranscript).toBe(true);
    expect(parseEditPlan(wrap({ density: "sparse" })).needsTranscript).toBe(true);
    expect(parseEditPlan(wrap({ inserts: { visuals: [{ term: "Coffee", kind: "video" }, "tree"] } })).needsTranscript).toBe(true);
  });
  it("reads inserts as photo or short clip, deduplicated", () => {
    const p = parseEditPlan(wrap({ inserts: { visuals: [{ term: "Coffee", kind: "video" }, { term: "coffee", kind: "photo" }, "tree", { term: "", kind: "video" }] } }));
    expect(p.inserts?.visuals).toEqual([{ term: "coffee", kind: "video" }, { term: "tree", kind: "photo" }]);
  });
  it("describes the plan in plain words, and an empty plan is recognised", () => {
    const d = describePlan(parseEditPlan(wrap({ profile: "music", captions: false, captionStyle: "pop", overlayPos: "lower", density: "balanced" })));
    expect(d).toEqual(expect.arrayContaining(["Profil editing: Musik / ritme", "Subtitle: mati", "Gaya subtitle: Pop (viral)", "Posisi animasi: bawah (di atas subtitle)", "Banyak animasi: Seimbang"]));
    expect(planIsEmpty(parseEditPlan(wrap({ unsupported: ["hapus orang"] })))).toBe(true);
  });
  it("sends the lines of the video only when there is a transcript, and tells the model not to pretend", () => {
    expect(editPrompt("buat lucu", { ...ctx, hasTranscript: true })).toMatch(/Halo semua/);
    expect(editPrompt("buat lucu", ctx)).not.toMatch(/Halo semua/);
    expect(editPrompt("buat lucu", ctx)).toMatch(/Jangan pura-pura bisa/);
  });
  it("makes one AI call, caches the same command, and refuses a short command or a video over 3 minutes without calling", async () => {
    resetAiGuards();
    let calls = 0;
    const fn = async () => { calls++; return reply({ captionStyle: "pop" }); };
    expect((await planEdit("subtitle gaya pop saja", ctx, opts(fn))).captionStyle).toBe("pop");
    await planEdit("subtitle gaya pop saja", ctx, opts(fn));
    expect(calls).toBe(1);
    await expect(planEdit("lucu", ctx, opts(fn))).rejects.toMatchObject({ kind: "format" });
    await expect(planEdit("subtitle gaya pop saja", { ...ctx, seconds: MAX_AGENT_SECONDS + 1 }, opts(fn))).rejects.toMatchObject({ kind: "format" });
    expect(calls).toBe(1);
  });
});
