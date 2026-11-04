import { describe, expect, it } from "vitest";
import { aiUsage, cleanupLines, resetAiGuards } from "./gemini";
import { budgetExceeded, budgetStatus, DEFAULT_DAILY_TOKENS, DEFAULT_MONTHLY_TOKENS, getBudget, isFreeModel, localDayKey, recordUsage, setDailyLimit, setMonthlyLimit } from "./ai-budget";

const reply = (lines: string[], tokens?: number) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lines }) }] } }], ...(tokens ? { usageMetadata: { totalTokenCount: tokens } } : {}) }), { status: 200 });
const opts = (fn: unknown) => ({ apiKey: "k".repeat(30), model: "m", language: "id", fetchImpl: fn as typeof fetch, retryDelaysMs: [] as number[] });

describe("daily and monthly AI budget", () => {
  it("counts tokens (reported, or estimated when the service reports none) and requests", async () => {
    resetAiGuards();
    await cleanupLines(["a"], opts(async () => reply(["B"], 120)));
    expect(getBudget()).toMatchObject({ tokens: 120, requests: 1, limit: DEFAULT_DAILY_TOKENS });
    await cleanupLines(["b"], opts(async () => reply(["C"])));
    expect(getBudget().tokens).toBeGreaterThan(120);
    expect(getBudget().requests).toBe(2);
  });
  it("only warns when a limit is reached: the next request is still sent, and the limit can be raised or removed", async () => {
    resetAiGuards();
    setDailyLimit(100);
    await cleanupLines(["a"], opts(async () => reply(["B"], 150)));
    expect(budgetExceeded()).toBe(true);
    expect(budgetStatus()).toMatchObject({ level: "over", scope: "day" });
    let called = 0;
    await cleanupLines(["x"], opts(async () => { called++; return reply(["Y"]); }));
    expect(called).toBe(1);
    setDailyLimit(0);
    expect(budgetExceeded()).toBe(false);
    setDailyLimit(DEFAULT_DAILY_TOKENS);
  });
  it("warns from 80 % of the daily or the monthly limit, whichever is closer", () => {
    resetAiGuards();
    setDailyLimit(1000); setMonthlyLimit(10_000);
    expect(budgetStatus().level).toBe("ok");
    recordUsage(850, "m");
    expect(budgetStatus()).toMatchObject({ level: "warn", scope: "day", pct: 85 });
    setDailyLimit(0);
    expect(budgetStatus()).toMatchObject({ level: "ok", scope: "month" });
    recordUsage(7500, "m");
    expect(budgetStatus()).toMatchObject({ level: "warn", scope: "month" });
    recordUsage(2000, "m");
    expect(budgetStatus()).toMatchObject({ level: "over", scope: "month" });
    expect(getBudget().monthTokens).toBe(10_350);
    setDailyLimit(DEFAULT_DAILY_TOKENS); setMonthlyLimit(DEFAULT_MONTHLY_TOKENS);
  });
  it("does not count free models, but still counts their requests", () => {
    resetAiGuards();
    recordUsage(5000, "openrouter/free");
    recordUsage(5000, "meta/llama:free");
    expect(getBudget()).toMatchObject({ tokens: 0, monthTokens: 0, requests: 2 });
    recordUsage(300, "google/gemini-2.5-pro");
    expect(getBudget()).toMatchObject({ tokens: 300, monthTokens: 300, requests: 3 });
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
