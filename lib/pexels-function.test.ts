import { describe, expect, it } from "vitest";
import { cleanImageUrl, croppedUrl, handle, readPhotos } from "../supabase/functions/pexels/handler";

const ENV = { url: "https://p.supabase.co", serviceKey: "service-secret" };
const KEY = "pexels_key_" + "a".repeat(30);
const raw = (id: number, extra: object = {}) => ({
  id, alt: "Orang  berjalan\n di jalan", url: `https://www.pexels.com/photo/x-${id}/`, photographer: "Siti Aminah", photographer_url: "https://www.pexels.com/@siti",
  src: {
    original: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`, medium: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&h=350`,
    portrait: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?fit=crop&h=1200&w=800`,
  }, ...extra,
});

function world(opts: { user?: boolean; storedKey?: string | null; dbDown?: boolean; search?: Response | Error; image?: Response | Error } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  let stored: string | null = opts.storedKey === undefined ? KEY : opts.storedKey;
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes("/auth/v1/user")) return opts.user === false ? new Response("{}", { status: 401 }) : new Response(JSON.stringify({ id: "u1" }), { status: 200 });
    if (url.includes("/rest/v1/user_pexels")) {
      if (opts.dbDown) return new Response("{}", { status: 500 });
      if (init.method === "POST") { stored = JSON.parse(String(init.body)).api_key; return new Response(null, { status: 201 }); }
      if (init.method === "DELETE") { stored = null; return new Response(null, { status: 204 }); }
      return new Response(JSON.stringify(stored ? [{ api_key: stored }] : []), { status: 200 });
    }
    if (url.startsWith("https://api.pexels.com/v1/search")) {
      const s = opts.search ?? new Response(JSON.stringify({ photos: [raw(1), raw(2)] }), { status: 200, headers: { "x-ratelimit-remaining": "187" } });
      if (s instanceof Error) throw s;
      return s.clone();
    }
    if (url.startsWith("https://images.pexels.com/")) {
      const i = opts.image ?? new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });
      if (i instanceof Error) throw i;
      return i.clone();
    }
    throw new Error("unexpected " + url);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, stored: () => stored };
}
const run = async (w: ReturnType<typeof world>, body: unknown, method = "POST") => {
  const res = await handle(new Request("https://f/p", { method, headers: { authorization: "Bearer jwt" }, body: method === "POST" ? JSON.stringify(body) : undefined }), ENV, w.fetchImpl);
  return { status: res.status, res, json: res.headers.get("content-type")?.includes("json") ? await res.clone().json() : null };
};

describe("addresses", () => {
  it("accepts only Pexels' own image host over https", () => {
    expect(cleanImageUrl("https://images.pexels.com/photos/1/a.jpeg")).toBe("https://images.pexels.com/photos/1/a.jpeg");
    for (const bad of ["http://images.pexels.com/photos/1/a.jpeg", "https://evil.com/photos/1/a.jpeg", "https://images.pexels.com.evil.com/photos/1/a.jpeg", "https://u:p@images.pexels.com/photos/1/a.jpeg", "https://images.pexels.com:8443/photos/1/a.jpeg", "https://images.pexels.com/other/a.jpeg", "javascript:alert(1)", 5, null]) expect(cleanImageUrl(bad)).toBeNull();
  });
  it("asks for the photo already cropped to the video's size", () => {
    expect(croppedUrl("https://images.pexels.com/photos/9/p.jpeg?junk=1")).toBe("https://images.pexels.com/photos/9/p.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920");
  });
});

describe("readPhotos", () => {
  it("returns small checked records with the credit", () => {
    const [p] = readPhotos({ photos: [raw(5)] });
    expect(p).toMatchObject({ id: 5, alt: "Orang berjalan di jalan", photographer: "Siti Aminah", photographerUrl: "https://www.pexels.com/@siti", pexelsUrl: "https://www.pexels.com/photo/x-5/" });
    expect(p.image).toContain("w=1080&h=1920");
    expect(p.fallback).toContain("w=800");
  });
  it("drops photos with an unexpected address, and credit links that are not Pexels", () => {
    const list = readPhotos({ photos: [raw(1, { src: { original: "https://evil.com/photos/1/a.jpg", medium: "https://evil.com/photos/1/a.jpg", portrait: "https://evil.com/photos/1/a.jpg" } }), raw(2, { photographer_url: "https://evil.com/@x" }), { id: "x" }] });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(2);
    expect(list[0].photographerUrl).toBe("");
  });
  it("copes with garbage", () => {
    expect(readPhotos(null)).toEqual([]);
    expect(readPhotos({ photos: "no" })).toEqual([]);
  });
});

describe("the pexels function", () => {
  it("needs a signed-in user and a POST", async () => {
    expect((await run(world({ user: false }), { action: "status" })).status).toBe(401);
    expect((await run(world(), {}, "GET")).status).toBe(405);
    expect((await run(world(), { action: "nope" })).json.error.status).toBe("UNKNOWN_ACTION");
  });

  it("reports whether a key is saved, never the key", async () => {
    const r = await run(world(), { action: "status" });
    expect(r.json).toEqual({ hasKey: true });
    expect(JSON.stringify(r.json)).not.toContain(KEY);
    expect((await run(world({ storedKey: null }), { action: "status" })).json).toEqual({ hasKey: false });
  });

  it("checks a new key with Pexels before saving it", async () => {
    const w = world({ storedKey: null });
    const r = await run(w, { action: "save-key", apiKey: `  ${KEY} ` });
    expect(r.json).toEqual({ ok: true });
    expect(w.stored()).toBe(KEY);
    const check = w.calls.find(c => c.url.startsWith("https://api.pexels.com"))!;
    expect((check.init.headers as Record<string, string>).authorization).toBe(KEY);
    expect(check.url).toContain("per_page=1");
  });
  it("refuses a malformed key, and one Pexels rejects, without saving", async () => {
    const w = world({ storedKey: null });
    expect((await run(w, { action: "save-key", apiKey: "short" })).json.error.status).toBe("BAD_KEY");
    expect((await run(w, { action: "save-key", apiKey: "has space " + "a".repeat(30) })).json.error.status).toBe("BAD_KEY");
    const rejected = world({ storedKey: null, search: new Response("{}", { status: 401 }) });
    expect((await run(rejected, { action: "save-key", apiKey: KEY })).json.error.status).toBe("KEY_REJECTED");
    expect(rejected.stored()).toBeNull();
  });
  it("still saves a valid key when Pexels is only rate-limiting right now", async () => {
    const w = world({ storedKey: null, search: new Response("{}", { status: 429 }) });
    expect((await run(w, { action: "save-key", apiKey: KEY })).json).toEqual({ ok: true });
  });
  it("forgets the key", async () => {
    const w = world();
    expect((await run(w, { action: "forget" })).json).toEqual({ ok: true });
    expect(w.stored()).toBeNull();
  });

  it("searches portrait photos with the saved key and returns checked records and the quota left", async () => {
    const w = world();
    const r = await run(w, { action: "search", query: "  jam   pasir ", perPage: 99, page: 2 });
    expect(r.status).toBe(200);
    expect(r.json.photos).toHaveLength(2);
    expect(r.json.remaining).toBe(187);
    const call = w.calls.find(c => c.url.startsWith("https://api.pexels.com"))!;
    const q = new URL(call.url).searchParams;
    expect(q.get("query")).toBe("jam pasir");
    expect(q.get("orientation")).toBe("portrait");
    expect(q.get("per_page")).toBe("12");
    expect(q.get("page")).toBe("2");
    expect((call.init.headers as Record<string, string>).authorization).toBe(KEY);
    expect(JSON.stringify(r.json)).not.toContain(KEY);
  });
  it("explains each way a search can fail", async () => {
    expect((await run(world({ storedKey: null }), { action: "search", query: "kopi" })).json.error.status).toBe("NO_KEY");
    expect((await run(world(), { action: "search", query: "k" })).json.error.status).toBe("BAD_QUERY");
    expect((await run(world({ search: new Response("{}", { status: 401 }) }), { action: "search", query: "kopi" })).json.error.status).toBe("KEY_REJECTED");
    const limited = await run(world({ search: new Response("{}", { status: 429 }) }), { action: "search", query: "kopi" });
    expect(limited.status).toBe(429);
    expect(limited.json.error.status).toBe("RATE_LIMIT");
    expect((await run(world({ search: new Response("{}", { status: 500 }) }), { action: "search", query: "kopi" })).json.error.status).toBe("UPSTREAM_ERROR");
    expect((await run(world({ search: new Error("boom") }), { action: "search", query: "kopi" })).json.error.status).toBe("UPSTREAM_UNREACHABLE");
    expect((await run(world({ dbDown: true }), { action: "search", query: "kopi" })).json.error.status).toBe("DB_ERROR");
  });

  it("hands over the bytes of a Pexels photo, sending no key to the image host", async () => {
    const w = world();
    const r = await run(w, { action: "image", url: "https://images.pexels.com/photos/1/a.jpeg?w=1080" });
    expect(r.status).toBe(200);
    expect(r.res.headers.get("content-type")).toBe("image/jpeg");
    expect([...new Uint8Array(await r.res.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 1, 2, 3]);
    const call = w.calls.find(c => c.url.startsWith("https://images.pexels.com"))!;
    expect(JSON.stringify(call.init.headers ?? {})).not.toContain(KEY);
  });
  it("fetches nothing outside Pexels' image host", async () => {
    const w = world();
    for (const url of ["https://evil.com/photos/1/a.jpeg", "http://images.pexels.com/photos/1/a.jpeg", "https://internal.local/x", ""]) {
      expect((await run(w, { action: "image", url })).json.error.status).toBe("BAD_URL");
    }
    expect(w.calls.some(c => c.url.includes("evil.com") || c.url.includes("internal"))).toBe(false);
  });
  it("rejects a non-image answer, a failed fetch and an oversized image", async () => {
    const url = "https://images.pexels.com/photos/1/a.jpeg";
    expect((await run(world({ image: new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }) }), { action: "image", url })).json.error.status).toBe("IMAGE_FAILED");
    expect((await run(world({ image: new Response("x", { status: 404 }) }), { action: "image", url })).json.error.status).toBe("IMAGE_FAILED");
    expect((await run(world({ image: new Error("down") }), { action: "image", url })).json.error.status).toBe("UPSTREAM_UNREACHABLE");
    const big = new Response(new Uint8Array(13 * 1024 * 1024), { status: 200, headers: { "content-type": "image/jpeg" } });
    expect((await run(world({ image: big }), { action: "image", url })).status).toBe(413);
  });
});
