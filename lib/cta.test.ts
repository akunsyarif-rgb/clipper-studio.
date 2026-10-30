import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ffmpegArgs, outputSize } from "./clip";
import { cleanCtaText, ctaBox, ctaPrompt, ctaTiming, DEFAULT_CTA, detectLanguage, loadCta, normalizeCta, parseCta, resolveCta, saveCta, suggestCta, writeCta } from "./cta";
import { SAFE } from "./layout";

// A fixed-width stand-in for the browser's text measure: 55 px per character at 100 px.
const measure = (t: string) => t.length * 55;

describe("settings", () => {
  it("is on by default and cleans what is stored", () => {
    expect(DEFAULT_CTA).toEqual({ enabled: true, text: "" });
    expect(normalizeCta(null)).toEqual({ enabled: true, text: "" });
    expect(normalizeCta({ enabled: false, text: "  Halo\n\tdunia  " })).toEqual({ enabled: false, text: "Halo dunia" });
    expect(normalizeCta({ enabled: "no", text: 5 })).toEqual({ enabled: true, text: "" });
    expect(cleanCtaText("x".repeat(100)).length).toBe(60);
    expect(cleanCtaText("a​b\u0000c")).toBe("a b c");
  });
  it("is remembered on the device and survives a blocked store", () => {
    const mem: Record<string, string> = {};
    const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    saveCta({ enabled: false, text: "Follow ya" }, store);
    expect(loadCta(store)).toEqual({ enabled: false, text: "Follow ya" });
    expect(loadCta({ getItem: () => { throw new Error("blocked"); } })).toEqual(DEFAULT_CTA);
    expect(loadCta(null)).toEqual(DEFAULT_CTA);
  });
});

describe("the suggestion from the content", () => {
  it("fits the kind of video, in the language of the video", () => {
    expect(suggestCta({ text: "Ini tips dan cara membuat nasi goreng, langkah pertama siapkan bahan" })).toMatchObject({ kind: "tips", language: "id" });
    expect(suggestCta({ text: "Review produk ini, harganya murah dan kualitasnya bagus, ada diskon" }).kind).toBe("product");
    expect(suggestCta({ text: "Kejadian lucu waktu itu, kami ngakak sampai tiba-tiba semuanya jatuh" }).kind).toBe("story");
    expect(suggestCta({ text: "Tetap sabar dan bersyukur, itu nasihat hidup untuk sukses" }).kind).toBe("inspire");
    expect(suggestCta({ text: "Tahukah kamu, penelitian ini membuktikan fakta menarik tentang sejarah" }).kind).toBe("facts");
    const en = suggestCta({ text: "Here is how to make this, the trick is to follow the steps and learn the guide" });
    expect(en).toMatchObject({ kind: "tips", language: "en" });
    expect(en.text).toMatch(/[Ss]ave/);
  });
  it("always gives a line, even for no content, and the same line for the same content", () => {
    const none = suggestCta({});
    expect(none.kind).toBe("general");
    expect(none.text.length).toBeGreaterThan(5);
    expect(suggestCta({ text: "ngobrol biasa saja" })).toEqual(suggestCta({ text: "ngobrol biasa saja" }));
    for (const t of ["", "a", "xyz 123", "😀😀", "x".repeat(5000)]) expect(cleanCtaText(suggestCta({ text: t }).text).length).toBeGreaterThan(0);
  });
  it("detects Indonesian unless the text is clearly English", () => {
    expect(detectLanguage("aku tidak tahu kenapa ini bisa terjadi")).toBe("id");
    expect(detectLanguage("this is what you can do for the best of it and we will")).toBe("en");
    expect(detectLanguage("")).toBe("id");
  });
  it("uses the creator's own line first, and nothing when switched off", () => {
    expect(resolveCta({ enabled: true, text: "Beli sekarang" }, { text: "tips cara" })).toBe("Beli sekarang");
    expect(resolveCta({ enabled: true, text: "" }, { text: "tips cara langkah" })).toMatch(/Simpan|Coba/);
    expect(resolveCta({ enabled: false, text: "Beli" }, { text: "x" })).toBeNull();
  });
});

describe("timing and layout", () => {
  it("covers the last quarter (2 to 4 s) and is left out of a very short clip", () => {
    expect(ctaTiming(2.9)).toBeNull();
    expect(ctaTiming(Number.NaN)).toBeNull();
    expect(ctaTiming(4)).toEqual({ seconds: 2, start: 2, fade: 0.4 });
    expect(ctaTiming(20)).toEqual({ seconds: 4, start: 16, fade: 0.4 });
    expect(ctaTiming(30)!.seconds).toBe(4);
    expect(ctaTiming(30)!.start).toBeCloseTo(26, 3);
  });
  it("sits centred above the platform's description area in 9:16, inside the frame, in at most two lines", () => {
    const frame = { width: 1080, height: 1920 };
    for (const text of ["Follow ya", "Simpan video ini biar nggak lupa", "x".repeat(60), "Ayo ".repeat(14).trim()]) {
      const b = ctaBox(text, frame, measure);
      expect(b.lines.length).toBeLessThanOrEqual(2);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(frame.width);
      expect(Math.abs(b.x + b.width / 2 - frame.width / 2)).toBeLessThanOrEqual(1);
      expect(b.y + b.height).toBeLessThanOrEqual(frame.height - SAFE.bottom);
      expect(b.y).toBeGreaterThan(frame.height / 2);
      expect(b.width).toBeLessThanOrEqual(frame.width * 0.9);
    }
  });
  it("scales with the frame, stays clear of a bottom watermark, and works for wide and square frames", () => {
    const small = ctaBox("Follow ya", { width: 540, height: 960 }, measure), big = ctaBox("Follow ya", { width: 1080, height: 1920 }, measure);
    expect(big.fontSize).toBeCloseTo(small.fontSize * 2, 0);
    const clear = ctaBox("Follow ya", { width: 1080, height: 1920 }, measure, 700);
    expect(clear.y + clear.height).toBeLessThanOrEqual(1920 - 700);
    for (const f of [{ width: 1280, height: 720 }, { width: 720, height: 720 }]) {
      const b = ctaBox("Follow untuk konten seru lainnya", f, measure);
      expect(b.y + b.height).toBeLessThanOrEqual(f.height * 0.93);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(f.width);
    }
  });
});

describe("the AI's version", () => {
  const reply = (cta: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ cta }) }] } }] });
  it("asks for one short, grounded line from the clip's own text", () => {
    const p = ctaPrompt("Cara membuat nasi goreng enak", "id");
    expect(p).toMatch(/maksimal 8 kata/);
    expect(p).toMatch(/jangan menjanjikan/i);
    expect(p).toContain("Cara membuat nasi goreng enak");
  });
  it("cleans what comes back (quotes, hashtags, emoji) and refuses an empty answer", () => {
    expect(parseCta(reply('"Simpan resep ini sekarang" #resep 🔥'))).toBe("Simpan resep ini sekarang");
    expect(() => parseCta(reply("   "))).toThrow(/ajakan/);
    expect(parseCta(reply("x".repeat(100))).length).toBeLessThanOrEqual(60);
  });
  it("sends only the text, and refuses to call without any", async () => {
    let body = "";
    const fetchImpl = (async (_u: string, init: RequestInit) => { body = String(init.body); return new Response(JSON.stringify(reply("Follow untuk resep lainnya")), { status: 200 }); }) as unknown as typeof fetch;
    expect(await writeCta("Resep nasi goreng", { apiKey: "k", model: "m", language: "id", fetchImpl })).toBe("Follow untuk resep lainnya");
    expect(body).toContain("Resep nasi goreng");
    await expect(writeCta("   ", { apiKey: "k", model: "m", language: "id", fetchImpl })).rejects.toThrow();
  });
});

// The picture really appears only at the end of the file: a plain blue clip, a red label laid over it, pixels read from the output.
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
describe.skipIf(!hasFfmpeg)("ffmpegArgs with a closing CTA, native FFmpeg", () => {
  const dir = mkdtempSync(join(tmpdir(), "cta-"));
  const source = join(dir, "blue.mp4"), audio = join(dir, "voice.m4a"), label = join(dir, "cta.png"), mark = join(dir, "wm.png");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0x0000ff:s=640x360:r=25:d=8", "-f", "lavfi", "-i", "sine=frequency=440:duration=8", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=8", "-c:a", "aac", audio]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0xff0000:s=200x80", "-frames:v", "1", label]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0x00ff00:s=60x30", "-frames:v", "1", mark]);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** The RGB of one pixel of the output at time t. */
  function pixel(file: string, t: number, x: number, y: number, w: number, h: number): [number, number, number] {
    const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 * 1024 * 1024 });
    expect(raw.length).toBe(w * h * 3);
    const i = (y * w + x) * 3;
    return [raw[i], raw[i + 1], raw[i + 2]];
  }
  /** Runs the arguments the way the app does (output named by OUTPUT_NAME, here in the work folder) and keeps the file under `name`. */
  function run(args: string[], name: string): string {
    execFileSync("ffmpeg", ["-v", "error", ...args], { cwd: dir });
    const out = join(dir, name);
    renameSync(join(dir, "clipper-export.mp4"), out);
    return out;
  }
  const isRed = ([r, g, b]: number[]) => r > 200 && g < 60 && b < 60;
  const isBlue = ([r, g, b]: number[]) => r < 60 && g < 60 && b > 200;
  const isGreen = ([r, g, b]: number[]) => r < 60 && g > 200 && b < 60;

  it("is invisible at first, fades in, and fills the end of a video clip", () => {
    const { width: w, height: h } = outputSize("9:16", "480");
    const cta = { file: label, x: 100, y: 500, start: 3, fade: 0.4 };
    const out = run(ffmpegArgs(source, { start: 1, duration: 5 }, "9:16", "480", "crop", null, false, cta), "video.mp4");
    const at = (t: number) => pixel(out, t, 150, 530, w, h);
    expect(isBlue(at(0.5))).toBe(true);
    expect(isBlue(at(2.5))).toBe(true);
    const mid = at(3.2);
    expect(mid[0]).toBeGreaterThan(20); expect(mid[0]).toBeLessThan(235); // halfway through the fade
    expect(isRed(at(4.7))).toBe(true);
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", out]).toString());
    expect(Number(info.format.duration)).toBeGreaterThan(4.8); expect(Number(info.format.duration)).toBeLessThan(5.2); // the looped picture does not stretch the clip
    expect(info.streams.map((s: { codec_type: string }) => s.codec_type).sort()).toEqual(["audio", "video"]);
    // Outside the label the picture is untouched.
    expect(isBlue(pixel(out, 4.7, 20, 20, w, h))).toBe(true);
  });

  it("works together with a watermark, and for an audio-only source", () => {
    const { width: w, height: h } = outputSize("16:9", "480");
    const cta = { file: label, x: 100, y: 200, start: 2, fade: 0.2 }, wm = { file: mark, x: 10, y: 10 };
    const out = run(ffmpegArgs(source, { start: 0, duration: 4 }, "16:9", "480", "pad", wm, false, cta), "both.mp4");
    expect(isGreen(pixel(out, 0.5, 20, 20, w, h))).toBe(true);
    expect(isGreen(pixel(out, 3.5, 20, 20, w, h))).toBe(true); // the watermark stays for the whole clip
    expect(isBlue(pixel(out, 0.5, 150, 230, w, h)) || !isRed(pixel(out, 0.5, 150, 230, w, h))).toBe(true);
    expect(isRed(pixel(out, 3.5, 150, 230, w, h))).toBe(true);

    const { width: aw, height: ah } = outputSize("9:16", "480");
    const aout = run(ffmpegArgs(audio, { start: 0, duration: 4 }, "9:16", "480", "pad", null, true, { file: label, x: 100, y: 500, start: 2, fade: 0.2 }), "audio.mp4");
    expect(isRed(pixel(aout, 0.5, 150, 530, aw, ah))).toBe(false);
    expect(isRed(pixel(aout, 3.5, 150, 530, aw, ah))).toBe(true);
    const aInfo = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", aout]).toString());
    expect(aInfo.streams.map((s: { codec_type: string }) => s.codec_type).sort()).toEqual(["audio", "video"]);
  });

  it("leaves the arguments without a CTA exactly as before", () => {
    const base = ffmpegArgs("/input/a.mp4", { start: 1, duration: 5 }, "9:16", "480", "pad");
    expect(ffmpegArgs("/input/a.mp4", { start: 1, duration: 5 }, "9:16", "480", "pad", null, false, null)).toEqual(base);
    expect(base).not.toContain("-loop");
  });
});
