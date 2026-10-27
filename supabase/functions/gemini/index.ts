import { handle } from "./handler.ts";

Deno.serve(req => handle(req, { url: Deno.env.get("SUPABASE_URL")!, serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! }));
