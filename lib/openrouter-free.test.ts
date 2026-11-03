import { beforeEach, describe, expect, it } from "vitest";
import { fetchFreeModels, parseFreeModels, resetFreeModelsCache } from "./openrouter-free";

const data = { data: [
  { id: "meta/llama-x:free", name: "Llama X (free)", context_length: 131072, pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["text"] } },
  { id: "google/gemini-pro", name: "Gemini Pro", context_length: 1000000, pricing: { prompt: "0.000001", completion: "0.000002" } },
  { id: "zed/free-model", name: "Zed", context_length: 8000, pricing: { prompt: 0, completion: 0 } },
  { id: "img/gen:free", name: "Image", context_length: 4000, pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["image"] } },
  { id: "openrouter/free", name: "Auto", context_length: 200000, pricing: { prompt: "0", completion: "0" } },
  { id: "half/free-prompt-only", name: "Half", context_length: 5000, pricing: { prompt: "0", completion: "0.00001" } },
] };

describe("free OpenRouter models", () => {
  beforeEach(() => resetFreeModelsCache());
  it("keeps only models that are free for prompt and completion and output text, longest context first, without the auto alias", () => {
    expect(parseFreeModels(data).map(m => m.id)).toEqual(["meta/llama-x:free", "zed/free-model"]);
    expect(parseFreeModels(null)).toEqual([]);
    expect(parseFreeModels({ data: "x" })).toEqual([]);
  });
  it("fetches once and reuses the list; an empty or failed answer is an error", async () => {
    let n = 0;
    const ok = (async () => { n++; return new Response(JSON.stringify(data)); }) as unknown as typeof fetch;
    expect((await fetchFreeModels({ fetchImpl: ok })).length).toBe(2);
    await fetchFreeModels({ fetchImpl: ok });
    expect(n).toBe(1);
    resetFreeModelsCache();
    await expect(fetchFreeModels({ fetchImpl: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch })).rejects.toThrow();
    await expect(fetchFreeModels({ fetchImpl: (async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof fetch })).rejects.toThrow();
  });
});
