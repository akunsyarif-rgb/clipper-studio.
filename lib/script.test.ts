import { describe, expect, it } from "vitest";
import {
  activeWordIndex, buildTimeline, captionLine, explainRenderError, FPS, MAX_SCENE_CHARS, MAX_SECONDS, MIN_SCENE_SECONDS,
  clipPlan, MAX_CLIP_FRAMES, slug, splitScript, splitScriptWithPauses, spokenFrames, totalFrames, validateAudioFile, validateTitle,
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

describe("pause tags", () => {
  it("removes tags from the scene text and records the silence after the scene", () => {
    const r = splitScriptWithPauses("Jangan menyerah. [jeda 1.5s] Mulai sekarang. [pause 500ms]");
    expect(r.texts).toEqual(["Jangan menyerah.", "Mulai sekarang."]);
    expect(r.pauses).toEqual([1.5, 0.5]);
  });

  it("never lets a tag reach the scene text, TTS or captions", () => {
    for (const t of splitScript("Satu [jeda] dua [Jeda: 2] tiga (pause 3s) empat [jeda abc] lima.")) expect(t).not.toMatch(/jeda|pause|\[|\]|/i);
  });

  it("uses 1 s for a bare tag, clamps to 0.1–10 s and ignores invalid or non-positive values", () => {
    expect(splitScriptWithPauses("Halo dunia. [jeda]").pauses).toEqual([1]);
    expect(splitScriptWithPauses("Halo dunia. [jeda 20]").pauses).toEqual([10]);
    expect(splitScriptWithPauses("Halo dunia. [jeda 20ms]").pauses).toEqual([0.1]);
    expect(splitScriptWithPauses("Halo dunia. [jeda abc]").pauses).toEqual([0]);
    expect(splitScriptWithPauses("Halo dunia. [jeda 0]").pauses).toEqual([0]);
  });

  it("adds up consecutive tags (capped) and ignores a tag before any speech", () => {
    expect(splitScriptWithPauses("[jeda 2] Halo dunia. [jeda 3] [jeda 4] [jeda 5]").pauses).toEqual([10]);
    expect(splitScriptWithPauses("[jeda 2] Halo dunia.").texts).toEqual(["Halo dunia."]);
  });

  it("a tag in the middle of a sentence pauses after the scene that contains it", () => {
    expect(splitScriptWithPauses("Tunggu dulu [jeda 2] lalu mulai.")).toEqual({ texts: ["Tunggu dulu lalu mulai."], pauses: [2] });
  });

  it("does not change scripts without tags", () => {
    const script = "Satu kalimat. Dua kalimat?\nBaris baru.";
    expect(splitScriptWithPauses(script)).toEqual({ texts: splitScript(script), pauses: [0, 0, 0] });
    expect(splitScript(script)).toEqual(["Satu kalimat.", "Dua kalimat?", "Baris baru."]);
  });

  it("lengthens the scene and reports the silence in pauseFrames (auto timing)", () => {
    const plain = buildTimeline("Halo dunia semua. Sampai jumpa lagi.", { kind: "auto" });
    const paused = buildTimeline("Halo dunia semua. [jeda 2s] Sampai jumpa lagi.", { kind: "auto" });
    if (!plain.ok || !paused.ok) throw new Error("timeline");
    expect(paused.scenes[0].durationInFrames - plain.scenes[0].durationInFrames).toBe(60);
    expect(paused.scenes[0].pauseFrames).toBe(60);
    expect(paused.scenes[1].pauseFrames).toBeUndefined();
  });

  it("gives a paused scene a larger share of a fixed duration", () => {
    const r = buildTimeline("Halo dunia semua. [jeda 3s] Sampai jumpa lagi.", { kind: "target", seconds: 30 });
    const plain = buildTimeline("Halo dunia semua. Sampai jumpa lagi.", { kind: "target", seconds: 30 });
    if (!r.ok || !plain.ok) throw new Error("timeline");
    expect(r.totalFrames).toBe(plain.totalFrames);
    expect(r.scenes[0].durationInFrames).toBeGreaterThan(plain.scenes[0].durationInFrames);
  });

  it("spreads highlighted words over the spoken part only", () => {
    const text = "satu dua tiga empat";
    const s = { durationInFrames: 150, pauseFrames: 60 };
    expect(activeWordIndex(text, spokenFrames(s) - 1, spokenFrames(s))).toBe(3);
    expect(spokenFrames({ durationInFrames: 30 })).toBe(30);
    expect(spokenFrames({ durationInFrames: 30, pauseFrames: 99 })).toBe(1);
  });
});

describe("clipPlan (other footage from the source video)", () => {
  const scene = (extra: object) => ({ durationInFrames: 90, cut: "clip" as const, ...extra });

  it("only applies to scenes cut to a clip", () => {
    expect(clipPlan({ durationInFrames: 90, cut: "video" }, 60)).toBeNull();
    expect(clipPlan({ durationInFrames: 90, cut: "graphic" }, 60)).toBeNull();
    expect(clipPlan({ durationInFrames: 90 }, 60)).toBeNull();
  });

  it("starts at the chosen second and lasts as long as the scene", () => {
    expect(clipPlan(scene({ clipFrom: 12.5 }), 60)).toEqual({ startFrame: 375, lengthFrames: 90 });
  });

  it("limits a clip to 4 s so the pace stays quick", () => {
    expect(MAX_CLIP_FRAMES).toBe(120);
    expect(clipPlan(scene({ durationInFrames: 300, clipFrom: 1 }), 60)?.lengthFrames).toBe(120);
  });

  it("keeps the whole clip inside the video, never before 0, and survives bad values", () => {
    // 12 s source, 3 s clip: the latest start is 9 s.
    expect(clipPlan(scene({ clipFrom: 11.5 }), 12)).toEqual({ startFrame: 270, lengthFrames: 90 });
    expect(clipPlan(scene({ clipFrom: -4 }), 12)?.startFrame).toBe(0);
    expect(clipPlan(scene({ clipFrom: NaN }), 12)?.startFrame).toBe(0);
    expect(clipPlan(scene({}), 12)?.startFrame).toBe(0);
    // A source shorter than the clip starts at 0 rather than at a negative frame.
    expect(clipPlan(scene({ clipFrom: 5 }), 2)?.startFrame).toBe(0);
  });

  it("without a known source length trusts the chosen start", () => {
    expect(clipPlan(scene({ clipFrom: 40 }), undefined)?.startFrame).toBe(1200);
  });
});

import { fitScenesToVideo } from "./script";

describe("scenes cut to the source video", () => {
  const scenes = [{ text: "a", durationInFrames: 100 }, { text: "b", durationInFrames: 100 }, { text: "c", durationInFrames: 100 }];
  it("keeps everything when the video is long enough", () => {
    expect(fitScenesToVideo(scenes, 300)).toEqual(scenes);
    expect(fitScenesToVideo(scenes, 1000)).toEqual(scenes);
  });
  it("shortens the scene the video ends in and drops the ones after it, so the picture never freezes", () => {
    const fitted = fitScenesToVideo(scenes, 250);
    expect(fitted.map(s => s.durationInFrames)).toEqual([100, 100, 50]);
    expect(fitScenesToVideo(scenes, 150).map(s => [s.text, s.durationInFrames])).toEqual([["a", 100], ["b", 50]]);
    expect(fitScenesToVideo(scenes, 100).map(s => s.text)).toEqual(["a"]);
  });
  it("does not change the scenes it was given, and ignores a length it cannot use", () => {
    fitScenesToVideo(scenes, 150);
    expect(scenes[1].durationInFrames).toBe(100);
    expect(fitScenesToVideo(scenes, NaN)).toBe(scenes);
    expect(fitScenesToVideo(scenes, 0)).toBe(scenes);
  });
});

describe("no limit on the number of scenes", () => {
  it("accepts a long script as many scenes, bounded only by the total length", () => {
    const text = Array.from({ length: 90 }, (_, i) => `Kalimat nomor ${i} di sini.`).join("\n");
    const t = buildTimeline(text, { kind: "target", seconds: 170 });
    expect(t.ok).toBe(true);
    if (t.ok) { expect(t.scenes).toHaveLength(90); expect(t.totalFrames).toBe(170 * FPS); }
    const auto = buildTimeline(Array.from({ length: 21 }, (_, i) => `Kalimat nomor ${i} di sini.`).join("\n"), { kind: "auto" });
    expect(auto.ok).toBe(true);
  });
  it("still refuses when the scenes cannot fit in the time", () => {
    const t = buildTimeline(Array.from({ length: 200 }, (_, i) => `Kalimat nomor ${i} di sini.`).join("\n"), { kind: "target", seconds: 100 });
    expect(t.ok).toBe(false);
  });
});

describe("exact scene durations (timing taken from a transcript)", () => {
  const text = "Satu dua tiga.\nEmpat lima enam tujuh delapan.\nSembilan sepuluh sebelas.\nDua belas tiga belas.";
  const seconds = [0.3, 5, 0.5, 2.2];
  it("uses each duration as it is, so no later scene is pushed late", () => {
    const t = buildTimeline(text, { kind: "scenes", seconds, exact: true });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.scenes.map(s => s.durationInFrames)).toEqual([9, 150, 15, 66]);
    expect(t.totalFrames).toBe(240);
  });
  it("still stretches short scenes by default (speech made per scene is padded to the minimum)", () => {
    const t = buildTimeline(text, { kind: "scenes", seconds });
    expect(t.ok && t.scenes.map(s => s.durationInFrames)).toEqual([36, 150, 36, 66]);
  });
  it("gives a scene at least one frame", () => {
    const t = buildTimeline("Satu dua tiga.\nEmpat lima enam.", { kind: "scenes", seconds: [0.001, 1], exact: true });
    expect(t.ok && t.scenes[0].durationInFrames).toBe(1);
  });
});
