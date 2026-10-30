// AWS Signature V4 for Cloudflare R2 (S3 API), on WebCrypto only: no SDK, so nothing to pin and nothing heavy to load in the
// Edge Function. Two forms: `signHeaders` (server -> R2 requests) and `presign` (short-lived URLs handed to the browser).
// Pure (clock passed in) so it is unit-tested against the published AWS examples.

export type Creds = { accessKeyId: string; secretAccessKey: string; region: string };

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}
async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}
async function signingKey(c: Creds, day: string): Promise<ArrayBuffer> {
  const k1 = await hmac(enc.encode("AWS4" + c.secretAccessKey), day);
  const k2 = await hmac(k1, c.region);
  const k3 = await hmac(k2, "s3");
  return hmac(k3, "aws4_request");
}

/** RFC 3986 percent-encoding as S3 wants it (unreserved kept). */
export const encodeRfc3986 = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, ch => "%" + ch.charCodeAt(0).toString(16).toUpperCase());

const stamp = (d: Date) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");

function canonicalQuery(params: [string, string][]): string {
  return params.map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join("&");
}
const canonicalPath = (u: URL) => u.pathname.split("/").map(seg => encodeRfc3986(decodeURIComponent(seg))).join("/") || "/";

/** Headers (including Authorization) for a request R2 will receive from the server. `payloadHash` is the body's SHA-256 hex. */
export async function signHeaders(c: Creds, method: string, url: string, payloadHash: string, extra: Record<string, string> = {}, now = new Date()): Promise<Record<string, string>> {
  const u = new URL(url);
  const amzDate = stamp(now), day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...extra, host: u.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const names = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, " ")]));
  const canonical = [method, canonicalPath(u), canonicalQuery([...u.searchParams.entries()]), names.map(n => `${n}:${lower[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");
  const sig = hex(await hmac(await signingKey(c, day), toSign));
  const send = { ...headers }; delete send.host; // fetch sets Host itself
  return { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` };
}

/** A query-signed URL valid for `expiresSec`. Only `host` (plus any `signedHeaders`, which the caller must then send) is signed. */
export async function presign(c: Creds, method: string, url: string, expiresSec: number, opts: { signedHeaders?: Record<string, string>; now?: Date } = {}): Promise<string> {
  const u = new URL(url);
  const amzDate = stamp(opts.now ?? new Date()), day = amzDate.slice(0, 8);
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const hdrs: Record<string, string> = { host: u.host };
  for (const [k, v] of Object.entries(opts.signedHeaders ?? {})) hdrs[k.toLowerCase()] = String(v).trim().replace(/\s+/g, " ");
  const names = Object.keys(hdrs).sort();
  const params: [string, string][] = [...u.searchParams.entries(),
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"], ["X-Amz-Credential", `${c.accessKeyId}/${scope}`], ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSec)], ["X-Amz-SignedHeaders", names.join(";")]];
  const query = canonicalQuery(params);
  const canonical = [method, canonicalPath(u), query, names.map(n => `${n}:${hdrs[n]}\n`).join(""), names.join(";"), "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");
  const sig = hex(await hmac(await signingKey(c, day), toSign));
  return `${u.origin}${u.pathname}?${query}&X-Amz-Signature=${sig}`;
}
