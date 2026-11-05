import { describe, expect, it } from "vitest";
import { formatPrice, parsePrices, recommendGoogle, recommendOpenRouter } from "./model-recommend";

const entry = (id: string, prompt: number, completion: number, name = id) => ({ id, name, pricing: { prompt: String(prompt / 1e6), completion: String(completion / 1e6) } });
const list = { data: [
  entry("google/gemini-2.5-flash-lite", 0.1, 0.4, "Gemini 2.5 Flash Lite"), entry("openai/gpt-4o-mini", 0.15, 0.6), entry("google/gemini-2.5-flash", 0.3, 2.5),
  entry("openai/gpt-4.1", 2, 8), entry("anthropic/claude-sonnet-4", 3, 15), entry("openai/gpt-5", 1.25, 10), entry("anthropic/claude-opus-4.1", 15, 75),
  entry("some/other-model", 0.01, 0.01), { id: "broken/no-price" },
] };

describe("model recommendations", () => {
  it("reads prices per million tokens and skips entries without a price", () => {
    const p = parsePrices(list);
    expect(p.get("openai/gpt-4o-mini")?.input).toBeCloseTo(0.15, 6);
    expect(p.get("openai/gpt-4o-mini")?.output).toBeCloseTo(0.6, 6);
    expect(p.has("broken/no-price")).toBe(false);
  });
  it("gives at most five choices, the free one first, the rest from cheapest to most expensive", () => {
    const recs = recommendOpenRouter(parsePrices(list));
    expect(recs.length).toBe(5);
    expect(recs[0]).toMatchObject({ id: "openrouter/free", tier: "Gratis", free: true });
    const paid = recs.slice(1);
    const blended = (r: (typeof recs)[number]) => r.price!.input * 0.75 + r.price!.output * 0.25;
    for (let i = 1; i < paid.length; i++) expect(blended(paid[i])).toBeGreaterThanOrEqual(blended(paid[i - 1]));
    expect(paid.map(r => r.tier)).toEqual(["Hemat", "Seimbang", "Cerdas", "Terbaik"]);
    expect(paid[0].id).toBe("google/gemini-2.5-flash-lite");
    expect(paid.at(-1)!.id).toBe("anthropic/claude-opus-4.1");
    expect(recs.every(r => r.id !== "some/other-model")).toBe(true);
  });
  it("uses only models the live list still offers, and works with few or none", () => {
    const few = recommendOpenRouter(parsePrices({ data: [entry("openai/gpt-4o-mini", 0.15, 0.6), entry("openai/gpt-4.1", 2, 8)] }));
    expect(few.map(r => r.id)).toEqual(["openrouter/free", "openai/gpt-4o-mini", "openai/gpt-4.1"]);
    expect(recommendOpenRouter(new Map()).map(r => r.id)).toEqual(["openrouter/free"]);
  });
  it("for a Google key picks the newest lite, flash and pro, cheapest first, skipping previews", () => {
    const recs = recommendGoogle(["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3-pro-preview", "gemini-2.5-pro-preview-05-06"]);
    expect(recs.map(r => r.id)).toEqual(["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"]);
    expect(recs.map(r => r.tier)).toEqual(["Hemat", "Seimbang", "Terbaik"]);
    expect(recommendGoogle([])).toEqual([]);
  });
  it("shows a price a beginner can read", () => {
    expect(formatPrice({ input: 0.15, output: 0.6 })).toBe("$0,15 / $0,60 per 1 juta token (masuk / keluar)");
    expect(formatPrice({ input: 3, output: 15 })).toBe("$3,0 / $15 per 1 juta token (masuk / keluar)");
    expect(formatPrice(undefined)).toBe("");
  });
});
