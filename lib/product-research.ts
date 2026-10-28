// AI research of a product for affiliate videos: a web-searching model (through the creator's OpenRouter key) reports the
// product's specifications with the page each one came from; the product pages themselves are read too (lib/product.ts).
//
// Accuracy is the point, so nothing here trusts the model's word: a fact counts as sourced only when the address it cites
// is one the search itself returned (the answer's citations), facts with promotional or health wording are held back, and
// prices are only ever shown as a hint with their source, never put into the video's data on their own.
import { cloud } from "./cloud";
import { checkClaims, EMPTY_BRIEF } from "./affiliate";
import { explain, GeminiError } from "./gemini";
import { ProductError, readProductPage, type Fn, type ProductPage } from "./product";

/** A search model that cites its sources. Changeable in the panel because model names on the router change over time. */
export const DEFAULT_RESEARCH_MODEL = "perplexity/sonar";
export const MAX_FACTS = 8;

export type ResearchFact = {
  text: string;
  url: string;
  host: string;
  /** The cited page is one the search really returned (or the page was read directly): safe to tick by default. */
  verified: boolean;
  /** Promotional or health wording: held back and shown with a warning. */
  risky: boolean;
};
export type ResearchPrice = { text: string; url: string; host: string; verified: boolean };
export type ResearchPage = { url: string; host: string; kind: string; title: string };
export type ResearchAnswer = { officialName: string; brand: string; category: string; facts: ResearchFact[]; price: ResearchPrice | null; pages: ResearchPage[]; citations: string[] };

export type ResearchQuery = { product: string; link?: string };

export function researchPrompt(q: ResearchQuery): string {
  return [
    "Kamu peneliti produk untuk konten affiliate (bahasa Indonesia). Cari di web informasi tentang produk berikut dan laporkan HANYA fakta yang tertulis di halaman yang kamu temukan.",
    "",
    `Produk: ${q.product.replace(/\s+/g, " ").trim().slice(0, 120)}`,
    q.link ? `Halaman produk dari pembuat video (utamakan): ${q.link}` : "",
    "",
    "Aturan keras:",
    "1. Setiap fakta berupa spesifikasi atau fitur konkret (ukuran, bahan, kapasitas, daya, fitur, isi paket, kompatibilitas, garansi resmi bila tertulis) dan wajib punya source_url: alamat halaman tempat fakta itu tertulis.",
    "2. Jangan menulis kata promosi (terbaik, nomor 1, paling...), klaim kesehatan, testimoni, rating, jumlah terjual, atau perbandingan dengan merek lain.",
    "3. Jangan menebak. Bila tidak yakin, jangan dimasukkan. Angka harus persis seperti di sumber.",
    "4. Utamakan halaman resmi merek atau produsen, lalu toko resmi, lalu marketplace; hindari blog dan ulasan.",
    `5. Maksimal ${MAX_FACTS} fakta, satu kalimat pendek per fakta (maks. 100 karakter).`,
    "6. Harga: laporkan hanya bila tertulis di sumber, sebagai teks apa adanya, dengan source_url. Harga bisa berubah.",
    "7. pages: sampai 3 alamat halaman produk (resmi, toko, atau marketplace) yang paling relevan.",
    "",
    "Balas hanya JSON: {\"official_name\":\"...\",\"brand\":\"...\",\"category\":\"...\",\"facts\":[{\"text\":\"...\",\"source_url\":\"...\"}],\"price\":{\"text\":\"...\",\"source_url\":\"...\"},\"pages\":[{\"url\":\"...\",\"kind\":\"official|store|marketplace|other\",\"title\":\"...\"}]}",
  ].filter(l => l !== "").join("\n");
}

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
/** Two addresses of the same page compare equal: host without www, path without a trailing slash, no query or fragment. */
export function pageKey(raw: string): string {
  try { const u = new URL(raw); return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`; } catch { return ""; }
}
const httpsUrl = (v: unknown): string => { try { const u = new URL(String(v ?? "").trim()); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : ""; } catch { return ""; } };
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\*\*/g, "").replace(/^\s*(?:[-•·]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim().slice(0, max);

type RawAnswer = {
  choices?: { message?: { content?: unknown; annotations?: { type?: string; url_citation?: { url?: string }; url?: string }[] } }[];
  citations?: unknown[]; search_results?: { url?: string }[];
};

/** Every address the search itself returned, from whichever of the router's answer shapes is present. */
export function citedAddresses(response: unknown): string[] {
  const r = response as RawAnswer | null;
  const out: string[] = [];
  for (const a of r?.choices?.[0]?.message?.annotations ?? []) { const u = httpsUrl(a?.url_citation?.url ?? a?.url); if (u) out.push(u); }
  for (const c of r?.citations ?? []) { const u = httpsUrl(typeof c === "string" ? c : (c as { url?: string } | null)?.url); if (u) out.push(u); }
  for (const s of r?.search_results ?? []) { const u = httpsUrl(s?.url); if (u) out.push(u); }
  return [...new Set(out)];
}

function jsonFromText(text: string): Record<string, unknown> | null {
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  for (const candidate of [t, t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)]) {
    if (!candidate.startsWith("{")) continue;
    try { const v = JSON.parse(candidate); if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>; } catch { /* try the next form */ }
  }
  return null;
}

export function parseResearch(response: unknown): ResearchAnswer {
  const content = (response as RawAnswer | null)?.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? content : Array.isArray(content) ? content.map(p => (p as { text?: string })?.text ?? "").join("") : "";
  if (!raw.trim()) throw new GeminiError("format", "Layanan pencarian tidak memberi jawaban. Coba lagi.");
  const json = jsonFromText(raw);
  if (!json) throw new GeminiError("format", "Jawaban pencarian tidak berbentuk JSON yang bisa dibaca. Coba lagi.");
  const citations = citedAddresses(response);
  const cited = new Set(citations.map(pageKey));

  const facts: ResearchFact[] = [];
  const seen = new Set<string>();
  for (const f of Array.isArray(json.facts) ? json.facts as Record<string, unknown>[] : []) {
    const text = clean(f?.text, 120);
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (text.length < 4 || seen.has(key)) continue;
    seen.add(key);
    const url = httpsUrl(f?.source_url);
    // Promotional or health wording is held back; the numbers inside a specification are fine (they are the point).
    const risky = checkClaims([text], EMPTY_BRIEF).some(c => c.kind !== "angka");
    facts.push({ text, url, host: hostOf(url), verified: !!url && cited.has(pageKey(url)), risky });
    if (facts.length >= MAX_FACTS) break;
  }

  const p = json.price as Record<string, unknown> | undefined;
  const priceText = clean(p?.text, 60), priceUrl = httpsUrl(p?.source_url);
  const price = priceText && /\d/.test(priceText) ? { text: priceText, url: priceUrl, host: hostOf(priceUrl), verified: !!priceUrl && cited.has(pageKey(priceUrl)) } : null;

  const pages: ResearchPage[] = [];
  for (const g of Array.isArray(json.pages) ? json.pages as Record<string, unknown>[] : []) {
    const url = httpsUrl(g?.url);
    // Only pages the search really returned are read; an address the model made up is never fetched.
    if (!url || !cited.has(pageKey(url)) || pages.some(x => pageKey(x.url) === pageKey(url))) continue;
    pages.push({ url, host: hostOf(url), kind: clean(g?.kind, 20) || "other", title: clean(g?.title, 100) });
    if (pages.length >= 3) break;
  }
  return { officialName: clean(json.official_name, 100), brand: clean(json.brand, 60), category: clean(json.category, 60), facts, price, pages, citations };
}

/** Asks the web-searching model. Needs the router's (OpenAI-format) key kept on the server. */
export async function researchProduct(q: ResearchQuery, o: { model?: string; signal?: AbortSignal; fn?: Fn } = {}): Promise<ResearchAnswer> {
  const model = (o.model ?? DEFAULT_RESEARCH_MODEL).trim();
  const body = { messages: [{ role: "user", content: researchPrompt(q) }], temperature: 0.1 };
  let res: Response | null;
  try { res = await (o.fn ?? ((n, b, op) => cloud.fn(n, b, op)))("gemini", { action: "generate", model, body }, { signal: o.signal, timeoutMs: 100_000 }); }
  catch { throw new GeminiError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res) throw new GeminiError("key", "Sesi masuk berakhir. Masuk lagi.");
  let json: unknown = null;
  try { json = await res.json(); } catch { /* an error page without JSON */ }
  if (!res.ok) {
    const e = explain(res.status, json);
    if (e.kind === "model") throw new GeminiError("model", `Model pencarian web "${model}" tidak ditemukan di layanan Anda. Ganti namanya di bagian Lanjutan.`);
    throw e;
  }
  return parseResearch(json);
}

// ---- putting the answer and the pages together --------------------------------------------------------------------------

export type ResearchImage = { url: string; pageUrl: string; host: string };
export type ProductResearch = {
  officialName: string; brand: string; category: string;
  facts: ResearchFact[]; price: ResearchPrice | null; images: ResearchImage[];
  /** What could not be done, in plain words (a page that blocked reading, no search answer…). */
  notes: string[];
};

/** "89000" in rupiah as the creator writes it: "Rp 89.000"; other currencies keep their code. */
export function formatPrice(amount: string, currency: string): string {
  const rupiah = !currency || currency === "IDR";
  const shown = rupiah && /^\d{4,}$/.test(amount) ? amount.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : amount;
  return `${rupiah ? "Rp" : currency} ${shown}`;
}

const normFact = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Facts the pages themselves list come first (structured, read directly), then the sourced search facts, then the rest. */
export function mergeResearch(answer: ResearchAnswer | null, pages: ProductPage[], notes: string[] = []): ProductResearch {
  const facts: ResearchFact[] = [];
  const seen = new Set<string>();
  const add = (f: ResearchFact) => { const k = normFact(f.text); if (k && !seen.has(k)) { seen.add(k); facts.push(f); } };
  for (const p of pages) for (const s of p.specs) add({ text: s.slice(0, 120), url: p.url, host: p.host.replace(/^www\./, ""), verified: true, risky: checkClaims([s], EMPTY_BRIEF).some(c => c.kind !== "angka") });
  const order = (f: ResearchFact) => (f.verified && !f.risky ? 0 : f.risky ? 2 : 1);
  for (const f of [...(answer?.facts ?? [])].sort((a, b) => order(a) - order(b))) add(f);

  let price: ResearchPrice | null = answer?.price ?? null;
  const pagePrice = pages.find(p => p.price)?.price;
  if (pagePrice) { const page = pages.find(p => p.price)!; price = { text: formatPrice(pagePrice.amount, pagePrice.currency), url: page.url, host: page.host.replace(/^www\./, ""), verified: true }; }

  const images: ResearchImage[] = [];
  for (const p of pages) for (const u of p.images) if (!images.some(i => i.url === u)) images.push({ url: u, pageUrl: p.url, host: p.host.replace(/^www\./, "") });
  return {
    officialName: answer?.officialName || pages.find(p => p.title)?.title.slice(0, 100) || "",
    brand: answer?.brand || pages.find(p => p.brand)?.brand || "",
    category: answer?.category ?? "",
    facts: facts.slice(0, 12), price, images: images.slice(0, 12), notes,
  };
}

/**
 * The whole research: the page the creator pasted (if any), the web search, and the best pages the search found. Each part
 * may fail on its own (shops often refuse to be read); only when nothing at all came back is it an error.
 */
export async function researchEverything(q: ResearchQuery, o: { model?: string; signal?: AbortSignal; fn?: Fn; readPage?: (url: string) => Promise<ProductPage> } = {}): Promise<ProductResearch> {
  const read = o.readPage ?? ((url: string) => readProductPage(url, { signal: o.signal, fn: o.fn }));
  const notes: string[] = [];
  const pages: ProductPage[] = [];
  const tryRead = async (url: string) => {
    try { pages.push(await read(url)); }
    catch (e) { if (o.signal?.aborted) throw e; notes.push(`Halaman ${new URL(url).hostname.replace(/^www\./, "")} tidak bisa dibaca${e instanceof ProductError && e.kind === "blocked" ? " (situsnya menolak dibaca otomatis)" : ""}.`); }
  };
  if (q.link) await tryRead(q.link);

  let answer: ResearchAnswer | null = null;
  let searchError: unknown = null;
  try { answer = await researchProduct(q, { model: o.model, signal: o.signal, fn: o.fn }); }
  catch (e) { if (o.signal?.aborted) throw e; searchError = e; notes.push(e instanceof Error ? e.message : "Pencarian web gagal."); }

  const have = new Set(pages.map(p => pageKey(p.url)));
  for (const page of (answer?.pages ?? []).filter(p => !have.has(pageKey(p.url))).slice(0, 2)) await tryRead(page.url);

  const merged = mergeResearch(answer, pages, notes);
  if (merged.facts.length === 0 && merged.images.length === 0) {
    if (searchError) throw searchError;
    throw new GeminiError("format", "Tidak ada informasi yang bisa dipastikan sumbernya. Coba tempel tautan halaman produk dari toko resmi atau merek.");
  }
  return merged;
}
