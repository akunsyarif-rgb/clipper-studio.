import { describe, expect, it } from "vitest";
import { planSfx, SFX_MODES, type SfxEvent } from "./sfx";
import { mixSfx, SFX_RATE, sfxWav, synthEffect } from "./sfx-synth";

const scene = (over: object = {}) => ({ durationInFrames: 90, ...over });
const peak = (x: Float32Array) => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; };
const rms = (x: Float32Array, from: number, to: number) => { let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, to - from)); };

describe("planSfx", () => {
  const scenes = [
    scene({ narrative: { role: "hook", intensity: "impact" } }),
    scene({ narrative: { role: "continuation", intensity: "quiet" }, sticker: "seedling" }),
    scene({ narrative: { role: "application", intensity: "emphasis" } }),
    scene({ narrative: { role: "application", intensity: "emphasis" }, visual: { template: "cta" }, sticker: "rocket" }),
  ];
  it("plays nothing when switched off", () => {
    expect(planSfx(scenes, "off")).toEqual([]);
  });
  it("whooshes into every new scene a few frames early, pops with stickers, dings on the call to action", () => {
    const e = planSfx(scenes, "punchy");
    expect(e.filter(x => x.kind === "whoosh").map(x => x.frame)).toEqual([86, 176, 266]);
    expect(e.filter(x => x.kind === "pop").map(x => x.frame)).toEqual([93, 273]);
    expect(e.filter(x => x.kind === "ding").map(x => x.frame)).toEqual([278]);
    expect(e.filter(x => x.kind === "thud").map(x => x.frame)).toEqual([2]);
    expect([...e].sort((a, b) => a.frame - b.frame)).toEqual(e);
  });
  it("subtle is quieter, has no thud, and skips whooshes into very short scenes; calm scenes are softer than impact ones", () => {
    const punchy = planSfx(scenes, "punchy"), subtle = planSfx(scenes, "subtle");
    expect(subtle.some(x => x.kind === "thud")).toBe(false);
    expect(Math.max(...subtle.map(x => x.gain))).toBeLessThan(Math.max(...punchy.map(x => x.gain)));
    const quiet = punchy.find(x => x.kind === "whoosh" && x.frame === 86)!, normal = punchy.find(x => x.kind === "whoosh" && x.frame === 176)!;
    expect(quiet.gain).toBeLessThan(normal.gain);
    expect(planSfx([scene(), scene({ durationInFrames: 30 })], "subtle").some(x => x.kind === "whoosh")).toBe(false);
    expect(planSfx([scene(), scene({ durationInFrames: 30 })], "punchy").some(x => x.kind === "whoosh")).toBe(true);
  });
  it("over a source video only a full-screen cutaway gets a whoosh (the speaker keeps the sound)", () => {
    const e = planSfx([scene({ cut: "video" }), scene({ cut: "graphic" }), scene({ cut: "overlay", sticker: "fire" })], "punchy", { videoEdit: true });
    expect(e.map(x => `${x.kind}@${x.frame}`)).toEqual(["whoosh@86"]);
  });
  it("merges effects of one kind that fall almost together", () => {
    const e = planSfx([scene({ durationInFrames: 4 }), scene({ durationInFrames: 4 }), scene({ durationInFrames: 90 })], "punchy");
    expect(e.filter(x => x.kind === "whoosh").length).toBeLessThanOrEqual(2);
  });
  it("lists the modes", () => { expect(SFX_MODES).toEqual(["off", "subtle", "punchy"]); });
});

describe("synthesis", () => {
  it("every effect is audible, within range, finite, and the same every time", () => {
    for (const kind of ["whoosh", "pop", "ding", "thud"] as const) {
      const a = synthEffect(kind), b = synthEffect(kind);
      expect(a.length, kind).toBeGreaterThan(SFX_RATE * 0.1);
      expect(a.length, kind).toBeLessThan(SFX_RATE * 1.3);
      expect(peak(a), kind).toBeGreaterThan(0.8);
      expect(peak(a), kind).toBeLessThanOrEqual(1);
      expect(a.every(Number.isFinite), kind).toBe(true);
      expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer)), kind).toBe(true);
    }
  });
  it("gain scales the effect", () => {
    const full = synthEffect("pop", 1), half = synthEffect("pop", 0.5);
    expect(peak(half)).toBeCloseTo(peak(full) * 0.5, 2);
    expect(peak(synthEffect("pop", 0))).toBe(0);
  });
  it("starts and ends quietly, so there is no click", () => {
    for (const kind of ["whoosh", "pop", "ding", "thud"] as const) {
      const x = synthEffect(kind);
      expect(Math.abs(x[0]), kind).toBeLessThan(0.05);
      expect(rms(x, x.length - 200, x.length), kind).toBeLessThan(0.05);
    }
  });
  it("the track is as long as the video, has sound only where an effect is, and never clips", () => {
    const events: SfxEvent[] = [{ frame: 30, kind: "pop", gain: 1 }, { frame: 60, kind: "ding", gain: 1 }, { frame: 60, kind: "thud", gain: 1 }];
    const track = mixSfx(events, 150, 30);
    expect(track.length).toBe(Math.round(5 * SFX_RATE));
    expect(rms(track, 0, SFX_RATE * 0.9)).toBe(0);                                 // before the first effect
    expect(rms(track, SFX_RATE * 1.0, SFX_RATE * 1.1)).toBeGreaterThan(0.05);      // the pop
    expect(rms(track, SFX_RATE * 4.2, SFX_RATE * 5)).toBe(0);                      // after the bell has died away
    expect(peak(track)).toBeLessThan(1);
  });
  it("an effect that would run past the end is cut, not an error", () => {
    expect(() => mixSfx([{ frame: 148, kind: "ding", gain: 1 }], 150, 30)).not.toThrow();
    expect(mixSfx([], 30, 30).every(v => v === 0)).toBe(true);
  });
  it("makes a valid mono 16-bit WAV", () => {
    const wav = Buffer.from(sfxWav([{ frame: 0, kind: "pop", gain: 1 }], 60, 30));
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(SFX_RATE);
    expect(wav.readUInt32LE(40)).toBe(Math.round(2 * SFX_RATE) * 2);
  });
});
