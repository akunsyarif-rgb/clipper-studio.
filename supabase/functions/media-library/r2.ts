// The few Cloudflare R2 (S3 API) operations Content Hub needs. Server side only: the credentials never leave this module's
// caller. Responses are reduced to plain values; provider error bodies are never passed on.
import { EMPTY_SHA256, presign, sha256Hex, signHeaders, type Creds } from "./sigv4.ts";

export type R2Config = Creds & { endpoint: string; bucket: string };
export class R2Error extends Error { constructor(readonly status: number, readonly op: string) { super(`R2 ${op} failed (${status})`); } }
export type Part = { partNumber: number; size: number; etag: string };

const objectUrl = (c: R2Config, key: string, query = "") => `${c.endpoint.replace(/\/$/, "")}/${c.bucket}/${key.split("/").map(encodeURIComponent).join("/")}${query}`;
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
const unescapeXml = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'");
const cleanEtag = (s: string) => unescapeXml(s).replace(/"/g, "");

export function r2(c: R2Config, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()) {
  async function send(op: string, method: string, url: string, body?: string, extra: Record<string, string> = {}): Promise<Response> {
    const hash = body ? await sha256Hex(body) : EMPTY_SHA256;
    const headers = await signHeaders(c, method, url, hash, extra, now());
    let res: Response;
    try { res = await fetchImpl(url, { method, headers, body }); } catch { throw new R2Error(0, op); }
    return res;
  }
  const must = (res: Response, op: string, ok: number[] = [200]) => { if (!ok.includes(res.status)) throw new R2Error(res.status, op); return res; };

  return {
    /** Starts a multipart upload; returns its id. */
    async createMultipart(key: string, contentType: string): Promise<string> {
      const res = must(await send("createMultipart", "POST", objectUrl(c, key, "?uploads"), undefined, { "content-type": contentType }), "createMultipart");
      const id = tag(await res.text(), "UploadId");
      if (!id) throw new R2Error(502, "createMultipart");
      return id;
    },
    /** What R2 itself holds for the upload (all pages), independent of anything the browser claims. */
    async listParts(key: string, uploadId: string): Promise<Part[]> {
      const out: Part[] = [];
      let marker = "0";
      for (let guard = 0; guard < 20; guard++) {
        const res = must(await send("listParts", "GET", objectUrl(c, key, `?max-parts=1000&part-number-marker=${marker}&uploadId=${encodeURIComponent(uploadId)}`)), "listParts");
        const xml = await res.text();
        for (const m of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
          const n = Number(tag(m[1], "PartNumber")), size = Number(tag(m[1], "Size")), etag = cleanEtag(tag(m[1], "ETag") ?? "");
          if (Number.isInteger(n) && Number.isFinite(size) && etag) out.push({ partNumber: n, size, etag });
        }
        if (tag(xml, "IsTruncated") !== "true") return out;
        marker = tag(xml, "NextPartNumberMarker") ?? "";
        if (!marker) return out;
      }
      throw new R2Error(502, "listParts");
    },
    async completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
      const xml = `<CompleteMultipartUpload>${parts.map(p => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
      const res = must(await send("completeMultipart", "POST", objectUrl(c, key, `?uploadId=${encodeURIComponent(uploadId)}`), xml, { "content-type": "application/xml" }), "completeMultipart");
      // R2 can answer 200 with an <Error> body when the final assembly fails.
      if (/<Error>/.test(await res.text())) throw new R2Error(502, "completeMultipart");
    },
    async abortMultipart(key: string, uploadId: string): Promise<void> {
      must(await send("abortMultipart", "DELETE", objectUrl(c, key, `?uploadId=${encodeURIComponent(uploadId)}`)), "abortMultipart", [200, 204, 404]);
    },
    /** Size and type of the stored object, or null when it does not exist. */
    async head(key: string): Promise<{ size: number; contentType: string } | null> {
      const res = await send("head", "HEAD", objectUrl(c, key));
      if (res.status === 404) return null;
      must(res, "head");
      return { size: Number(res.headers.get("content-length") ?? NaN), contentType: res.headers.get("content-type") ?? "" };
    },
    async remove(key: string): Promise<void> { must(await send("remove", "DELETE", objectUrl(c, key)), "remove", [200, 204, 404]); },

    /** Short-lived URLs for the browser. Nothing here touches the network. */
    putUrl: (key: string, contentType: string, ttl: number) => presign(c, "PUT", objectUrl(c, key), ttl, { signedHeaders: { "content-type": contentType }, now: now() }),
    partUrl: (key: string, uploadId: string, partNumber: number, ttl: number) =>
      presign(c, "PUT", objectUrl(c, key, `?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`), ttl, { now: now() }),
    getUrl: (key: string, fileName: string, contentType: string, ttl: number) =>
      presign(c, "GET", objectUrl(c, key, `?response-content-disposition=${encodeURIComponent(`attachment; filename="${fileName.replace(/["\\\r\n]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`)}&response-content-type=${encodeURIComponent(contentType)}`), ttl, { now: now() }),
  };
}
