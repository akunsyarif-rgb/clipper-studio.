import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backsoundPlan, DUCK_LEVEL, encodeWav, moodForStyle, MOODS, musicGain, normalize, speechEnvelope } from "./audio";

const tone = (seconds: number, rate: number, amp = 0.5, freq = 220) =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate));

describe("encodeWav", () => {
  it("writes a valid 16-bit PCM header and data", () => {
    const buf = encodeWav([new Float32Array([0, 1, -1, 0.5])], 8000);
    const v = new DataView(buf);
    const str = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
    expect([str(0), str(8), str(12), str(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([1, 8000, 16, 8]);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([0, 32767, -32768]);
    expect(buf.byteLength).toBe(44 + 8);
  });

  const hasFfprobe = spawnSync("ffprobe", ["-version"]).status === 0;
  it.skipIf(!hasFfprobe)("is readable by ffprobe with the right duration and channels", () => {
    const dir = mkdtempSync(join(tmpdir(), "wav-"));
    try {
      const file = join(dir, "t.wav");
      writeFileSync(file, Buffer.from(encodeWav([tone(1.5, 44100), tone(1.5, 44100, 0.3, 330)], 44100)));
      const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,channels,sample_rate:format=duration", "-of", "json", file]).toString());
      expect(out.streams[0]).toMatchObject({ codec_name: "pcm_s16le", channels: 2, sample_rate: "44100" });
      expect(Number(out.format.duration)).toBeCloseTo(1.5, 2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("normalize", () => {
  it("raises quiet audio to the target peak but caps the gain", () => {
    expect(Math.max(...normalize(new Float32Array([0.1, -0.2])))).toBeCloseTo(0.9 * 0.5);
    expect(Math.min(...normalize(new Float32Array([0.1, -0.2])))).toBeCloseTo(-0.9);
    expect(Math.max(...normalize(new Float32Array([0.01]), 0.9, 8))).toBeCloseTo(0.08);
    expect(Array.from(normalize(new Float32Array([0, 0])))).toEqual([0, 0]);
  });
});

describe("speechEnvelope", () => {
  const rate = 16000, fps = 30;
  it("is ~1 while speaking and falls back to 0 in silence", () => {
    const samples = new Float32Array(rate * 4);
    samples.set(tone(1, rate), rate * 1); // speech from 1 s to 2 s
    const env = speechEnvelope(samples, rate, fps);
    expect(env).toHaveLength(120);
    expect(env[10]).toBe(0);
    expect(env[45]).toBeGreaterThan(0.95);
    expect(env[61]).toBeGreaterThan(0.5); // slow release right after speech
    expect(env[115]).toBeLessThan(0.05);
  });
  it("returns zeros for silence", () => {
    expect(speechEnvelope(new Float32Array(rate), rate, fps).every(v => v === 0)).toBe(true);
  });
});

describe("musicGain", () => {
  const music = { volume: 0.5, duck: true };
  it("fades in and out", () => {
    expect(musicGain(0, 300, 30, music, null)).toBe(0);
    expect(musicGain(15, 300, 30, music, null)).toBeCloseTo(0.25);
    expect(musicGain(150, 300, 30, music, null)).toBeCloseTo(0.5);
    expect(musicGain(300, 300, 30, music, null)).toBe(0);
  });
  it("ducks under speech only when enabled", () => {
    const speech = Array(300).fill(1);
    expect(musicGain(150, 300, 30, music, speech)).toBeCloseTo(0.5 * DUCK_LEVEL);
    expect(musicGain(150, 300, 30, { ...music, duck: false }, speech)).toBeCloseTo(0.5);
    expect(musicGain(150, 300, 30, music, [1])).toBeCloseTo(0.5 * DUCK_LEVEL); // fixed duck when not analysable
  });
});

describe("backsoundPlan", () => {
  it.each(MOODS.map(m => m.id))("covers the whole duration without overrunning (%s)", mood => {
    const { bpm, events } = backsoundPlan(mood, 20.3, 7);
    expect(bpm).toBeGreaterThan(50);
    expect(events.length).toBeGreaterThan(4);
    for (const e of events) {
      expect(e.time).toBeGreaterThanOrEqual(0);
      expect(e.time).toBeLessThan(20.3);
      expect(e.velocity).toBeGreaterThan(0);
      expect(e.velocity).toBeLessThanOrEqual(1);
      for (const n of e.notes) expect(n).toMatch(/^[A-G]b?\d$/);
    }
    expect(Math.max(...events.filter(e => e.part === "pad").map(e => e.time + e.duration))).toBeCloseTo(20.3, 1);
  });
  it("is deterministic per seed and varies between seeds", () => {
    expect(backsoundPlan("semangat", 10, 3)).toEqual(backsoundPlan("semangat", 10, 3));
    expect(backsoundPlan("semangat", 10, 3)).not.toEqual(backsoundPlan("semangat", 10, 4));
  });
  it("maps animation styles to moods", () => {
    expect(moodForStyle("cinematic")).toBe("sinematik");
    expect(moodForStyle("popup")).toBe("semangat");
    expect(moodForStyle("hybrid")).toBe("tenang");
  });
});
