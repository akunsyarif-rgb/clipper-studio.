import { describe, expect, it } from "vitest";
import { handle, rank, safeLink, youtube } from "../supabase/functions/trends/handler";
import { signalsText, statusLine } from "./trends";

const ENV = { url: "https://p.supabase.co", serviceKey: "service-secret" };
const KEY = "yt_key_" + "a".repeat(30);
const NOW = Date.UTC(2026, 9, 29, 12);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

function world(opts: { user?: boolean; storedKey?: string | null; dbDown?: boolean; yt?: "ok" | "quota" | "rejected" | "down" | "empty"; wikiDown?: boolean; hnDown?: boolean } = {}) {
  const calls: string[] = [];
  let stored: string | null = opts.storedKey === undefined ? KEY : opts.storedKey;
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push(url);
    if (url.includes("/auth/v1/user")) return opts.user === false ? new Response("{}", { status: 401 }) : json({ id: "u1" });
    if (url.includes("/rest/v1/user_youtube_api")) {
      if (opts.dbDown) return new Response("{}", { status: 500 });
      if (init.method === "POST") { stored = JSON.parse(String(init.body)).api_key; return new Response(null, { status: 201 }); }
      if (init.method === "DELETE") { stored = null; return new Response(null, { status: 204 }); }
      return json(stored ? [{ api_key: stored }] : []);
    }
    if (url.startsWith("https://wikimedia.org/")) {
      if (opts.wikiDown) throw new Error("down");
      return json({ items: [{ articles: [{ article: "Halaman_Utama", views: 9e6 }, { article: "Banjir_Jakarta", views: 400000 }, { article: "Khusus:Cari", views: 1e6 }] }] });
    }
    if (url.startsWith("https://hn.algolia.com/")) {
      if (opts.hnDown) return new Response("{}", { status: 500 });
      return json({ hits: [{ title: "Banjir Jakarta terbaru", objectID: "42", points: 120, num_comments: 30, created_at_i: Math.floor(NOW / 1000) - 3600 }, { title: "", objectID: "9" }] });
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/")) {
      if (opts.yt === "quota") return json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403);
      if (opts.yt === "rejected") return json({ error: { errors: [{ reason: "keyInvalid" }] } }, 400);
      if (opts.yt === "down") throw new Error("down");
      if (opts.yt === "empty") return json({ items: [] });
      if (url.includes("/search")) return json({ items: [{ id: { videoId: "abcdefghijk" } }, { id: { videoId: "bad id" } }] });
      return json({ items: [{ id: "abcdefghijk", snippet: { title: "Cara hemat gaji", channelTitle: "Kanal  Uang", publishedAt: new Date(NOW - 2 * 864e5).toISOString() }, statistics: { viewCount: "1500000" } }] });
    }
    throw new Error("unexpected " + url);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, stored: () => stored };
}
const run = (w: ReturnType<typeof world>, body: unknown, method = "POST") =>
  handle(new Request("https://f/trends", { method, headers: { authorization: "Bearer t" }, body: method === "POST" ? JSON.stringify(body) : undefined }), ENV, w.fetchImpl, NOW);
type Body = { hasKey?: boolean; error: { status: string }; status: { source: string; ok: boolean; note?: string }[]; items: { source: string; title: string; url: string; engLabel: string; also: string[]; score: number }[] };
const out = async (r: Response) => (await r.json()) as Body;

describe("trends function", () => {
  it("answers only to a signed-in user and to POST", async () => {
    expect((await run(world({ user: false }), { action: "status" })).status).toBe(401);
    expect((await run(world(), {}, "GET")).status).toBe(405);
    expect((await run(world(), { action: "nope" })).status).toBe(400);
  });
  it("reports whether a key is saved, saves a checked key and forgets it", async () => {
    expect(await out(await run(world({ storedKey: null }), { action: "status" }))).toEqual({ hasKey: false });
    const w = world({ storedKey: null });
    expect((await run(w, { action: "save-key", apiKey: "short" })).status).toBe(400);
    expect((await run(w, { action: "save-key", apiKey: KEY })).status).toBe(200);
    expect(w.stored()).toBe(KEY);
    expect((await run(w, { action: "forget" })).status).toBe(200);
    expect(w.stored()).toBeNull();
  });
  it("does not save a key YouTube rejects, but saves one whose daily quota is merely used up", async () => {
    const bad = world({ storedKey: null, yt: "rejected" });
    const r = await run(bad, { action: "save-key", apiKey: KEY });
    expect(r.status).toBe(400); expect((await out(r)).error.status).toBe("KEY_REJECTED"); expect(bad.stored()).toBeNull();
    const spent = world({ storedKey: null, yt: "quota" });
    expect((await run(spent, { action: "save-key", apiKey: KEY })).status).toBe(200); expect(spent.stored()).toBe(KEY);
  });
  it("scans the keyless sources, drops noise pages, links only to the three sources and merges the same story", async () => {
    const b = await out(await run(world({ storedKey: null }), { action: "scan", q: "banjir", region: "ID" }));
    expect(b.status.find(s => s.source === "youtube")).toEqual({ source: "youtube", ok: false, note: "kunci YouTube belum disimpan" });
    const titles = b.items.map(i => i.title);
    expect(titles).not.toContain("Halaman Utama"); expect(titles).not.toContain("Khusus:Cari");
    expect(b.items).toHaveLength(1);
    expect(b.items[0].also.length).toBe(1);
    for (const i of b.items) expect(safeLink(i.url)).toBe(i.url);
  });
  it("adds YouTube with the saved key, never puts the key in an answer, and reports a source that fails", async () => {
    const w = world({ hnDown: true });
    const res = await run(w, { action: "scan", q: "hemat gaji", region: "ID" });
    const text = await res.clone().text();
    expect(text).not.toContain(KEY);
    const b = JSON.parse(text) as Body;
    expect(b.status).toContainEqual({ source: "hn", ok: false, note: "gagal" });
    const yt = b.items.find(i => i.source === "youtube")!;
    expect(yt.title).toBe("Cara hemat gaji"); expect(yt.engLabel).toBe("1,5 jt tayangan, Kanal Uang"); expect(yt.url).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(w.calls.some(u => u.includes("/search") && u.includes("publishedAfter"))).toBe(true);
  });
  it("uses the most-popular chart without a topic and explains a used-up quota", async () => {
    const w = world();
    await run(w, { action: "scan", q: "", region: "ID" });
    expect(w.calls.some(u => u.includes("chart=mostPopular"))).toBe(true);
    const b = await out(await run(world({ yt: "quota" }), { action: "scan", q: "x", region: "US" }));
    expect(b.status).toContainEqual({ source: "youtube", ok: false, note: "kuota harian YouTube habis" });
    expect(b.items.length).toBeGreaterThan(0);
  });
  it("still answers when a keyless source is down", async () => {
    const b = await out(await run(world({ storedKey: null, wikiDown: true }), { action: "scan", q: "banjir", region: "ID" }));
    expect(b.status.find(s => s.source === "wikipedia")!.ok).toBe(false);
    expect(b.items.length).toBe(1);
  });
  it("a database failure is reported, not hidden", async () => {
    expect((await run(world({ dbDown: true }), { action: "scan", q: "a" })).status).toBe(500);
  });
});

describe("ranking and links", () => {
  it("ranks fresher and bigger higher, per source, and keeps 20", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ source: "hn" as const, title: `topik${"abcdefghijklmnopqrstuvwxyzABCDEFGH"[i]}${i} cerita${"abcdefghijklmnopqrstuvwxyzABCDEFGH"[(i * 7) % 34]}${i} unik${"abcdefghijklmnopqrstuvwxyzABCDEFGH"[(i * 3) % 34]}${i}`, url: "https://news.ycombinator.com/item?id=" + i, eng: 10 + i * 10, engLabel: "", ts: NOW - i * 864e5 }));
    const r = rank(items, NOW);
    expect(r).toHaveLength(20);
    expect(r[0].score).toBeGreaterThanOrEqual(r[1].score);
  });
  it("refuses links to other hosts and non-https", () => {
    expect(safeLink("https://id.wikipedia.org/wiki/A")).toContain("wikipedia.org");
    expect(safeLink("http://id.wikipedia.org/wiki/A")).toBe("");
    expect(safeLink("https://evil.com/?u=youtube.com")).toBe("");
    expect(safeLink("javascript:alert(1)")).toBe("");
  });
  it("youtube() ignores videos with odd ids", async () => {
    const f = (async () => json({ items: [{ id: "x", snippet: { title: "a" } }] })) as unknown as typeof fetch;
    expect(await youtube(f, KEY, "", "ID", NOW)).toEqual([]);
  });
});

describe("client text", () => {
  it("writes the ticked signals and the source status in plain words", () => {
    const s = { source: "youtube" as const, title: "Cara hemat gaji", url: "u", engLabel: "1,5 jt tayangan", ts: 0, score: 1, also: [] };
    expect(signalsText([s])).toBe("Cara hemat gaji (YouTube: 1,5 jt tayangan)");
    expect(statusLine([{ source: "hn", ok: true, n: 3 }, { source: "youtube", ok: false, note: "kunci YouTube belum disimpan" }])).toBe("Hacker News: 3 hasil · YouTube: kunci YouTube belum disimpan");
  });
});
