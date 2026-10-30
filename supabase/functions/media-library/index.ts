import { handle } from "./handler.ts";

// Secrets are set in Supabase Function Secrets and never leave the server. A missing one makes every call answer NOT_CONFIGURED.
const e = (n: string) => Deno.env.get(n) ?? "";
const r2 = e("R2_ENDPOINT").startsWith("https://") && e("R2_ENDPOINT").endsWith(".r2.cloudflarestorage.com") && e("R2_ACCESS_KEY_ID") && e("R2_SECRET_ACCESS_KEY") && e("R2_BUCKET_NAME")
  ? { endpoint: e("R2_ENDPOINT"), bucket: e("R2_BUCKET_NAME"), accessKeyId: e("R2_ACCESS_KEY_ID"), secretAccessKey: e("R2_SECRET_ACCESS_KEY"), region: e("R2_REGION") || "auto" }
  : null;

Deno.serve(req => handle(req, { url: e("SUPABASE_URL"), serviceKey: e("SUPABASE_SERVICE_ROLE_KEY"), r2 }));
