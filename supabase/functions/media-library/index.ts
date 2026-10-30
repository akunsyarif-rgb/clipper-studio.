import { handle } from "./handler.ts";

// Secrets are set in Supabase Function Secrets and never leave the server. A missing or malformed one makes every call answer
// NOT_CONFIGURED, and the log names which one (never its value).
const e = (n: string) => (Deno.env.get(n) ?? "").trim();
let endpoint = "";
try {
  // Accept the endpoint with a trailing slash or a bucket path: only the origin matters (path-style addressing adds the bucket).
  const u = new URL(e("R2_ENDPOINT"));
  if (u.protocol === "https:" && u.hostname.endsWith(".r2.cloudflarestorage.com")) endpoint = u.origin;
} catch { /* reported below */ }
const bad = [["R2_ENDPOINT", endpoint], ["R2_ACCESS_KEY_ID", e("R2_ACCESS_KEY_ID")], ["R2_SECRET_ACCESS_KEY", e("R2_SECRET_ACCESS_KEY")], ["R2_BUCKET_NAME", e("R2_BUCKET_NAME")]].filter(([, v]) => !v).map(([n]) => n);
if (bad.length) console.error("media-library: missing or invalid secrets:", bad.join(", "));
const r2 = bad.length ? null : { endpoint, bucket: e("R2_BUCKET_NAME"), accessKeyId: e("R2_ACCESS_KEY_ID"), secretAccessKey: e("R2_SECRET_ACCESS_KEY"), region: e("R2_REGION") || "auto" };

Deno.serve(req => handle(req, { url: e("SUPABASE_URL"), serviceKey: e("SUPABASE_SERVICE_ROLE_KEY"), r2 }));
