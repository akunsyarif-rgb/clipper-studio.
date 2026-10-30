// Content Hub backend for Clipper Studio: metadata, ownership and short-lived presigned URLs for Cloudflare R2.
// The video bytes never pass through here: the browser PUTs them straight to R2 (one PUT, or multipart for big files).
// The function answers only to a signed-in user (JWT verified by the platform and again here through Supabase Auth), reads
// and writes public.media_assets with the service role, and ALWAYS filters by the user id Auth returned, never by anything
// in the request. Object keys are made here and never returned. Pure on purpose (environment and fetch are passed in) so it
// is unit-tested from the app's test suite.
import { r2, R2Error, type R2Config } from "./r2.ts";

export type Env = { url: string; serviceKey: string; r2: R2Config | null };
export type Status = "uploading" | "ready" | "failed" | "deleting" | "deleted";
type Row = {
  id: string; user_id: string; title: string; file_name: string; mime_type: string; file_size: number; duration_seconds: number | null;
  width: number | null; height: number | null; source: string; object_key: string; status: Status; multipart_upload_id: string | null;
  created_at: string; updated_at: string; file_deleted_at: string | null;
};

const MIB = 1024 * 1024;
export const LIMITS = {
  /** Up to this size one presigned PUT is used; bigger files go multipart (retryable per part). */
  singleMax: 64 * MIB,
  /** Preferred multipart part size; grows only when 10,000 parts (R2's limit) would not be enough. */
  partSize: 16 * MIB,
  maxParts: 9_000,
  /** R2's own ceiling for one object (5 TiB). There is no smaller limit set by the app. */
  maxFileBytes: 5 * 1024 ** 4 - 1,
  signMaxParts: 100,
  uploadUrlTtl: 15 * 60,
  downloadUrlTtl: 5 * 60,
  mimeTypes: ["video/mp4", "video/webm", "video/quicktime"] as readonly string[],
};
const EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PUBLIC_COLUMNS = "id,title,file_name,mime_type,file_size,duration_seconds,width,height,source,status,created_at,updated_at,file_deleted_at";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
class Fail extends Error { constructor(readonly status: number, readonly code: string, message: string, readonly extra: Record<string, unknown> = {}) { super(message); } }
const fail = (status: number, code: string, message: string, extra?: Record<string, unknown>) => new Fail(status, code, message, extra);

/** The part size for a file: 16 MiB, or larger (whole MiB) when the file would need more than `maxParts` parts. */
export function planParts(fileSize: number): { partSize: number; partCount: number } {
  const partSize = Math.max(LIMITS.partSize, Math.ceil(fileSize / LIMITS.maxParts / MIB) * MIB);
  return { partSize, partCount: Math.max(1, Math.ceil(fileSize / partSize)) };
}

/** A file name safe to store and to put in a header: no path, no control characters, at most 160 characters. */
export function cleanFileName(raw: unknown): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? "";
  const name = base.replace(/[\u0000-\u001f\u007f"<>:*?|]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  if (name.length <= 160) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0 && name.length - dot <= 12 ? name.slice(0, 160 - (name.length - dot)) + name.slice(dot) : name.slice(0, 160);
}

const num = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const int = (v: unknown, min: number, max: number): number | null => { const n = num(v, min, max); return n !== null && Number.isInteger(n) ? n : null; };

const publicAsset = (r: Row) => ({
  id: r.id, title: r.title, fileName: r.file_name, mimeType: r.mime_type, fileSize: r.file_size, durationSeconds: r.duration_seconds,
  width: r.width, height: r.height, source: r.source, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, fileDeletedAt: r.file_deleted_at,
});

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reply(405, { error: { status: "METHOD_NOT_ALLOWED", message: "Gunakan POST." } });
  try {
    return await route(req, env, fetchImpl, now);
  } catch (e) {
    if (e instanceof Fail) return reply(e.status, { error: { status: e.code, message: e.message, ...e.extra } });
    // Provider and database details stay in the server log (status only), never in the answer.
    console.error("media-library", e instanceof R2Error ? `${e.op}:${e.status}` : e instanceof Error ? e.name : "unknown");
    return reply(502, { error: { status: e instanceof R2Error ? "STORAGE_ERROR" : "SERVER_ERROR", message: "Penyimpanan cloud sedang bermasalah. Coba lagi sebentar lagi." } });
  }
}

async function route(req: Request, env: Env, fetchImpl: typeof fetch, now: () => Date): Promise<Response> {
  // 1. Who is asking. The id comes from Supabase Auth for the bearer token, never from the body.
  let uid = "";
  try {
    const who = await fetchImpl(`${env.url}/auth/v1/user`, { headers: { apikey: env.serviceKey, authorization: req.headers.get("authorization") ?? "" } });
    if (who.ok) uid = ((await who.json()) as { id?: string }).id ?? "";
  } catch { throw fail(502, "AUTH_UNREACHABLE", "Layanan login tidak terjangkau."); }
  if (!UUID.test(uid)) throw fail(401, "NOT_SIGNED_IN", "Masuk dulu.");

  let msg: Record<string, unknown>;
  try { const b = await req.json(); if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error(); msg = b as Record<string, unknown>; } catch { throw fail(400, "BAD_REQUEST", "Permintaan tidak terbaca."); }
  if (!env.r2) throw fail(500, "NOT_CONFIGURED", "Penyimpanan cloud belum dikonfigurasi di server.");
  const store = r2(env.r2, fetchImpl, now);

  // 2. Database access (service role) scoped to this user.
  const db = (path: string, init: RequestInit = {}) => fetchImpl(`${env.url}/rest/v1/${path}`, {
    ...init, headers: { apikey: env.serviceKey, authorization: `Bearer ${env.serviceKey}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
  const one = async (res: Response): Promise<Row | null> => { if (!res.ok) throw new Error("db"); const rows = (await res.json()) as Row[]; return rows[0] ?? null; };
  const mine = async (id: unknown): Promise<Row> => {
    if (typeof id !== "string" || !UUID.test(id)) throw fail(400, "BAD_ASSET", "Video tidak dikenali.");
    const row = await one(await db(`media_assets?id=eq.${id}&user_id=eq.${uid}&select=*`));
    if (!row) throw fail(404, "NOT_FOUND", "Video tidak ditemukan."); // same answer for "not yours" and "does not exist"
    return row;
  };
  /** Compare-and-set: changes the row only if it is still in one of `from`; null when another request got there first. */
  const move = async (row: Row, from: Status[], set: Record<string, unknown>): Promise<Row | null> =>
    one(await db(`media_assets?id=eq.${row.id}&user_id=eq.${uid}&status=in.(${from.join(",")})`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(set) }));

  const action = String(msg.action ?? "");
  const mustBe = (row: Row, ...ok: Status[]) => { if (!ok.includes(row.status)) throw fail(409, "BAD_STATUS", `Video sedang berstatus "${row.status}".`, { assetStatus: row.status }); };
  const expectMultipart = (row: Row) => { if (row.file_size <= LIMITS.singleMax) throw fail(400, "NOT_MULTIPART", "Video ini diunggah dengan satu permintaan."); };
  const quietly = async (p: Promise<unknown>) => { try { await p; } catch { /* best effort */ } };

  switch (action) {
    case "init-upload": {
      // A retry: same asset, fresh upload.
      if (msg.assetId !== undefined) {
        const row = await mine(msg.assetId);
        mustBe(row, "uploading", "failed");
        if (row.multipart_upload_id) await quietly(store.abortMultipart(row.object_key, row.multipart_upload_id));
        const fresh = await move(row, ["uploading", "failed"], { status: "uploading", multipart_upload_id: null });
        if (!fresh) throw fail(409, "BAD_STATUS", "Video sedang diproses permintaan lain.");
        return reply(200, await startReply(store, fresh));
      }
      const fileName = cleanFileName(msg.fileName);
      const mimeType = String(msg.mimeType ?? "").toLowerCase().split(";")[0].trim();
      const fileSize = int(msg.fileSize, 1, LIMITS.maxFileBytes);
      if (!fileName) throw fail(400, "BAD_NAME", "Nama file tidak valid.");
      if (!LIMITS.mimeTypes.includes(mimeType)) throw fail(415, "BAD_TYPE", "Hanya video MP4, WebM, atau MOV yang bisa disimpan.");
      if (fileSize === null) throw fail(400, "BAD_SIZE", "Ukuran file tidak valid.");
      const source = msg.source === "motion" ? "motion" : "clipper";
      const id = crypto.randomUUID();
      const objectKey = `u/${uid}/${id}/${crypto.randomUUID().replace(/-/g, "")}.${EXT[mimeType]}`;
      const row = await one(await db("media_assets", {
        method: "POST", headers: { prefer: "return=representation" },
        body: JSON.stringify({
          id, user_id: uid, title: String(msg.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || fileName.replace(/\.[^.]+$/, ""),
          file_name: fileName, mime_type: mimeType, file_size: fileSize, duration_seconds: num(msg.durationSeconds, 0, 86_400 * 7),
          width: int(msg.width, 1, 16_384), height: int(msg.height, 1, 16_384), source, object_key: objectKey, status: "uploading",
        }),
      }));
      if (!row) throw new Error("db");
      return reply(200, await startReply(store, row));
    }

    case "multipart-init": {
      const row = await mine(msg.assetId);
      mustBe(row, "uploading");
      expectMultipart(row);
      const plan = planParts(row.file_size);
      if (row.multipart_upload_id) return reply(200, { asset: publicAsset(row), ...plan });
      const uploadId = await store.createMultipart(row.object_key, row.mime_type);
      const set = await one(await db(`media_assets?id=eq.${row.id}&user_id=eq.${uid}&status=eq.uploading&multipart_upload_id=is.null`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ multipart_upload_id: uploadId }) }));
      if (!set) { // lost a race with another init (or the asset changed): drop ours and report the winner's state
        await quietly(store.abortMultipart(row.object_key, uploadId));
        const cur = await mine(row.id);
        mustBe(cur, "uploading");
        return reply(200, { asset: publicAsset(cur), ...plan });
      }
      return reply(200, { asset: publicAsset(set), ...plan });
    }

    case "sign-parts": {
      const row = await mine(msg.assetId);
      mustBe(row, "uploading");
      expectMultipart(row);
      if (!row.multipart_upload_id) throw fail(409, "NO_MULTIPART", "Unggahan bertahap belum dimulai.");
      const { partCount } = planParts(row.file_size);
      const wanted = Array.isArray(msg.partNumbers) ? msg.partNumbers : [];
      if (!wanted.length || wanted.length > LIMITS.signMaxParts || !wanted.every(n => Number.isInteger(n) && n >= 1 && n <= partCount)) throw fail(400, "BAD_PARTS", "Daftar bagian tidak valid.");
      const unique = [...new Set(wanted as number[])];
      const parts = await Promise.all(unique.map(async partNumber => ({ partNumber, url: await store.partUrl(row.object_key, row.multipart_upload_id!, partNumber, LIMITS.uploadUrlTtl) })));
      return reply(200, { parts, expiresIn: LIMITS.uploadUrlTtl });
    }

    case "list-parts": { // lets a retried upload skip what R2 already holds
      const row = await mine(msg.assetId);
      mustBe(row, "uploading");
      expectMultipart(row);
      if (!row.multipart_upload_id) return reply(200, { parts: [] });
      const held = await store.listParts(row.object_key, row.multipart_upload_id);
      return reply(200, { parts: held.map(p => ({ partNumber: p.partNumber, size: p.size })) });
    }

    case "complete-upload": {
      const row = await mine(msg.assetId);
      if (row.status === "ready") return reply(200, { asset: publicAsset(row) });
      mustBe(row, "uploading");
      expectMultipart(row);
      if (!row.multipart_upload_id) throw fail(409, "NO_MULTIPART", "Unggahan bertahap belum dimulai.");
      const { partSize, partCount } = planParts(row.file_size);
      // What R2 really holds is the only truth; the browser's list is only compared against it.
      const held = (await store.listParts(row.object_key, row.multipart_upload_id)).sort((a, b) => a.partNumber - b.partNumber);
      const byNumber = new Map(held.map(p => [p.partNumber, p]));
      const missing: number[] = [], wrongSize: number[] = [];
      for (let n = 1; n <= partCount; n++) {
        const p = byNumber.get(n), expected = n < partCount ? partSize : row.file_size - partSize * (partCount - 1);
        if (!p) missing.push(n); else if (p.size !== expected) wrongSize.push(n);
      }
      const extra = held.filter(p => p.partNumber < 1 || p.partNumber > partCount).map(p => p.partNumber);
      const total = held.reduce((s, p) => s + p.size, 0);
      if (missing.length || wrongSize.length || extra.length || total !== row.file_size) throw fail(409, "PARTS_MISMATCH", "Bagian unggahan belum lengkap atau tidak cocok.", { missing, wrongSize });
      if (Array.isArray(msg.parts)) {
        for (const p of msg.parts as { partNumber?: unknown; etag?: unknown }[]) {
          const mineP = typeof p?.partNumber === "number" ? byNumber.get(p.partNumber) : undefined;
          const claimed = typeof p?.etag === "string" ? p.etag.replace(/"/g, "") : null;
          if (!mineP || (claimed !== null && claimed !== mineP.etag)) throw fail(409, "PARTS_MISMATCH", "Daftar bagian tidak cocok dengan yang diterima penyimpanan.", { missing: [], wrongSize: [] });
        }
      }
      try {
        await store.completeMultipart(row.object_key, row.multipart_upload_id, held.map(p => ({ partNumber: p.partNumber, etag: p.etag })));
      } catch (e) {
        // A retried request may find the upload already assembled: the stored object is then the proof.
        const done = e instanceof R2Error && e.status === 404 ? await store.head(row.object_key) : null;
        if (!done) throw e;
      }
      return reply(200, { asset: publicAsset(await verifyAndReady(store, row, move)) });
    }

    case "complete-single": {
      const row = await mine(msg.assetId);
      if (row.status === "ready") return reply(200, { asset: publicAsset(row) });
      mustBe(row, "uploading");
      if (row.file_size > LIMITS.singleMax) throw fail(400, "NOT_SINGLE", "Video ini diunggah bertahap.");
      return reply(200, { asset: publicAsset(await verifyAndReady(store, row, move)) });
    }

    case "abort-upload": {
      const row = await mine(msg.assetId);
      mustBe(row, "uploading", "failed");
      if (row.multipart_upload_id) await quietly(store.abortMultipart(row.object_key, row.multipart_upload_id));
      await quietly(store.remove(row.object_key)); // a single PUT may have landed, or a completed assembly
      const failed = await move(row, ["uploading", "failed"], { status: "failed", multipart_upload_id: null });
      if (!failed) throw fail(409, "BAD_STATUS", "Video sedang diproses permintaan lain.");
      return reply(200, { asset: publicAsset(failed) });
    }

    case "list": {
      const limit = int(msg.limit, 1, 100) ?? 50;
      const before = typeof msg.before === "string" && !Number.isNaN(Date.parse(msg.before)) ? `&created_at=lt.${encodeURIComponent(new Date(msg.before).toISOString())}` : "";
      const res = await db(`media_assets?user_id=eq.${uid}${before}&select=${PUBLIC_COLUMNS}&order=created_at.desc&limit=${limit}`);
      if (!res.ok) throw new Error("db");
      const rows = (await res.json()) as Row[];
      return reply(200, { assets: rows.map(publicAsset) });
    }

    case "get-download-url": {
      const row = await mine(msg.assetId);
      mustBe(row, "ready");
      return reply(200, { url: await store.getUrl(row.object_key, row.file_name, row.mime_type, LIMITS.downloadUrlTtl), fileName: row.file_name, expiresIn: LIMITS.downloadUrlTtl });
    }

    case "delete-file": {
      const row = await mine(msg.assetId);
      if (row.status === "deleted") return reply(200, { asset: publicAsset(row) });
      const marked = row.status === "deleting" ? row : await move(row, ["uploading", "ready", "failed"], { status: "deleting" });
      if (!marked) throw fail(409, "BAD_STATUS", "Video sedang diproses permintaan lain.");
      if (marked.multipart_upload_id) await quietly(store.abortMultipart(marked.object_key, marked.multipart_upload_id));
      await store.remove(marked.object_key);
      if (await store.head(marked.object_key)) throw new R2Error(502, "remove"); // still there: stays "deleting" so it can be retried
      const done = await move(marked, ["deleting"], { status: "deleted", file_deleted_at: now().toISOString(), multipart_upload_id: null });
      return reply(200, { asset: publicAsset(done ?? await mine(row.id)) });
    }

    default:
      throw fail(400, "BAD_ACTION", "Aksi tidak dikenal.");
  }
}

/** What the browser needs to start sending: one signed PUT, or the multipart plan. */
async function startReply(store: ReturnType<typeof r2>, row: Row) {
  if (row.file_size <= LIMITS.singleMax) {
    return { asset: publicAsset(row), mode: "single" as const, putUrl: await store.putUrl(row.object_key, row.mime_type, LIMITS.uploadUrlTtl), contentType: row.mime_type, expiresIn: LIMITS.uploadUrlTtl };
  }
  return { asset: publicAsset(row), mode: "multipart" as const, ...planParts(row.file_size) };
}

/** "ready" only once the stored object exists with exactly the declared size (and type). Otherwise the upload is marked failed and the object removed. */
async function verifyAndReady(store: ReturnType<typeof r2>, row: Row, move: (r: Row, from: Status[], set: Record<string, unknown>) => Promise<Row | null>): Promise<Row> {
  const head = await store.head(row.object_key);
  if (!head) throw fail(409, "NOT_UPLOADED", "File belum sampai di penyimpanan. Coba kirim ulang.");
  if (head.size !== row.file_size || (head.contentType && head.contentType.split(";")[0].trim().toLowerCase() !== row.mime_type)) {
    await store.remove(row.object_key).catch(() => {});
    await move(row, ["uploading"], { status: "failed", multipart_upload_id: null });
    throw fail(409, "SIZE_MISMATCH", "Ukuran file di penyimpanan tidak cocok. Unggah ulang.");
  }
  const ready = await move(row, ["uploading"], { status: "ready", multipart_upload_id: null });
  if (!ready) throw fail(409, "BAD_STATUS", "Video sedang diproses permintaan lain.");
  return ready;
}
