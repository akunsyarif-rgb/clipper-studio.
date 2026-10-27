import { describe, expect, it } from "vitest";
import {
  applyCleanup, changedLines, cleanKey, cleanupLines, cleanupPrompt, clearGeminiSettings, DEFAULT_GEMINI_MODEL, GEMINI_ENDPOINT, GeminiError, lineSimilarity,
  loadGeminiSettings, maskKey, parseLines, saveGeminiSettings,
} from "./gemini";
import { allWords, transcriptFromWords } from "./transcript";

const KEY = "AIzaSyFAKE_KEY_FOR_TESTS_0123456789abcd";
const reply = (lines: unknown, extra: object = {}) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lines }) }] }, ...extra }] });
const ok = (json: unknown): Response => new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status: number, error: object): Response => new Response(JSON.stringify({ error }), { status });
type Call = { url: string; init: RequestInit };
const fakeFetch = (...responses: (Response | Error)[]) => {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fn, calls };
};
const opts = (fn: typeof fetch) => ({ apiKey: KEY, model: "gemini-test", language: "id", fetchImpl: fn });

describe("settings stay on this device", () => {
  const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
  it("saves, loads and forgets", () => {
    const s = store();
    expect(loadGeminiSettings(s)).toBeNull();
    expect(saveGeminiSettings({ apiKey: KEY, model: "m", consent: true }, s)).toBe(true);
    expect(loadGeminiSettings(s)).toEqual({ apiKey: KEY, model: "m", consent: true });
    clearGeminiSettings(s);
    expect(loadGeminiSettings(s)).toBeNull();
  });
  it("ignores damaged data and a missing agreement", () => {
    const s = store();
    s.setItem("clipper:gemini:v1", "not json"); expect(loadGeminiSettings(s)).toBeNull();
    s.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: KEY, model: "m", consent: false })); expect(loadGeminiSettings(s)).toBeNull();
    s.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "short", model: "m", consent: true })); expect(loadGeminiSettings(s)).toBeNull();
  });
  it("copes with storage that is missing or refuses", () => {
    expect(loadGeminiSettings(undefined)).toBeNull();
    expect(saveGeminiSettings({ apiKey: KEY, model: "m", consent: true }, { getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem: () => undefined })).toBe(false);
  });
  it("accepts a trimmed key and refuses a paste mistake", () => {
    expect(cleanKey(`  ${KEY}\n`)).toBe(KEY);
    expect(cleanKey("AIza short")).toBeNull();
    expect(cleanKey(`${KEY} ${KEY}`)).toBeNull();
    expect(cleanKey("")).toBeNull();
  });
  it("masks a key so it can be recognised but not used", () => {
    expect(maskKey(KEY)).toBe("AIza••••abcd");
    expect(maskKey("abc")).toBe("••••");
    expect(maskKey(KEY)).not.toContain(KEY.slice(6, 20));
  });
});

describe("the request", () => {
  it("posts the lines to the chosen model, the key in a header and never in the address", async () => {
    const { fn, calls } = fakeFetch(ok(reply(["Halo dunia"])));
    await cleanupLines(["Halo dunya"], opts(fn));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${GEMINI_ENDPOINT}/gemini-test:generateContent`);
    expect(calls[0].url).not.toContain(KEY);
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.temperature).toBeLessThanOrEqual(0.3);
    expect(body.contents[0].parts[0].text).toContain(JSON.stringify(["Halo dunya"]));
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
  it("asks for the same number of lines and to keep the speaker's words", () => {
    const p = cleanupPrompt(["a", "b"], "id");
    expect(p).toContain("persis sama");
    expect(p).toContain("bahasa Indonesia");
    expect(cleanupPrompt(["a"], "en")).toContain("bahasa Inggris");
  });
  it("encodes the model name and does not call for nothing", async () => {
    const { fn, calls } = fakeFetch(ok(reply(["x"])));
    await cleanupLines(["x"], { ...opts(fn), model: "models/odd name" });
    expect(calls[0].url).toContain("models%2Fodd%20name");
    expect(await cleanupLines([], opts(fn))).toEqual([]);
    expect(calls).toHaveLength(1);
  });
  it("has a default model", () => { expect(DEFAULT_GEMINI_MODEL).toMatch(/^gemini/); });
});

describe("the answer", () => {
  it("returns the corrected lines", async () => {
    expect(await cleanupLines(["a", "b"], opts(fakeFetch(ok(reply(["A", "B"]))).fn))).toEqual(["A", "B"]);
  });
  it("reads JSON inside a code fence and a bare array", () => {
    const fenced = { candidates: [{ content: { parts: [{ text: "```json\n{\"lines\":[\"x\"]}\n```" }] } }] };
    expect(parseLines(fenced, 1)).toEqual(["x"]);
    expect(parseLines({ candidates: [{ content: { parts: [{ text: "[\"x\",\"y\"]" }] } }] }, 2)).toEqual(["x", "y"]);
  });
  it("retries once when the number of lines is wrong, then gives up", async () => {
    const good = fakeFetch(ok(reply(["only one"])), ok(reply(["a", "b"])));
    expect(await cleanupLines(["1", "2"], opts(good.fn))).toEqual(["a", "b"]);
    expect(good.calls).toHaveLength(2);
    const bad = fakeFetch(ok(reply(["x"])), ok(reply(["y"])));
    await expect(cleanupLines(["1", "2"], opts(bad.fn))).rejects.toMatchObject({ kind: "format", message: expect.stringContaining("seharusnya 2") });
  });
  it("rejects answers that are not lines", () => {
    expect(() => parseLines({ candidates: [] }, 1)).toThrow(GeminiError);
    expect(() => parseLines({ candidates: [{ content: { parts: [{ text: "bukan json" }] } }] }, 1)).toThrow(/JSON/);
    expect(() => parseLines({ candidates: [{ content: { parts: [{ text: "{\"lines\":[1,2]}" }] } }] }, 2)).toThrow(/daftar baris/);
  });
  it("reports a block by the safety filter", () => {
    expect(() => parseLines({ promptFeedback: { blockReason: "SAFETY" } }, 1)).toThrow(expect.objectContaining({ kind: "blocked" }));
    expect(() => parseLines(reply(["x"], { finishReason: "SAFETY" }), 1)).toThrow(expect.objectContaining({ kind: "blocked" }));
  });
});

describe("what went wrong, in words, and never with the key", () => {
  const kind = async (res: Response | Error) => cleanupLines(["a"], opts(fakeFetch(res, res instanceof Response ? res.clone() : res).fn)).then(() => "ok", (e: GeminiError) => e);
  it("names a bad key, a missing model, a used-up quota and a server problem", async () => {
    expect(await kind(fail(400, { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." }))).toMatchObject({ kind: "key" });
    expect(await kind(fail(403, { status: "PERMISSION_DENIED", message: "x" }))).toMatchObject({ kind: "key" });
    expect(await kind(fail(404, { status: "NOT_FOUND", message: "models/x is not found for API version" }))).toMatchObject({ kind: "model" });
    expect(await kind(fail(429, { status: "RESOURCE_EXHAUSTED", message: "quota" }))).toMatchObject({ kind: "quota" });
    expect(await kind(fail(503, { message: "overloaded" }))).toMatchObject({ kind: "server" });
    expect(await kind(fail(400, { status: "INVALID_ARGUMENT", message: "bad request" }))).toMatchObject({ kind: "format" });
  });
  it("names a network failure and an answer that is not JSON at all", async () => {
    expect(await kind(new TypeError("Failed to fetch"))).toMatchObject({ kind: "network" });
    expect(await kind(new Response("<html>gateway</html>", { status: 502 }))).toMatchObject({ kind: "server" });
  });
  it("never puts the key in a message", async () => {
    for (const r of [fail(403, { message: `key ${KEY} rejected` }), new TypeError(`fetch ${KEY}`), fail(429, { message: KEY })]) {
      const e = await kind(r);
      expect(e instanceof GeminiError ? e.message : "").not.toContain(KEY);
    }
  });
  it("stops when asked, and when it takes too long", async () => {
    const ctl = new AbortController();
    const slow = (async (_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    const p = cleanupLines(["a"], { ...opts(slow), signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ kind: "timeout", message: "Dibatalkan." });
    await expect(cleanupLines(["a"], { ...opts(slow), timeoutMs: 10 })).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("what changed", () => {
  it("measures how much of a line is the same words", () => {
    expect(lineSimilarity("halo semuanya apa kabar", "Halo semuanya, apa kabar?")).toBe(1);
    expect(lineSimilarity("aplun di tiktok", "aplikasi di tiktok")).toBeCloseTo(2 / 3, 5);
    expect(lineSimilarity("a b c d", "w x y z")).toBe(0);
    expect(lineSimilarity("", "")).toBe(1);
  });
  it("lists only real changes, ignoring spacing, and marks a rewrite as large", () => {
    const before = ["Halo  dunia", "aplun di tiktok", "satu dua tiga empat", "tetap sama"];
    const after = ["Halo dunia", "aplikasi di TikTok", "lima enam tujuh delapan", ""];
    const c = changedLines(before, after);
    expect(c.map(x => x.index)).toEqual([1, 2]);
    expect(c[0].large).toBe(false);
    expect(c[1].large).toBe(true);
  });
  it("lists nothing when nothing changed", () => {
    expect(changedLines(["a b", "c d"], ["a b", "c d"])).toEqual([]);
  });
});

describe("applyCleanup keeps the timing of the speech", () => {
  const t = transcriptFromWords([
    { text: " Aplun", timestamp: [0.2, 0.7] }, { text: " di", timestamp: [0.7, 0.9] }, { text: " TikTok.", timestamp: [0.9, 1.6] },
    { text: " lu", timestamp: [3, 3.2] }, { text: " mikro", timestamp: [3.2, 3.8] }, { text: " gitu", timestamp: [3.8, 4.2] },
  ], 5, "id");
  const lines = t.segments.map(s => s.text);

  it("gives the same word count the same times, with the new text", () => {
    const c = changedLines(lines, ["Aplikasi di TikTok.", lines[1]]);
    const out = applyCleanup(t, c, new Set([0]));
    expect(out.segments[0].text).toBe("Aplikasi di TikTok.");
    expect(out.segments[0].words.map(w => w.start)).toEqual(t.segments[0].words.map(w => w.start));
    expect(out.segments[0].words.map(w => w.text)).toEqual(["Aplikasi", "di", "TikTok."]);
    expect(out.segments[1]).toEqual(t.segments[1]);
  });
  it("applies only what was accepted", () => {
    const c = changedLines(lines, ["Aplikasi di TikTok.", "lu mikir gitu"]);
    expect(c).toHaveLength(2);
    const out = applyCleanup(t, c, new Set([1]));
    expect(out.segments[0].text).toBe(t.segments[0].text);
    expect(out.segments[1].text).toBe("lu mikir gitu");
    expect(applyCleanup(t, c, new Set())).toEqual(t);
  });
  it("aligns when a word was added and still covers the segment's time span", () => {
    const c = changedLines(lines, ["Aplikasi apa di TikTok.", lines[1]]);
    const out = applyCleanup(t, c, new Set([0]));
    const w = out.segments[0].words;
    expect(w).toHaveLength(4);
    expect(w[0].start).toBeGreaterThanOrEqual(t.segments[0].start - 1e-9);
    expect(w.at(-1)!.end).toBeLessThanOrEqual(t.segments[0].end + 1e-6);
    for (let i = 1; i < w.length; i++) expect(w[i].start).toBeGreaterThanOrEqual(w[i - 1].start - 1e-9);
  });
  it("leaves the rest of the transcript untouched", () => {
    const c = changedLines(lines, [lines[0], "lu mikir gitu"]);
    const out = applyCleanup(t, c, new Set([1]));
    expect(out.duration).toBe(t.duration);
    expect(out.granularity).toBe(t.granularity);
    expect(allWords(out)).toHaveLength(allWords(t).length);
  });
});

import { audioCleanupPrompt, judgePrompt, judgeScenesWithGemini, MAX_AUDIO_SECONDS, parseScores, wavPart } from "./gemini";
import { blendAi, judgeScenes } from "./importance";
import { detectVisual } from "./visuals";

describe("listening to the speech", () => {
  it("encodes 16 kHz mono samples as a WAV", () => {
    const part = wavPart(new Float32Array([0, 0.5, -0.5, 1, -1]));
    expect(part.mimeType).toBe("audio/wav");
    const bytes = Uint8Array.from(atob(part.data), c => c.charCodeAt(0));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
    expect(bytes.length).toBe(44 + 10);
    const v = new DataView(bytes.buffer);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getInt16(44 + 6, true)).toBe(32767);
    expect(v.getInt16(44 + 8, true)).toBe(-32768);
  });
  it("refuses audio that would not fit in a request", () => {
    expect(() => wavPart(new Float32Array(16000 * (MAX_AUDIO_SECONDS + 1)))).toThrow(/terlalu panjang/);
  });
  it("sends the audio before the instruction, with the start of every line", async () => {
    const { fn, calls } = fakeFetch(ok(reply(["A", "B"])));
    const audio = wavPart(new Float32Array(160));
    await cleanupLines(["a", "b"], { ...opts(fn), audio, starts: [0.04, 3.26] });
    const parts = JSON.parse(calls[0].init.body as string).contents[0].parts;
    expect(parts[0].inlineData).toEqual({ mimeType: "audio/wav", data: audio.data });
    expect(parts[1].text).toContain("[0,3.3]");
    expect(parts[1].text.split("\n").at(-1)).toBe(JSON.stringify(["a", "b"]));
    expect(audioCleanupPrompt(["x"], [1], "en")).toContain("bahasa Inggris");
  });
  it("sends no audio unless asked", async () => {
    const { fn, calls } = fakeFetch(ok(reply(["A"])));
    await cleanupLines(["a"], opts(fn));
    expect(JSON.parse(calls[0].init.body as string).contents[0].parts).toHaveLength(1);
  });
});

describe("judging which sentences deserve an animation", () => {
  const scores = (list: unknown[]) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ scenes: list }) }] } }] });
  it("reads scores by index, clamps them, and leaves skipped sentences empty", () => {
    const out = parseScores(scores([{ index: 0, score: 1.4, reason: "  angka   uang " }, { index: 2, score: 0.2, reason: "basa-basi" }, { index: 9, score: 1, reason: "x" }, { index: 1, score: "tinggi", reason: "" }]), 3);
    expect(out).toEqual([{ score: 1, reason: "angka uang" }, undefined, { score: 0.2, reason: "basa-basi" }]);
  });
  it("rejects an answer with nothing usable", () => {
    expect(() => parseScores(scores([]), 2)).toThrow(GeminiError);
    expect(() => parseScores(scores([{ index: 5, score: 1 }]), 2)).toThrow(/nilai/);
  });
  it("sends only the sentences, key in the header", async () => {
    const { fn, calls } = fakeFetch(ok(scores([{ index: 0, score: 0.9, reason: "uang" }, { index: 1, score: 0.1, reason: "basa-basi" }])));
    const out = await judgeScenesWithGemini([{ text: "Gaji *100 juta* sebulan", seconds: 3 }, { text: "ya gitu deh", seconds: 1 }], opts(fn));
    expect(out.map(x => x?.score)).toEqual([0.9, 0.1]);
    expect(calls[0].init.headers).toMatchObject({ "x-goog-api-key": KEY });
    const text = JSON.parse(calls[0].init.body as string).contents[0].parts[0].text as string;
    expect(text).toContain("Gaji 100 juta sebulan");
    expect(text).not.toContain("*");
    expect(judgePrompt([{ text: "a", seconds: 1 }], "en")).toContain("bahasa Inggris");
  });
  it("sends nothing for an empty script", async () => {
    const { fn, calls } = fakeFetch();
    expect(await judgeScenesWithGemini([], opts(fn))).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("mixing Gemini into the rule scores", () => {
  const scene = (text: string) => ({ text, visual: detectVisual(text), seconds: 4 });
  const rules = judgeScenes([scene("Gaji saya 100 juta sebulan"), scene("Coba pikirkan soal tabungan dan investasi untuk masa depan"), scene("ya gitu deh gimana sih"), scene("Mari belajar di YouTube hari ini")]);
  it("averages the two where the rules saw something", () => {
    const i = rules.findIndex(j => j.score > 0 && !j.reasons.includes("istilah populer") && !j.reasons.includes("ditandai manual"));
    const out = blendAi(rules, rules.map(() => ({ score: 0.1, reason: "biasa" })));
    expect(out[i].score).toBeCloseTo((rules[i].score + 0.1) / 2, 2);
    expect(out[i].reasons.at(-1)).toBe("Gemini 0.10: biasa");
  });
  it("cannot lift a sentence that has nothing to show", () => {
    const zero = rules.findIndex(j => j.score === 0);
    if (zero < 0) return;
    expect(blendAi(rules, rules.map(() => ({ score: 1, reason: "x" })))[zero]).toEqual(rules[zero]);
  });
  it("leaves popular names and manual marks as the rules judged them", () => {
    const marked = judgeScenes([scene("Ini *penting sekali* untuk kamu"), scene("Buka YouTube sekarang juga")]);
    expect(blendAi(marked, [{ score: 0, reason: "x" }, { score: 0, reason: "x" }])).toEqual(marked);
  });
  it("changes nothing without an opinion, or for a sentence it skipped", () => {
    expect(blendAi(rules)).toBe(rules);
    expect(blendAi(rules, [undefined, undefined, undefined, undefined])).toEqual(rules);
  });
});

describe("through the owner's server", () => {
  it("sends the request to the transport, not to Google, and uses what it answers", async () => {
    const { fn, calls } = fakeFetch();
    let seen: object | null = null;
    const transport = async (payload: object) => { seen = payload; return ok(reply(["B"])); };
    expect(await cleanupLines(["a"], { ...opts(fn), apiKey: "", transport })).toEqual(["B"]);
    expect(calls).toHaveLength(0);
    expect(JSON.stringify(seen)).toContain("Masukan (JSON)");
  });
  it("explains the server's own answers", async () => {
    const via = (status: number, code: string) => cleanupLines(["a"], { ...opts(fakeFetch().fn), apiKey: "", transport: async () => fail(status, { status: code, message: code }) }).catch((e: GeminiError) => e);
    expect(await via(400, "NO_KEY")).toMatchObject({ kind: "key", message: expect.stringContaining("Belum ada kunci") });
    expect(await via(401, "NOT_SIGNED_IN")).toMatchObject({ kind: "key", message: expect.stringContaining("Masuk lagi") });
    expect(await via(413, "TOO_LARGE")).toMatchObject({ kind: "format" });
    expect(await via(504, "UPSTREAM_UNREACHABLE")).toMatchObject({ kind: "server" });
    expect(await via(429, "RESOURCE_EXHAUSTED")).toMatchObject({ kind: "quota" });
  });
  it("asks to sign in again when the session is gone", async () => {
    await expect(cleanupLines(["a"], { ...opts(fakeFetch().fn), apiKey: "", transport: async () => null })).rejects.toMatchObject({ kind: "key", message: expect.stringContaining("Masuk lagi") });
  });
});
