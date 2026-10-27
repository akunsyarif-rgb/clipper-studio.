import { describe, expect, it } from "vitest";
import { ASR_CACHE_LIMIT, asrCacheKey, isPristine, isSession, SESSION_VERSION, sourceMatches, touchCache, type SessionData } from "./session";

const base: SessionData = {
  v: SESSION_VERSION, savedAt: 1, script: "Halo dunia.", title: "Judul", style: "editorial", palette: "ivory", contentPreset: "quiet-editorial", target: "auto", captions: true,
  overrides: { "Halo dunia.": { template: "statement", icon: "money" } }, cutOverrides: { "Halo dunia.": "clip" }, clipStarts: { "Halo dunia.": 12.5 },
  videoEdit: true, captionOffset: -0.2, imported: null, voiceMode: "none", ttsLang: "id", ttsVoice: 0, ttsSpeed: 1.05,
};
// JSON round trip: what actually comes back out of storage.
const stored = (s: unknown) => JSON.parse(JSON.stringify(s));

describe("isSession", () => {
  it("accepts what was saved", () => {
    expect(isSession(stored(base))).toBe(true);
    expect(isSession(stored({ ...base, imported: { language: "id", granularity: "word", duration: 5, segments: [{ start: 0, end: 1, text: "Halo", words: [] }] }, contentPreset: "custom" }))).toBe(true);
  });

  it("accepts sessions saved before the overlay setting existed, and the two positions", () => {
    expect(isSession(stored({ ...base, overlay: "lower" }))).toBe(true);
    expect(isSession(stored({ ...base, overlay: "top", cutOverrides: { a: "overlay" } }))).toBe(true);
    expect(isSession(stored({ ...base, overlay: "middle" }))).toBe(false);
  });

  it("rejects other versions, missing fields and wrong types instead of half-applying them", () => {
    expect(isSession(null)).toBe(false);
    expect(isSession([])).toBe(false);
    expect(isSession({ ...base, v: 99 })).toBe(false);
    expect(isSession({ ...base, script: 5 })).toBe(false);
    expect(isSession({ ...base, style: "disco" })).toBe(false);
    expect(isSession({ ...base, palette: "neon" })).toBe(false);
    expect(isSession({ ...base, contentPreset: "nope" })).toBe(false);
    expect(isSession({ ...base, cutOverrides: { a: "zoom" } })).toBe(false);
    expect(isSession({ ...base, clipStarts: { a: -1 } })).toBe(false);
    expect(isSession({ ...base, clipStarts: { a: Number.NaN } })).toBe(false);
    expect(isSession({ ...base, captionOffset: Infinity })).toBe(false);
    expect(isSession({ ...base, imported: { segments: "x" } })).toBe(false);
    expect(isSession({ ...base, voiceMode: "manual" })).toBe(false);
    const missing: Partial<SessionData> = { ...base };
    delete missing.target;
    expect(isSession(missing)).toBe(false);
  });
});

describe("isPristine", () => {
  const sample = "Contoh naskah.";
  it("does not offer back an untouched sample", () => {
    expect(isPristine({ script: sample, imported: null, videoEdit: false }, sample, false)).toBe(true);
  });
  it("offers anything the creator changed or added", () => {
    expect(isPristine({ script: "Lain.", imported: null, videoEdit: false }, sample, false)).toBe(false);
    expect(isPristine({ script: sample, imported: null, videoEdit: false }, sample, true)).toBe(false);
    expect(isPristine({ script: sample, imported: null, videoEdit: true }, sample, false)).toBe(false);
  });
});

describe("transcript cache", () => {
  const file = { name: "a.mp4", size: 10, lastModified: 5 };
  it("keys on the file, the part, the model and the language", () => {
    const k = asrCacheKey(file, { start: 0, duration: 30 }, "Xenova/whisper-base", "indonesian");
    expect(asrCacheKey(file, { start: 0, duration: 30 }, "Xenova/whisper-base", "indonesian")).toBe(k);
    expect(asrCacheKey({ ...file, size: 11 }, { start: 0, duration: 30 }, "Xenova/whisper-base", "indonesian")).not.toBe(k);
    expect(asrCacheKey({ ...file, lastModified: 6 }, { start: 0, duration: 30 }, "Xenova/whisper-base", "indonesian")).not.toBe(k);
    expect(asrCacheKey(file, { start: 5, duration: 30 }, "Xenova/whisper-base", "indonesian")).not.toBe(k);
    expect(asrCacheKey(file, { start: 0, duration: 30 }, "Xenova/whisper-small", "indonesian")).not.toBe(k);
    expect(asrCacheKey(file, { start: 0, duration: 30 }, "Xenova/whisper-base", "english")).not.toBe(k);
  });

  it("ignores sub-centisecond noise in the range", () => {
    expect(asrCacheKey(file, { start: 0, duration: 12.3001 }, "m", "l")).toBe(asrCacheKey(file, { start: 0, duration: 12.3004 }, "m", "l"));
  });

  it("keeps the newest entries and says which old ones to delete", () => {
    let index: string[] = [];
    const dropped: string[] = [];
    for (let i = 0; i < ASR_CACHE_LIMIT + 3; i++) { const r = touchCache(index, `k${i}`); index = r.index; dropped.push(...r.drop); }
    expect(index).toHaveLength(ASR_CACHE_LIMIT);
    expect(index.at(-1)).toBe(`k${ASR_CACHE_LIMIT + 2}`);
    expect(dropped).toEqual(["k0", "k1", "k2"]);
  });

  it("re-using a key moves it to the newest place without dropping anything", () => {
    expect(touchCache(["a", "b", "c"], "a")).toEqual({ index: ["b", "c", "a"], drop: [] });
  });
});

describe("sourceMatches", () => {
  it("compares name, size and modified time", () => {
    const f = { name: "a.mp4", size: 1, lastModified: 2 };
    expect(sourceMatches(f, { ...f })).toBe(true);
    expect(sourceMatches(f, { ...f, size: 3 })).toBe(false);
  });
});
