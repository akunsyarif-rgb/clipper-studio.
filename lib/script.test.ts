import { describe, expect, it } from "vitest";
import {
  activeWordIndex, buildTimeline, captionLine, explainRenderError, FPS, MAX_SCENE_CHARS, MAX_SCENES, MAX_SECONDS, MIN_SCENE_SECONDS,
  slug, splitScript, totalFrames, validateAudioFile, validateTitle,
} from "./script";

describe("splitScript", () => {
  it("splits on lines and sentences", () => {
    expect(splitScript("Halo dunia. Apa kabar?\nBaris kedua!")).toEqual(["Halo dunia.", "Apa kabar?", "Baris kedua!"]);
  });
  it("ignores blank lines and extra spaces", () => {
    expect(splitScript("\n\n  Satu   dua tiga.  \n\n")).toEqual(["Satu dua tiga."]);
  });
  it("merges tiny fragments into the previous scene", () => {
    expect(splitScript("Ini kalimat pertama yang cukup panjang. Ya. Benar.")).toEqual(["Ini kalimat pertama yang cukup panjang. Ya. Benar."]);
  });
  it("breaks very long sentences into readable chunks", () => {
    const long = Array.from({ length: 60 }, (_, i) => `kata${i}`).join(" ") + ".";
    const parts = splitScript(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(MAX_SCENE_CHARS);
    expect(parts.join(" ")).toBe(long);
  });
});

describe("buildTimeline", () => {
  const script = "Jangan tunggu semangat datang. Mulailah, meski langkahmu kecil. Disiplin membuatmu tetap bergerak.";

  it("follows the narration length exactly when audio is present", () => {
    const t = buildTimeline(script, { kind: "audio", seconds: 9.4 });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.totalFrames).toBe(Math.round(9.4 * FPS));
    expect(totalFrames(t.scenes)).toBe(t.totalFrames);
    for (const s of t.scenes) expect(s.durationInFrames).toBeGreaterThanOrEqual(Math.ceil(MIN_SCENE_SECONDS * FPS));
  });

  it("gives longer sentences more time", () => {
    const t = buildTimeline("Pendek sekali ya.\nIni kalimat yang jauh lebih panjang dan butuh waktu baca lebih lama dari yang pertama.", { kind: "audio", seconds: 12 });
    expect(t.ok && t.scenes[1].durationInFrames > t.scenes[0].durationInFrames).toBe(true);
  });

  it("hits a target duration exactly", () => {
    const t = buildTimeline(script, { kind: "target", seconds: 30 });
    expect(t.ok && t.totalFrames).toBe(900);
  });

  it("estimates duration from reading speed when nothing else is given", () => {
    const t = buildTimeline(script, { kind: "auto" });
    expect(t.ok).toBe(true);
    if (t.ok) { expect(t.seconds).toBeGreaterThan(5); expect(t.seconds).toBeLessThan(20); }
  });

  it("warns when the script is too long for the chosen duration", () => {
    const words = Array.from({ length: 80 }, (_, i) => `kata${i}`).join(" ");
    const t = buildTimeline(words, { kind: "target", seconds: 15 });
    expect(t.ok && t.warnings.length).toBe(1);
  });

  it.each([
    ["", { kind: "auto" as const }, /kosong/],
    ["   \n  ", { kind: "auto" as const }, /kosong/],
    ["x".repeat(3001), { kind: "auto" as const }, /terlalu panjang/],
    [Array.from({ length: MAX_SCENES + 1 }, (_, i) => `Kalimat nomor ${i} di sini.`).join("\n"), { kind: "auto" as const }, /scene/],
    [script, { kind: "audio" as const, seconds: MAX_SECONDS + 1 }, /melebihi batas/],
    [script, { kind: "audio" as const, seconds: 2 }, /terlalu pendek/],
    [script, { kind: "audio" as const, seconds: NaN }, /tidak dapat dibaca/],
    [script, { kind: "target" as const, seconds: 2 }, /terlalu pendek/],
  ])("rejects invalid input %#", (text, mode, msg) => {
    const t = buildTimeline(text, mode);
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error).toMatch(msg);
  });
});

describe("captions", () => {
  it("moves the active word through the scene and finishes before the end", () => {
    const text = "satu dua tiga empat";
    expect(activeWordIndex(text, 0, 100)).toBe(0);
    expect(activeWordIndex(text, 45, 100)).toBe(2);
    expect(activeWordIndex(text, 95, 100)).toBe(3);
    expect(activeWordIndex("", 10, 100)).toBe(-1);
  });
  it("shows the caption line that contains the active word", () => {
    expect(captionLine("a b c d e f g", 5)).toEqual({ words: ["e", "f", "g"], activeInLine: 1 });
    expect(captionLine("a b", -1)).toEqual({ words: [], activeInLine: -1 });
  });
});

describe("validation helpers", () => {
  it("validates audio files", () => {
    expect(validateAudioFile({ name: "n.mp3", type: "audio/mpeg", size: 10 })).toBeNull();
    expect(validateAudioFile({ name: "voice.m4a", type: "", size: 10 })).toBeNull();
    expect(validateAudioFile({ name: "x.pdf", type: "application/pdf", size: 10 })).toMatch(/audio/);
    expect(validateAudioFile({ name: "n.mp3", type: "audio/mpeg", size: 0 })).toMatch(/kosong/);
    expect(validateAudioFile({ name: "n.wav", type: "audio/wav", size: 60 * 1024 ** 2 })).toMatch(/50 MB/);
  });
  it("validates the title", () => {
    expect(validateTitle("Judul")).toBeNull();
    expect(validateTitle("x".repeat(49))).toMatch(/48/);
  });
  it("explains render failures", () => {
    expect(explainRenderError("AbortError: aborted")).toMatch(/dibatalkan/);
    expect(explainRenderError("VideoEncoder is not defined")).toMatch(/WebCodecs/);
    expect(explainRenderError("EncodingError: Unable to decode audio data")).toMatch(/Audio/);
    expect(explainRenderError("boom")).toMatch(/Render gagal/);
  });
  it("makes safe file names", () => {
    expect(slug("Sebuah Pengingat: Mulai!")).toBe("sebuah-pengingat-mulai");
    expect(slug("???")).toBe("video");
  });
});
