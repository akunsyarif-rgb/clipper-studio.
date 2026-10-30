import { describe, expect, it } from "vitest";
import { cleanFileName, handle, LIMITS, planParts, type Env } from "../supabase/functions/media-library/handler";

const MIB = 1024 * 1024;
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const R2 = { endpoint: "https://acct.r2.cloudflarestorage.com", bucket: "bkt", accessKeyId: "AKID", secretAccessKey: "SECRET-VALUE-XYZ", region: "auto" };
const ENV: Env = { url: "https://p.supabase.co", serviceKey: "service-secret", r2: R2 };

type Row = Record<string, unknown>;
type Stored = { size: number; contentType: string };

/** In-memory Supabase Auth + PostgREST + R2 (S3 API), enough for the function's calls. */
function world(opts: { r2Fails?: (method: string, url: URL) => boolean } = {}) {
  const rows: Row[] = [];
  const objects = new Map<string, Stored>();
  const uploads = new Map<string, { key: string; contentType: string; parts: Map<number, { size: number; etag: string }> }>();
  const log: string[] = [];
  let seq = 0;
  const tokens: Record<string, string> = { "Bearer t1": U1, "Bearer t2": U2 };

  const matches = (r: Row, u: URL) => {
    for (const [k, v] of u.searchParams) {
      if (["select", "order", "limit"].includes(k)) continue;
      const [op, arg] = [v.slice(0, v.indexOf(".")), v.slice(v.indexOf(".") + 1)];
      const val = r[k];
      if (op === "eq" && String(val) !== arg) return false;
      if (op === "is" && arg === "null" && val !== null && val !== undefined) return false;
      if (op === "in" && !arg.slice(1, -1).split(",").includes(String(val))) return false;
      if (op === "lt" && !(String(val) < arg)) return false;
    }
    return true;
  };

  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const u = new URL(input), method = (init.method ?? "GET").toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (u.pathname === "/auth/v1/user") { const id = tokens[headers.authorization]; return id ? new Response(JSON.stringify({ id }), { status: 200 }) : new Response("{}", { status: 401 }); }
    if (u.pathname.startsWith("/rest/v1/media_assets")) {
      log.push(`db ${method} ${u.search}`);
      if (method === "POST") { const r = { multipart_upload_id: null, file_deleted_at: null, created_at: new Date(1_700_000_000_000 + rows.length * 1000).toISOString(), updated_at: "u", ...JSON.parse(String(init.body)) }; rows.push(r); return new Response(JSON.stringify([r]), { status: 201 }); }
      const hit = rows.filter(r => matches(r, u));
      if (method === "PATCH") { hit.forEach(r => Object.assign(r, JSON.parse(String(init.body)))); return new Response(JSON.stringify(hit), { status: 200 }); }
      const limit = Number(u.searchParams.get("limit") ?? 1000);
      return new Response(JSON.stringify([...hit].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit)), { status: 200 });
    }
    if (u.host === "acct.r2.cloudflarestorage.com") {
      expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//); // every server-side R2 call is signed
      const key = decodeURIComponent(u.pathname.replace(/^\/bkt\//, ""));
      log.push(`r2 ${method} ${key.split("/").pop()}${u.search.replace(/uploadId=[^&]*/, "uploadId=…")}`);
      if (opts.r2Fails?.(method, u)) return new Response("<Error><Code>InternalError</Code><Message>secret provider detail</Message></Error>", { status: 500 });
      if (method === "POST" && u.searchParams.has("uploads")) { const id = `up${++seq}`; uploads.set(id, { key, contentType: headers["content-type"], parts: new Map() }); return new Response(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`); }
      const up = uploads.get(u.searchParams.get("uploadId") ?? "");
      if (method === "GET" && u.searchParams.has("uploadId")) {
        if (!up) return new Response("", { status: 404 });
        const after = Number(u.searchParams.get("part-number-marker") ?? 0), max = Number(u.searchParams.get("max-parts") ?? 1000);
        const all = [...up.parts.entries()].sort((a, b) => a[0] - b[0]).filter(([n]) => n > after);
        const page = all.slice(0, Math.min(max, 2)); // small pages to exercise pagination
        const more = all.length > page.length;
        return new Response(`<ListPartsResult><IsTruncated>${more}</IsTruncated>${more ? `<NextPartNumberMarker>${page.at(-1)![0]}</NextPartNumberMarker>` : ""}${page.map(([n, p]) => `<Part><PartNumber>${n}</PartNumber><Size>${p.size}</Size><ETag>&quot;${p.etag}&quot;</ETag></Part>`).join("")}</ListPartsResult>`);
      }
      if (method === "POST" && u.searchParams.has("uploadId")) {
        if (!up) return new Response("", { status: 404 });
        const wanted = [...String(init.body).matchAll(/<PartNumber>(\d+)<\/PartNumber><ETag>"([^"]+)"/g)];
        if (wanted.some(m => up.parts.get(Number(m[1]))?.etag !== m[2])) return new Response("<Error/>", { status: 400 });
        objects.set(up.key, { size: [...up.parts.values()].reduce((s, p) => s + p.size, 0), contentType: up.contentType });
        uploads.delete(u.searchParams.get("uploadId")!);
        return new Response("<CompleteMultipartUploadResult/>");
      }
      if (method === "DELETE" && u.searchParams.has("uploadId")) { uploads.delete(u.searchParams.get("uploadId")!); return new Response(null, { status: 204 }); }
      if (method === "HEAD") { const o = objects.get(key); return o ? new Response(null, { status: 200, headers: { "content-length": String(o.size), "content-type": o.contentType } }) : new Response(null, { status: 404 }); }
      if (method === "DELETE") { objects.delete(key); return new Response(null, { status: 204 }); }
    }
    throw new Error(`unexpected ${method} ${input}`);
  }) as unknown as typeof fetch;

  /** What the browser would do with a presigned URL: PUT bytes of a given size. */
  const put = (url: string, size: number, contentType = "video/mp4") => {
    const u = new URL(url), key = decodeURIComponent(u.pathname.replace(/^\/bkt\//, ""));
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(u.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);
    if (u.searchParams.has("partNumber")) uploads.get(u.searchParams.get("uploadId")!)!.parts.set(Number(u.searchParams.get("partNumber")), { size, etag: `etag-${u.searchParams.get("partNumber")}-${size}` });
    else objects.set(key, { size, contentType });
  };
  const call = async (body: unknown, token = "t1", env: Env = ENV) => {
    const res = await handle(new Request("https://f/media-library", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), env, fetchImpl, () => new Date("2026-10-30T00:00:00Z"));
    return { status: res.status, body: await res.json() as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  return { rows, objects, uploads, log, put, call };
}

const small = { action: "init-upload", fileName: "klip.mp4", mimeType: "video/mp4", fileSize: 5 * MIB, title: "Klip", durationSeconds: 12.5, width: 1080, height: 1920, source: "motion" };

describe("helpers", () => {
  it("plans parts: 16 MiB, growing only past 9000 parts", () => {
    expect(planParts(100 * MIB)).toEqual({ partSize: 16 * MIB, partCount: 7 });
    expect(planParts(16 * MIB).partCount).toBe(1);
    const huge = planParts(2 * 1024 ** 4);
    expect(huge.partCount).toBeLessThanOrEqual(9000);
    expect(huge.partSize % MIB).toBe(0);
  });
  it("cleans file names", () => {
    expect(cleanFileName("../../etc/pass\u0000wd.mp4")).toBe("passwd.mp4");
    expect(cleanFileName('a"b<c>.mp4')).toBe("abc.mp4");
    expect(cleanFileName("x".repeat(300) + ".mp4").length).toBeLessThanOrEqual(160);
    expect(cleanFileName("x".repeat(300) + ".mp4").endsWith(".mp4")).toBe(true);
  });
});

describe("media-library: access", () => {
  it("rejects unauthenticated and malformed calls; never trusts a user id in the body", async () => {
    const w = world();
    expect((await w.call(small, "nope")).status).toBe(401);
    expect((await handle(new Request("https://f", { method: "GET" }), ENV, fetch)).status).toBe(405);
    const r = await w.call({ ...small, userId: U2, user_id: U2 });
    expect(r.status).toBe(200);
    expect(w.rows[0].user_id).toBe(U1);
    expect((await w.call({ action: "nope" })).status).toBe(400);
  });
  it("answers NOT_CONFIGURED when R2 secrets are missing", async () => {
    expect((await world().call(small, "t1", { ...ENV, r2: null })).body.error.status).toBe("NOT_CONFIGURED");
  });
  it("hides other users' assets (same answer as a missing one)", async () => {
    const w = world();
    const { body } = await w.call(small);
    for (const action of ["get-download-url", "delete-file", "abort-upload", "complete-single", "init-upload"]) {
      const r = await w.call({ action, assetId: body.asset.id }, "t2");
      expect(r.status, action).toBe(404);
    }
    expect((await w.call({ action: "list" }, "t2")).body.assets).toEqual([]);
    expect((await w.call({ action: "list" })).body.assets).toHaveLength(1);
  });
  it("validates type, size and name", async () => {
    const w = world();
    expect((await w.call({ ...small, mimeType: "application/zip" })).status).toBe(415);
    expect((await w.call({ ...small, fileSize: 0 })).status).toBe(400);
    expect((await w.call({ ...small, fileSize: 1.5 })).status).toBe(400);
    expect((await w.call({ ...small, fileSize: LIMITS.maxFileBytes + 1 })).status).toBe(400);
    expect((await w.call({ ...small, fileName: "///" })).status).toBe(400);
    expect((await w.call({ ...small, assetId: "../x" })).status).toBe(400);
    expect((await w.call({ ...small, fileSize: 200 * 1024 ** 3 })).status).toBe(200); // no app-made size cap
  });
});

describe("media-library: single PUT", () => {
  it("uploads, goes ready only after the object is verified, downloads, deletes but keeps metadata", async () => {
    const w = world();
    const init = await w.call(small);
    expect(init.body.mode).toBe("single");
    const { putUrl, ...rest } = init.body; // the presigned URL itself must carry the object path; nothing else may
    expect(putUrl).not.toContain("SECRET-VALUE");
    expect(JSON.stringify(rest)).not.toMatch(/object_key|u\/1111|SECRET-VALUE|multipart_upload_id/);
    const id = init.body.asset.id;
    expect(w.rows[0].object_key).toMatch(new RegExp(`^u/${U1}/${id}/[0-9a-f]{32}\\.mp4$`));
    expect(new URL(init.body.putUrl).searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");

    expect((await w.call({ action: "complete-single", assetId: id })).body.error.status).toBe("NOT_UPLOADED"); // nothing there yet
    expect(w.rows[0].status).toBe("uploading");
    w.put(init.body.putUrl, 5 * MIB);
    const done = await w.call({ action: "complete-single", assetId: id });
    expect(done.body.asset.status).toBe("ready");
    expect((await w.call({ action: "complete-single", assetId: id })).status).toBe(200); // idempotent

    const dl = await w.call({ action: "get-download-url", assetId: id });
    const du = new URL(dl.body.url);
    expect(du.searchParams.get("response-content-disposition")).toContain('attachment; filename="klip.mp4"');
    expect(Number(du.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(300);
    expect(JSON.stringify(dl.body)).not.toContain("SECRET-VALUE");

    const del = await w.call({ action: "delete-file", assetId: id });
    expect(del.body.asset.status).toBe("deleted");
    expect(del.body.asset.fileDeletedAt).toBe("2026-10-30T00:00:00.000Z");
    expect(w.objects.size).toBe(0);
    expect(w.rows).toHaveLength(1); // metadata stays
    expect((await w.call({ action: "list" })).body.assets[0]).toMatchObject({ title: "Klip", fileSize: 5 * MIB, status: "deleted", source: "motion", durationSeconds: 12.5 });
    expect((await w.call({ action: "get-download-url", assetId: id })).status).toBe(409);
    expect((await w.call({ action: "delete-file", assetId: id })).body.asset.status).toBe("deleted"); // idempotent
  });
  it("fails the upload when the stored size is wrong, and removes the object", async () => {
    const w = world();
    const init = await w.call(small);
    w.put(init.body.putUrl, 4 * MIB);
    const r = await w.call({ action: "complete-single", assetId: init.body.asset.id });
    expect(r.body.error.status).toBe("SIZE_MISMATCH");
    expect(w.rows[0].status).toBe("failed");
    expect(w.objects.size).toBe(0);
  });
  it("retries a failed upload with the same asset", async () => {
    const w = world();
    const init = await w.call(small);
    const id = init.body.asset.id;
    expect((await w.call({ action: "abort-upload", assetId: id })).body.asset.status).toBe("failed");
    const retry = await w.call({ action: "init-upload", assetId: id });
    expect(retry.body.asset.status).toBe("uploading");
    w.put(retry.body.putUrl, 5 * MIB);
    expect((await w.call({ action: "complete-single", assetId: id })).body.asset.status).toBe("ready");
    expect((await w.call({ action: "abort-upload", assetId: id })).status).toBe(409); // a finished video cannot be "cancelled"
    expect(w.rows).toHaveLength(1);
  });
});

describe("media-library: multipart", () => {
  const big = { ...small, fileSize: 70 * MIB + 123 }; // 4 x 16 MiB + 6 MiB + 123 B -> 5 parts

  async function start(w: ReturnType<typeof world>) {
    const init = await w.call(big);
    expect(init.body).toMatchObject({ mode: "multipart", partSize: 16 * MIB, partCount: 5 });
    const id = init.body.asset.id;
    const mp = await w.call({ action: "multipart-init", assetId: id });
    expect(mp.body.partCount).toBe(5);
    return id as string;
  }
  const signAndPut = async (w: ReturnType<typeof world>, id: string, n: number, size: number) => {
    const s = await w.call({ action: "sign-parts", assetId: id, partNumbers: [n] });
    w.put(s.body.parts[0].url, size);
  };

  it("uploads parts, verifies them against R2, completes, and is ready only after the object checks out", async () => {
    const w = world();
    const id = await start(w);
    expect((await w.call({ action: "multipart-init", assetId: id })).status).toBe(200); // idempotent: no second upload
    expect(w.uploads.size).toBe(1);
    for (const n of [1, 2, 3, 4]) await signAndPut(w, id, n, 16 * MIB);
    const early = await w.call({ action: "complete-upload", assetId: id });
    expect(early.status).toBe(409);
    expect(early.body.error).toMatchObject({ status: "PARTS_MISMATCH", missing: [5] });
    expect((await w.call({ action: "list-parts", assetId: id })).body.parts.map((p: { partNumber: number }) => p.partNumber)).toEqual([1, 2, 3, 4]); // pagination: 2 per page
    await signAndPut(w, id, 5, 6 * MIB + 123);
    const done = await w.call({ action: "complete-upload", assetId: id });
    expect(done.body.asset.status).toBe("ready");
    expect(w.objects.size).toBe(1);
    expect(w.rows[0].multipart_upload_id).toBeNull();
    expect((await w.call({ action: "complete-upload", assetId: id })).status).toBe(200); // idempotent
  });
  it("rejects wrong part sizes, a wrong total and a wrong client etag", async () => {
    const w = world();
    const id = await start(w);
    await signAndPut(w, id, 1, 15 * MIB);
    for (const n of [2, 3, 4]) await signAndPut(w, id, n, 16 * MIB);
    await signAndPut(w, id, 5, 6 * MIB + 123);
    const bad = await w.call({ action: "complete-upload", assetId: id });
    expect(bad.body.error).toMatchObject({ status: "PARTS_MISMATCH", wrongSize: [1] });
    await signAndPut(w, id, 1, 16 * MIB); // the retried part replaces the bad one
    const lie = await w.call({ action: "complete-upload", assetId: id, parts: [{ partNumber: 1, etag: "forged" }] });
    expect(lie.body.error.status).toBe("PARTS_MISMATCH");
    expect((await w.call({ action: "complete-upload", assetId: id, parts: [{ partNumber: 1, etag: `"etag-1-${16 * MIB}"` }] })).body.asset.status).toBe("ready");
  });
  it("limits and validates sign-parts", async () => {
    const w = world();
    const id = await start(w);
    for (const partNumbers of [[], [0], [6], [1.5], ["1"], Array.from({ length: 101 }, () => 1)]) expect((await w.call({ action: "sign-parts", assetId: id, partNumbers })).status).toBe(400);
    expect((await w.call({ action: "sign-parts", assetId: id, partNumbers: [1, 1, 2] })).body.parts).toHaveLength(2);
  });
  it("cancel aborts the multipart upload and marks the asset failed; retry starts clean", async () => {
    const w = world();
    const id = await start(w);
    await signAndPut(w, id, 1, 16 * MIB);
    expect((await w.call({ action: "abort-upload", assetId: id })).body.asset.status).toBe("failed");
    expect(w.uploads.size).toBe(0);
    expect((await w.call({ action: "sign-parts", assetId: id, partNumbers: [1] })).status).toBe(409);
    const retry = await w.call({ action: "init-upload", assetId: id });
    expect(retry.body).toMatchObject({ mode: "multipart", partCount: 5 });
    expect((await w.call({ action: "multipart-init", assetId: id })).status).toBe(200);
    expect(w.uploads.size).toBe(1);
  });
  it("refuses multipart actions on a small file and single actions on a big one", async () => {
    const w = world();
    const s = await w.call(small);
    expect((await w.call({ action: "multipart-init", assetId: s.body.asset.id })).body.error.status).toBe("NOT_MULTIPART");
    const id = await start(w);
    expect((await w.call({ action: "complete-single", assetId: id })).body.error.status).toBe("NOT_SINGLE");
  });
  it("deleting an unfinished upload aborts it and keeps the row", async () => {
    const w = world();
    const id = await start(w);
    await signAndPut(w, id, 1, 16 * MIB);
    expect((await w.call({ action: "delete-file", assetId: id })).body.asset.status).toBe("deleted");
    expect(w.uploads.size).toBe(0);
    expect(w.rows).toHaveLength(1);
  });
});

describe("media-library: provider failures", () => {
  it("answers a generic error without provider details or secrets, and a failed delete stays retryable", async () => {
    let failDelete = false;
    const w = world({ r2Fails: (m, u) => failDelete && m === "DELETE" && !u.searchParams.has("uploadId") });
    const init = await w.call(small);
    const id = init.body.asset.id;
    w.put(init.body.putUrl, 5 * MIB);
    await w.call({ action: "complete-single", assetId: id });
    failDelete = true;
    const r = await w.call({ action: "delete-file", assetId: id });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toMatch(/provider detail|InternalError|SECRET|acct\.r2|u\/1111/);
    expect(w.rows[0].status).toBe("deleting");
    failDelete = false;
    expect((await w.call({ action: "delete-file", assetId: id })).body.asset.status).toBe("deleted");
  });
  it("lists newest first and pages with `before`", async () => {
    const w = world();
    for (let i = 0; i < 3; i++) await w.call({ ...small, title: `v${i}` });
    const all = (await w.call({ action: "list" })).body.assets;
    expect(all.map((a: { title: string }) => a.title)).toEqual(["v2", "v1", "v0"]);
    expect((await w.call({ action: "list", limit: 1 })).body.assets).toHaveLength(1);
    expect((await w.call({ action: "list", before: all[1].createdAt })).body.assets.map((a: { title: string }) => a.title)).toEqual(["v0"]);
    expect(JSON.stringify(all)).not.toMatch(/object_key|multipart/);
  });
});

describe("media-library: categories and thumbnails", () => {
  it("defaults to uncategorized/video, accepts valid categories, rejects unknown ones", async () => {
    const w = world();
    expect((await w.call(small)).body.asset).toMatchObject({ platform: "uncategorized", contentFormat: "video", hasThumb: false });
    const t = await w.call({ ...small, platform: "tiktok", contentFormat: "shorts" });
    expect(t.body.asset).toMatchObject({ platform: "tiktok", contentFormat: "shorts" });
    expect((await w.call({ ...small, platform: "myspace" })).body.error.status).toBe("BAD_CATEGORY");
    expect((await w.call({ ...small, contentFormat: "podcast" })).body.error.status).toBe("BAD_CATEGORY");
  });
  it("moves a video between categories and renames it, in any status, only for its owner", async () => {
    const w = world();
    const id = (await w.call(small)).body.asset.id;
    const r = await w.call({ action: "update-meta", assetId: id, platform: "youtube", contentFormat: "long_form", title: "  Judul   baru " });
    expect(r.body.asset).toMatchObject({ platform: "youtube", contentFormat: "long_form", title: "Judul baru" });
    expect(w.rows[0].platform).toBe("youtube");
    expect((await w.call({ action: "update-meta", assetId: id, platform: "x" }, "t2")).status).toBe(404);
    expect(w.rows[0].platform).toBe("youtube");
    for (const bad of [{ platform: "nope" }, { contentFormat: "nope" }, { title: "   " }, {}]) expect((await w.call({ action: "update-meta", assetId: id, ...bad })).status).toBe(400);
    w.put((await w.call({ action: "init-upload", assetId: id })).body.putUrl, 5 * MIB);
    await w.call({ action: "complete-single", assetId: id });
    await w.call({ action: "delete-file", assetId: id });
    expect((await w.call({ action: "update-meta", assetId: id, platform: "threads" })).body.asset).toMatchObject({ status: "deleted", platform: "threads" }); // metadata outlives the file
  });
  it("signs a thumbnail upload, keeps it only if it exists and is small, lists a signed URL, and removes it with the file", async () => {
    const w = world();
    const init = await w.call({ ...small, thumbnail: true });
    expect(init.body.thumbPutUrl).toContain("X-Amz-Signature=");
    const id = init.body.asset.id;
    const thumbKey = w.rows[0].thumb_key as string;
    expect(thumbKey).toMatch(new RegExp(`^u/${U1}/${id}/[0-9a-f]{32}-thumb\\.jpg$`));
    w.put(init.body.putUrl, 5 * MIB);
    w.put(init.body.thumbPutUrl, 20_000, "image/jpeg");
    expect((await w.call({ action: "complete-single", assetId: id })).body.asset).toMatchObject({ status: "ready", hasThumb: true });
    const listed = (await w.call({ action: "list" })).body.assets[0];
    expect(listed.thumbUrl).toContain("X-Amz-Signature=");
    expect(JSON.stringify(listed)).not.toMatch(/thumb_key|object_key|-thumb\.jpg\b.*u\//);
    await w.call({ action: "delete-file", assetId: id });
    expect(w.objects.has(thumbKey)).toBe(false);
    expect(w.rows[0].thumb_key).toBeNull();
    expect((await w.call({ action: "list" })).body.assets[0].thumbUrl).toBeNull();
  });
  it("drops a missing or oversized thumbnail without failing the video", async () => {
    const w = world();
    const a = await w.call({ ...small, thumbnail: true });
    w.put(a.body.putUrl, 5 * MIB);
    expect((await w.call({ action: "complete-single", assetId: a.body.asset.id })).body.asset).toMatchObject({ status: "ready", hasThumb: false });
    const b = await w.call({ ...small, thumbnail: true });
    w.put(b.body.putUrl, 5 * MIB);
    w.put(b.body.thumbPutUrl, 600 * 1024, "image/jpeg");
    expect((await w.call({ action: "complete-single", assetId: b.body.asset.id })).body.asset).toMatchObject({ status: "ready", hasThumb: false });
    expect(w.objects.size).toBe(2); // only the two videos
  });
  it("inline download URLs carry no attachment header", async () => {
    const w = world();
    const init = await w.call(small);
    w.put(init.body.putUrl, 5 * MIB);
    await w.call({ action: "complete-single", assetId: init.body.asset.id });
    const u = new URL((await w.call({ action: "get-download-url", assetId: init.body.asset.id, inline: true })).body.url);
    expect(u.searchParams.has("response-content-disposition")).toBe(false);
    expect(u.searchParams.get("response-content-type")).toBe("video/mp4");
  });
});
