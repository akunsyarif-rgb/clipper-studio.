import { beforeEach, describe, expect, it, vi } from "vitest";
import { bodyToNode, fetchIcon, getSvgDirectUrl, parseIconName, resetIconifyCache, resolveSceneIcon, searchSvgIcons } from "./iconify";

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
beforeEach(() => resetIconifyCache());

describe("addresses", () => {
  it("builds the direct SVG address with the colour encoded", () => {
    expect(getSvgDirectUrl("lucide:rocket", "#ff00aa", 64)).toBe("https://api.iconify.design/lucide/rocket.svg?color=%23ff00aa&width=64");
  });
  it("refuses sets that are not allowed and malformed names", () => {
    expect(parseIconName("mdi:home")).toBeNull();
    expect(parseIconName("lucide:../x")).toBeNull();
    expect(() => getSvgDirectUrl("mdi:home")).toThrow();
  });
});

describe("search", () => {
  it("asks the allowed sets only, keeps allowed results, and reuses the answer", async () => {
    const fn = vi.fn(async () => json({ icons: ["lucide:rocket", "mdi:rocket", "tabler:rocket"] }));
    expect(await searchSvgIcons("rocket", 5, { fetchImpl: fn as unknown as typeof fetch })).toEqual(["lucide:rocket", "tabler:rocket"]);
    await searchSvgIcons("Rocket", 5, { fetchImpl: fn as unknown as typeof fetch });
    expect(fn).toHaveBeenCalledTimes(1);
    expect((fn.mock.calls[0] as unknown as [string])[0]).toContain("query=rocket&limit=5&prefixes=lucide,tabler,feather,iconoir");
  });
  it("an empty keyword makes no request; a server error and a dead network say so", async () => {
    const fn = vi.fn();
    expect(await searchSvgIcons("  ", 5, { fetchImpl: fn })).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
    await expect(searchSvgIcons("a", 5, { fetchImpl: (async () => json({}, 500)) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "network" });
    await expect(searchSvgIcons("b", 5, { fetchImpl: (async () => { throw new TypeError("x"); }) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "network" });
    await expect(searchSvgIcons("c", 5, { fetchImpl: (async () => json({ nope: 1 })) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "format" });
  });
});

describe("icon body", () => {
  it("keeps drawing shapes and drops anything else", () => {
    const body = '<g fill="none" stroke="currentColor"><path d="M4 4l16 16" onclick="x"/><circle cx="12" cy="12" r="3"/></g><script>alert(1)</script><image href="http://x/y.png"/><path d="M0 0" fill="url(#a)"/>';
    expect(bodyToNode(body)).toEqual([["path", { d: "M4 4l16 16" }], ["circle", { cx: "12", cy: "12", r: "3" }], ["path", { d: "M0 0" }]]);
  });
  it("drops a value that is not path data", () => {
    expect(bodyToNode('<path d="M0 0 javascript:alert(1)"/>')).toEqual([]);
  });
});

describe("fetching an icon", () => {
  const reply = { icons: { rocket: { body: '<path d="M1 1h4"/><circle cx="5" cy="5" r="2"/>' } }, width: 24, height: 24 };
  it("returns a drawable icon with a stable id, fetched once", async () => {
    const fn = vi.fn(async () => json(reply));
    const a = await fetchIcon("lucide:rocket", { fetchImpl: fn as unknown as typeof fetch });
    await fetchIcon("lucide:rocket", { fetchImpl: fn as unknown as typeof fetch });
    expect(a).toMatchObject({ id: "iconify:lucide:rocket", label: "rocket (Lucide)" });
    expect(a.node).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("follows an alias (a renamed icon) to its parent, as the real API answers", async () => {
    const real = { prefix: "lucide", aliases: { "alert-triangle": { parent: "triangle-alert" } }, width: 24, height: 24, icons: { "triangle-alert": { body: '<path d="M1 1h4"/>' } } };
    const icon = await fetchIcon("lucide:alert-triangle", { fetchImpl: (async () => json(real)) as unknown as typeof fetch });
    expect(icon.id).toBe("iconify:lucide:alert-triangle");
    expect(icon.node).toHaveLength(1);
  });
  it("rejects a non-24 grid, a missing icon and a disallowed set", async () => {
    await expect(fetchIcon("lucide:rocket", { fetchImpl: (async () => json({ ...reply, width: 32, height: 32 })) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "unsupported" });
    resetIconifyCache();
    await expect(fetchIcon("lucide:nothing", { fetchImpl: (async () => json({ icons: {}, width: 24, height: 24 })) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "format" });
    await expect(fetchIcon("mdi:rocket", { fetchImpl: vi.fn() })).rejects.toMatchObject({ kind: "unsupported" });
  });
});

describe("resolving a scene icon", () => {
  const body = { icons: { "trending-up": { body: '<path d="M1 1h4"/>' }, rocket: { body: '<path d="M2 2h4"/>' } }, width: 24, height: 24 };
  it("fetches the dictionary's exact icon without any search", async () => {
    const fn = vi.fn(async () => json(body));
    const icon = await resolveSceneIcon({ exact: ["lucide:trending-up"], query: "profit" }, { fetchImpl: fn as unknown as typeof fetch });
    expect(icon?.id).toBe("iconify:lucide:trending-up");
    expect(fn).toHaveBeenCalledTimes(1);
    expect((fn.mock.calls[0] as unknown as [string])[0]).toContain("lucide.json");
  });
  it("falls back to the search when the exact name does not exist, and to null when nothing fits", async () => {
    const fn = vi.fn(async (url: string) => url.includes("/search") ? json({ icons: ["lucide:rocket"] }) : json(url.includes("icons=rocket") ? body : { icons: {}, width: 24, height: 24 }));
    expect((await resolveSceneIcon({ exact: ["lucide:nope"], query: "launch" }, { fetchImpl: fn as unknown as typeof fetch }))?.id).toBe("iconify:lucide:rocket");
    resetIconifyCache();
    expect(await resolveSceneIcon({ exact: [], query: "" }, { fetchImpl: fn as unknown as typeof fetch })).toBeNull();
  });
  it("a dead network is thrown (so a batch stops), not swallowed", async () => {
    await expect(resolveSceneIcon({ exact: ["lucide:clock"], query: "" }, { fetchImpl: (async () => { throw new TypeError("x"); }) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "network" });
  });
});
