import { describe, expect, it } from "vitest";
import { aiExtractor, extractionPrompt, formatPrice, mergeResearch, pageKey, parseExtraction, rankHits, researchEverything, searchQueries, type PageForAi, type ResearchFact } from "./product-research";
import { ProductError, type ProductPage, type SearchHit } from "./product";

const OFFICIAL = "https://www.aqualux.example/produk/termos-750";
const STORE = "https://tokoresmi.example/aqualux-750";
const hit = (url: string, title = "Halaman", snippet = ""): SearchHit => ({ title, url, host: new URL(url).hostname.replace(/^www\./, ""), snippet });
const page = (url: string, extra: Partial<ProductPage> = {}): ProductPage => ({ url, host: new URL(url).hostname, title: "Termos Aqualux 750 ml", brand: "", description: "", price: null, specs: [], images: [], text: "", ...extra });
const PAGE_TEXT = "Termos Aqualux 750 ml\nKapasitas 750 ml dengan bahan stainless steel 304.\nTutup rapat anti bocor, menjaga minuman tetap dingin hingga 12 jam.\nGaransi resmi 1 tahun dari distributor.";

describe("searchQueries", () => {
  it("asks for the specification in Indonesian and in English", () => {
    expect(searchQueries("  Termos   Aqualux 750 ml ")).toEqual(["Termos Aqualux 750 ml spesifikasi resmi", "Termos Aqualux 750 ml specifications"]);
  });
});

describe("pageKey", () => {
  it("treats trailing slash, www, query and fragment as the same page", () => {
    expect(pageKey("https://www.A.example/p/?x=1#y")).toBe(pageKey("http://a.example/p"));
    expect(pageKey("https://a.example/p")).not.toBe(pageKey("https://a.example/q"));
  });
});

describe("rankHits", () => {
  const hits = [
    hit("https://www.pinterest.com/pin/1", "Termos Aqualux"), hit("https://blogsaya.example/review-termos-terbaik", "Review termos terbaik 2026"),
    hit("https://www.tokopedia.com/aqualux/termos-750", "Termos Aqualux 750 ml"), hit("https://www.aqualux.example/produk/termos-750", "Aqualux Termos 750 ml"),
    hit("https://www.youtube.com/watch?v=1", "Unboxing"), hit("https://toko.example/termos-aqualux", "Termos Aqualux - Toko Resmi"),
  ];
  const ranked = rankHits(hits, "Termos Aqualux 750 ml");
  it("puts the brand's own site first, then official shops and marketplaces, review lists last", () => {
    expect(ranked.map(h => h.host)).toEqual(["aqualux.example", "toko.example", "tokopedia.com", "blogsaya.example"]);
  });
  it("leaves out social media and video sites", () => {
    expect(ranked.some(h => /pinterest|youtube/.test(h.host))).toBe(false);
  });
  it("skips pages already read, whatever the query string or trailing slash", () => {
    expect(rankHits(hits, "Termos Aqualux 750 ml", ["https://aqualux.example/produk/termos-750/?utm=1"]).some(h => h.host === "aqualux.example")).toBe(false);
  });
  it("takes at most two pages per site", () => {
    const many = [1, 2, 3, 4].map(i => hit(`https://www.aqualux.example/p${i}`, "Aqualux"));
    expect(rankHits(many, "Aqualux")).toHaveLength(2);
  });
});

describe("extractionPrompt", () => {
  const pages: PageForAi[] = [{ url: OFFICIAL, host: "aqualux.example", title: "T", text: "x".repeat(5000) }];
  const p = extractionPrompt("Termos Aqualux 750 ml", pages);
  it("only summarizes the pages' text, requires a quote and forbids adding anything", () => {
    expect(p).toContain("HANYA dari teks halaman");
    expect(p).toContain("tidak mencari apa pun");
    expect(p).toContain("\"quote\"");
    expect(p).toContain("Angka di \"text\" harus ada di kutipan");
    expect(p).toContain("Jangan kata promosi");
    expect(p).toContain("informasi umum yang berguna bagi calon pembeli");
    expect(p).toContain("jangan menilai sendiri");
  });
  it("sends a bounded excerpt of each page", () => {
    expect(p.length).toBeLessThan(5000);
    expect(p).toContain(OFFICIAL);
  });
});

describe("parseExtraction", () => {
  const pages: PageForAi[] = [{ url: OFFICIAL, host: "aqualux.example", title: "T", text: PAGE_TEXT }, { url: STORE, host: "tokoresmi.example", title: "S", text: "Warna hitam doff. Berat 420 gram." }];
  it("keeps a fact whose quote is really in the page, ignoring case and spacing", () => {
    const { facts, dropped } = parseExtraction({ facts: [{ page: 0, text: "Kapasitas 750 ml", quote: "kapasitas  750 ML dengan bahan stainless steel 304" }, { page: 1, text: "Berat 420 gram", quote: "Berat 420 gram." }] }, pages);
    expect(dropped).toBe(0);
    expect(facts).toEqual([
      { text: "Kapasitas 750 ml", url: OFFICIAL, host: "aqualux.example", verified: true, risky: false, quote: "kapasitas 750 ML dengan bahan stainless steel 304" },
      { text: "Berat 420 gram", url: STORE, host: "tokoresmi.example", verified: true, risky: false, quote: "Berat 420 gram." },
    ]);
  });
  it("drops a fabricated quote, a wrong page, and a number that is not in the quote", () => {
    const { facts, dropped } = parseExtraction({ facts: [
      { page: 0, text: "Tahan benturan", quote: "tahan benturan hebat" },
      { page: 1, text: "Kapasitas 750 ml", quote: "Kapasitas 750 ml" },
      { page: 0, text: "Kapasitas 900 ml", quote: "Kapasitas 750 ml dengan bahan" },
      { page: 7, text: "Entah", quote: "Warna hitam" },
      { page: 0, text: "x", quote: "ab" },
    ] }, pages);
    expect(facts).toEqual([]);
    expect(dropped).toBe(5);
  });
  it("holds back promotional or health wording, not numbers", () => {
    const withPromo: PageForAi[] = [{ url: OFFICIAL, host: "aqualux.example", title: "T", text: "Termos terbaik nomor 1 di Indonesia. Cocok untuk diet menurunkan berat badan." }];
    const { facts } = parseExtraction([{ page: 0, text: "Termos terbaik nomor 1", quote: "Termos terbaik nomor 1 di Indonesia" }, { page: 0, text: "Cocok untuk menurunkan berat badan", quote: "Cocok untuk diet menurunkan berat badan" }], withPromo);
    expect(facts.map(f => f.risky)).toEqual([true, true]);
  });
  it("accepts a bare array, copes with junk, and caps the number of facts", () => {
    expect(parseExtraction([{ page: 0, text: "Kapasitas 750 ml", quote: "Kapasitas 750 ml" }], pages).facts).toHaveLength(1);
    expect(parseExtraction("nothing", pages)).toEqual({ facts: [], dropped: 0 });
    const lots = { facts: Array.from({ length: 20 }, (_, i) => ({ page: 0, text: `Garansi resmi ${i}`, quote: "Garansi resmi 1 tahun" })) };
    expect(parseExtraction(lots, [{ ...pages[0], text: "Garansi resmi 1 tahun" }]).facts.length).toBeLessThanOrEqual(8);
  });
});

describe("aiExtractor", () => {
  it("asks the creator's AI once with the prompt and returns its JSON, without any web search", async () => {
    let sent = "";
    const fetchImpl = (async (_u: string, init: { body: string }) => { sent = init.body; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ facts: [] }) }] } }] }), { status: 200 }); }) as unknown as typeof fetch;
    const extract = aiExtractor({ apiKey: "k".repeat(30), model: "m", language: "id", fetchImpl, retryDelaysMs: [] });
    expect(await extract("PROMPT ISI")).toEqual({ facts: [] });
    expect(sent).toContain("PROMPT ISI");
    expect(sent).not.toContain("k".repeat(30));
    expect(sent).not.toMatch(/plugins|web_search|online/);
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

describe("mergeResearch", () => {
  const p = page(OFFICIAL, { host: "www.aqualux.example", brand: "Aqualux", price: { amount: "89000", currency: "IDR" }, specs: ["Kapasitas: 750 ml", "Garansi: 1 tahun"], images: ["https://cdn.aqualux.example/1.jpg", "https://cdn.aqualux.example/2.jpg"] });
  const ai: ResearchFact[] = [
    { text: "Kapasitas 750 ml", url: OFFICIAL, host: "aqualux.example", verified: true, risky: false, quote: "q" },
    { text: "Tutup rapat anti bocor", url: OFFICIAL, host: "aqualux.example", verified: true, risky: false, quote: "q2" },
    { text: "Termos terbaik", url: OFFICIAL, host: "aqualux.example", verified: true, risky: true, quote: "q3" },
  ];
  const m = mergeResearch([p], ai);
  it("lists what the page itself lists first, then quoted facts, held-back ones last, without duplicates", () => {
    expect(m.facts.map(f => f.text)).toEqual(["Kapasitas: 750 ml", "Tutup rapat anti bocor", "Garansi: 1 tahun", "Termos terbaik"]);
    expect(m.facts.filter(f => /Kapasitas/.test(f.text))).toHaveLength(1);
    expect(m.facts[2].risky).toBe(true); // a warranty line reads as a guarantee claim: unticked, the creator can still tick it
  });
  it("shows the page's price as a sourced hint, with its pictures and where they came from", () => {
    expect(m.price).toEqual({ text: "Rp 89.000", url: OFFICIAL, host: "aqualux.example", verified: true });
    expect(m.images).toHaveLength(2);
    expect(m.images[0]).toEqual({ url: "https://cdn.aqualux.example/1.jpg", pageUrl: OFFICIAL, host: "aqualux.example" });
    expect(m.brand).toBe("Aqualux");
  });
});

describe("researchEverything", () => {
  const sampleSpecs = (url: string) => page(url, { specs: [`Spek dari ${new URL(url).hostname}`], text: PAGE_TEXT, images: [`https://cdn.example/${new URL(url).hostname}.jpg`] });
  const hits = [hit(OFFICIAL, "Aqualux Termos 750 ml"), hit(STORE, "Termos Aqualux - Toko Resmi"), hit("https://www.pinterest.com/x", "pin"), hit("https://blog.example/review-termos", "Review termos terbaik"), hit("https://lain.example/termos-aqualux", "Termos Aqualux lain")];
  const base = (over: Partial<Parameters<typeof researchEverything>[1]> = {}) => {
    const read: string[] = [], queries: string[] = [];
    return { read, queries, opts: { readPage: async (u: string) => { read.push(u); return sampleSpecs(u); }, search: async (q: string) => { queries.push(q); return hits; }, ...over } };
  };

  it("reads the pasted page first, searches twice, and reads the best other pages (four in all), never the same page twice", async () => {
    const t = base();
    const r = await researchEverything({ product: "Termos Aqualux 750 ml", link: OFFICIAL + "/" }, t.opts);
    expect(t.queries).toHaveLength(2);
    expect(t.read[0]).toBe(OFFICIAL + "/");
    expect(t.read).toHaveLength(4);
    expect(t.read.filter(u => pageKey(u) === pageKey(OFFICIAL))).toHaveLength(1);
    expect(t.read.some(u => /pinterest/.test(u))).toBe(false);
    expect(r.facts.length).toBeGreaterThanOrEqual(4);
    expect(r.images.length).toBe(4);
  });
  it("works from the product name alone", async () => {
    const t = base();
    const r = await researchEverything({ product: "Termos Aqualux 750 ml" }, t.opts);
    expect(t.read).toHaveLength(4);
    expect(r.facts.length).toBeGreaterThan(0);
  });
  it("hands the pages' text to the AI and adds only its quoted facts, noting what it dropped", async () => {
    const prompts: string[] = [];
    const t = base({ extract: async prompt => { prompts.push(prompt); return { facts: [{ page: 0, text: "Garansi resmi 1 tahun", quote: "Garansi resmi 1 tahun dari distributor" }, { page: 0, text: "Anti pecah", quote: "anti pecah total" }] }; } });
    const r = await researchEverything({ product: "Termos Aqualux 750 ml", link: OFFICIAL }, t.opts);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Kapasitas 750 ml dengan bahan stainless steel 304");
    expect(r.facts.some(f => f.quote && /Garansi resmi/.test(f.text))).toBe(true);
    expect(r.facts.some(f => /Anti pecah/.test(f.text))).toBe(false);
    expect(r.notes.join(" ")).toMatch(/1 ringkasan AI dibuang/);
  });
  it("uses only what the pages list when there is no AI, and does not call one", async () => {
    const t = base();
    const r = await researchEverything({ product: "Termos Aqualux 750 ml" }, t.opts);
    expect(r.facts.every(f => !f.quote)).toBe(true);
  });
  it("keeps the pages' facts when the AI fails, and says so", async () => {
    const t = base({ extract: async () => { throw new Error("Saldo habis."); } });
    const r = await researchEverything({ product: "Termos Aqualux 750 ml" }, t.opts);
    expect(r.facts.length).toBeGreaterThan(0);
    expect(r.notes.join(" ")).toMatch(/AI tidak bisa merangkum halaman: Saldo habis\./);
  });
  it("carries on when the search is limited, with the pasted page, and says so", async () => {
    const t = base({ search: async () => { throw new ProductError("blocked", "Mesin pencari membatasi."); } });
    const r = await researchEverything({ product: "Termos Aqualux 750 ml", link: OFFICIAL }, t.opts);
    expect(r.facts.length).toBeGreaterThan(0);
    expect(r.notes).toContain("Mesin pencari membatasi.");
    expect(t.read).toEqual([OFFICIAL]);
  });
  it("reports a page that refuses to be read, and still uses the others", async () => {
    const t = base({ readPage: async (u: string) => { if (u.includes("tokoresmi")) throw new ProductError("blocked", "x"); return sampleSpecs(u); } });
    const r = await researchEverything({ product: "Termos Aqualux 750 ml" }, t.opts);
    expect(r.notes.join(" ")).toMatch(/tokoresmi\.example tidak bisa dibaca \(situsnya menolak dibaca otomatis\)/);
    expect(r.facts.length).toBeGreaterThan(0);
  });
  it("fails clearly when nothing at all could be read", async () => {
    const limited = base({ search: async () => { throw new ProductError("blocked", "Mesin pencari membatasi."); } });
    await expect(researchEverything({ product: "Termos Aqualux 750 ml" }, limited.opts)).rejects.toMatchObject({ kind: "blocked" });
    const empty = base({ search: async () => [] });
    await expect(researchEverything({ product: "Termos Aqualux 750 ml" }, empty.opts)).rejects.toThrow(/tempel tautan/i);
  });
  it("stops when cancelled", async () => {
    const ctl = new AbortController();
    const t = base({ signal: ctl.signal, search: async () => { ctl.abort(); throw new Error("aborted"); } });
    await expect(researchEverything({ product: "Termos Aqualux 750 ml" }, t.opts)).rejects.toThrow();
  });
});
