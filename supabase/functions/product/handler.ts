// Product pages for Clipper Studio's affiliate mode: reads a public product page (the shop's or the brand's own) and returns
// its structured facts (schema.org Product, Open Graph) and picture addresses, and hands over the bytes of a chosen picture.
// It answers only to a signed-in user. The server fetches addresses it was given, so every one of them (and every redirect)
// must be a public https address: no credentials, no ports, no IP numbers, no local or internal names. Nothing here needs a key.
// Pure on purpose (fetch is passed in) so it is unit-tested from the app's test suite.

export type Env = { url: string; serviceKey: string };
export type ProductPage = {
  url: string; host: string; title: string; brand: string; description: string;
  price: { amount: string; currency: string } | null;
  /** "name: value" facts the page lists itself (schema.org additionalProperty). */
  specs: string[];
  images: string[];
};

const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const UA = "Mozilla/5.0 (compatible; ClipperStudio/1.0; product-page-reader)";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const fail = (status: number, code: string, message: string) => reply(status, { error: { status: code, message } });

/** A public https address, or null: no credentials, query-less port, IP number, localhost, or local/internal name. */
export function cleanPublicUrl(raw: unknown, base?: string): string | null {
  if (typeof raw !== "string" || raw.length > 1000) return null;
  let u: URL;
  try { u = new URL(raw.trim(), base); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost") || h.includes(":") || h.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(h) || /^\d+$/.test(h.split(".").pop() ?? "")) return null;
  u.hash = "";
  return u.toString();
}

/** Fetches with redirects followed by hand, so each hop is checked like the first address. */
async function fetchPublic(fetchImpl: typeof fetch, url: string, accept: string, timeoutMs: number): Promise<{ res: Response; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchImpl(current, { redirect: "manual", headers: { "user-agent": UA, accept, "accept-language": "id-ID,id;q=0.9,en;q=0.7" }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 300 && res.status < 400) {
      const next = cleanPublicUrl(res.headers.get("location") ?? "", current);
      if (!next) throw new Error("REDIRECT_REFUSED");
      current = next;
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

/** At most `max` bytes of the body, so an enormous page cannot exhaust the function. */
async function readCapped(res: Response, max: number): Promise<ArrayBuffer | null> {
  const reader = res.body?.getReader();
  if (!reader) { const all = await res.arrayBuffer(); return all.byteLength > max ? null : all; }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { void reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out.buffer;
}

const text = (v: unknown, max: number) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, max);

function metaContent(html: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(`<meta\\b[^>]*?(?:property|name)\\s*=\\s*["']${name}["'][^>]*?>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const v = content?.[1] ?? content?.[2];
    if (v) return v;
  }
  return "";
}

type Json = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const isProduct = (n: Json) => asArray(n["@type"]).some(t => String(t).toLowerCase() === "product");

function ldNodes(html: string): Json[] {
  const out: Json[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (v && typeof v === "object") {
      const o = v as Json;
      out.push(o);
      if (o["@graph"]) visit(o["@graph"]);
    }
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1].trim())); } catch { /* a broken block is skipped */ }
  }
  return out;
}

/** The product page's facts. Anything missing stays empty; nothing is guessed. */
export function parseProductPage(html: string, pageUrl: string): ProductPage {
  const product = ldNodes(html).find(isProduct);
  const brandRaw = product?.brand;
  const brand = text(typeof brandRaw === "object" && brandRaw ? (brandRaw as Json).name : brandRaw, 80);
  const offers = asArray(product?.offers).filter((o): o is Json => !!o && typeof o === "object");
  const offer = offers.find(o => o.price !== undefined || o.lowPrice !== undefined) ?? offers[0];
  const amount = offer ? text(offer.price ?? offer.lowPrice, 30) : "";
  const price = amount && /^[\d.,]+$/.test(amount) ? { amount, currency: text(offer?.priceCurrency, 5).toUpperCase() } : null;

  const specs: string[] = [];
  for (const p of asArray(product?.additionalProperty)) {
    const o = p as Json;
    const name = text(o?.name, 60), value = text(o?.value, 80);
    if (name && value) specs.push(`${name}: ${value}`);
  }
  for (const key of ["material", "color", "weight", "size"]) {
    const v = product?.[key];
    const val = typeof v === "object" && v ? text((v as Json).name ?? (v as Json).value, 80) : text(v, 80);
    if (val) specs.push(`${key === "material" ? "Bahan" : key === "color" ? "Warna" : key === "weight" ? "Berat" : "Ukuran"}: ${val}`);
  }

  const candidates: unknown[] = [];
  for (const im of asArray(product?.image)) candidates.push(typeof im === "object" && im ? (im as Json).url : im);
  candidates.push(metaContent(html, ["og:image", "og:image:secure_url", "twitter:image"]));
  const images: string[] = [];
  for (const c of candidates) {
    const u = cleanPublicUrl(c, pageUrl);
    if (u && !images.includes(u)) images.push(u);
    if (images.length >= 8) break;
  }

  const title = text(product?.name ?? metaContent(html, ["og:title", "twitter:title"]) ?? "", 160) || text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 160);
  const description = text(product?.description ?? metaContent(html, ["og:description", "description", "twitter:description"]), 600);
  const host = new URL(pageUrl).hostname;
  return { url: pageUrl, host, title, brand: brand || text(metaContent(html, ["og:site_name"]), 60), description, price, specs: specs.slice(0, 12), images };
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Gunakan POST.");

  const authorization = req.headers.get("authorization") ?? "";
  let uid = "";
  try {
    const who = await fetchImpl(`${env.url}/auth/v1/user`, { headers: { apikey: env.serviceKey, authorization } });
    if (who.ok) uid = ((await who.json()) as { id?: string }).id ?? "";
  } catch { return fail(502, "AUTH_UNREACHABLE", "Layanan login tidak terjangkau."); }
  if (!uid) return fail(401, "NOT_SIGNED_IN", "Masuk dulu.");

  let msg: { action?: string; url?: unknown };
  try { msg = await req.json(); } catch { return fail(400, "BAD_REQUEST", "Permintaan tidak terbaca."); }

  try {
    if (msg.action === "page") {
      const url = cleanPublicUrl(msg.url);
      if (!url) return fail(400, "BAD_URL", "Tautan harus alamat https publik (tanpa IP, port, atau nama lokal).");
      let got: { res: Response; finalUrl: string };
      try { got = await fetchPublic(fetchImpl, url, "text/html,application/xhtml+xml", 20_000); }
      catch (e) { return fail(502, "PAGE_UNREACHABLE", e instanceof Error && /REDIRECT/.test(e.message) ? "Halaman mengalihkan ke alamat yang tidak diizinkan." : "Halaman tidak terjangkau dari server."); }
      if (got.res.status === 401 || got.res.status === 403 || got.res.status === 429) return fail(502, "PAGE_BLOCKED", "Situs menolak dibaca otomatis (sering terjadi di marketplace). Coba tautan halaman toko resmi atau merek.");
      if (!got.res.ok) return fail(502, "PAGE_ERROR", `Halaman menjawab ${got.res.status}.`);
      if (!/text\/html|application\/xhtml/i.test(got.res.headers.get("content-type") ?? "")) return fail(502, "NOT_HTML", "Tautan itu bukan halaman web.");
      const bytes = await readCapped(got.res, MAX_HTML_BYTES);
      if (!bytes) return fail(413, "PAGE_TOO_LARGE", "Halaman terlalu besar untuk dibaca.");
      return reply(200, { page: parseProductPage(new TextDecoder("utf-8", { fatal: false }).decode(bytes), got.finalUrl) });
    }

    if (msg.action === "image") {
      const url = cleanPublicUrl(msg.url);
      if (!url) return fail(400, "BAD_URL", "Alamat gambar tidak valid.");
      let got: { res: Response; finalUrl: string };
      try { got = await fetchPublic(fetchImpl, url, "image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5", 30_000); }
      catch { return fail(502, "IMAGE_UNREACHABLE", "Gambar tidak terjangkau dari server."); }
      if (!got.res.ok) return fail(502, "IMAGE_FAILED", "Gambar gagal diambil (situs mungkin melarang pengambilan otomatis).");
      const type = (got.res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return fail(502, "IMAGE_FAILED", "Jawaban bukan gambar JPG, PNG, atau WebP.");
      const bytes = await readCapped(got.res, MAX_IMAGE_BYTES);
      if (!bytes) return fail(413, "TOO_LARGE", "Gambar terlalu besar.");
      return new Response(bytes, { status: 200, headers: { ...CORS, "content-type": type } });
    }
  } catch { return fail(500, "SERVER_ERROR", "Kesalahan di server."); }

  return fail(400, "UNKNOWN_ACTION", "Perintah tidak dikenal.");
}
