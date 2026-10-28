// Research of a product for affiliate videos, done by code: the server searches the web and reads the pages; this file picks
// the pages worth reading, collects what they say, and (when the creator has an AI key) lets the AI turn the pages' text into
// short facts. The AI never searches and never adds anything: every fact it writes must come with a quote that really appears
// in the page it names, and its numbers must be in that quote, otherwise the fact is dropped.
//
// What the pages list themselves (structured data, specification tables) is used as it is. Promotional or health wording is
// held back, a found price is only a hint with its source, and nothing joins the video's data unless the creator ticks it.
import { checkClaims, EMPTY_BRIEF } from "./affiliate";
import { answerJson, ask, type CleanupOptions } from "./gemini";
import { ProductError, readProductPage, searchWeb, type Fn, type ProductPage, type SearchHit } from "./product";

export const MAX_FACTS = 8;
const MAX_PAGES = 4;

export type ResearchFact = {
  text: string;
  url: string;
  host: string;
  /** Listed by the page itself, or quoted from it (the quote was found in its text): safe to tick by default. */
  verified: boolean;
  /** Promotional or health wording: held back and shown with a warning. */
  risky: boolean;
  /** For AI-written facts: the words of the page the fact rests on, to compare with the original. */
  quote?: string;
};
export type ResearchPrice = { text: string; url: string; host: string; verified: boolean };
export type ResearchImage = { url: string; pageUrl: string; host: string };
export type ProductResearch = {
  officialName: string; brand: string;
  facts: ResearchFact[]; price: ResearchPrice | null; images: ResearchImage[];
  /** What could not be done, in plain words (a page that blocked reading, a search that was limited…). */
  notes: string[];
};

export type ResearchQuery = { product: string; link?: string };

// ---- choosing what to read ---------------------------------------------------------------------------------------------

export function searchQueries(product: string): string[] {
  const p = product.replace(/\s+/g, " ").trim().slice(0, 100);
  return [`${p} spesifikasi resmi`, `${p} specifications`];
}

const MARKETPLACES = /(^|\.)(tokopedia|shopee|lazada|blibli|bukalapak|tiktok)\./;
const NOT_PRODUCT_PAGES = /(^|\.)(pinterest|facebook|instagram|youtube|youtu\.be|twitter|x\.com|reddit|quora|scribd|slideshare|wikipedia|linkedin)\b/;
const REVIEWISH = /\b(review|ulasan|vs|versus|terbaik|rekomendasi|perbandingan|bandingkan|top \d+)\b/i;

const words = (t: string) => t.toLowerCase().normalize("NFKD").split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4);

/** The hits worth reading, best first: the brand's own site and official shops, then marketplaces; not social media or review lists. */
export function rankHits(hits: SearchHit[], product: string, skip: string[] = []): SearchHit[] {
  const pw = words(product);
  const skipKeys = new Set(skip.map(pageKey));
  const scored = hits.map((h, i) => {
    const host = h.host.toLowerCase();
    if (NOT_PRODUCT_PAGES.test(host) || skipKeys.has(pageKey(h.url))) return null;
    let score = 0;
    if (pw.some(w => host.replace(/[^a-z0-9]/g, "").includes(w))) score += 3;
    if (/\b(official|resmi)\b/i.test(`${h.title} ${host}`)) score += 2;
    if (MARKETPLACES.test(host)) score += 1;
    if (REVIEWISH.test(h.title)) score -= 2;
    return { h, score, i };
  }).filter((x): x is { h: SearchHit; score: number; i: number } => x !== null);
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const perHost = new Map<string, number>();
  const out: SearchHit[] = [];
  for (const { h } of scored) {
    const n = perHost.get(h.host) ?? 0;
    if (n >= 2) continue;
    perHost.set(h.host, n + 1);
    out.push(h);
  }
  return out;
}

/** Two addresses of the same page compare equal: host without www, path without a trailing slash, no query or fragment. */
export function pageKey(raw: string): string {
  try { const u = new URL(raw); return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`; } catch { return ""; }
}

// ---- the AI step: short facts, each with a quote that must exist ----------------------------------------------------------

export type PageForAi = { url: string; host: string; title: string; text: string };
const EXCERPT = 2500;

export function extractionPrompt(product: string, pages: PageForAi[]): string {
  return [
    "Kamu merangkum spesifikasi produk untuk konten affiliate (bahasa Indonesia), HANYA dari teks halaman di bawah. Kamu tidak mencari apa pun dan tidak menambah apa pun.",
    "",
    `Produk yang dimaksud: ${product.replace(/\s+/g, " ").trim().slice(0, 120)}`,
    "",
    "Aturan keras:",
    "1. Ambil spesifikasi atau fitur konkret (ukuran, bahan, kapasitas, daya, fitur, isi paket, kompatibilitas, garansi resmi bila tertulis) tentang produk yang dimaksud saja; abaikan produk lain di halaman.",
    "2. Setiap fakta wajib punya \"quote\": potongan kata PERSIS dari teks halaman (salin apa adanya, 3 sampai 160 karakter) dan \"page\": nomor halaman tempat kutipan itu berada.",
    "3. \"text\" adalah ringkasan satu kalimat pendek bahasa Indonesia (maks. 100 karakter) yang isinya sama dengan kutipan. Angka di \"text\" harus ada di kutipan.",
    "4. Jangan kata promosi (terbaik, nomor 1, paling...), klaim kesehatan, rating, testimoni, jumlah terjual, atau perbandingan dengan merek lain. Jangan menebak.",
    `5. Maksimal ${MAX_FACTS} fakta.`,
    "",
    "Balas hanya JSON: {\"facts\":[{\"page\":0,\"text\":\"...\",\"quote\":\"...\"}]}",
    "",
    "HALAMAN (JSON):",
    JSON.stringify(pages.map((p, page) => ({ page, alamat: p.url, judul: p.title, teks: p.text.slice(0, EXCERPT) }))),
  ].join("\n");
}

const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/\s+/g, " ").trim();
const digits = (t: string) => (t.match(/\d[\d.,]*/g) ?? []).map(d => d.replace(/[.,]/g, ""));

/** The AI's facts that hold up: the quote is really in the page it names and the numbers are in the quote. The rest are dropped. */
export function parseExtraction(json: unknown, pages: PageForAi[]): { facts: ResearchFact[]; dropped: number } {
  const list = Array.isArray(json) ? json : (json as { facts?: unknown } | null)?.facts;
  const facts: ResearchFact[] = [];
  let dropped = 0;
  for (const f of Array.isArray(list) ? list as Record<string, unknown>[] : []) {
    const page = pages[Number(f?.page)];
    const text = String(f?.text ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
    const quote = String(f?.quote ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const ok = !!page && text.length >= 4 && quote.length >= 3 && norm(page.text).includes(norm(quote)) && digits(text).every(d => digits(quote).includes(d));
    if (!ok) { dropped++; continue; }
    facts.push({ text, url: page.url, host: page.host, verified: true, risky: checkClaims([text], EMPTY_BRIEF).some(c => c.kind !== "angka"), quote });
    if (facts.length >= MAX_FACTS) break;
  }
  return { facts, dropped };
}

/** An extractor that asks the creator's own AI (normal model, no web search) and returns its JSON answer. */
export function aiExtractor(o: CleanupOptions): (prompt: string) => Promise<unknown> {
  const schema = { type: "OBJECT", properties: { facts: { type: "ARRAY", items: { type: "OBJECT", properties: { page: { type: "INTEGER" }, text: { type: "STRING" }, quote: { type: "STRING" } }, required: ["page", "text", "quote"] } } }, required: ["facts"] };
  return prompt => ask(o, [{ text: prompt }], schema, response => answerJson(response));
}

// ---- putting it together --------------------------------------------------------------------------------------------------

/** "89000" in rupiah as the creator writes it: "Rp 89.000"; other currencies keep their code. */
export function formatPrice(amount: string, currency: string): string {
  const rupiah = !currency || currency === "IDR";
  const shown = rupiah && /^\d{4,}$/.test(amount) ? amount.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : amount;
  return `${rupiah ? "Rp" : currency} ${shown}`;
}

const normFact = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const bareHost = (p: ProductPage) => p.host.replace(/^www\./, "");

/** Facts the pages list themselves come first, then the quoted ones; held-back (promotional) ones last. */
export function mergeResearch(pages: ProductPage[], aiFacts: ResearchFact[], notes: string[] = []): ProductResearch {
  const facts: ResearchFact[] = [];
  const seen = new Set<string>();
  const add = (f: ResearchFact) => { const k = normFact(f.text); if (k && !seen.has(k)) { seen.add(k); facts.push(f); } };
  for (const p of pages) for (const s of p.specs) add({ text: s.slice(0, 120), url: p.url, host: bareHost(p), verified: true, risky: checkClaims([s], EMPTY_BRIEF).some(c => c.kind !== "angka") });
  const order = (f: ResearchFact) => (f.risky ? 1 : 0);
  for (const f of [...aiFacts].sort((a, b) => order(a) - order(b))) add(f);
  facts.sort((a, b) => order(a) - order(b));

  const priced = pages.find(p => p.price);
  const price: ResearchPrice | null = priced?.price ? { text: formatPrice(priced.price.amount, priced.price.currency), url: priced.url, host: bareHost(priced), verified: true } : null;
  const images: ResearchImage[] = [];
  for (const p of pages) for (const u of p.images) if (!images.some(i => i.url === u)) images.push({ url: u, pageUrl: p.url, host: bareHost(p) });
  return {
    officialName: pages.find(p => p.title)?.title.slice(0, 100) ?? "",
    brand: pages.find(p => p.brand)?.brand ?? "",
    facts: facts.slice(0, 12), price, images: images.slice(0, 12), notes,
  };
}

export type ResearchOptions = {
  signal?: AbortSignal;
  fn?: Fn;
  readPage?: (url: string) => Promise<ProductPage>;
  search?: (query: string) => Promise<SearchHit[]>;
  /** The creator's AI, if there is one: turns the pages' text into quoted facts. Without it only what the pages list is used. */
  extract?: (prompt: string) => Promise<unknown>;
};

/**
 * The whole research, without AI browsing: the pasted page (if any), a web search done by the server, the best few pages it
 * found, and then (if the creator has an AI key) quoted facts from those pages' text. Each part may fail on its own; only when
 * nothing at all came back is it an error.
 */
export async function researchEverything(q: ResearchQuery, o: ResearchOptions = {}): Promise<ProductResearch> {
  const read = o.readPage ?? ((url: string) => readProductPage(url, { signal: o.signal, fn: o.fn }));
  const search = o.search ?? ((query: string) => searchWeb(query, { signal: o.signal, fn: o.fn }));
  const notes: string[] = [];
  const pages: ProductPage[] = [];
  const tryRead = async (url: string) => {
    try { pages.push(await read(url)); }
    catch (e) {
      if (o.signal?.aborted) throw e;
      let host = url; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep the address */ }
      notes.push(`Halaman ${host} tidak bisa dibaca${e instanceof ProductError && e.kind === "blocked" ? " (situsnya menolak dibaca otomatis)" : ""}.`);
    }
  };

  if (q.link) await tryRead(q.link);

  // Search (two phrasings), then rank. A search that is limited or down is a note, not the end: the pasted page may be enough.
  const hits: SearchHit[] = [];
  let searchError: unknown = null;
  if (q.product.trim().length >= 2) {
    for (const query of searchQueries(q.product)) {
      try { for (const h of await search(query)) if (!hits.some(x => pageKey(x.url) === pageKey(h.url))) hits.push(h); }
      catch (e) { if (o.signal?.aborted) throw e; searchError = e; break; }
    }
    if (searchError && hits.length === 0) notes.push(searchError instanceof Error ? searchError.message : "Pencarian web gagal.");
  }
  const candidates = rankHits(hits, q.product, pages.map(p => p.url).concat(q.link ? [q.link] : [])).slice(0, MAX_PAGES - pages.length);
  // At most three at a time, so a slow shop does not hold the others back and the server is not flooded.
  for (let i = 0; i < candidates.length; i += 3) await Promise.all(candidates.slice(i, i + 3).map(c => tryRead(c.url)));

  const aiFacts: ResearchFact[] = [];
  const readable: PageForAi[] = pages.filter(p => p.text.length >= 80).map(p => ({ url: p.url, host: bareHost(p), title: p.title, text: p.text })).slice(0, MAX_PAGES);
  if (o.extract && readable.length > 0 && !o.signal?.aborted) {
    try {
      const { facts, dropped } = parseExtraction(await o.extract(extractionPrompt(q.product || pages[0]?.title || "", readable)), readable);
      aiFacts.push(...facts);
      if (dropped > 0) notes.push(`${dropped} ringkasan AI dibuang karena kutipannya tidak ditemukan di halaman.`);
    } catch (e) { if (o.signal?.aborted) throw e; notes.push(`AI tidak bisa merangkum halaman: ${e instanceof Error ? e.message : "gagal"} Spesifikasi yang tertulis di halaman tetap dipakai.`); }
  }

  const merged = mergeResearch(pages, aiFacts, notes);
  if (merged.facts.length === 0 && merged.images.length === 0) {
    if (searchError) throw searchError;
    throw new ProductError("server", "Tidak ada spesifikasi atau gambar yang bisa dibaca. Coba tempel tautan halaman produk dari toko resmi atau merek.");
  }
  return merged;
}
