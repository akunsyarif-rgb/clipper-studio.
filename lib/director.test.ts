import { describe, expect, it } from "vitest";
import { directorPrompt, directVideo, parseDirector, planToOverrides, PLAYBOOK, type DirectorInput } from "./director";

const gem = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const input: DirectorInput = {
  scenes: [{ text: "Kamu rugi 80% waktu tiap hari.", seconds: 3 }, { text: "Pilih jalan lama atau jalan baru?", seconds: 3 }, { text: "Ikuti untuk tips berikutnya!", seconds: 2 }],
  videoEdit: false, style: "hybrid", palette: "violet", language: "id",
};

describe("directorPrompt scope", () => {
  it("limits a scoped revision to the named scenes and keeps the script unchanged", () => {
    const p = directorPrompt({ scenes: [{ text: "A.", seconds: 2 }, { text: "B.", seconds: 2 }], videoEdit: false, style: "hybrid", palette: "violet", language: "id", scope: [1], feedback: "scene 2 lebih dinamis" });
    expect(p).toContain("REVISI TERBATAS: ubah HANYA scene dengan index 1");
    expect(p).toContain("Teks naskah tidak boleh berubah");
    expect(directorPrompt({ scenes: [{ text: "A.", seconds: 2 }], videoEdit: false, style: "hybrid", palette: "violet", language: "id" })).not.toContain("REVISI TERBATAS");
  });
});

describe("directorPrompt", () => {
  it("carries the playbook, the allowed options, the creator's feedback and every sentence", () => {
    const p = directorPrompt({ ...input, feedback: "terlalu ramai, lebih tenang" });
    expect(p).toContain(PLAYBOOK[0]);
    expect(p).toMatch(/Opsi gaya \(style\): .*cinematic/);
    expect(p).toMatch(/Opsi ikon .*none|Opsi ikon .*money/);
    expect(p).toContain("terlalu ramai, lebih tenang");
    expect(p).toContain("Kamu rugi 80% waktu tiap hari.");
    expect(p).toContain("jangan isi \"cut\"");
    expect(p).toContain("imageQuery");
  });
  it("adds the selling rules for an affiliate video, and only then", () => {
    const p = directorPrompt({ ...input, affiliate: { product: "Botol Termos Aqualux" } });
    expect(p).toContain("video AFFILIATE");
    expect(p).toContain("Botol Termos Aqualux");
    expect(p).toContain("scene terakhir");
    expect(directorPrompt(input)).not.toContain("AFFILIATE");
  });
  it("asks for screen cuts only when editing over a video", () => {
    expect(directorPrompt({ ...input, videoEdit: true })).toContain("isi juga \"cut\"");
  });
  it("passes the current choices so feedback adjusts instead of restarting", () => {
    const p = directorPrompt({ ...input, current: [{ template: "number", icon: "money" }] });
    expect(p).toContain('"sekarang":{"template":"number","icon":"money"}');
  });
});

describe("parseDirector", () => {
  it("keeps valid choices, drops unknown ones and never invents", () => {
    const plan = parseDirector(gem({ style: "kinetic", palette: "nope", note: "Tegas lalu tenang.", scenes: [
      { index: 0, template: "number", icon: "money", reason: "Angka jadi sorotan", imageIdea: "uang rupiah", imageQuery: "  indonesian\n rupiah money " },
      { index: 1, template: "hologram", icon: "not-an-icon", reason: "x" },
      { index: 9, template: "cta", reason: "di luar" },
    ] }), 3, false);
    expect(plan.style).toBe("kinetic");
    expect(plan.palette).toBeUndefined();
    expect(plan.scenes[0]).toMatchObject({ template: "number", icon: "money", imageIdea: "uang rupiah", imageQuery: "indonesian rupiah money" });
    expect(plan.scenes[1]).toBeUndefined();
    expect(plan.scenes[2]).toBeUndefined();
    expect(plan.note).toBe("Tegas lalu tenang.");
  });
  it("accepts cuts only when editing over a video, and never the 'clip' cut", () => {
    const a = gem({ scenes: [{ index: 0, template: "statement", cut: "graphic", reason: "poin kunci" }, { index: 1, cut: "clip", reason: "x" }] });
    expect(parseDirector(a, 2, true).scenes[0]?.cut).toBe("graphic");
    expect(parseDirector(a, 2, true).scenes[1]).toBeUndefined();
    expect(parseDirector(a, 2, false).scenes[0]?.cut).toBeUndefined();
  });
  it("reads an OpenAI-format answer from a router like OpenRouter, also inside a code fence", () => {
    const body = "```json\n" + JSON.stringify({ scenes: [{ index: 0, template: "quote", reason: "ucapan" }] }) + "\n```";
    const plan = parseDirector({ choices: [{ message: { content: body } }] }, 1, false);
    expect(plan.scenes[0]?.template).toBe("quote");
  });
  it("says so when nothing is usable", () => {
    expect(() => parseDirector(gem({ scenes: [] }), 2, false)).toThrow(/bisa dipakai/);
    expect(() => parseDirector(gem({ nope: 1 }), 2, false)).toThrow(/susunan scene/);
  });
  it("trims overlong reasons", () => {
    const plan = parseDirector(gem({ scenes: [{ index: 0, template: "statement", reason: "a".repeat(300) }] }), 1, false);
    expect(plan.scenes[0]!.reason.length).toBeLessThanOrEqual(80);
  });
});

describe("planToOverrides", () => {
  const texts = input.scenes.map(s => s.text);
  it("turns choices into the studio's overrides keyed by scene text", () => {
    const plan = parseDirector(gem({ scenes: [{ index: 0, template: "number", reason: "a" }, { index: 1, template: "question", icon: "none", reason: "b" }, { index: 2, template: "cta", reason: "c" }] }), 3, false);
    const { overrides } = planToOverrides(plan, texts);
    expect(overrides[texts[0]]).toEqual({ template: "number" });
    expect(overrides[texts[1]]).toEqual({ template: "question", icon: "none" });
    expect(overrides[texts[2]]).toEqual({ template: "cta" });
  });
  it("drops a template the text cannot support", () => {
    const plan = parseDirector(gem({ scenes: [{ index: 1, template: "number", reason: "a" }, { index: 0, template: "compare", reason: "b" }] }), 3, false);
    expect(planToOverrides(plan, texts).overrides).toEqual({});
  });
  it("never opens the video with a call to action, and sets no icon on cta or compare", () => {
    const plan = parseDirector(gem({ scenes: [{ index: 0, template: "cta", icon: "money", reason: "a" }, { index: 2, template: "cta", icon: "money", reason: "b" }] }), 3, false);
    const { overrides } = planToOverrides(plan, texts);
    expect(overrides[texts[0]]).toEqual({ icon: "money" });
    expect(overrides[texts[2]]).toEqual({ template: "cta" });
  });
  it("returns screen cuts per scene text", () => {
    const plan = parseDirector(gem({ scenes: [{ index: 1, template: "statement", cut: "overlay", reason: "a" }] }), 3, true);
    expect(planToOverrides(plan, texts).cuts).toEqual({ [texts[1]]: "overlay" });
  });
});

describe("directVideo", () => {
  it("sends one request with the playbook and returns the parsed plan", async () => {
    let sent = "";
    const fetchImpl = (async (_url: string, init: { body: string }) => { sent = init.body; return new Response(JSON.stringify(gem({ style: "cinematic", palette: "gold", note: "Sinematik.", scenes: [{ index: 0, template: "statement", icon: "none", reason: "tenang" }] })), { status: 200 }); }) as unknown as typeof fetch;
    const plan = await directVideo({ ...input, scenes: [input.scenes[0]] }, { apiKey: "k".repeat(30), model: "m", language: "id", fetchImpl, retryDelaysMs: [] });
    expect(plan.style).toBe("cinematic");
    expect(plan.scenes[0]?.reason).toBe("tenang");
    expect(sent).toContain("Panduan kerja");
    expect(sent).not.toContain("k".repeat(30));
  });
  it("refuses an empty script without calling the service", async () => {
    await expect(directVideo({ ...input, scenes: [] }, { apiKey: "k".repeat(30), model: "m", language: "id" })).rejects.toThrow(/scene/);
  });
});
