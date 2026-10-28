import { describe, expect, it } from "vitest";
import { citedAddresses, formatPrice, mergeResearch, pageKey, parseResearch, researchEverything, researchProduct, researchPrompt, DEFAULT_RESEARCH_MODEL } from "./product-research";
import { ProductError, type ProductPage } from "./product";

const OFFICIAL = "https://www.aqualux.example/produk/termos-750";
const STORE = "https://tokoresmi.example/aqualux-750";
const answerJson = {
  official_name: "Aqualux Termos 750 ml", brand: "Aqualux", category: "botol minum termos",
  facts: [
    { text: "Kapasitas 750 ml", source_url: OFFICIAL },
    { text: "Bahan stainless steel 304", source_url: OFFICIAL + "/" },
    { text: "Menjaga dingin 12 jam", source_url: "https://invented.example/nowhere" },
    { text: "Termos terbaik nomor 1", source_url: OFFICIAL },
    { text: "Membantu menurunkan berat badan", source_url: OFFICIAL },
    { text: "Kapasitas 750 ml!", source_url: STORE },
    { text: "x", source_url: OFFICIAL },
  ],
  price: { text: "Rp 89.000", source_url: STORE },
  pages: [{ url: OFFICIAL, kind: "official", title: "Aqualux" }, { url: "https://made-up.example/p", kind: "store", title: "?" }, { url: STORE, kind: "store", title: "Toko" }],
};
const response = (content: unknown, extra: object = {}) => ({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content), annotations: [{ type: "url_citation", url_citation: { url: OFFICIAL } }, { type: "url_citation", url_citation: { url: STORE + "?utm=1" } }] } }], ...extra });

describe("researchPrompt", () => {
  it("asks for sourced specifications only and forbids guessing and promotion", () => {
    const p = researchPrompt({ product: "Termos Aqualux 750 ml", link: OFFICIAL });
    expect(p).toContain("HANYA fakta yang tertulis");
    expect(p).toContain("source_url");
    expect(p).toContain("Jangan menebak");
    expect(p).toContain("Jangan menulis kata promosi");
    expect(p).toContain(OFFICIAL);
    expect(researchPrompt({ product: "X produk" })).not.toContain("Halaman produk dari pembuat video");
  });
});

describe("citedAddresses", () => {
  it("collects addresses from annotations, citations and search results, once each", () => {
    const r = response("{}", { citations: [STORE, { url: "https://c.example/x" }], search_results: [{ url: "https://d.example/y" }, { url: OFFICIAL }] });
    expect(citedAddresses(r)).toEqual([OFFICIAL, STORE + "?utm=1", STORE, "https://c.example/x", "https://d.example/y"]);
  });
  it("ignores anything that is not a web address", () => {
    expect(citedAddresses({ citations: ["javascript:alert(1)", 5, null, "ftp://x.example"] })).toEqual([]);
  });
});

describe("pageKey", () => {
  it("treats trailing slash, www, query and fragment as the same page", () => {
    expect(pageKey("https://www.A.example/p/?x=1#y")).toBe(pageKey("http://a.example/p"));
    expect(pageKey("https://a.example/p")).not.toBe(pageKey("https://a.example/q"));
  });
});

describe("parseResearch", () => {
  const r = parseResearch(response(answerJson));
  it("accepts a fact as sourced only when its address was returned by the search itself", () => {
    const byText = Object.fromEntries(r.facts.map(f => [f.text, f]));
    expect(byText["Kapasitas 750 ml"]).toMatchObject({ verified: true, host: "aqualux.example", risky: false });
    expect(byText["Bahan stainless steel 304"].verified).toBe(true); // same page, trailing slash
    expect(byText["Menjaga dingin 12 jam"].verified).toBe(false); // an address the search never returned
  });
  it("holds back promotional and health wording, but not numbers", () => {
    const byText = Object.fromEntries(r.facts.map(f => [f.text, f]));
    expect(byText["Termos terbaik nomor 1"].risky).toBe(true);
    expect(byText["Membantu menurunkan berat badan"].risky).toBe(true);
    expect(byText["Kapasitas 750 ml"].risky).toBe(false);
  });
  it("drops duplicates and junk", () => {
    expect(r.facts.filter(f => /^Kapasitas 750 ml/.test(f.text))).toHaveLength(1);
    expect(r.facts.some(f => f.text === "x")).toBe(false);
  });
  it("keeps a price only as a hint with its source status", () => {
    expect(r.price).toEqual({ text: "Rp 89.000", url: STORE, host: "tokoresmi.example", verified: true });
    expect(parseResearch(response({ ...answerJson, price: { text: "murah", source_url: STORE } })).price).toBeNull();
  });
  it("lists only pages the search really returned, never an address the model invented", () => {
    expect(r.pages.map(p => p.url)).toEqual([OFFICIAL, STORE]);
  });
  it("reads an answer wrapped in a code fence or in extra words", () => {
    expect(parseResearch(response("```json\n" + JSON.stringify(answerJson) + "\n```")).facts.length).toBeGreaterThan(0);
    expect(parseResearch(response("Berikut hasilnya: " + JSON.stringify(answerJson) + " semoga membantu")).brand).toBe("Aqualux");
  });
  it("says so when the answer is unusable", () => {
    expect(() => parseResearch({ choices: [{ message: { content: "" } }] })).toThrow(/tidak memberi jawaban/);
    expect(() => parseResearch(response("bukan json"))).toThrow(/JSON/);
  });
  it("copes with missing parts", () => {
    const e = parseResearch(response({ facts: "no", pages: 5 }));
    expect(e).toMatchObject({ facts: [], price: null, pages: [], brand: "" });
  });
});

describe("researchProduct", () => {
  const fnOf = (res: Response | null | Error) => { const calls: Record<string, unknown>[] = []; return { calls, fn: async (_n: string, b: unknown) => { calls.push(b as Record<string, unknown>); if (res instanceof Error) throw res; return res?.clone() ?? null; } }; };
  const ok = () => new Response(JSON.stringify(response(answerJson)), { status: 200 });
  it("sends one request to the search model through the server and returns the answer", async () => {
    const f = fnOf(ok());
    const a = await researchProduct({ product: "Termos Aqualux" }, { fn: f.fn });
    expect(a.brand).toBe("Aqualux");
    expect(f.calls[0]).toMatchObject({ action: "generate", model: DEFAULT_RESEARCH_MODEL });
    expect(JSON.stringify(f.calls[0])).toContain("Termos Aqualux");
  });
  it("uses the model the creator chose", async () => {
    const f = fnOf(ok());
    await researchProduct({ product: "Termos Aqualux" }, { fn: f.fn, model: " perplexity/sonar-pro " });
    expect(f.calls[0].model).toBe("perplexity/sonar-pro");
  });
  it("explains a missing model, credit, sign-in and network failures", async () => {
    const e = (status: number, body: unknown = {}) => researchProduct({ product: "Termos" }, { fn: fnOf(new Response(JSON.stringify(body), { status })).fn });
    await expect(e(404, { error: { message: "No endpoints found" } })).rejects.toMatchObject({ kind: "model", message: /perplexity\/sonar.*tidak ditemukan/ });
    await expect(e(402)).rejects.toMatchObject({ kind: "quota", message: /Saldo/ });
    await expect(researchProduct({ product: "Termos" }, { fn: fnOf(null).fn })).rejects.toMatchObject({ kind: "key" });
    await expect(researchProduct({ product: "Termos" }, { fn: fnOf(new Error("x")).fn })).rejects.toMatchObject({ kind: "network" });
  });
});

describe("mergeResearch", () => {
  const page: ProductPage = { url: OFFICIAL, host: "www.aqualux.example", title: "Termos Aqualux", brand: "Aqualux", description: "", price: { amount: "89000", currency: "IDR" }, specs: ["Kapasitas: 750 ml", "Bahan: Stainless steel 304"], images: ["https://cdn.aqualux.example/1.jpg", "https://cdn.aqualux.example/2.jpg"] };
  const answer = parseResearch(response(answerJson));
  const m = mergeResearch(answer, [page]);
  it("puts what the pages list themselves first, then sourced facts, then held-back ones last", () => {
    expect(m.facts[0]).toMatchObject({ text: "Kapasitas: 750 ml", verified: true, host: "aqualux.example" });
    const idx = (t: string) => m.facts.findIndex(f => f.text === t);
    expect(idx("Bahan stainless steel 304")).toBeLessThan(idx("Menjaga dingin 12 jam"));
    expect(idx("Menjaga dingin 12 jam")).toBeLessThan(idx("Termos terbaik nomor 1"));
  });
  it("shows the page's own price as a sourced hint", () => {
    expect(m.price).toEqual({ text: "Rp 89.000", url: OFFICIAL, host: "aqualux.example", verified: true });
  });
  it("collects the pictures with where they came from, once each", () => {
    expect(m.images).toEqual([{ url: "https://cdn.aqualux.example/1.jpg", pageUrl: OFFICIAL, host: "aqualux.example" }, { url: "https://cdn.aqualux.example/2.jpg", pageUrl: OFFICIAL, host: "aqualux.example" }]);
  });
  it("works with pages alone or an answer alone", () => {
    expect(mergeResearch(null, [page]).facts).toHaveLength(2);
    expect(mergeResearch(answer, []).images).toEqual([]);
    expect(mergeResearch(null, [page]).brand).toBe("Aqualux");
  });
});

describe("researchEverything", () => {
  const page = (url: string, extra: Partial<ProductPage> = {}): ProductPage => ({ url, host: new URL(url).hostname, title: "T", brand: "", description: "", price: null, specs: [], images: [], ...extra });
  const fnOf = (res: Response | Error) => async () => { if (res instanceof Error) throw res; return res.clone(); };
  const ok = () => new Response(JSON.stringify(response(answerJson)), { status: 200 });

  it("reads the pasted page, searches the web, and reads the pages the search found (at most two more)", async () => {
    const read: string[] = [];
    const r = await researchEverything({ product: "Termos Aqualux", link: "https://pasted.example/p" }, { fn: fnOf(ok()), readPage: async u => { read.push(u); return page(u, { specs: [`Spek ${read.length}`], images: [`https://cdn.example/${read.length}.jpg`] }); } });
    expect(read).toEqual(["https://pasted.example/p", OFFICIAL, STORE]);
    expect(r.images).toHaveLength(3);
    expect(r.facts.length).toBeGreaterThan(3);
  });
  it("does not read a found page twice when it is the pasted one", async () => {
    const read: string[] = [];
    await researchEverything({ product: "Termos Aqualux", link: OFFICIAL + "/" }, { fn: fnOf(ok()), readPage: async u => { read.push(u); return page(u); } });
    expect(read).toEqual([OFFICIAL + "/", STORE]);
  });
  it("carries on when a page refuses to be read, and says so", async () => {
    const r = await researchEverything({ product: "Termos Aqualux" }, { fn: fnOf(ok()), readPage: async () => { throw new ProductError("blocked", "x"); } });
    expect(r.notes.join(" ")).toMatch(/menolak dibaca otomatis/);
    expect(r.facts.length).toBeGreaterThan(0);
  });
  it("still gives the page's facts when the web search fails", async () => {
    const r = await researchEverything({ product: "Termos Aqualux", link: "https://pasted.example/p" }, { fn: fnOf(new Response("{}", { status: 402 })), readPage: async u => page(u, { specs: ["Kapasitas: 750 ml"] }) });
    expect(r.facts.map(f => f.text)).toEqual(["Kapasitas: 750 ml"]);
    expect(r.notes.join(" ")).toMatch(/Saldo/);
  });
  it("fails clearly when nothing at all could be confirmed", async () => {
    await expect(researchEverything({ product: "Termos Aqualux" }, { fn: fnOf(new Response("{}", { status: 402 })) })).rejects.toMatchObject({ kind: "quota" });
    await expect(researchEverything({ product: "Termos Aqualux" }, { fn: fnOf(new Response(JSON.stringify(response({ facts: [], pages: [] })), { status: 200 })) })).rejects.toThrow(/tidak ada informasi/i);
  });
  it("stops when cancelled", async () => {
    const ctl = new AbortController();
    await expect(researchEverything({ product: "Termos Aqualux" }, { signal: ctl.signal, fn: async () => { ctl.abort(); throw new Error("aborted"); } })).rejects.toThrow();
  });
});

describe("formatPrice", () => {
  it("writes rupiah the Indonesian way and keeps other currencies", () => {
    expect(formatPrice("89000", "IDR")).toBe("Rp 89.000");
    expect(formatPrice("1500000", "")).toBe("Rp 1.500.000");
    expect(formatPrice("750", "IDR")).toBe("Rp 750");
    expect(formatPrice("12.99", "USD")).toBe("USD 12.99");
  });
});
