import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ASPECTS, FITS, QUALITIES, MAX_BYTES, exportFileName, explainError, ffmpegArgs, formatTime, logTime, outputSize,
  parseTime, parseYouTube, validateFile, validateRange, videoFilter, OUTPUT_NAME,
} from "./clip";

describe("parseTime", () => {
  it("accepts hh:mm:ss, mm:ss, seconds and decimals", () => {
    expect(parseTime("00:01:05")).toBe(65);
    expect(parseTime("1:05")).toBe(65);
    expect(parseTime("90")).toBe(90);
    expect(parseTime("00:00:02.5")).toBe(2.5);
    expect(parseTime(" 1:02,5 ")).toBe(62.5);
  });
  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "1:2:3:4", "00:61:00", "00:00:60", "-5", "1.5:00", "1::2"]) expect(parseTime(bad), bad).toBeNaN();
  });
});

describe("formatTime", () => {
  it("round-trips with parseTime", () => {
    for (const t of [0, 5, 65, 3599, 3600, 2.5, 61.3]) expect(parseTime(formatTime(t))).toBeCloseTo(t, 1);
  });
  it("handles junk", () => { expect(formatTime(NaN)).toBe("00:00:00"); expect(formatTime(-3)).toBe("00:00:00"); });
});

describe("validateFile", () => {
  it("accepts videos, including iOS files with an empty MIME type", () => {
    expect(validateFile({ name: "a.mp4", type: "video/mp4", size: 10 }).ok).toBe(true);
    expect(validateFile({ name: "IMG_0001.MOV", type: "", size: 10 }).ok).toBe(true);
  });
  it("rejects non-video, empty and oversized files", () => {
    expect(validateFile({ name: "a.pdf", type: "application/pdf", size: 10 }).ok).toBe(false);
    expect(validateFile({ name: "a.mp4", type: "video/mp4", size: 0 }).ok).toBe(false);
    const big = validateFile({ name: "a.mp4", type: "video/mp4", size: MAX_BYTES + 1 });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toMatch(/1 GB/);
  });
});

describe("validateRange", () => {
  it("returns the clip duration for a valid range", () => {
    expect(validateRange("00:00:10", "00:00:40", 120)).toEqual({ ok: true, start: 10, end: 40, duration: 30 });
  });
  it("clamps a tiny overshoot at the end of the source", () => {
    const r = validateRange("0", "10.04", 10);
    expect(r.ok && r.duration).toBeCloseTo(10);
  });
  it.each([
    ["00:00:40", "00:00:10", 120, /setelah/],
    ["00:00:10", "00:00:10", 120, /setelah/],
    ["00:03:00", "00:03:10", 120, /mulai melewati/],
    ["00:00:10", "00:03:00", 120, /selesai melewati/],
    ["x", "00:00:10", 120, /mulai tidak valid/],
    ["0", "y", 120, /selesai tidak valid/],
    ["0", "0.2", 120, /terlalu pendek/],
    ["0", "00:06:00", 3000, /terlalu panjang/],
    ["0", "10", 0, /belum terbaca/],
    ["0", "10", 4000, /60 menit/],
  ])("rejects %s → %s (source %ss)", (a, b, d, msg) => {
    const r = validateRange(a, b, d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe("outputSize", () => {
  it("maps aspect × quality to even pixel sizes", () => {
    expect(outputSize("9:16", "1080")).toEqual({ width: 1080, height: 1920 });
    expect(outputSize("16:9", "720")).toEqual({ width: 1280, height: 720 });
    expect(outputSize("1:1", "480")).toEqual({ width: 480, height: 480 });
    expect(outputSize("16:9", "480")).toEqual({ width: 854, height: 480 });
    for (const a of ASPECTS) for (const q of QUALITIES) {
      const s = outputSize(a.id, q.id);
      expect(s.width % 2 + s.height % 2).toBe(0);
    }
  });
});

describe("ffmpegArgs", () => {
  it("seeks before input, limits duration and produces web-safe MP4 settings", () => {
    const args = ffmpegArgs("/input/a.mov", { start: 12.3456, duration: 30 }, "9:16", "720", "pad");
    expect(args.slice(0, 6)).toEqual(["-ss", "12.346", "-i", "/input/a.mov", "-t", "30.000"]);
    expect(args).toEqual(expect.arrayContaining(["libx264", "yuv420p", "aac", "+faststart", "0:a:0?"]));
    expect(args.at(-1)).toBe(OUTPUT_NAME);
    expect(args[args.indexOf("-vf") + 1]).toBe(videoFilter("9:16", "720", "pad"));
  });
});

describe("logTime / explainError / exportFileName / parseYouTube", () => {
  it("parses FFmpeg progress lines", () => {
    expect(logTime("frame=  50 fps=10 q=28.0 size=256kB time=00:00:01.66 bitrate=")).toBeCloseTo(1.66);
    expect(logTime("Input #0, mov")).toBeNaN();
  });
  it("explains common failures", () => {
    expect(explainError("RangeError: Array buffer allocation failed")).toMatch(/Memori/);
    expect(explainError("moov atom not found")).toMatch(/codec/);
    expect(explainError("weird")).toMatch(/Ekspor gagal/);
  });
  it("builds safe file names", () => {
    expect(exportFileName("My Trip (final).MOV", "9:16", "720", 65.7)).toBe("My-Trip-final-9x16-720p-65s.mp4");
    expect(exportFileName("???.mp4", "1:1", "480", 0)).toBe("clip-1x1-480p-0s.mp4");
  });
  it("parses YouTube links for preview only", () => {
    expect(parseYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=43")).toEqual({ id: "dQw4w9WgXcQ", start: 43 });
    expect(parseYouTube("https://youtu.be/dQw4w9WgXcQ?t=1m5s")).toEqual({ id: "dQw4w9WgXcQ", start: 65 });
    expect(parseYouTube("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ id: "dQw4w9WgXcQ", start: 0 });
    expect(parseYouTube("https://vimeo.com/123")).toBeNull();
    expect(parseYouTube("not a url")).toBeNull();
  });
});

// Runs the exact argument list with a native FFmpeg (same filters/codecs as ffmpeg.wasm) to prove
// the filter graphs produce playable MP4s with the right size and duration.
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
describe.skipIf(!hasFfmpeg)("ffmpegArgs with native FFmpeg", () => {
  const dir = mkdtempSync(join(tmpdir(), "clipper-"));
  const source = join(dir, "source.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=6", "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
  const silent = join(dir, "silent.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", silent]);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function probe(file: string) {
    const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt:format=duration", "-of", "json", file]).toString());
    return { duration: Number(out.format.duration), streams: out.streams as { codec_type: string; codec_name: string; width?: number; height?: number; pix_fmt?: string }[] };
  }

  for (const a of ASPECTS) for (const f of FITS) {
    it(`renders ${a.id} / ${f.id}`, () => {
      const args = ffmpegArgs(source, { start: 1.5, duration: 2 }, a.id, "480", f.id);
      args[args.length - 1] = join(dir, `${a.id.replace(":", "x")}-${f.id}.mp4`);
      execFileSync("ffmpeg", ["-v", "error", ...args]);
      const out = probe(args.at(-1)!);
      const v = out.streams.find(s => s.codec_type === "video")!;
      const s = outputSize(a.id, "480");
      expect([v.codec_name, v.width, v.height, v.pix_fmt]).toEqual(["h264", s.width, s.height, "yuv420p"]);
      expect(out.streams.find(st => st.codec_type === "audio")?.codec_name).toBe("aac");
      expect(out.duration).toBeGreaterThan(1.9);
      expect(out.duration).toBeLessThan(2.2);
    }, 30_000);
  }

  it("handles sources without an audio track", () => {
    const args = ffmpegArgs(silent, { start: 0, duration: 3 }, "16:9", "480", "blur");
    args[args.length - 1] = join(dir, "silent-out.mp4");
    execFileSync("ffmpeg", ["-v", "error", ...args]);
    const out = probe(args.at(-1)!);
    expect(out.streams.map(s => s.codec_type)).toEqual(["video"]);
    expect(statSync(args.at(-1)!).size).toBeGreaterThan(1000);
  }, 30_000);
});
