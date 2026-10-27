import { describe, expect, it } from "vitest";
import { ASR_RUN_KEY, defaultModelFor, isTouchDevice, lighterModel, parseRunMark } from "./device";

const IPAD_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC = IPAD_SAFARI;
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("device detection and model choice", () => {
  it("treats iPadOS (Mac user agent with a touch screen), iPhone and Android as touch devices", () => {
    expect(isTouchDevice(IPAD_SAFARI, 5)).toBe(true);
    expect(isTouchDevice(IPHONE, 5)).toBe(true);
    expect(isTouchDevice("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36", 5)).toBe(true);
  });
  it("does not treat a real Mac or a PC as one", () => {
    expect(isTouchDevice(MAC, 0)).toBe(false);
    expect(isTouchDevice(WINDOWS, 0)).toBe(false);
  });
  it("defaults to base on touch devices and small elsewhere", () => {
    expect(defaultModelFor(IPAD_SAFARI, 5)).toBe("Xenova/whisper-base");
    expect(defaultModelFor(WINDOWS, 0)).toBe("Xenova/whisper-small");
  });
  it("steps down one model after a failed run", () => {
    expect(lighterModel("Xenova/whisper-small")).toBe("Xenova/whisper-base");
    expect(lighterModel("Xenova/whisper-base")).toBe("Xenova/whisper-tiny");
    expect(lighterModel("Xenova/whisper-tiny")).toBe("Xenova/whisper-tiny");
  });
});

describe("run mark", () => {
  it("reads what was written and ignores anything else", () => {
    expect(ASR_RUN_KEY).toBe("clipper:asr-run");
    expect(parseRunMark(JSON.stringify({ model: "Xenova/whisper-small", at: 5 }))).toEqual({ model: "Xenova/whisper-small", at: 5 });
    expect(parseRunMark(null)).toBeNull();
    expect(parseRunMark("")).toBeNull();
    expect(parseRunMark("not json")).toBeNull();
    expect(parseRunMark(JSON.stringify({ model: 3 }))).toBeNull();
    expect(parseRunMark("null")).toBeNull();
  });
});
