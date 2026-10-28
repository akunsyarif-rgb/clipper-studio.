import { describe, expect, it } from "vitest";
import { creditText, downloadPhoto, forgetPexelsKey, pexelsStatus, savePexelsKey, searchPhotos, type PexelsPhoto } from "./pexels";

const photo: PexelsPhoto = { id: 7, alt: "a", photographer: "Siti", photographerUrl: "", pexelsUrl: "", thumb: "t", image: "https://images.pexels.com/photos/7/a.jpeg?w=1080&h=1920", fallback: "https://images.pexels.com/photos/7/a.jpeg?w=800" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const err = (status: number, code: string, message = "") => json(status, { error: { status: code, message } });
const fnOf = (...answers: (Response | null | Error)[]) => {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const fn = async (name: string, body: unknown) => {
    calls.push({ name, body: body as Record<string, unknown> });
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return a === undefined ? json(200, {}) : a?.clone() ?? null;
  };
  return { fn, calls };
};
const jpeg = () => new Response(new Uint8Array(2000).fill(1), { status: 200, headers: { "content-type": "image/jpeg" } });

describe("status", () => {
  it("says whether a key is saved, and null when it cannot tell", async () => {
    expect(await pexelsStatus(fnOf(json(200, { hasKey: true })).fn)).toBe(true);
    expect(await pexelsStatus(fnOf(json(200, { hasKey: false })).fn)).toBe(false);
    expect(await pexelsStatus(fnOf(null).fn)).toBeNull();
    expect(await pexelsStatus(fnOf(err(404, "X")).fn)).toBeNull();
    expect(await pexelsStatus(fnOf(new Error("offline")).fn)).toBeNull();
  });
});

describe("saving and forgetting the key", () => {
  it("sends the trimmed key only to the pexels function", async () => {
    const f = fnOf(json(200, { ok: true }));
    await savePexelsKey("  " + "k".repeat(30) + "\n", f.fn);
    expect(f.calls).toEqual([{ name: "pexels", body: { action: "save-key", apiKey: "k".repeat(30) } }]);
  });
  it("refuses a malformed key without calling the server", async () => {
    const f = fnOf();
    await expect(savePexelsKey("short", f.fn)).rejects.toMatchObject({ kind: "key" });
    await expect(savePexelsKey("with space " + "k".repeat(30), f.fn)).rejects.toMatchObject({ kind: "key" });
    expect(f.calls).toHaveLength(0);
  });
  it("explains a rejected key, signed-out and a missing function", async () => {
    await expect(savePexelsKey("k".repeat(30), fnOf(err(400, "KEY_REJECTED", "Pexels menolak kunci ini.")).fn)).rejects.toMatchObject({ kind: "key", message: /menolak/ });
    await expect(savePexelsKey("k".repeat(30), fnOf(null).fn)).rejects.toMatchObject({ kind: "signed-out" });
    await expect(savePexelsKey("k".repeat(30), fnOf(json(404, {})).fn)).rejects.toMatchObject({ kind: "server", message: /belum dipasang/ });
    await expect(savePexelsKey("k".repeat(30), fnOf(new Error("x")).fn)).rejects.toMatchObject({ kind: "network" });
  });
  it("forgets", async () => {
    const f = fnOf(json(200, { ok: true }));
    await forgetPexelsKey(f.fn);
    expect(f.calls[0].body).toEqual({ action: "forget" });
  });
});

describe("searchPhotos", () => {
  it("returns the photos and the quota left", async () => {
    const f = fnOf(json(200, { photos: [photo], remaining: 150 }));
    expect(await searchPhotos("jam pasir", { fn: f.fn, perPage: 4 })).toEqual({ photos: [photo], remaining: 150 });
    expect(f.calls[0].body).toEqual({ action: "search", query: "jam pasir", perPage: 4, page: 1 });
  });
  it("maps the failures to kinds the screen can explain", async () => {
    await expect(searchPhotos("x", { fn: fnOf(err(400, "NO_KEY")).fn })).rejects.toMatchObject({ kind: "no-key" });
    await expect(searchPhotos("x", { fn: fnOf(err(429, "RATE_LIMIT")).fn })).rejects.toMatchObject({ kind: "limit" });
    await expect(searchPhotos("x", { fn: fnOf(err(400, "KEY_REJECTED", "Simpan kunci yang baru.")).fn })).rejects.toMatchObject({ kind: "key" });
    await expect(searchPhotos("x", { fn: fnOf(null).fn })).rejects.toMatchObject({ kind: "signed-out" });
    await expect(searchPhotos("x", { fn: fnOf(err(502, "UPSTREAM_ERROR", "Pexels sedang bermasalah.")).fn })).rejects.toMatchObject({ kind: "server" });
  });
  it("treats an odd answer as no photos", async () => {
    expect((await searchPhotos("x", { fn: fnOf(json(200, { nope: 1 })).fn })).photos).toEqual([]);
  });
});

describe("downloadPhoto", () => {
  it("returns the 1080×1920 version as an image file", async () => {
    const f = fnOf(jpeg());
    const file = await downloadPhoto(photo, { fn: f.fn });
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toBe("pexels-7.jpg");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].body.url).toBe(photo.image);
  });
  it("falls back to the smaller version when the first fails", async () => {
    const f = fnOf(err(502, "IMAGE_FAILED"), jpeg());
    await downloadPhoto(photo, { fn: f.fn });
    expect(f.calls.map(c => c.body.url)).toEqual([photo.image, photo.fallback]);
  });
  it("rejects a broken or non-image answer, and stops at once when signed out", async () => {
    await expect(downloadPhoto(photo, { fn: fnOf(new Response("<html>", { headers: { "content-type": "text/html" } }), new Response(new Uint8Array(10), { headers: { "content-type": "image/jpeg" } })).fn })).rejects.toMatchObject({ kind: "server" });
    const f = fnOf(null, jpeg());
    await expect(downloadPhoto(photo, { fn: f.fn })).rejects.toMatchObject({ kind: "signed-out" });
    expect(f.calls).toHaveLength(1);
  });
  it("does not start when already cancelled", async () => {
    const ctl = new AbortController(); ctl.abort();
    const f = fnOf(jpeg());
    await expect(downloadPhoto(photo, { fn: f.fn, signal: ctl.signal })).rejects.toThrow(/Dibatalkan/);
    expect(f.calls).toHaveLength(0);
  });
});

describe("credit", () => {
  it("names the photographer and Pexels", () => { expect(creditText(photo)).toBe("Foto: Siti di Pexels"); });
});
