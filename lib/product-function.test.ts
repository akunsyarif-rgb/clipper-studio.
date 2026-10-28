import { describe, expect, it } from "vitest";
import { cleanPublicUrl, handle, parseProductPage, parseSearchResults, readableText, tableSpecs } from "../supabase/functions/product/handler";

const ENV = { url: "https://p.supabase.co", serviceKey: "service-secret" };
const PAGE = "https://www.aqualux.example/produk/termos-750";
const LD = {
  "@context": "https://schema.org", "@type": "Product", name: "Termos Aqualux 750 ml", description: "Botol <b>termos</b> stainless steel &amp; tutup rapat.",
  brand: { "@type": "Brand", name: "Aqualux" }, image: ["https://cdn.aqualux.example/a.jpg", "/img/b.jpg", "http://insecure.example/c.jpg", { "@type": "ImageObject", url: "https://cdn.aqualux.example/d.jpg" }],
  offers: { "@type": "Offer", price: "89000", priceCurrency: "idr" }, material: "Stainless steel 304",
  additionalProperty: [{ name: "Kapasitas", value: "750 ml" }, { name: "", value: "x" }],
};
const html = (ld: unknown = LD, extra = "") => `<html><head><title> Termos | Aqualux </title><meta property="og:image" content="https://cdn.aqualux.example/og.jpg"><meta content="Aqualux Store" property="og:site_name">${extra}<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;

function world(opts: { user?: boolean; routes?: Record<string, Response | Error | (() => Response)> } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes("/auth/v1/user")) return opts.user === false ? new Response("{}", { status: 401 }) : new Response(JSON.stringify({ id: "u1" }), { status: 200 });
    const r = opts.routes?.[url];
    if (r === undefined) throw new Error("unexpected " + url);
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r() : r.clone();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const html200 = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
const run = async (w: ReturnType<typeof world>, body: unknown, method = "POST") => {
  const res = await handle(new Request("https://f/p", { method, headers: { authorization: "Bearer jwt" }, body: method === "POST" ? JSON.stringify(body) : undefined }), ENV, w.fetchImpl);
  return { status: res.status, res, json: res.headers.get("content-type")?.includes("json") ? await res.clone().json() : null };
};

describe("cleanPublicUrl", () => {
  it("accepts public https addresses and resolves relative ones", () => {
    expect(cleanPublicUrl("https://www.aqualux.example/a#x")).toBe("https://www.aqualux.example/a");
    expect(cleanPublicUrl("/img/b.jpg", PAGE)).toBe("https://www.aqualux.example/img/b.jpg");
  });
  it("refuses everything that could reach an internal service", () => {
    for (const bad of ["http://a.example/x", "https://u:p@a.example/x", "https://a.example:8443/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://169.254.169.254/latest/meta-data", "https://[::1]/x", "https://intranet/x", "https://db.internal/x", "https://printer.local/x", "https://2130706433/x", "ftp://a.example/x", "javascript:alert(1)", "", null, 5, "https://a.example/" + "x".repeat(1000)])
      expect(cleanPublicUrl(bad as unknown)).toBeNull();
  });
});

describe("parseProductPage", () => {
  const p = parseProductPage(html(), PAGE);
  it("reads the product's own structured facts", () => {
    expect(p).toMatchObject({ title: "Termos Aqualux 750 ml", brand: "Aqualux", host: "www.aqualux.example", price: { amount: "89000", currency: "IDR" } });
    expect(p.description).toBe("Botol termos stainless steel & tutup rapat.");
    expect(p.specs).toEqual(["Kapasitas: 750 ml", "Bahan: Stainless steel 304"]);
  });
  it("keeps only public https pictures, resolved and without duplicates, the page's own preview last", () => {
    expect(p.images).toEqual(["https://cdn.aqualux.example/a.jpg", "https://www.aqualux.example/img/b.jpg", "https://cdn.aqualux.example/d.jpg", "https://cdn.aqualux.example/og.jpg"]);
  });
  it("falls back to Open Graph and the title when there is no product data, and never guesses", () => {
    const q = parseProductPage(html({ "@type": "WebSite" }, '<meta property="og:title" content="Termos Aqualux"><meta name="description" content="Deskripsi toko">'), PAGE);
    expect(q.title).toBe("Termos Aqualux");
    expect(q.description).toBe("Deskripsi toko");
    expect(q.brand).toBe("Aqualux Store");
    expect(q.price).toBeNull();
    expect(q.specs).toEqual([]);
  });
  it("finds the product inside @graph and arrays, and skips a broken block", () => {
    const wrapped = `<script type="application/ld+json">{broken</script>` + html({ "@graph": [{ "@type": "WebPage" }, { "@type": ["Thing", "Product"], name: "Dalam Graph", offers: [{ lowPrice: "1.500" }] }] });
    const q = parseProductPage(wrapped, PAGE);
    expect(q.title).toBe("Dalam Graph");
    expect(q.price).toEqual({ amount: "1.500", currency: "" });
  });
  it("ignores a price that is not a number", () => {
    expect(parseProductPage(html({ ...LD, offers: { price: "hubungi kami" } }), PAGE).price).toBeNull();
  });
});

describe("the page action", () => {
  it("needs a signed-in user and a POST", async () => {
    expect((await run(world({ user: false }), { action: "page", url: PAGE })).status).toBe(401);
    expect((await run(world(), {}, "GET")).status).toBe(405);
    expect((await run(world(), { action: "nope" })).json.error.status).toBe("UNKNOWN_ACTION");
  });
  it("returns the parsed page", async () => {
    const r = await run(world({ routes: { [PAGE]: html200(html()) } }), { action: "page", url: PAGE });
    expect(r.status).toBe(200);
    expect(r.json.page.title).toBe("Termos Aqualux 750 ml");
    expect(r.json.page.images).toHaveLength(4);
  });
  it("refuses an internal address without fetching it", async () => {
    const w = world();
    for (const url of ["https://169.254.169.254/latest/meta-data", "http://a.example/x", "https://localhost/", "https://intranet/"]) expect((await run(w, { action: "page", url })).json.error.status).toBe("BAD_URL");
    expect(w.calls.every(c => c.url.includes("/auth/v1/user"))).toBe(true);
  });
  it("follows a redirect only to another public https address", async () => {
    const ok = world({ routes: { [PAGE]: new Response(null, { status: 301, headers: { location: "/baru" } }), "https://www.aqualux.example/baru": html200(html()) } });
    const r = await run(ok, { action: "page", url: PAGE });
    expect(r.json.page.url).toBe("https://www.aqualux.example/baru");
    const bad = world({ routes: { [PAGE]: new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }) } });
    expect((await run(bad, { action: "page", url: PAGE })).json.error.message).toMatch(/tidak diizinkan/);
    expect(bad.calls.some(c => c.url.includes("169.254"))).toBe(false);
  });
  it("stops a redirect loop", async () => {
    const loop = world({ routes: { [PAGE]: new Response(null, { status: 302, headers: { location: PAGE } }) } });
    expect((await run(loop, { action: "page", url: PAGE })).json.error.status).toBe("PAGE_UNREACHABLE");
  });
  it("explains blocks, errors, non-pages, unreachable sites and oversized pages", async () => {
    const code = async (r: Response | Error) => (await run(world({ routes: { [PAGE]: r } }), { action: "page", url: PAGE })).json.error.status;
    expect(await code(new Response("no", { status: 403 }))).toBe("PAGE_BLOCKED");
    expect(await code(new Response("no", { status: 500 }))).toBe("PAGE_ERROR");
    expect(await code(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }))).toBe("NOT_HTML");
    expect(await code(new Error("down"))).toBe("PAGE_UNREACHABLE");
    expect(await code(html200("x".repeat(1_600_000)))).toBe("PAGE_TOO_LARGE");
  });
});

describe("the image action", () => {
  const IMG = "https://cdn.aqualux.example/a.jpg";
  const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2]), { status: 200, headers: { "content-type": "image/jpeg" } });
  it("hands over the bytes of a public image, with no credentials sent", async () => {
    const w = world({ routes: { [IMG]: jpeg() } });
    const r = await run(w, { action: "image", url: IMG });
    expect(r.status).toBe(200);
    expect(r.res.headers.get("content-type")).toBe("image/jpeg");
    expect([...new Uint8Array(await r.res.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 1, 2]);
    const call = w.calls.find(c => c.url === IMG)!;
    expect(JSON.stringify(call.init.headers)).not.toMatch(/authorization|service-secret|jwt/i);
  });
  it("refuses internal addresses, non-images, failures and oversized files", async () => {
    expect((await run(world(), { action: "image", url: "https://169.254.169.254/x.jpg" })).json.error.status).toBe("BAD_URL");
    expect((await run(world({ routes: { [IMG]: new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }) } }), { action: "image", url: IMG })).json.error.status).toBe("IMAGE_FAILED");
    expect((await run(world({ routes: { [IMG]: new Response("x", { status: 403 }) } }), { action: "image", url: IMG })).json.error.status).toBe("IMAGE_FAILED");
    expect((await run(world({ routes: { [IMG]: new Error("down") } }), { action: "image", url: IMG })).json.error.status).toBe("IMAGE_UNREACHABLE");
    const big = new Response(new Uint8Array(13 * 1024 * 1024), { status: 200, headers: { "content-type": "image/png" } });
    expect((await run(world({ routes: { [IMG]: big } }), { action: "image", url: IMG })).status).toBe(413);
  });
});

const DDG_HTML = `<html><body>
<div class="result results_links results_links_deep web-result"><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.aqualux.example%2Fproduk%2Ftermos-750&amp;rut=abc">Termos <b>Aqualux</b> 750 ml &amp; tutup</a></h2>
<a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.aqualux.example%2Fproduk%2Ftermos-750">Termos stainless <b>steel</b> 750 ml menjaga dingin.</a></div>
<div class="result result--ad"><a class="result__a" href="https://duckduckgo.com/y.js?ad_provider=x&amp;u3=https%3A%2F%2Fads.example%2F">Iklan</a></div>
<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=http%3A%2F%2F169.254.169.254%2Flatest">Internal</a></div>
<div class="result"><a href="https://tokoresmi.example/aqualux-750" class="result__a">Toko resmi</a><div class="result__snippet">Beli langsung di toko resmi.</div></div>
<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.aqualux.example%2Fproduk%2Ftermos-750">Duplikat</a></div>
</body></html>`;

describe("parseSearchResults", () => {
  const hits = parseSearchResults(DDG_HTML);
  it("returns the real address behind each redirect link, with title and snippet", () => {
    expect(hits[0]).toEqual({ title: "Termos Aqualux 750 ml & tutup", url: "https://www.aqualux.example/produk/termos-750", host: "aqualux.example", snippet: "Termos stainless steel 750 ml menjaga dingin." });
    expect(hits[1]).toMatchObject({ url: "https://tokoresmi.example/aqualux-750", host: "tokoresmi.example", snippet: "Beli langsung di toko resmi." });
  });
  it("drops ads, internal addresses and duplicates", () => {
    expect(hits).toHaveLength(2);
  });
  it("copes with a page that has no results", () => {
    expect(parseSearchResults("<html><body>kosong</body></html>")).toEqual([]);
  });
});

describe("tableSpecs and readableText", () => {
  const html = `<table><tr><th>Kapasitas</th><td>750 ml</td></tr><tr><td>Bahan:</td><td><b>Stainless</b> steel 304</td></tr><tr><td>satu</td><td>dua</td><td>tiga</td></tr><tr><th>Warna</th><th>Warna</th></tr></table>
    <dl><dt>Berat</dt><dd>420 gram</dd></dl><script>var x = "Skrip jangan ikut";</script><p>Termos ini menjaga minuman tetap dingin sampai dua belas jam.</p><p>pendek</p>`;
  it("reads two-cell rows and definition lists, and nothing else", () => {
    expect(tableSpecs(html)).toEqual(["Kapasitas: 750 ml", "Bahan: Stainless steel 304", "Berat: 420 gram"]);
  });
  it("keeps the visible text without scripts or tiny fragments", () => {
    const t = readableText(html);
    expect(t).toContain("Termos ini menjaga minuman tetap dingin sampai dua belas jam.");
    expect(t).not.toContain("Skrip jangan ikut");
    expect(t).not.toContain("pendek");
  });
  it("caps the text", () => {
    expect(readableText("<p>" + "kalimat panjang yang berulang. ".repeat(2000) + "</p>").length).toBeLessThanOrEqual(8000);
  });
  it("puts the specifications and the text on the parsed page", () => {
    const p = parseProductPage(`<html><body>${html}</body></html>`, PAGE);
    expect(p.specs).toEqual(["Kapasitas: 750 ml", "Bahan: Stainless steel 304", "Berat: 420 gram"]);
    expect(p.text).toContain("Termos ini menjaga");
  });
});

describe("the search action", () => {
  const url = (q: string) => `https://html.duckduckgo.com/html/?${new URLSearchParams({ q, kl: "id-id" })}`;
  it("returns checked hits and sends no credentials to the search engine", async () => {
    const w = world({ routes: { [url("termos aqualux 750")]: html200(DDG_HTML) } });
    const r = await run(w, { action: "search", query: "  termos   aqualux 750 " });
    expect(r.status).toBe(200);
    expect(r.json.hits).toHaveLength(2);
    expect(r.json.hits[0].url).toBe("https://www.aqualux.example/produk/termos-750");
    const call = w.calls.find(c => c.url.startsWith("https://html.duckduckgo.com"))!;
    expect(JSON.stringify(call.init.headers)).not.toMatch(/authorization|service-secret|jwt/i);
  });
  it("needs a real query and a signed-in user", async () => {
    expect((await run(world(), { action: "search", query: "a" })).json.error.status).toBe("BAD_QUERY");
    expect((await run(world({ user: false }), { action: "search", query: "termos" })).status).toBe(401);
  });
  it("says so when the search engine limits automated searches or cannot be reached", async () => {
    const q = "termos";
    expect((await run(world({ routes: { [url(q)]: new Response("", { status: 202 }) } }), { action: "search", query: q })).json.error.status).toBe("SEARCH_BLOCKED");
    expect((await run(world({ routes: { [url(q)]: new Response("", { status: 429 }) } }), { action: "search", query: q })).json.error.status).toBe("SEARCH_BLOCKED");
    expect((await run(world({ routes: { [url(q)]: html200("<html>Unfortunately, bots use DuckDuckGo too. anomaly detected</html>") } }), { action: "search", query: q })).json.error.status).toBe("SEARCH_BLOCKED");
    expect((await run(world({ routes: { [url(q)]: new Response("", { status: 500 }) } }), { action: "search", query: q })).json.error.status).toBe("SEARCH_ERROR");
    expect((await run(world({ routes: { [url(q)]: new Error("down") } }), { action: "search", query: q })).json.error.status).toBe("SEARCH_UNREACHABLE");
  });
  it("returns no hits, not an error, when there are simply no results", async () => {
    const r = await run(world({ routes: { [url("xyzzy")]: html200("<html><body>No results.</body></html>") } }), { action: "search", query: "xyzzy" });
    expect(r.json.hits).toEqual([]);
  });
});
