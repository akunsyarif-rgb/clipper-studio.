import { describe, expect, it } from "vitest";
import { aiUsage, cleanupLines, resetAiGuards } from "./gemini";
import { budgetExceeded, DEFAULT_DAILY_TOKENS, getBudget, isFreeModel, localDayKey, setDailyLimit } from "./ai-budget";

const reply = (lines: string[], tokens?: number) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lines }) }] } }], ...(tokens ? { usageMetadata: { totalTokenCount: tokens } } : {}) }), { status: 200 });
const opts = (fn: unknown) => ({ apiKey: "k".repeat(30), model: "m", language: "id", fetchImpl: fn as typeof fetch, retryDelaysMs: [] as number[] });

describe("daily AI budget", () => {
  it("counts tokens (reported, or estimated when the service reports none) and requests", async () => {
    resetAiGuards();
    await cleanupLines(["a"], opts(async () => reply(["B"], 120)));
    expect(getBudget()).toMatchObject({ tokens: 120, requests: 1, limit: DEFAULT_DAILY_TOKENS });
    await cleanupLines(["b"], opts(async () => reply(["C"])));
    expect(getBudget().tokens).toBeGreaterThan(120);
    expect(getBudget().requests).toBe(2);
  });
  it("refuses the next request once the limit is reached, with no call to the service; the limit can be raised or removed", async () => {
    resetAiGuards();
    setDailyLimit(100);
    await cleanupLines(["a"], opts(async () => reply(["B"], 150)));
    expect(budgetExceeded()).toBe(true);
    let called = 0;
    await expect(cleanupLines(["x"], opts(async () => { called++; return reply(["Y"]); }))).rejects.toMatchObject({ kind: "quota", message: expect.stringContaining("Batas pemakaian AI hari ini") });
    expect(called).toBe(0);
    setDailyLimit(0);
    expect(budgetExceeded()).toBe(false);
    await cleanupLines(["x"], opts(async () => reply(["Y"])));
    setDailyLimit(DEFAULT_DAILY_TOKENS);
  });
  it("an answer already paid for is still served from memory when the budget is spent", async () => {
    resetAiGuards();
    const fn = async () => reply(["B"], 90);
    await cleanupLines(["same"], opts(fn));
    setDailyLimit(50);
    expect(await cleanupLines(["same"], opts(fn))).toEqual(["B"]);
    expect(aiUsage.cacheHits).toBe(1);
    setDailyLimit(DEFAULT_DAILY_TOKENS);
  });
  it("uses the device's local calendar date, including year and month boundaries", () => {
    expect(localDayKey(new Date(2026, 10, 2, 23, 59))).toBe("2026-11-02");
    expect(localDayKey(new Date(2026, 10, 3, 0, 0))).toBe("2026-11-03");
    expect(localDayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
    expect(localDayKey(new Date(2027, 0, 1))).toBe("2027-01-01");
  });
  it("tells free models from billable ones", () => {
    expect(isFreeModel("openrouter/free")).toBe(true);
    expect(isFreeModel("meta/llama:free")).toBe(true);
    expect(isFreeModel("google/gemini-2.5-pro")).toBe(false);
  });
});

describe("estimate with attached audio", () => {
  it("does not count base64 audio as text: a long audio request without reported usage stays small", async () => {
    resetAiGuards();
    const { ask } = await import("./gemini");
    const audio = "A".repeat(2_000_000);
    await ask(opts(async () => reply(["B"])), [{ inlineData: { mimeType: "audio/wav", data: audio } }, { text: "dengarkan" }], {}, () => 1);
    expect(getBudget().tokens).toBeLessThan(1000);
  });
});
