import { describe, expect, it } from "vitest";
import { FREE_STORAGE_BYTES, staleUploads, storageUsed, usageLevel, countByPlatform, createHubApi, explainHubError, filterAssets, formatDuration, HubError, uploadToHub, type HubApi, type HubAsset, type PutFn } from "./content-hub";

const MIB = 1024 * 1024;
const asset = (o: Partial<HubAsset>): HubAsset => ({
  id: "a", title: "Judul", fileName: "file.mp4", mimeType: "video/mp4", fileSize: 1, durationSeconds: 10, width: 1080, height: 1920, source: "clipper", status: "ready",
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "", fileDeletedAt: null, platform: "uncategorized", contentFormat: "video", hasThumb: false, ...o,
});
const blobOf = (n: number, type = "video/mp4") => new Blob([new Uint8Array(n)], { type });

/** A scripted Edge Function: records calls, answers like the real one. */
function backend(o: { size: number; heldParts?: { partNumber: number; size: number }[]; partSize?: number } ) {
  const calls: { action: string; body: Record<string, unknown> }[] = [];
  const partSize = o.partSize ?? 16 * MIB, partCount = Math.ceil(o.size / partSize);
  const api: HubApi = async (action, body = {}) => {
    calls.push({ action, body });
    switch (action) {
      case "init-upload": return o.size <= 64 * MIB
        ? { asset: { id: "A1" }, mode: "single", putUrl: "https://r2/put", contentType: "video/mp4", thumbPutUrl: "https://r2/thumb" }
        : { asset: { id: "A1" }, mode: "multipart", partSize, partCount, thumbPutUrl: "https://r2/thumb" };
      case "multipart-init": return { partSize, partCount };
      case "list-parts": return { parts: o.heldParts ?? [] };
      case "sign-parts": return { parts: [{ partNumber: (body.partNumbers as number[])[0], url: `https://r2/part/${(body.partNumbers as number[])[0]}` }] };
      case "complete-single": case "complete-upload": return { asset: { id: "A1", status: "ready" } };
      case "abort-upload": return { asset: { id: "A1", status: "failed" } };
      default: throw new Error(action);
    }
  };
  return { api, calls, partCount, partSize };
}
const input = (blob: Blob, extra = {}) => ({ blob, fileName: "k.mp4", title: "K", platform: "tiktok" as const, contentFormat: "shorts" as const, source: "motion" as const, durationSeconds: 5, width: 1080, height: 1920, ...extra });

describe("uploadToHub", () => {
  it("sends a small file with one PUT, reports real byte progress, then verifies", async () => {
    const b = backend({ size: 5 * MIB });
    const seen: number[] = [];
    const puts: string[] = [];
    const put: PutFn = async (url, blob, headers, on) => { puts.push(`${url} ${headers["content-type"]}`); on(blob.size / 2); on(blob.size); };
    const r = await uploadToHub(input(blobOf(5 * MIB), { thumbnail: blobOf(100, "image/jpeg") }), { api: b.api, put, onProgress: p => seen.push(p.sent) });
    expect(r.status).toBe("ready");
    expect(puts).toEqual(["https://r2/thumb image/jpeg", "https://r2/put video/mp4"]);
    expect(seen).toEqual([0, 2.5 * MIB, 5 * MIB]);
    expect(b.calls.map(c => c.action)).toEqual(["init-upload", "complete-single"]);
    expect(b.calls[0].body).toMatchObject({ platform: "tiktok", contentFormat: "shorts", source: "motion", fileSize: 5 * MIB, mimeType: "video/mp4", thumbnail: true });
  });

  it("sends a big file in parts (3 at a time), each with a fresh URL, then completes", async () => {
    const size = 70 * MIB + 123, b = backend({ size });
    let live = 0, peak = 0;
    const sent: Record<string, number> = {};
    const put: PutFn = async (url, blob, _h, on) => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 5)); on(blob.size); sent[url] = blob.size; live--; };
    const last: number[] = [];
    await uploadToHub(input(blobOf(size)), { api: b.api, put, onProgress: p => last.push(p.sent) });
    expect(b.partCount).toBe(5);
    expect(sent["https://r2/part/5"]).toBe(6 * MIB + 123);
    expect(Object.values(sent).reduce((s, v) => s + v, 0)).toBe(size);
    expect(peak).toBeLessThanOrEqual(3);
    expect(last.at(-1)).toBe(size);
    expect(b.calls.at(-1)!.action).toBe("complete-upload");
    for (let i = 1; i < last.length; i++) expect(last[i]).toBeGreaterThanOrEqual(0);
  });

  it("retries a failed part with backoff, but not forever", async () => {
    const size = 70 * MIB, b = backend({ size }), waits: number[] = [];
    let fails = 2;
    const put: PutFn = async (url) => { if (url.endsWith("/2") && fails-- > 0) throw new HubError("network", "x"); };
    await uploadToHub(input(blobOf(size)), { api: b.api, put, sleep: async ms => { waits.push(ms); } });
    expect(waits).toEqual([1000, 2000]);
    const dead: PutFn = async (url) => { if (url.endsWith("/2")) throw new HubError("network", "x"); };
    const err = await uploadToHub(input(blobOf(size)), { api: backend({ size }).api, put: dead, sleep: async () => {} }).catch(e => e);
    expect(err).toBeInstanceOf(HubError);
    expect(err.assetId).toBe("A1");
  });

  it("resumes: asks for the same asset and skips the parts R2 already holds", async () => {
    const size = 70 * MIB + 123;
    const b = backend({ size, heldParts: [{ partNumber: 1, size: 16 * MIB }, { partNumber: 2, size: 16 * MIB }, { partNumber: 3, size: 5 * MIB }] }); // part 3 is the wrong size: sent again
    const urls: string[] = [];
    const prog: number[] = [];
    await uploadToHub(input(blobOf(size)), { api: b.api, put: async url => { urls.push(url); }, resume: "A1", onProgress: p => prog.push(p.sent) });
    expect(urls.sort()).toEqual(["https://r2/part/3", "https://r2/part/4", "https://r2/part/5"]);
    expect(b.calls[0]).toEqual({ action: "init-upload", body: { assetId: "A1" } });
    expect(prog[1]).toBe(32 * MIB); // progress starts from what is already stored
  });

  it("cancel aborts the transfer and the cloud upload", async () => {
    const size = 70 * MIB, b = backend({ size }), ctl = new AbortController();
    const put: PutFn = (_u, _b, _h, _o, signal) => new Promise((_, rej) => { ctl.abort(); signal!.addEventListener("abort", () => rej(new HubError("cancelled", "Dibatalkan."))); if (signal!.aborted) rej(new HubError("cancelled", "Dibatalkan.")); });
    const err = await uploadToHub(input(blobOf(size)), { api: b.api, put, signal: ctl.signal }).catch(e => e);
    expect(err.kind).toBe("cancelled");
    expect(b.calls.at(-1)!.action).toBe("abort-upload");
    expect(b.calls.some(c => c.action === "complete-upload")).toBe(false);
  });

  it("a thumbnail failure never fails the video; a refused request is not retried", async () => {
    const b = backend({ size: MIB });
    const ok = await uploadToHub(input(blobOf(MIB), { thumbnail: blobOf(10) }), { api: b.api, put: async url => { if (url.includes("thumb")) throw new HubError("storage", "x"); } });
    expect(ok.status).toBe("ready");
    let tries = 0;
    const api: HubApi = async (a, body) => { if (a === "sign-parts") { tries++; throw new HubError("rejected", "Ditolak"); } return backend({ size: 70 * MIB }).api(a, body); };
    const e = await uploadToHub(input(blobOf(70 * MIB)), { api, put: async () => {}, concurrency: 1 }).catch(x => x);
    expect(e.kind).toBe("rejected");
    expect(tries).toBe(1);
  });
});

describe("createHubApi", () => {
  const make = (res: Response | null | Error) => createHubApi({ fn: async () => { if (res instanceof Error) throw res; return res; } } as never);
  it("maps responses to results and errors", async () => {
    expect(await make(new Response('{"assets":[]}'))("list")).toEqual({ assets: [] });
    expect((await make(null)("list").catch(e => e)).kind).toBe("signed-out");
    expect((await make(new Response("{}", { status: 401 }))("list").catch(e => e)).kind).toBe("signed-out");
    const rej = await make(new Response('{"error":{"status":"BAD_TYPE","message":"Hanya video"}}', { status: 415 }))("x").catch(e => e);
    expect([rej.kind, rej.code, rej.message]).toEqual(["rejected", "BAD_TYPE", "Hanya video"]);
    expect((await make(new Response("oops", { status: 502 }))("x").catch(e => e)).kind).toBe("server");
    expect((await make(new Error("down"))("x").catch(e => e)).kind).toBe("network");
  });
  it("explains errors with a way out", () => {
    expect(explainHubError(new HubError("network", "x"))).toMatch(/Coba lagi/);
    expect(explainHubError(new HubError("signed-out", "x"))).toMatch(/Masuk lagi/);
  });
});

describe("list helpers", () => {
  const list = [
    asset({ id: "1", title: "Tips masak", platform: "tiktok", createdAt: "2026-10-01T00:00:00Z" }),
    asset({ id: "2", title: "Resep nasi", fileName: "nasi-goreng.mp4", platform: "youtube", createdAt: "2026-10-03T00:00:00Z" }),
    asset({ id: "3", title: "Vlog", platform: "tiktok", createdAt: "2026-10-02T00:00:00Z", status: "deleted" }),
  ];
  it("filters by category, searches title and file name, sorts", () => {
    const f = (o: object) => filterAssets(list, { platform: "all", query: "", sort: "newest", ...o }).map(a => a.id);
    expect(f({})).toEqual(["2", "3", "1"]);
    expect(f({ sort: "oldest" })).toEqual(["1", "3", "2"]);
    expect(f({ platform: "tiktok" })).toEqual(["3", "1"]);
    expect(f({ query: "NASI" })).toEqual(["2"]);
    expect(f({ query: "goreng resep" })).toEqual(["2"]);
    expect(f({ platform: "youtube", query: "vlog" })).toEqual([]);
  });
  it("counts per category including empty ones", () => {
    expect(countByPlatform(list)).toMatchObject({ all: 3, tiktok: 2, youtube: 1, instagram: 0, uncategorized: 0, other: 0 });
  });
  it("formats duration", () => {
    expect([formatDuration(5), formatDuration(65), formatDuration(3725), formatDuration(null)]).toEqual(["0:05", "1:05", "1:02:05", ""]);
  });
});

describe("storage and housekeeping helpers", () => {
  const GB = 1024 ** 3;
  it("counts finished and in-flight uploads, not failed or deleted ones", () => {
    const l = [asset({ fileSize: 2 * GB }), asset({ status: "uploading", fileSize: GB }), asset({ status: "failed", fileSize: 5 * GB }), asset({ status: "deleted", fileSize: 7 * GB })];
    expect(storageUsed(l)).toBe(3 * GB);
  });
  it("warns at 80% and flags the free allowance as passed", () => {
    expect([usageLevel(0), usageLevel(7.9 * GB), usageLevel(8 * GB), usageLevel(FREE_STORAGE_BYTES - 1), usageLevel(FREE_STORAGE_BYTES)]).toEqual(["ok", "ok", "warn", "warn", "over"]);
  });
  it("finds uploads that will never finish: failed, or uploading for over an hour", () => {
    const now = Date.parse("2026-10-30T12:00:00Z");
    const l = [
      asset({ id: "f", status: "failed", createdAt: "2026-10-30T11:59:00Z" }),
      asset({ id: "old", status: "uploading", createdAt: "2026-10-30T10:30:00Z" }),
      asset({ id: "live", status: "uploading", createdAt: "2026-10-30T11:30:00Z" }),
      asset({ id: "ok", status: "ready", createdAt: "2026-10-01T00:00:00Z" }),
    ];
    expect(staleUploads(l, now).map(a => a.id)).toEqual(["f", "old"]);
  });
});
