import { describe, expect, it } from "vitest";
import { handle } from "../supabase/functions/gemini/handler";

const ENV = { url: "https://p.supabase.co", serviceKey: "service-role-secret" };
const KEY = "AIzaSyFAKE_KEY_FOR_TESTS_0123456789abcd";
type Call = { url: string; init: RequestInit };

/** A fake Supabase (auth + one secrets row) and a fake Google. */
function world(opts: { user?: string | null; row?: { gemini_key: string | null; gemini_model: string | null } | null; google?: Response; authDown?: boolean; googleDown?: boolean } = {}) {
  const calls: Call[] = [];
  const state = { row: opts.row === undefined ? { gemini_key: null, gemini_model: null } : opts.row, deleted: false, saved: null as unknown };
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes("/auth/v1/user")) {
      if (opts.authDown) throw new TypeError("down");
      return opts.user === null ? new Response("{}", { status: 401 }) : new Response(JSON.stringify({ id: opts.user ?? "u1" }), { status: 200 });
    }
    if (url.includes("/rest/v1/user_secrets")) {
      if (init.method === "POST") { state.saved = JSON.parse(init.body as string); return new Response(null, { status: 201 }); }
      if (init.method === "DELETE") { state.deleted = true; return new Response(null, { status: 204 }); }
      return new Response(JSON.stringify(state.row ? [state.row] : []), { status: state.row === null ? 500 : 200 });
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      if (opts.googleDown) throw new TypeError("down");
      return opts.google ?? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"lines\":[\"x\"]}" }] } }] }), { status: 200 });
    }
    throw new Error("unexpected " + url);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, state };
}
const post = (body: unknown, headers: Record<string, string> = { authorization: "Bearer user-jwt" }) =>
  new Request("https://f/gemini", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const run = async (w: ReturnType<typeof world>, body: unknown, headers?: Record<string, string>) => {
  const res = await handle(post(body, headers), ENV, w.fetchImpl);
  return { status: res.status, json: await res.json().catch(() => null), res };
};

describe("who may call", () => {
  it("answers the browser's pre-flight request", async () => {
    const res = await handle(new Request("https://f/gemini", { method: "OPTIONS" }), ENV, world().fetchImpl);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
  });
  it("refuses a caller who is not signed in, without touching the secrets", async () => {
    const w = world({ user: null });
    const r = await run(w, { action: "status" });
    expect(r.status).toBe(401);
    expect(r.json.error.status).toBe("NOT_SIGNED_IN");
    expect(w.calls.some(c => c.url.includes("user_secrets"))).toBe(false);
  });
  it("asks the auth service about the caller's own token", async () => {
    const w = world();
    await run(w, { action: "status" });
    const who = w.calls[0];
    expect(who.url).toBe(`${ENV.url}/auth/v1/user`);
    expect((who.init.headers as Record<string, string>).authorization).toBe("Bearer user-jwt");
  });
  it("only reads and writes the caller's own row", async () => {
    const w = world({ user: "owner-1" });
    await run(w, { action: "status" });
    await run(w, { action: "save-key", apiKey: KEY });
    await run(w, { action: "forget" });
    const rows = w.calls.filter(c => c.url.includes("user_secrets"));
    expect(rows[0].url).toContain("user_id=eq.owner-1");
    expect(JSON.parse(rows[1].init.body as string).user_id).toBe("owner-1");
    expect(rows[2].url).toContain("user_id=eq.owner-1");
  });
  it("rejects other methods, unreadable bodies and unknown actions", async () => {
    expect((await handle(new Request("https://f/g", { method: "GET" }), ENV, world().fetchImpl)).status).toBe(405);
    const bad = new Request("https://f/g", { method: "POST", headers: { authorization: "Bearer x" }, body: "not json" });
    expect((await handle(bad, ENV, world().fetchImpl)).status).toBe(400);
    expect((await run(world(), { action: "dance" })).json.error.status).toBe("UNKNOWN_ACTION");
  });
  it("reports an unreachable auth service", async () => {
    expect((await run(world({ authDown: true }), { action: "status" })).status).toBe(502);
  });
});

describe("the key", () => {
  it("says whether a key is saved, never returning the key", async () => {
    expect((await run(world(), { action: "status" })).json).toEqual({ hasKey: false, model: "gemini-2.5-flash" });
    const r = await run(world({ row: { gemini_key: KEY, gemini_model: "gemini-x" } }), { action: "status" });
    expect(r.json).toEqual({ hasKey: true, model: "gemini-x" });
    expect(JSON.stringify(r.json)).not.toContain(KEY);
  });
  it("saves a key, trimmed, with the service role, and never echoes it", async () => {
    const w = world();
    const r = await run(w, { action: "save-key", apiKey: `  ${KEY}\n`, model: "gemini-y" });
    expect(r.json).toEqual({ ok: true, model: "gemini-y" });
    expect(w.state.saved).toMatchObject({ gemini_key: KEY, gemini_model: "gemini-y" });
    expect(JSON.stringify(r.json)).not.toContain(KEY);
    expect((w.calls.find(c => c.url.includes("user_secrets"))!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${ENV.serviceKey}`);
  });
  it("refuses a key that is too short or has spaces, and a model name that is not a name", async () => {
    expect((await run(world(), { action: "save-key", apiKey: "short" })).json.error.status).toBe("BAD_KEY");
    expect((await run(world(), { action: "save-key", apiKey: `${KEY} ${KEY}` })).json.error.status).toBe("BAD_KEY");
    const w = world();
    expect((await run(w, { action: "save-key", apiKey: KEY, model: "../../etc?x=1" })).json.model).toBe("gemini-2.5-flash");
  });
  it("forgets the key", async () => {
    const w = world();
    expect((await run(w, { action: "forget" })).json).toEqual({ ok: true });
    expect(w.state.deleted).toBe(true);
  });
});

describe("generate", () => {
  const body = { contents: [{ role: "user", parts: [{ text: "hai" }] }] };
  it("calls Google with the stored key in a header and returns Google's answer as it is", async () => {
    const w = world({ row: { gemini_key: KEY, gemini_model: "gemini-x" } });
    const r = await run(w, { action: "generate", body });
    expect(r.status).toBe(200);
    expect(r.json.candidates[0].content.parts[0].text).toContain("lines");
    const g = w.calls.find(c => c.url.includes("googleapis"))!;
    expect(g.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
    expect(g.url).not.toContain(KEY);
    expect((g.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(JSON.parse(g.init.body as string)).toEqual(body);
  });
  it("lets the request name a model", async () => {
    const w = world({ row: { gemini_key: KEY, gemini_model: "gemini-x" } });
    await run(w, { action: "generate", model: "gemini-z", body });
    expect(w.calls.find(c => c.url.includes("googleapis"))!.url).toContain("/gemini-z:generateContent");
  });
  it("passes Google's errors through with their status", async () => {
    const quota = new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }), { status: 429 });
    const r = await run(world({ row: { gemini_key: KEY, gemini_model: null }, google: quota }), { action: "generate", body });
    expect(r.status).toBe(429);
    expect(r.json.error.status).toBe("RESOURCE_EXHAUSTED");
  });
  it("tells when there is no key, and refuses a body that is not an object", async () => {
    expect((await run(world(), { action: "generate", body })).json.error.status).toBe("NO_KEY");
    expect((await run(world({ row: { gemini_key: KEY, gemini_model: null } }), { action: "generate", body: "x" })).status).toBe(400);
  });
  it("reports Google being unreachable, and a database failure", async () => {
    expect((await run(world({ row: { gemini_key: KEY, gemini_model: null }, googleDown: true }), { action: "generate", body })).status).toBe(504);
    expect((await run(world({ row: null }), { action: "generate", body })).status).toBe(500);
  });
  it("never leaks the key in any error", async () => {
    for (const w of [world({ row: { gemini_key: KEY, gemini_model: null }, googleDown: true }), world({ row: { gemini_key: KEY, gemini_model: null }, google: new Response("boom", { status: 500 }) })]) {
      const res = await handle(post({ action: "generate", body }), ENV, w.fetchImpl);
      expect(await res.text()).not.toContain(KEY);
    }
  });
});
