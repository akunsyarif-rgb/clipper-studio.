import { describe, expect, it } from "vitest";
import { holdWakeLock, wakeLockSupported } from "./wake-lock";

const fakeDoc = () => { const l = new Set<() => void>(); return { visibilityState: "visible" as DocumentVisibilityState, addEventListener: (_: string, f: () => void) => { l.add(f); }, removeEventListener: (_: string, f: () => void) => { l.delete(f); }, fire() { l.forEach(f => f()); }, count: () => l.size } as unknown as Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState"> & { fire(): void; count(): number }; };

describe("wake lock", () => {
  it("holds the screen, asks again when the tab comes back, and lets go", async () => {
    let requests = 0, released = 0;
    const nav = { wakeLock: { request: async () => { requests++; return { release: async () => { released++; } }; } } };
    const doc = fakeDoc();
    const release = await holdWakeLock({ nav, doc });
    expect(requests).toBe(1);
    doc.fire(); await Promise.resolve();
    expect(requests).toBe(2);
    await release();
    expect(released).toBe(1);
    expect(doc.count()).toBe(0);
  });
  it("a browser without the API, or one that refuses, never breaks the job", async () => {
    expect(wakeLockSupported({})).toBe(false);
    const none = await holdWakeLock({ nav: {}, doc: fakeDoc() });
    await expect(none()).resolves.toBeUndefined();
    const refusing = await holdWakeLock({ nav: { wakeLock: { request: async () => { throw new Error("NotAllowedError"); } } }, doc: fakeDoc() });
    await expect(refusing()).resolves.toBeUndefined();
    const badRelease = await holdWakeLock({ nav: { wakeLock: { request: async () => ({ release: async () => { throw new Error("x"); } }) } }, doc: fakeDoc() });
    await expect(badRelease()).resolves.toBeUndefined();
  });
});
