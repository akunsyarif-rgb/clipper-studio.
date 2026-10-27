import { describe, expect, it } from "vitest";
import { decodeEntities, handle, parseCaptionXml, pickTrack, videoIdFrom } from "../supabase/functions/youtube/handler";

const ENV = { url: "https://p.supabase.co", serviceKey: "service-secret" };
const ID = "dQw4w9WgXcQ";
const XML_OLD = `<?xml version="1.0"?><transcript><text start="0.5" dur="2.5">Halo semuanya</text><text start="3" dur="2">kita &amp;amp; mulai &amp;#39;hari&amp;#39; ini</text><text start="6" dur="0">tanpa durasi</text><text start="9" dur="1"> </text></transcript>`;
const XML_NEW = `<timedtext format="3"><body><p t="1000" d="2500"><s>Halo</s><s> dunia</s></p><p t="4000" d="1500">baris dua</p></body></timedtext>`;
const player = (extra: object = {}) => ({
  playabilityStatus: { status: "OK" },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=id&fmt=srv3", languageCode: "id", kind: "asr" }] } },
  videoDetails: { title: "Video Uji", lengthSeconds: "1158" },
  ...extra,
});

function world(opts: { user?: boolean; player?: object | Response | Error; xml?: string | Response | Error } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes("/auth/v1/user")) return opts.user === false ? new Response("{}", { status: 401 }) : new Response(JSON.stringify({ id: "u1" }), { status: 200 });
    if (url.includes("youtubei/v1/player")) {
      const p = opts.player ?? player();
      if (p instanceof Error) throw p;
      return p instanceof Response ? p : new Response(JSON.stringify(p), { status: 200 });
    }
    if (url.includes("youtube.com/api/timedtext")) {
      const x = opts.xml ?? XML_OLD;
      if (x instanceof Error) throw x;
      return x instanceof Response ? x : new Response(x, { status: 200 });
    }
    throw new Error("unexpected " + url);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const run = async (w: ReturnType<typeof world>, body: unknown) => {
  const res = await handle(new Request("https://f/y", { method: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify(body) }), ENV, w.fetchImpl);
  return { status: res.status, json: await res.json().catch(() => null) };
};

describe("reading a link and caption text", () => {
  it("finds the id in every kind of YouTube link", () => {
    for (const u of [`https://www.youtube.com/watch?v=${ID}&t=30s`, `https://youtu.be/${ID}?si=x`, `https://m.youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`, `https://www.youtube.com/live/${ID}`, ID]) expect(videoIdFrom(u)).toBe(ID);
    for (const u of ["https://example.com/watch?v=" + ID, "https://youtube.com/watch?v=short", "bukan link", 5, null]) expect(videoIdFrom(u)).toBeNull();
  });
  it("decodes entities, also when escaped twice", () => {
    expect(decodeEntities("a &amp;amp; b &amp;#39;c&amp;#39; &quot;d&quot; &#x41;&#66; &unknown;")).toBe("a & b 'c' \"d\" AB &unknown;");
  });
  it("reads both caption formats, skipping empty lines and giving a missing duration a default", () => {
    const old = parseCaptionXml(XML_OLD);
    expect(old.map(l => [l.start, l.end, l.text])).toEqual([[0.5, 3, "Halo semuanya"], [3, 5, "kita & mulai 'hari' ini"], [6, 8, "tanpa durasi"]]);
    expect(parseCaptionXml(XML_NEW).map(l => [l.start, l.end, l.text])).toEqual([[1, 3.5, "Halo dunia"], [4, 5.5, "baris dua"]]);
    expect(parseCaptionXml("<html>bukan teks</html>")).toEqual([]);
  });
  it("prefers a human track in the language, then an automatic one, then anything", () => {
    const t = [{ baseUrl: "a", languageCode: "en" }, { baseUrl: "b", languageCode: "id", kind: "asr" }, { baseUrl: "c", languageCode: "id" }];
    expect(pickTrack(t, "id")?.baseUrl).toBe("c");
    expect(pickTrack(t.slice(0, 2), "id")?.baseUrl).toBe("b");
    expect(pickTrack([{ baseUrl: "a", languageCode: "en" }], "id")?.baseUrl).toBe("a");
    expect(pickTrack([], "id")).toBeNull();
  });
});

describe("the function", () => {
  it("returns the title, length, language and lines of a video", async () => {
    const w = world();
    const r = await run(w, { action: "captions", url: `https://youtu.be/${ID}`, lang: "id" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ videoId: ID, title: "Video Uji", seconds: 1158, language: "id", auto: true });
    expect(r.json.lines).toHaveLength(3);
    const caption = w.calls.find(c => c.url.includes("timedtext"))!;
    expect(caption.url).not.toContain("fmt=");
  });
  it("answers only a signed-in caller, without touching YouTube", async () => {
    const w = world({ user: false });
    const r = await run(w, { action: "captions", url: ID });
    expect(r.json.error.status).toBe("NOT_SIGNED_IN");
    expect(w.calls.some(c => c.url.includes("youtube"))).toBe(false);
  });
  it("refuses a link that is not YouTube and unknown actions", async () => {
    expect((await run(world(), { action: "captions", url: "https://example.com/x" })).json.error.status).toBe("BAD_URL");
    expect((await run(world(), { action: "download", url: ID })).json.error.status).toBe("UNKNOWN_ACTION");
  });
  it("explains each way YouTube can say no", async () => {
    const code = async (o: Parameters<typeof world>[0]) => (await run(world(o), { action: "captions", url: ID })).json.error.status;
    expect(await code({ player: player({ playabilityStatus: { status: "LOGIN_REQUIRED" } }) })).toBe("BLOCKED");
    expect(await code({ player: player({ playabilityStatus: { status: "UNPLAYABLE", reason: "Privat" } }) })).toBe("UNPLAYABLE");
    expect(await code({ player: player({ captions: undefined }) })).toBe("NO_CAPTIONS");
    expect(await code({ player: new Response("{}", { status: 403 }) })).toBe("BLOCKED");
    expect(await code({ player: new TypeError("down") })).toBe("UNREACHABLE");
    expect(await code({ xml: new Response("", { status: 429 }) })).toBe("BLOCKED");
    expect(await code({ xml: "<transcript></transcript>" })).toBe("NO_CAPTIONS");
  });
  it("never follows a caption address that is not YouTube's", async () => {
    const evil = player({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: "https://evil.example.com/steal", languageCode: "id" }] } } });
    const w = world({ player: evil });
    expect((await run(w, { action: "captions", url: ID })).json.error.status).toBe("BLOCKED");
    expect(w.calls.some(c => c.url.includes("evil"))).toBe(false);
  });
  it("falls back to the last line's end when the length is unknown", async () => {
    const r = await run(world({ player: player({ videoDetails: { title: "x" } }) }), { action: "captions", url: ID });
    expect(r.json.seconds).toBe(8);
  });
});
