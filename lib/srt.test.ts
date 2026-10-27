import { describe, expect, it } from "vitest";
import { sceneCues, scenesToSrt } from "./srt";
import { activeWordIndex, phraseLine, type Scene } from "./script";

const scene = (text: string, durationInFrames: number, extra: Partial<Scene> = {}): Scene => ({ text, durationInFrames, ...extra });

describe("sceneCues", () => {
  it("creates one cue per caption phrase and keeps cues ordered, non-overlapping and inside the video", () => {
    const scenes = [scene("Mulai dari langkah kecil yang jelas, lalu ulangi setiap hari.", 150), scene("Itu saja.", 60)];
    const cues = sceneCues(scenes);
    expect(cues.map(c => c.text).join(" ")).toBe("Mulai dari langkah kecil yang jelas, lalu ulangi setiap hari. Itu saja.");
    for (let i = 0; i < cues.length; i++) {
      expect(cues[i].end).toBeGreaterThan(cues[i].start);
      if (i) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end - 1e-9);
    }
    expect(cues.at(-1)!.end).toBeLessThanOrEqual(210 / 30 + 1e-9);
  });

  it("shows each phrase exactly when the on-screen caption switches to it (estimated timing)", () => {
    const s = scene("Satu dua tiga empat lima enam tujuh delapan.", 120);
    const cues = sceneCues([s]);
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) {
      const f = Math.round(cue.start * 30) + 1;
      expect(phraseLine(s.text, activeWordIndex(s.text, f, 120)).words.join(" ")).toBe(cue.text);
    }
  });

  it("follows transcript word timing and offsets by earlier scenes", () => {
    const words = 4;
    const second = scene("Kata satu dua tiga.", 90, { wordStarts: [6, 20, 34, 48], wordEnds: [18, 32, 46, 60] });
    expect(second.wordStarts).toHaveLength(words);
    const cues = sceneCues([scene("Pembuka.", 60), second]);
    expect(cues[1].start).toBeCloseTo((60 + 6) / 30, 5);
  });

  it("ignores *emphasis* marks and extra spaces", () => {
    expect(sceneCues([scene("Ini  *penting*  sekali", 90)])[0].text).toBe("Ini penting sekali");
  });
});

describe("scenesToSrt", () => {
  it("writes numbered blocks with HH:MM:SS,mmm times", () => {
    const srt = scenesToSrt([scene("Halo dunia.", 60)]);
    expect(srt).toMatch(/^1\n00:00:00,\d{3} --> 00:00:\d{2},\d{3}\nHalo dunia\.\n$/);
  });
});

describe("pauses", () => {
  it("ends the last cue before the pause and keeps the next scene's cues in place", () => {
    const first = scene("Halo dunia semua.", 150, { pauseFrames: 60 });
    const cues = sceneCues([first, scene("Lalu lanjut.", 60)]);
    expect(cues[0].end).toBeLessThanOrEqual((150 - 60) / 30 + 1e-9);
    expect(cues.at(-1)!.start).toBeGreaterThanOrEqual(150 / 30 - 1e-9);
  });
});
