import { describe, expect, it } from "vitest";
import { CloudError, createCloud, explainAuth } from "./cloud";
import { SESSION_VERSION, type SessionData } from "./session";
import type { Transcript } from "./transcript";

const URL_ = "https://p.supabase.co", KEY = "sb_publishable_test";
type Call = { url: string; init: RequestInit };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const tokens = (extra: object = {}) => ({ access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { email: "me@x.id" }, ...extra });
function setup(...responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  let t = 1_000_000;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error("unexpected call " + url);
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  const c = createCloud({ url: URL_, key: KEY, fetchImpl, store, now: () => t });
  return { c, calls, store, advance: (ms: number) => { t += ms; } };
}
const hdr = (c: Call) => c.init.headers as Record<string, string>;
const session = (): SessionData => ({ v: SESSION_VERSION, savedAt: 5, script: "Halo dunia", title: "T", style: "editorial", palette: "ivory", contentPreset: "custom", target: "", captions: true, overrides: {}, cutOverrides: {}, clipStarts: {}, videoEdit: false, captionOffset: 0, imported: null, voiceMode: "none", ttsLang: "id", ttsVoice: 0, ttsSpeed: 1 });
const transcript: Transcript = { language: "indonesian", granularity: "word", duration: 2, segments: [{ start: 0, end: 1, text: "Halo", words: [{ text: "Halo", start: 0, end: 1 }] }] };

describe("signing in", () => {
  it("sends email and password to the auth service and remembers the session", async () => {
    const { c, calls, store } = setup(json(200, tokens()));
    expect(c.user()).toBeNull();
    expect(await c.signIn("me@x.id", "secret-pass")).toBe("me@x.id");
    expect(calls[0].url).toBe(`${URL_}/auth/v1/token?grant_type=password`);
    expect(hdr(calls[0]).apikey).toBe(KEY);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: "me@x.id", password: "secret-pass" });
    expect(c.user()).toBe("me@x.id");
    expect(store.getItem("clipper:cloud:v1")).not.toContain("secret-pass");
  });
  it("tells a wrong password from a closed sign-up from a missing confirmation", async () => {
    const wrong = await setup(json(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" })).c.signIn("a@b.c", "x").catch(e => e);
    expect(wrong).toMatchObject({ kind: "credentials" });
    const closed = await setup(json(500, { code: 500, error_code: "unexpected_failure", msg: "Database error saving new user" })).c.signUp("a@b.c", "password1").catch(e => e);
    expect(closed).toMatchObject({ kind: "closed", message: expect.stringContaining("masih pribadi") });
    expect(explainAuth(422, { error_code: "email_provider_disabled", msg: "Email logins are disabled" })).toMatchObject({ kind: "disabled", message: expect.stringContaining("Enable Email provider") });
    expect(explainAuth(400, { error_code: "email_not_confirmed" })).toMatchObject({ kind: "unconfirmed" });
    expect(explainAuth(422, { error_code: "weak_password", msg: "Password should be at least 6 characters" })).toMatchObject({ kind: "weak" });
    expect(explainAuth(422, { error_code: "user_already_exists" })).toMatchObject({ kind: "exists" });
  });
  it("never puts the password in an error", async () => {
    const e = (await setup(json(400, { msg: "Invalid login credentials secret-pass" })).c.signIn("a@b.c", "secret-pass").catch((x: CloudError) => x)) as CloudError;
    expect(e.message).not.toContain("secret-pass");
  });
  it("reports a network failure", async () => {
    await expect(setup(new TypeError("Failed to fetch")).c.signIn("a@b.c", "x")).rejects.toMatchObject({ kind: "network" });
  });
  it("sign-up signs in, or asks for confirmation when no session comes back", async () => {
    expect(await setup(json(200, tokens())).c.signUp("a@b.c", "password1")).toBe("signed-in");
    const s = setup(json(200, { id: "u", email: "a@b.c" }));
    expect(await s.c.signUp("a@b.c", "password1")).toBe("confirm");
    expect(s.c.user()).toBeNull();
  });
  it("signs out and tells listeners", async () => {
    const { c } = setup(json(200, tokens()));
    let n = 0; c.subscribe(() => n++);
    await c.signIn("me@x.id", "pw123456");
    c.signOut();
    expect(c.user()).toBeNull();
    expect(n).toBe(2);
  });
});

describe("while signed out nothing is sent", () => {
  it("does nothing for every data call", async () => {
    const { c, calls } = setup();
    expect(await c.pushSession(session())).toBe(false);
    expect(await c.pullSession()).toBeNull();
    expect(await c.putTranscript("k", transcript)).toBe(false);
    expect(await c.getTranscript("k")).toBeNull();
    expect(await c.pullHistory()).toBeNull();
    expect(await c.pushHistory([{ id: "a", data: null, deleted: true, updated_ms: 1 }])).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("syncing", () => {
  const signedIn = async (...next: (Response | Error)[]) => { const s = setup(json(200, tokens()), ...next); await s.c.signIn("me@x.id", "pw123456"); s.calls.length = 0; return s; };
  it("saves the work session as one row, merged on conflict", async () => {
    const { c, calls } = await signedIn(new Response(null, { status: 201 }));
    expect(await c.pushSession(session())).toBe(true);
    expect(calls[0].url).toBe(`${URL_}/rest/v1/app_sessions?on_conflict=user_id,id`);
    expect(hdr(calls[0]).authorization).toBe("Bearer AT");
    expect(hdr(calls[0]).prefer).toContain("merge-duplicates");
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ id: "current", data: { script: "Halo dunia" } });
  });
  it("brings the saved session back, and ignores a row that is not a session", async () => {
    const good = await signedIn(json(200, [{ data: session() }]));
    expect((await good.c.pullSession())?.script).toBe("Halo dunia");
    expect(good.calls[0].url).toBe(`${URL_}/rest/v1/app_sessions?id=eq.current&select=data`);
    expect(await (await signedIn(json(200, [{ data: { nope: 1 } }]))).c.pullSession()).toBeNull();
    expect(await (await signedIn(json(200, []))).c.pullSession()).toBeNull();
  });
  it("stores and fetches a transcript by its cache key", async () => {
    const put = await signedIn(new Response(null, { status: 201 }));
    expect(await put.c.putTranscript("asr2:a|b/c", transcript)).toBe(true);
    expect(JSON.parse(put.calls[0].init.body as string)).toMatchObject({ cache_key: "asr2:a|b/c" });
    const get = await signedIn(json(200, [{ data: transcript }]));
    expect(await get.c.getTranscript("asr2:a|b/c")).toEqual(transcript);
    expect(get.calls[0].url).toContain(`cache_key=eq.${encodeURIComponent("asr2:a|b/c")}`);
  });
  it("pulls the history rows, drops damaged ones, and pushes in batches of 25", async () => {
    const pull = await signedIn(json(200, [{ id: "m-1", data: {}, deleted: false, updated_ms: 5 }, { nope: 1 }, { id: 3, updated_ms: 1 }]));
    expect((await pull.c.pullHistory())?.map(r => r.id)).toEqual(["m-1"]);
    expect(pull.calls[0].url).toContain("/rest/v1/app_history?select=id,data,deleted,updated_ms");
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: "m-" + i, data: null, deleted: true, updated_ms: i }));
    const push = await signedIn(new Response(null, { status: 201 }), new Response(null, { status: 201 }), new Response(null, { status: 201 }));
    expect(await push.c.pushHistory(rows)).toBe(true);
    expect(push.calls).toHaveLength(3);
    expect(push.calls[0].url).toBe(`${URL_}/rest/v1/app_history?on_conflict=user_id,id`);
    expect(JSON.parse(push.calls[2].init.body as string)).toHaveLength(10);
    expect(await (await signedIn(json(500, {}))).c.pushHistory(rows)).toBe(false);
    expect(await (await signedIn(json(500, {}))).c.pullHistory()).toBeNull();
  });
  it("fails soft: a server error or a lost connection is just 'not synced'", async () => {
    expect(await (await signedIn(json(500, {}))).c.pushSession(session())).toBe(false);
    expect(await (await signedIn(new TypeError("offline"))).c.pullSession()).toBeNull();
  });
  it("renews an expired token before the call, and once after a 401", async () => {
    const a = await signedIn(json(200, tokens({ access_token: "AT2" })), json(200, [{ data: session() }]));
    a.advance(3_600_000);
    expect((await a.c.pullSession())?.title).toBe("T");
    expect(a.calls[0].url).toContain("grant_type=refresh_token");
    expect(hdr(a.calls[1]).authorization).toBe("Bearer AT2");
    const b = await signedIn(json(401, {}), json(200, tokens({ access_token: "AT3" })), json(200, [{ data: session() }]));
    expect((await b.c.pullSession())?.title).toBe("T");
    expect(hdr(b.calls[2]).authorization).toBe("Bearer AT3");
  });
  it("signs out when the refresh token is refused", async () => {
    const s = await signedIn(json(400, { error_code: "invalid_grant", msg: "Invalid Refresh Token" }));
    s.advance(3_600_000);
    expect(await s.c.pullSession()).toBeNull();
    expect(s.c.user()).toBeNull();
  });
});
