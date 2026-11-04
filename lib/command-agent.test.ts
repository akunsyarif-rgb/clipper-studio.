import { describe, expect, it } from "vitest";
import { commandPrompt, parseCommand, planFromCommand, MAX_COMMAND_CHARS } from "./command-agent";
import { resetAiGuards } from "./gemini";

const reply = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const opts = (fn: unknown) => ({ apiKey: "k".repeat(30), model: "openrouter/free", language: "id", fetchImpl: fn as typeof fetch, retryDelaysMs: [] as number[] });
const answer = { genre: "produk", product: "Kopi Pagi", tagline: "Mulai harimu hangat", problem: "", features: ["Biji pilihan", "Seduh 3 menit"], proof: "", cta: "Pesan sekarang", tone: "warm", seconds: 30, searchTerms: ["coffee cup", "morning light", "Coffee Cup"] };

describe("command agent", () => {
  it("turns an answer into a brief and search words (deduplicated, lowercase)", () => {
    const r = parseCommand({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }, "id");
    expect(r.brief).toMatchObject({ genre: "produk", product: "Kopi Pagi", tone: "warm", seconds: 30, features: ["Biji pilihan", "Seduh 3 menit"] });
    expect(r.searchTerms).toEqual(["coffee cup", "morning light"]);
  });
  it("falls back to safe values for unknown genre, tone and length, and refuses an answer without a topic", () => {
    const r = parseCommand({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...answer, genre: "x", tone: "y", seconds: 99 }) }] } }] }, "id");
    expect(r.brief).toMatchObject({ genre: "produk", tone: "keynote", seconds: 30 });
    expect(() => parseCommand({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...answer, product: " " }) }] } }] }, "id")).toThrow(/topik/);
  });
  it("tells the model not to invent claims and cuts a long command", () => {
    const p = commandPrompt("a".repeat(5000), "id");
    expect(p).toMatch(/jangan mengarang klaim/);
    expect(p.length).toBeLessThan(MAX_COMMAND_CHARS + 1500);
  });
  it("makes one AI call and builds the storyboard on the device; the same command is answered from memory", async () => {
    resetAiGuards();
    let calls = 0;
    const fn = async () => { calls++; return reply(answer); };
    const a = await planFromCommand("Buat video produk kopi 30 detik hangat", opts(fn));
    expect(calls).toBe(1);
    expect(a.plan.scenes.length).toBeGreaterThanOrEqual(4);
    expect(a.plan.script).toContain("Mulai harimu hangat");
    expect(a.searchTerms.length).toBe(2);
    await planFromCommand("Buat video produk kopi 30 detik hangat", opts(fn));
    expect(calls).toBe(1);
  });
  it("rejects a command that is too short without calling the service", async () => {
    resetAiGuards();
    let calls = 0;
    await expect(planFromCommand("kopi", opts(async () => { calls++; return reply(answer); }))).rejects.toMatchObject({ kind: "format" });
    expect(calls).toBe(0);
  });
});
