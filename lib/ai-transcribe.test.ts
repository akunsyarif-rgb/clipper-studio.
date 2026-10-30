import { describe, expect, it } from "vitest";
import { CHUNK_SECONDS, CHUNK_TIMEOUT_MS, parseTimedLines, planChunks, toBase64, toSeconds, transcribeChunk, transcribeLong, transcribePrompt } from "./ai-transcribe";

const gem = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
const bad = (status: number, error: object) => new Response(JSON.stringify({ error }), { status });
const base = { apiKey: "", model: "m", language: "id", retryDelaysMs: [] as number[] };

describe("planning the parts", () => {
  it("cuts a long video into equal parts and a short one into one", () => {
    expect(planChunks(100)).toEqual([{ index: 0, start: 0, duration: 100 }]);
    expect(planChunks(19 * 60 + 18)).toHaveLength(10);
    expect(planChunks(20 * 60 + 48)).toHaveLength(11); // the 20-minute video of the bug report: 11 parts of at most 2 minutes
    expect(planChunks(600).map(c => [c.start, c.duration])).toEqual([[0, 120], [120, 120], [240, 120], [360, 120], [480, 120]]);
  });
  it("folds a tiny last piece into the part before it, and covers the video exactly", () => {
    const p = planChunks(CHUNK_SECONDS * 2 + 10);
    expect(p).toHaveLength(2);
    expect(p.reduce((n, c) => n + c.duration, 0)).toBeCloseTo(CHUNK_SECONDS * 2 + 10, 6);
    expect(p[1].start + p[1].duration).toBeCloseTo(CHUNK_SECONDS * 2 + 10, 6);
  });
  it("plans nothing for an unreadable duration", () => {
    expect(planChunks(0)).toEqual([]);
    expect(planChunks(NaN)).toEqual([]);
  });
});

describe("reading times", () => {
  it("accepts numbers and clock strings", () => {
    expect([toSeconds(83.5), toSeconds("83.5"), toSeconds("1:23.5"), toSeconds("01:01:23"), toSeconds("1:23,5")]).toEqual([83.5, 83.5, 83.5, 3683, 83.5]);
    expect(toSeconds("abc")).toBeNaN();
    expect(toSeconds(null)).toBeNaN();
  });
});

describe("one part's lines", () => {
  it("keeps order, clamps to the part and removes overlaps", () => {
    const l = parseTimedLines(gem({ lines: [{ start: 5, end: 9, text: " kedua " }, { start: 0, end: 4, text: "pertama" }, { start: 8, end: 400, text: "ketiga" }] }), 60);
    expect(l.map(x => x.text)).toEqual(["pertama", "kedua", "ketiga"]);
    expect(l[2].start).toBe(9);
    expect(l[2].end).toBe(60);
    for (let i = 1; i < l.length; i++) expect(l[i].start).toBeGreaterThanOrEqual(l[i - 1].end);
  });
  it("reads clock-string times and drops empty lines and ones that last no time", () => {
    const l = parseTimedLines(gem({ lines: [{ start: "0:02", end: "0:05", text: "halo" }, { start: "0:06", end: "0:06", text: "" }, { start: 10, end: 10.05, text: "tiba-tiba" }] }), 30);
    expect(l.map(x => [x.start, x.end, x.text])).toEqual([[2, 5, "halo"], [10, 10.3, "tiba-tiba"]]);
  });
  it("spreads lines over the part by length when the times are missing or all zero", () => {
    const l = parseTimedLines(gem({ lines: [{ text: "aaaa" }, { text: "bbbbbbbb" }] }), 12);
    expect(l.map(x => [x.start, x.end])).toEqual([[0, 4], [4, 12]]);
    const zero = parseTimedLines(gem({ lines: [{ start: 0, end: 0, text: "a" }, { start: 0, end: 0, text: "b" }] }), 10);
    expect(zero[1].start).toBeGreaterThan(zero[0].start);
  });
  it("accepts no speech, and refuses an answer that is not a list", () => {
    expect(parseTimedLines(gem({ lines: [] }), 30)).toEqual([]);
    expect(() => parseTimedLines(gem({ nope: 1 }), 30)).toThrow(/daftar baris/);
  });
  it("asks for lines relative to the part, in the right language", () => {
    expect(transcribePrompt("id", 240)).toContain("240 detik");
    expect(transcribePrompt("id", 240)).toContain("terhadap awal audio ini");
    expect(transcribePrompt("en", 60)).toContain("bahasa Inggris");
  });
  it("sends the audio before the instruction", async () => {
    let parts: { inlineData?: { mimeType: string }; text?: string }[] = [];
    const transport = async (p: object) => { parts = (p as { contents: { parts: typeof parts }[] }).contents[0].parts; return ok(gem({ lines: [{ start: 0, end: 3, text: "halo" }] })); };
    expect(await transcribeChunk({ mimeType: "audio/mpeg", data: "QUJD" }, 30, { ...base, transport })).toHaveLength(1);
    expect(parts[0].inlineData?.mimeType).toBe("audio/mpeg");
    expect(parts[1].text).toContain("Tuliskan ucapannya");
  });
});

describe("a whole video", () => {
  const mp3 = (n: number) => new Uint8Array([n, n, n]);
  /** Cuts fake parts; each part's "audio" is its index byte. */
  const cutter = (log: string[] = []) => async (chunks: { index: number }[], onChunk: (i: number, d: Uint8Array) => Promise<void>) => {
    for (let n = 0; n < chunks.length; n++) { log.push(`cut${chunks[n].index}`); await onChunk(n, mp3(chunks[n].index)); }
  };
  const answerFor = (data: string) => {
    const idx = atob(data).charCodeAt(0);
    return gem({ lines: [{ start: 1, end: 4, text: `bagian ${idx} a` }, { start: 5, end: 9, text: `bagian ${idx} b` }] });
  };
  const transport = async (p: object) => {
    const parts = (p as { contents: { parts: { inlineData?: { data: string } }[] }[] }).contents[0].parts;
    return ok(answerFor(parts[0].inlineData!.data));
  };

  it("puts each part's lines on the video's timeline, in order, with word times", async () => {
    const t = await transcribeLong(600, cutter(), { ...base, transport });
    expect(t.segments.map(s => s.text).slice(0, 6)).toEqual(["bagian 0 a", "bagian 0 b", "bagian 1 a", "bagian 1 b", "bagian 2 a", "bagian 2 b"]);
    expect(t.segments.map(s => s.start)).toEqual([1, 5, 121, 125, 241, 245, 361, 365, 481, 485]);
    expect(t.duration).toBe(600);
    expect(t.language).toBe("indonesian");
    expect(t.segments[0].words.length).toBe(3);
    expect(toBase64(mp3(7))).toBe(btoa("\u0007\u0007\u0007"));
  });
  it("reports progress, and never has more requests in flight than allowed", async () => {
    let live = 0, peak = 0;
    const slow = async (p: object) => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 15)); live--; return transport(p); };
    const progress: string[] = [];
    await transcribeLong(CHUNK_SECONDS * 5, cutter(), { ...base, transport: slow }, { onProgress: (d, n) => progress.push(`${d}/${n}`) });
    expect(progress[0]).toBe("0/5");
    expect(progress.at(-1)).toBe("5/5");
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1);
  });
  it("fails as a whole and names the part when one cannot be done", async () => {
    let n = 0;
    const flaky = async (p: object) => (++n === 2 ? bad(403, { status: "PERMISSION_DENIED", message: "x" }) : transport(p));
    await expect(transcribeLong(900, cutter(), { ...base, transport: flaky })).rejects.toMatchObject({ kind: "key", message: expect.stringMatching(/^Bagian 2 dari 8: /) });
  });
  it("gives each part time to answer (a bit more than the server's own limit), not the 60 s of a small question", async () => {
    const seen: number[] = [];
    const watching = async (p: object, o: { timeoutMs: number }) => { seen.push(o.timeoutMs); return transport(p); };
    await transcribeLong(100, cutter(), { ...base, transport: watching });
    expect(seen).toEqual([CHUNK_TIMEOUT_MS]);
    expect(CHUNK_TIMEOUT_MS).toBeGreaterThan(110_000);
  });
  it("tries a part that was too slow once more, and says which part when it is slow twice", async () => {
    let n = 0;
    const slowOnce = async (p: object, o: { signal: AbortSignal }) => { if (++n === 1) { const e = new Error("abort"); await new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(e))); } return transport(p); };
    const t = await transcribeLong(100, cutter(), { ...base, transport: slowOnce, timeoutMs: 20 });
    expect(t.segments).toHaveLength(2);
    expect(n).toBe(2);
    const never = async (_p: object, o: { signal: AbortSignal }) => new Promise<Response | null>((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("abort"))));
    await expect(transcribeLong(100, cutter(), { ...base, transport: never, timeoutMs: 20 })).rejects.toMatchObject({ kind: "timeout", message: expect.stringMatching(/^Bagian 1 dari 1: Gemini terlalu lama/) });
  });
  it("continues from the parts already done after a failure instead of starting over", async () => {
    const done = new Map<string, { start: number; end: number; text: string }[]>();
    let n = 0;
    const log: string[] = [];
    const failsThird = async (p: object) => (++n === 3 ? bad(403, { status: "PERMISSION_DENIED", message: "x" }) : transport(p));
    await expect(transcribeLong(480, cutter(log), { ...base, transport: failsThird }, { done })).rejects.toBeDefined();
    const kept = done.size;
    expect(kept).toBeGreaterThanOrEqual(2);
    log.length = 0;
    const sent: number[] = [];
    const counting = async (p: object) => { sent.push(1); return transport(p); };
    const t = await transcribeLong(480, cutter(log), { ...base, transport: counting }, { done });
    expect(sent.length).toBe(4 - kept);
    expect(log.length).toBe(4 - kept);
    expect(t.segments.length).toBe(8);
    expect(t.segments.map(s => s.start)).toEqual([1, 5, 121, 125, 241, 245, 361, 365]);
    // Everything done already: nothing is cut or sent.
    log.length = 0; sent.length = 0;
    await transcribeLong(480, cutter(log), { ...base, transport: counting }, { done });
    expect(log).toEqual([]); expect(sent).toEqual([]);
  });
  it("stops when cancelled", async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(transcribeLong(600, cutter(), { ...base, transport }, { signal: ctl.signal })).rejects.toMatchObject({ kind: "timeout" });
  });
  it("says so when nobody speaks", async () => {
    const silent = async () => ok(gem({ lines: [] }));
    await expect(transcribeLong(100, cutter(), { ...base, transport: silent })).rejects.toMatchObject({ message: expect.stringContaining("Tidak ada ucapan") });
    await expect(transcribeLong(0, cutter(), { ...base, transport })).rejects.toMatchObject({ kind: "format" });
  });
});
