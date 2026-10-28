import { describe, expect, it } from "vitest";
import { downloadProductImage, normalizeLink, ProductError, readProductPage, searchWeb, type ProductPage } from "./product";

const page: ProductPage = { url: "https://a.example/p", host: "a.example", title: "T", brand: "B", description: "D", price: null, specs: ["Kapasitas: 750 ml"], images: ["https://cdn.a.example/1.jpg"], text: "Teks halaman." };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const err = (status: number, code: string, message = "") => json(status, { error: { status: code, message } });
const fnOf = (...answers: (Response | null | Error)[]) => {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const fn = async (name: string, body: unknown) => {
    calls.push({ name, body: body as Record<string, unknown> });
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return a === undefined ? json(200, {}) : a?.clone() ?? null;
  };
  return { fn, calls };
};

describe("normalizeLink", () => {
  it("accepts a pasted address, adding https when missing, and upgrades http", () => {
    expect(normalizeLink("https://www.a.example/p?x=1")).toBe("https://www.a.example/p?x=1");
    expect(normalizeLink("  a.example/produk/termos ")).toBe("https://a.example/produk/termos");
    expect(normalizeLink("http://a.example/p")).toBe("https://a.example/p");
  });
  it("rejects what is not an address", () => {
    for (const bad of ["", "   ", "termos aqualux", "javascript:alert(1)", "ftp://a.example/x", "satu"]) expect(normalizeLink(bad)).toBeNull();
  });
});

describe("readProductPage", () => {
  it("asks the product function for the page", async () => {
    const f = fnOf(json(200, { page }));
    expect(await readProductPage("https://a.example/p", { fn: f.fn })).toEqual(page);
    expect(f.calls).toEqual([{ name: "product", body: { action: "page", url: "https://a.example/p" } }]);
  });
  it("explains each way it can fail", async () => {
    await expect(readProductPage("x", { fn: fnOf(err(400, "BAD_URL", "Tautan harus https.")).fn })).rejects.toMatchObject({ kind: "bad-url" });
    await expect(readProductPage("x", { fn: fnOf(err(502, "PAGE_BLOCKED", "Situs menolak.")).fn })).rejects.toMatchObject({ kind: "blocked", message: "Situs menolak." });
    await expect(readProductPage("x", { fn: fnOf(null).fn })).rejects.toMatchObject({ kind: "signed-out" });
    await expect(readProductPage("x", { fn: fnOf(json(404, {})).fn })).rejects.toMatchObject({ kind: "server", message: /belum dipasang/ });
    await expect(readProductPage("x", { fn: fnOf(new Error("offline")).fn })).rejects.toMatchObject({ kind: "network" });
    await expect(readProductPage("x", { fn: fnOf(json(200, { nope: 1 })).fn })).rejects.toBeInstanceOf(ProductError);
  });
});

describe("downloadProductImage", () => {
  it("returns the picture as a file", async () => {
    const f = fnOf(new Response(new Uint8Array(2000).fill(1), { status: 200, headers: { "content-type": "image/jpeg" } }));
    const file = await downloadProductImage("https://cdn.a.example/1.jpg", { fn: f.fn, name: "produk-a.jpg" });
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toBe("produk-a.jpg");
    expect(f.calls[0].body).toEqual({ action: "image", url: "https://cdn.a.example/1.jpg" });
  });
  it("rejects a broken or non-image answer and explains a refusal", async () => {
    await expect(downloadProductImage("u", { fn: fnOf(new Response("<html>", { headers: { "content-type": "text/html" } })).fn })).rejects.toMatchObject({ kind: "server" });
    await expect(downloadProductImage("u", { fn: fnOf(err(502, "IMAGE_FAILED", "Situs melarang.")).fn })).rejects.toMatchObject({ kind: "blocked" });
  });
});

describe("searchWeb", () => {
  it("asks the product function to search and returns the hits", async () => {
    const hits = [{ title: "T", url: "https://a.example/p", host: "a.example", snippet: "S" }];
    const f = fnOf(json(200, { hits }));
    expect(await searchWeb("termos aqualux", { fn: f.fn })).toEqual(hits);
    expect(f.calls).toEqual([{ name: "product", body: { action: "search", query: "termos aqualux" } }]);
  });
  it("treats an odd answer as no hits and explains a limited search engine", async () => {
    expect(await searchWeb("x", { fn: fnOf(json(200, { nope: 1 })).fn })).toEqual([]);
    await expect(searchWeb("x", { fn: fnOf(err(502, "SEARCH_BLOCKED", "Mesin pencari membatasi.")).fn })).rejects.toMatchObject({ kind: "blocked", message: "Mesin pencari membatasi." });
    await expect(searchWeb("x", { fn: fnOf(null).fn })).rejects.toMatchObject({ kind: "signed-out" });
    await expect(searchWeb("x", { fn: fnOf(new Error("offline")).fn })).rejects.toMatchObject({ kind: "network" });
  });
  it("keeps the page's text when it is missing from an older answer", async () => {
    const { text: _t, ...noText } = page;
    expect((await readProductPage("u", { fn: fnOf(json(200, { page: noText })).fn })).text).toBe("");
  });
});
