import { describe, expect, it } from "vitest";
import { saveClipHandoff, takeClipHandoff, type ClipHandoff } from "./session-store";

const clip = (over: Partial<ClipHandoff> = {}): ClipHandoff => ({ blob: new Blob([new Uint8Array(2048)], { type: "video/mp4" }), name: "klip.mp4", type: "video/mp4", seconds: 37, title: "Judul", transcript: null, at: Date.now(), ...over });

describe("handing a cut clip to the motion studio", () => {
  it("passes the very same file through memory, once", async () => {
    const c = clip();
    expect(await saveClipHandoff(c)).toBe(true);
    const got = await takeClipHandoff();
    expect(got?.blob).toBe(c.blob);
    expect(got?.name).toBe("klip.mp4");
    expect(await takeClipHandoff()).toBeNull();
  });
  it("ignores a clip that is empty, has no length, or is older than an hour", async () => {
    await saveClipHandoff(clip({ blob: new Blob([]) }));
    expect(await takeClipHandoff()).toBeNull();
    await saveClipHandoff(clip({ seconds: 0 }));
    expect(await takeClipHandoff()).toBeNull();
    await saveClipHandoff(clip({ at: Date.now() - 2 * 60 * 60 * 1000 }));
    expect(await takeClipHandoff()).toBeNull();
  });
  it("keeps only the latest clip", async () => {
    await saveClipHandoff(clip({ name: "pertama.mp4" }));
    await saveClipHandoff(clip({ name: "kedua.mp4" }));
    expect((await takeClipHandoff())?.name).toBe("kedua.mp4");
  });
});
