// End-to-end check of /motion: production server + Chromium + @remotion/web-renderer.
// Needs `npm run build` first, plus ffmpeg/ffprobe on PATH to create the narration fixture and verify the MP4.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Uses whatever Playwright is resolvable (global install or devDependency).
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = Number(process.env.E2E_PORT || 3211);
const BASE = `http://localhost:${PORT}/motion`;
const dir = mkdtempSync(join(tmpdir(), "motion-e2e-"));
const narration = join(dir, "narasi.wav");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=6", "-ac", "1", "-ar", "44100", narration]);
const tooLong = join(dir, "panjang.mp3");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "200", "-b:a", "32k", tooLong]);
// Fake microphone input: speech-like tone bursts. Chromium loops this file as the mic.
const micFile = join(dir, "mic.wav");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=240:duration=8", "-af", "volume='if(lt(mod(t,1.2),0.8),1,0)':eval=frame", "-ac", "1", "-ar", "48000", micFile]);
// A short music loop (shorter than the video, so it must loop).
const musicFile = join(dir, "musik.wav");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=520:duration=3", "-ac", "2", "-ar", "44100", musicFile]);
const notAudio = join(dir, "catatan.txt");
writeFileSync(notAudio, "bukan audio");

function probe(file) {
  const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration", "-of", "json", file]).toString());
  const v = out.streams.find(s => s.codec_type === "video");
  const a = out.streams.find(s => s.codec_type === "audio");
  return { duration: Number(out.format.duration), width: v?.width, height: v?.height, fps: v?.r_frame_rate, video: v?.codec_name, audio: a?.codec_name ?? null };
}
function segmentVolume(file, from, to) {
  const log = spawnSync("ffmpeg", ["-v", "info", "-ss", String(from), "-to", String(to), "-i", file, "-af", "volumedetect", "-f", "null", "-"]).stderr.toString();
  return Number(/mean_volume: (-?[\d.]+) dB/.exec(log)?.[1] ?? NaN);
}
function volumeLog(file) {
  // volumedetect reports on stderr.
  const log = spawnSync("ffmpeg", ["-v", "info", "-i", file, "-af", "volumedetect", "-f", "null", "-"]).stderr.toString();
  return Number(/mean_volume: (-?[\d.]+) dB/.exec(log)?.[1] ?? NaN);
}

// Own process group so the whole tree (npx → next-server) is stopped afterwards.
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
const results = [];
let failed = false;
async function step(name, fn) {
  const t = Date.now();
  try { const info = await fn(); results.push(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${info ? " — " + info : ""}`); }
  catch (err) { failed = true; results.push(`FAIL ${name}: ${err instanceof Error ? err.message : err}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

try {
  if (await fetch(BASE).then(() => true, () => false)) throw new Error(`Port ${PORT} is already in use; stop the old server first.`);
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${micFile}`] });
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  const pageErrors = [];
  let telemetryBlocked = false;
  page.on("pageerror", e => pageErrors.push(e.message));
  // @remotion/web-renderer reports license usage to remotion.pro without catching network errors.
  // Where that host is unreachable (sandbox, ad blockers) this surfaces as "Failed to fetch"; it does not affect the render.
  page.on("requestfailed", r => { if (r.url().startsWith("https://www.remotion.pro/")) telemetryBlocked = true; });
  await page.goto(BASE);

  async function renderAndCheck(label, expectAudio, expectedSeconds) {
    await page.getByTestId("render").click();
    await page.getByTestId("result").waitFor({ timeout: 300000 });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
    const out = join(dir, label + ".mp4");
    await download.saveAs(out);
    // Captions are on by default, so a subtitle file must come with the MP4 and match its length.
    const [srtDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-srt").click()]);
    const srtPath = join(dir, label + ".srt");
    await srtDownload.saveAs(srtPath);
    const srt = readFileSync(srtPath, "utf8");
    assert(/^1\n\d\d:\d\d:\d\d,\d{3} --> /.test(srt), `srt header: ${srt.slice(0, 40)}`);
    const lastEnd = [...srt.matchAll(/--> (\d\d):(\d\d):(\d\d),(\d{3})/g)].map(m => +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000).at(-1);
    assert(lastEnd > 0 && lastEnd <= expectedSeconds + 0.2, `srt ends at ${lastEnd}s, video is ${expectedSeconds}s`);
    const p = probe(out);
    assert(p.video === "h264" && p.width === 1080 && p.height === 1920, `video ${p.video} ${p.width}x${p.height}`);
    assert(p.fps === "30/1", `fps ${p.fps}`);
    assert(Math.abs(p.duration - expectedSeconds) < 0.2, `duration ${p.duration}, expected ${expectedSeconds}`);
    if (expectAudio) {
      assert(p.audio === "aac", `audio ${p.audio}`);
      const vol = volumeLog(out);
      assert(vol > -40, `narration should be audible, mean volume ${vol} dB`);
      return `${download.suggestedFilename()} 1080x1920 30fps ${p.duration.toFixed(2)}s h264/aac, mean ${vol} dB`;
    }
    assert(p.audio === null, `expected no audio stream, got ${p.audio}`);
    return `${download.suggestedFilename()} 1080x1920 30fps ${p.duration.toFixed(2)}s h264, no audio track`;
  }

  await step("empty script blocks rendering", async () => {
    await page.getByTestId("script").fill("   ");
    await page.getByTestId("blocker").filter({ hasText: "kosong" }).waitFor({ timeout: 3000 });
    assert(await page.getByTestId("render").isDisabled(), "render button must be disabled");
  });

  await step("automatic voice over is the default and must be generated before rendering", async () => {
    await page.getByTestId("script").fill("Halo semua.\nIni video uji dengan narasi.\nDurasi mengikuti audio.");
    await page.getByTestId("ai-voice").waitFor({ timeout: 3000 });
    await page.getByTestId("blocker").filter({ hasText: "Buat suara otomatis" }).waitFor({ timeout: 3000 });
    assert(await page.getByTestId("render").isDisabled(), "render disabled until the voice exists");
  });

  await step("rejects a non-audio file", async () => {
    await page.getByTestId("voice-manual").click();
    await page.getByTestId("audio-input").setInputFiles(notAudio);
    await page.getByText("Pilih berkas audio").waitFor({ timeout: 3000 });
  });

  await step("rejects narration longer than the limit", async () => {
    await page.getByTestId("audio-input").setInputFiles(tooLong);
    await page.getByTestId("blocker").filter({ hasText: "melebihi batas" }).waitFor({ timeout: 10000 });
    assert(await page.getByTestId("render").isDisabled(), "render button must be disabled");
    await page.getByTestId("audio-remove").click();
  });

  await step("narration drives scene timing and preview", async () => {
    await page.getByTestId("audio-input").setInputFiles(narration);
    await page.getByText("6.0 dtk · durasi video mengikuti narasi").waitFor({ timeout: 10000 });
    assert(await page.getByTestId("duration").isDisabled(), "duration follows audio");
    const rows = await page.getByTestId("scenes").locator(".scene-row").count();
    assert(rows === 3, `expected 3 scenes, got ${rows}`);
    const last = await page.getByTestId("scenes").locator(".scene-row").last().innerText();
    assert(last.includes("6.0s"), `timeline should end at 6.0s: ${last}`);
    await page.locator(".player-wrap").hover();
    await page.locator(".player-wrap button").first().click(); // play
    await page.waitForTimeout(1500);
    return "3 scenes over 6.0 s, player plays";
  });

  await step("cancels a running render", async () => {
    await page.getByTestId("render").click();
    await page.getByTestId("progress").waitFor({ timeout: 10000 });
    await page.getByTestId("cancel").click();
    await page.getByTestId("status").filter({ hasText: "dibatalkan" }).waitFor({ timeout: 20000 });
    assert(!(await page.getByTestId("result").isVisible()), "no result after cancel");
  });

  await step("renders MP4 with narration", () => renderAndCheck("narrated", true, 6));

  await step("renders MP4 without audio at a fixed duration", async () => {
    await page.getByTestId("audio-remove").click();
    await page.getByTestId("script").fill("Tanpa audio tetap bisa.\nDurasi lima belas detik.");
    await page.getByTestId("style").selectOption("popup");
    await page.getByTestId("palette").selectOption("pearl");
    await page.getByTestId("duration").selectOption("15");
    return renderAndCheck("silent", false, 15);
  });

  async function failingEncoderPage(failWhen) {
    // Simulates a browser whose H.264 encoder rejects some configurations (as reported on iPad Safari).
    const p = await browser.newPage({ acceptDownloads: true });
    await p.addInitScript(mode => {
      const configure = VideoEncoder.prototype.configure;
      VideoEncoder.prototype.configure = function (config) {
        if (mode === "all" || config.hardwareAcceleration === "no-preference") throw new DOMException("Simulated encoder failure", "NotSupportedError");
        return configure.call(this, config);
      };
    }, failWhen);
    await p.goto(BASE);
    await p.getByTestId("voice-none").click();
    await p.getByTestId("script").fill("Uji fallback encoder.\nSelesai.");
    await p.getByTestId("style").selectOption("cinematic");
    await p.getByTestId("palette").selectOption("pearl");
    return p;
  }

  await step("falls back to another encoder setting when the first attempt fails", async () => {
    const p = await failingEncoderPage("default-only");
    await p.getByTestId("render").click();
    await p.getByTestId("result").waitFor({ timeout: 300000 });
    const [download] = await Promise.all([p.waitForEvent("download"), p.getByTestId("download").click()]);
    const out = join(dir, "fallback.mp4");
    await download.saveAs(out);
    const info = probe(out);
    assert(info.video === "h264" && info.width === 1080 && info.height === 1920, `video ${info.video} ${info.width}x${info.height}`);
    await p.close();
    return `${info.duration.toFixed(2)}s h264 after retry`;
  });

  await step("shows copyable diagnostics when every attempt fails", async () => {
    const p = await failingEncoderPage("all");
    await p.getByTestId("render").click();
    await p.getByTestId("render-error").waitFor({ timeout: 120000 });
    const detail = await p.getByTestId("error-detail").textContent();
    for (const needle of ["[default]", "[software]", "Simulated encoder failure", "UA:", "avc1.640028", "Gaya: cinematic"]) assert(detail.includes(needle), `detail missing ${needle}`);
    assert(await p.getByTestId("error-detail").isVisible(), "details should be open");
    await p.close();
  });

  await step("renders in a browser without native Symbol.dispose (Safari)", async () => {
    // Safari 27 has no Symbol.dispose; conflicting library polyfills used to make every render fail
    // with "Object not disposable". Hide the native symbols to reproduce that environment.
    const p = await browser.newPage({ acceptDownloads: true });
    await p.addInitScript(() => {
      const S = Symbol;
      function FakeSymbol(d) { return S(d); }
      for (const k of Object.getOwnPropertyNames(S)) {
        if (["dispose", "asyncDispose", "length", "name", "prototype"].includes(k)) continue;
        Object.defineProperty(FakeSymbol, k, Object.getOwnPropertyDescriptor(S, k));
      }
      FakeSymbol.prototype = S.prototype;
      globalThis.Symbol = FakeSymbol;
    });
    await p.goto(BASE);
    const key = await p.evaluate(() => Symbol.dispose === Symbol.for("Symbol.dispose"));
    assert(key, "page polyfill should define Symbol.dispose as Symbol.for('Symbol.dispose')");
    await p.getByTestId("voice-none").click();
    await p.getByTestId("script").fill("Uji tanpa Symbol.dispose.\nSelesai.");
    await p.getByTestId("style").selectOption("cinematic");
    await p.getByTestId("palette").selectOption("pearl");
    await p.getByTestId("render").click();
    const outcome = await Promise.race([
      p.getByTestId("result").waitFor({ timeout: 300000 }).then(() => "ok"),
      p.getByTestId("render-error").waitFor({ timeout: 300000 }).then(async () => await p.getByTestId("error-detail").textContent()),
    ]);
    assert(outcome === "ok", `render failed: ${outcome.split("\n")[0]}`);
    const [download] = await Promise.all([p.waitForEvent("download"), p.getByTestId("download").click()]);
    const out = join(dir, "no-dispose.mp4");
    await download.saveAs(out);
    const info = probe(out);
    assert(info.video === "h264" && info.width === 1080 && info.height === 1920, `video ${info.video} ${info.width}x${info.height}`);
    await p.close();
    return `${info.duration.toFixed(2)}s h264 1080x1920`;
  });

  await step("records narration from the microphone and uses it as the timeline", async () => {
    await page.getByTestId("script").fill("Rekaman langsung dari mikrofon.\nDurasi mengikuti suara.");
    await page.getByTestId("record-start").click();
    await page.getByTestId("recording").waitFor({ timeout: 10000 });
    await page.waitForTimeout(4200);
    await page.getByTestId("record-stop").click();
    await page.getByText("Rekaman mikrofon").waitFor({ timeout: 20000 });
    const label = await page.getByTestId("duration").inputValue();
    assert(label === "audio", `duration should follow the recording, got ${label}`);
    const text = await page.locator("#motion-duration option").first().textContent();
    const secs = Number(/\(([\d.]+) dtk\)/.exec(text)?.[1]);
    assert(secs > 3.5 && secs < 5.5, `recorded length ${secs}s`);
    return `recorded ${secs}s`;
  });

  await step("renders narration + automatic backsound", async () => {
    await page.getByTestId("music-auto").click();
    await page.getByTestId("music-status").filter({ hasText: "siap" }).waitFor({ timeout: 60000 });
    const status = await page.getByTestId("music-status").textContent();
    const expected = Number(/Backsound ([\d.]+) dtk/.exec(status)?.[1]);
    const info = await renderAndCheck("narration-auto-music", true, expected);
    return `${info}`;
  });

  await step("renders with an uploaded music track that loops under no narration", async () => {
    await page.getByTestId("audio-remove").click();
    await page.getByTestId("script").fill("Musik unggahan diulang.\nSampai video selesai.");
    await page.getByTestId("duration").selectOption("15");
    await page.getByTestId("music-input").setInputFiles(musicFile);
    await page.getByText("diulang (loop) sampai video selesai").waitFor({ timeout: 10000 });
    await page.getByTestId("render").click();
    await page.getByTestId("result").waitFor({ timeout: 300000 });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
    const out = join(dir, "uploaded-music.mp4");
    await download.saveAs(out);
    const p = probe(out);
    assert(p.audio === "aac" && Math.abs(p.duration - 15) < 0.2, `audio ${p.audio}, duration ${p.duration}`);
    // The 3 s track must still be audible near the end (looped), and silent at the very end (fade-out).
    const late = segmentVolume(out, 11, 12.5);
    assert(late > -45, `music should loop to the end, level at 11–12.5 s is ${late} dB`);
    return `15.00s aac, loop level ${late} dB at 11–12.5 s`;
  });

  await step("can switch backsound off again", async () => {
    await page.getByTestId("music-none").click();
    assert(!(await page.getByTestId("music-volume").isVisible()), "volume control hidden without backsound");
  });

  async function generateVoice(lang, voice) {
    await page.getByTestId("voice-ai").click();
    await page.getByTestId("tts-lang").selectOption(lang);
    await page.getByTestId("tts-voice").selectOption(String(voice));
    const t0 = Date.now();
    await page.getByTestId("voice-generate").click();
    await page.getByTestId("voice-progress").waitFor({ timeout: 5000 });
    await page.getByTestId("ai-audio").waitFor({ timeout: 300000 });
    return (Date.now() - t0) / 1000;
  }
  function sceneEnds() {
    return page.getByTestId("scenes").locator(".scene-meta b").allTextContents();
  }

  await step("automatic Indonesian voice over sets scene timing and renders with backsound", async () => {
    await page.getByTestId("script").fill("Halo semuanya, selamat datang.\nIni suara otomatis dalam bahasa Indonesia.");
    const secs = await generateVoice("id", 0);
    const ends = await sceneEnds();
    assert(ends.length === 2, `2 scenes, got ${ends.length}`);
    await page.getByTestId("music-auto").click();
    await page.getByTestId("music-status").filter({ hasText: "siap" }).waitFor({ timeout: 60000 });
    const total = Number(/–([\d.]+)s/.exec(ends.at(-1))?.[1]);
    const info = await renderAndCheck("ai-id", true, total);
    return `voice in ${secs.toFixed(1)}s, scenes ${ends.join(" ")}, ${info}`;
  });

  await step("changing the script invalidates the voice; regeneration reuses unchanged sentences", async () => {
    await page.getByTestId("script").fill("Halo semuanya, selamat datang.\nKalimat kedua sekarang berbeda.");
    await page.getByTestId("blocker").filter({ hasText: "berubah" }).waitFor({ timeout: 3000 });
    const t0 = Date.now();
    await page.getByTestId("voice-generate").click();
    await page.getByTestId("ai-audio").waitFor({ timeout: 300000 });
    assert(!(await page.getByTestId("blocker").isVisible()), "blocker cleared after regeneration");
    return `regenerated in ${((Date.now() - t0) / 1000).toFixed(1)}s (first sentence from cache)`;
  });

  await step("automatic English voice over renders", async () => {
    await page.getByTestId("music-none").click();
    await page.getByTestId("script").fill("Don't wait for motivation.\nStart now, even if your steps are small.");
    const secs = await generateVoice("en", 7);
    const ends = await sceneEnds();
    const total = Number(/–([\d.]+)s/.exec(ends.at(-1))?.[1]);
    const info = await renderAndCheck("ai-en", true, total);
    return `voice in ${secs.toFixed(1)}s, ${info}`;
  });

  await step("detects scene visuals and applies manual corrections in preview and render", async () => {
    await page.getByTestId("voice-none").click();
    await page.getByTestId("music-none").click();
    await page.getByTestId("script").fill("Pilih disiplin, bukan sekadar motivasi.\n80% kreator menyerah di bulan pertama.\nFollow untuk tips berikutnya!");
    await page.getByTestId("duration").selectOption("15");
    const autos = await page.locator('[data-testid="scene-template"] option:checked').allTextContents();
    assert(autos.join("|") === "Otomatis · ✗/✓|Otomatis · Angka|Otomatis · Ajakan", `auto templates: ${autos.join("|")}`);
    const player = page.locator(".player-wrap");
    await page.getByTestId("scene-item").nth(0).locator(".scene-row").click();
    await player.locator('[data-visual="compare"]').waitFor({ timeout: 5000 });
    await page.getByTestId("scene-item").nth(1).locator(".scene-row").click();
    await player.locator('[data-visual="number"]').waitFor({ timeout: 5000 });
    // Manual correction: scene 1 becomes "icon + text" with the money icon.
    await page.getByTestId("scene-template").nth(0).selectOption("statement");
    await page.getByTestId("scene-icon").nth(0).selectOption("money");
    await page.getByTestId("scene-item").nth(0).locator(".scene-row").click();
    await player.locator('[data-visual="icon-money"]').waitFor({ timeout: 5000 });
    assert(await player.locator('[data-visual="compare"]').count() === 0, "compare replaced by the override");
    const info = await renderAndCheck("visuals", false, 15);
    return `auto ${autos.length} templates ok, override applied, ${info}`;
  });

  await step("numbers with thousands separators stay in one scene and one line", async () => {
    await page.getByTestId("voice-none").click();
    await page.getByTestId("music-none").click();
    await page.getByTestId("script").fill("Negeri ini berdiri di atas lebih dari 17.000 pulau.\nAda lebih dari 1.300 suku dan 700 bahasa daerah.\nMerdeka pada tahun 1945.");
    await page.getByTestId("duration").selectOption("15");
    const rows = await page.getByTestId("scenes").locator(".scene-info > b").allTextContents();
    assert(rows.length === 3, `3 scenes expected, got ${rows.length}: ${JSON.stringify(rows)}`);
    assert(rows[0].includes("17.000") && rows[1].includes("1.300"), `numbers kept whole: ${JSON.stringify(rows)}`);
    const player = page.locator(".player-wrap");
    await page.getByTestId("scene-item").nth(0).locator(".scene-row").click();
    await player.locator('[data-visual="number"]').waitFor({ timeout: 5000 });
    await player.hover();
    await player.locator("button").first().click(); // play so the counter runs
    await page.waitForTimeout(2200);
    const box = await player.locator('[data-visual="number"] > div').first().evaluate(el => ({ text: el.textContent, lines: Math.round(el.offsetHeight / parseFloat(getComputedStyle(el).lineHeight)) }));
    assert(box.text === "17.000", `counter text ${box.text}`);
    assert(box.lines === 1, `counter must stay on one line, got ${box.lines}`);
    return "scenes " + rows.length + ", counter 17.000 on one line";
  });

  await step("no horizontal scroll on iPhone-size viewport", async () => {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await phone.goto(BASE);
    await phone.waitForTimeout(800);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 0, `page overflows by ${overflow}px`);
    await phone.screenshot({ path: join(process.env.E2E_SHOTS || dir, "motion-mobile.png"), fullPage: true });
    await phone.close();
  });

  await step("no uncaught page errors", async () => {
    const real = pageErrors.filter(m => !(telemetryBlocked && m === "Failed to fetch"));
    assert(real.length === 0, real.join(" | "));
    return telemetryBlocked ? "ignored Remotion license telemetry failures (remotion.pro unreachable here)" : "";
  });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
