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
// Waits (up to 8 s) until a condition holds; used right after a reload, when the page is still restoring what it remembered.
async function until(check, message) { for (let i = 0; i < 80; i++) { if (await check().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(message); }
// The optional groups (look, backsound, duration) start folded, as for the creator; tests that use their controls open them.
const openFolds = p => p.evaluate(() => document.querySelectorAll("details.fold").forEach(d => { d.open = true; }));

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
  await page.goto(BASE); await openFolds(page);

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
    await p.goto(BASE); await openFolds(p);
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
    await p.goto(BASE); await openFolds(p);
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

  await step("a [jeda] tag adds silence without being shown, spoken or captioned", async () => {
    await page.getByTestId("voice-none").click();
    await page.getByTestId("music-none").click();
    await page.getByTestId("script").fill("Satu dua tiga empat. [jeda 2s]\nLima enam tujuh delapan.");
    await page.getByTestId("duration").selectOption("15");
    const rows = await page.getByTestId("scenes").locator(".scene-info > b").allTextContents();
    assert(rows.length === 2 && rows.every(r => !/jeda|\[|\]/i.test(r)), `scene texts: ${JSON.stringify(rows)}`);
    const info = await renderAndCheck("pause", false, 15);
    return `2 scenes, tag hidden, ${info}`;
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

  await step("a scene picture moves behind its scene in preview and render, other scenes stay without", async () => {
    await page.getByTestId("voice-none").click();
    await page.getByTestId("music-none").click();
    await page.getByTestId("style").selectOption("hybrid");
    await page.getByTestId("palette").selectOption("violet");
    await page.getByTestId("script").fill("Gambar ini milik saya sendiri.\nScene kedua tanpa gambar.");
    await page.getByTestId("duration").selectOption("15");
    // A large phone-size photo stand-in: plain red, so the frame check below is unambiguous.
    const photo = join(dir, "foto.png");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=4000x3000", "-frames:v", "1", photo]);
    await page.getByTestId("scene-image-input").nth(1).setInputFiles(notAudio);
    await page.getByTestId("image-error").filter({ hasText: "JPG" }).waitFor({ timeout: 3000 });
    await page.getByTestId("scene-image-input").nth(0).setInputFiles(photo);
    await page.locator(".scene-thumb").waitFor({ timeout: 10000 });
    assert(await page.getByTestId("image-error").count() === 0, "error cleared after a good picture");
    const size = await page.locator(".scene-thumb").evaluate(img => [img.naturalWidth, img.naturalHeight]);
    assert(Math.max(...size) <= 2200, `picture reduced for memory, got ${size}`);
    const player = page.locator(".player-wrap");
    await page.getByTestId("scene-item").nth(0).locator(".scene-row").click();
    await player.locator("img").first().waitFor({ timeout: 5000 });
    const info = await renderAndCheck("picture", false, 15);
    const out = join(dir, "picture.mp4");
    // Average colour of the top band (lightest scrim): red in scene 1, the violet background in scene 2.
    const band = at => {
      const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", out, "-frames:v", "1", "-vf", "crop=1080:200:0:0,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
      return [...raw];
    };
    const [r1, g1, b1] = band(3), [r2, , b2] = band(11);
    assert(r1 > 120 && r1 > g1 + 60 && r1 > b1 + 40, `scene 1 should show the red picture, got rgb ${r1},${g1},${b1}`);
    assert(r2 < 120 && b2 >= r2, `scene 2 should keep the palette background, got r ${r2} b ${b2}`);
    if (process.env.E2E_SHOTS) for (const at of [0.2, 3, 7, 11]) execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", out, "-frames:v", "1", join(process.env.E2E_SHOTS, `picture-${at}s.png`)]);
    await page.getByTestId("scene-image-remove").click();
    assert(await page.locator(".scene-thumb").count() === 0, "picture removed");
    return `${info}, top band scene 1 rgb ${r1},${g1},${b1}, scene 2 rgb ${r2},-,${b2}`;
  });

  await step("typography packs, new palettes and backgrounds: fonts load, text is fitted with them, and they are in the rendered MP4", async () => {
    await page.getByTestId("voice-none").click();
    await page.getByTestId("music-none").click();
    await page.getByTestId("style").selectOption("hybrid");
    await page.getByTestId("palette").selectOption("violet");
    await page.getByTestId("script").fill("Jangan tunggu semangat datang.\nMulailah, meski langkahmu kecil.");
    await page.getByTestId("duration").selectOption("15");
    await page.getByTestId("story-visuals").uncheck();
    await page.evaluate(() => document.querySelectorAll("details.fold").forEach(d => { d.open = true; }));
    const player = page.locator(".player-wrap");
    const region = (file, x, y, w, h) => execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", file, "-frames:v", "1", "-vf", `crop=${w}:${h}:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
    const diff = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
    const TEXT = [100, 500, 880, 700], EMPTY = [700, 1650, 300, 120];

    assert((await page.getByTestId("typography").locator("option").count()) === 8, "eight type packs offered");
    const palettes = await page.getByTestId("palette").locator("option").allInnerTexts();
    assert(["Sunset / Peach", "Deep Ocean / Aqua", "Noir / Crimson", "Moss / Neon Lime", "Mint / Evergreen", "Lavender / Violet"].every(n => palettes.includes(n)), "new palettes offered: " + palettes.join("|"));
    await page.getByTestId("scene-item").nth(0).locator(".scene-row").click();
    await player.locator("[data-fit]").first().waitFor({ timeout: 8000 });
    await renderAndCheck("type-classic", false, 15);

    // Impact: Anton, capitals. The font file really loaded, and the preview text is drawn in it.
    await page.getByTestId("typography").selectOption("impact");
    await page.waitForFunction(() => document.fonts.check("100px Anton") && [...document.fonts].some(f => f.family.replace(/"/g, "") === "Anton" && f.status === "loaded"), null, { timeout: 15000 });
    await until(async () => /anton/i.test(await player.locator("[data-fit]").first().evaluate(el => getComputedStyle(el).fontFamily)), "preview headline uses Anton");
    assert((await player.locator("[data-fit]").first().innerText()).replace(/\s+/g, " ").trim() === "JANGAN TUNGGU SEMANGAT DATANG.", "display text is in capitals");
    assert(await player.locator('[data-fit="floor"]').count() === 0, "text still fits at a readable size");
    await renderAndCheck("type-impact", false, 15);

    // A new palette, then the moving background, then the grain: each on its own, so each can be shown to be in the file.
    await page.getByTestId("palette").selectOption("sunset");
    await renderAndCheck("type-sunset", false, 15);
    await page.getByTestId("backdrop").selectOption("mesh");
    await player.locator('[data-backdrop="mesh"]').waitFor({ timeout: 8000 });
    await renderAndCheck("type-mesh", false, 15);
    await page.getByTestId("grain").check();
    await player.locator('[data-backdrop="grain"]').waitFor({ timeout: 8000 });
    await renderAndCheck("type-grain", false, 15);

    const f = n => join(dir, n + ".mp4");
    const classicVsImpact = diff(region(f("type-classic"), ...TEXT), region(f("type-impact"), ...TEXT));
    assert(classicVsImpact > 8, `the type pack is in the file (headline region change ${classicVsImpact.toFixed(1)})`);
    const paletteVsViolet = diff(region(f("type-impact"), ...EMPTY), region(f("type-sunset"), ...EMPTY));
    assert(paletteVsViolet > 10, `the new palette is in the file (empty region change ${paletteVsViolet.toFixed(1)})`);
    const meshVsPlain = diff(region(f("type-sunset"), ...EMPTY), region(f("type-mesh"), ...EMPTY));
    assert(meshVsPlain > 1, `the mesh background is in the file (empty region change ${meshVsPlain.toFixed(2)})`);
    const grainVsMesh = diff(region(f("type-mesh"), ...EMPTY), region(f("type-grain"), ...EMPTY));
    assert(grainVsMesh > 0.4, `the grain texture is in the file (empty region change ${grainVsMesh.toFixed(2)})`);
    // Switching back restores the exact classic picture.
    await page.getByTestId("typography").selectOption("classic");
    await page.getByTestId("palette").selectOption("violet");
    await page.getByTestId("backdrop").selectOption("plain");
    await page.getByTestId("grain").uncheck();
    await page.getByTestId("story-visuals").check();
    return `type pack ${classicVsImpact.toFixed(0)}, palette ${paletteVsViolet.toFixed(0)}, mesh ${meshVsPlain.toFixed(1)}, grain ${grainVsMesh.toFixed(2)}`;
  });

  await step("story objects (from the Story Motion Lab) appear above suited scenes, no extra text, can be switched off, and are in the rendered MP4", async () => {
    await page.getByTestId("voice-none").click();
    await page.getByTestId("music-none").click();
    await page.getByTestId("style").selectOption("hybrid");
    await page.getByTestId("palette").selectOption("violet");
    await page.getByTestId("script").fill("Jangan tunggu semangat datang.\nMulailah, meski langkahmu kecil.\nDisiplin membuatmu tetap bergerak.\nSatu langkah hari ini lebih baik dari rencana sempurna.\nMulai sekarang.");
    await page.getByTestId("duration").selectOption("15");
    await page.evaluate(() => document.querySelectorAll("details.fold").forEach(d => { d.open = true; }));
    const player = page.locator(".player-wrap");
    assert(await page.getByTestId("story-visuals").isChecked(), "on by default");
    // The storyboard names the object per scene: focal point, none, orbit, none, converging point.
    const rows = await page.getByTestId("storyboard-scene").allInnerTexts();
    assert(rows.length === 5 && /Titik fokus melayang/.test(rows[0]) && !/objek 3D/.test(rows[1]) && /Sistem orbit/.test(rows[2]) && !/objek 3D/.test(rows[3]) && /Satu titik tujuan/.test(rows[4]), "storyboard lists the objects: " + rows.join(" | "));
    await page.getByTestId("scene-item").nth(0).locator(".scene-row").click();
    await player.locator('[data-visual="story-orb"]').waitFor({ timeout: 8000 });
    assert(!(await player.innerText()).match(/ORB|TITIK FOKUS|OBJEK/i), "the objects add no text to the picture");
    // Rendered file: the area where the focal point sits differs between on and off; elsewhere it does not.
    const region = (file, x, y, w, h) => execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", file, "-frames:v", "1", "-vf", `crop=${w}:${h}:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
    const diff = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
    await renderAndCheck("story-on", false, 15);
    await page.getByTestId("story-visuals").uncheck();
    await player.locator('[data-visual="story-orb"]').waitFor({ state: "detached", timeout: 8000 });
    assert((await page.getByTestId("storyboard-scene").allInnerTexts()).every(t => !/objek 3D/.test(t)), "storyboard shows none when off");
    await renderAndCheck("story-off", false, 15);
    const on = join(dir, "story-on.mp4"), off = join(dir, "story-off.mp4");
    const orbArea = diff(region(on, 340, 300, 400, 340), region(off, 340, 300, 400, 340));
    const lowerArea = diff(region(on, 100, 1560, 880, 200), region(off, 100, 1560, 880, 200));
    assert(orbArea > 3, `the focal point is in the file (region change ${orbArea.toFixed(2)})`);
    assert(lowerArea < 0.5, `nothing else changes (region change ${lowerArea.toFixed(2)})`);
    await page.getByTestId("story-visuals").check();
    return `focal point region change ${orbArea.toFixed(1)}, elsewhere ${lowerArea.toFixed(2)}`;
  });

  await step("the watermark: previewed, burned into the MP4 only when on and non-empty, positioned, remembered for re-renders", async () => {
    await page.getByTestId("voice-none").click();
    await page.getByTestId("music-none").click();
    await page.getByTestId("style").selectOption("hybrid");
    await page.getByTestId("palette").selectOption("violet");
    await page.getByTestId("script").fill("Watermark diuji di sini.\nScene kedua juga.");
    await page.getByTestId("duration").selectOption("15");
    await page.evaluate(() => document.querySelectorAll("details.fold").forEach(d => { d.open = true; }));
    const player = page.locator(".player-wrap");
    // Region of the frame (1080x1920) as raw RGB, and the mean absolute difference between two such regions.
    const region = (file, x, y, w, h) => execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", file, "-frames:v", "1", "-vf", `crop=${w}:${h}:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
    const diff = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
    const BR = [560, 1380, 400, 180], TL = [100, 200, 500, 180];

    // A: text typed but switched off -> no watermark anywhere.
    await page.getByTestId("wm-text").fill("@ArkaSenja");
    assert(await player.getByTestId("watermark").count() === 0, "nothing in the preview while switched off");
    await renderAndCheck("wm-off", false, 15);
    // B: on, bottom-right (default): visible in the preview, then in the file.
    await page.getByTestId("wm-enabled").check();
    await page.getByTestId("wm-pos-bottom-right").click();
    await player.getByTestId("watermark").waitFor({ timeout: 5000 });
    assert((await player.getByTestId("watermark").textContent()) === "@ArkaSenja", "preview shows the typed text");
    assert(await player.getByTestId("watermark").getAttribute("data-position") === "bottom-right", "preview position");
    await renderAndCheck("wm-br", false, 15);
    // C: on but empty text -> nothing.
    await page.getByTestId("wm-text").fill("   ");
    await page.getByTestId("wm-empty").waitFor({ timeout: 3000 });
    assert(await player.getByTestId("watermark").count() === 0, "an empty text draws nothing in the preview");
    await renderAndCheck("wm-empty", false, 15);
    // D: top-left, larger and more opaque.
    await page.getByTestId("wm-text").fill("@ArkaSenja");
    await page.getByTestId("wm-pos-top-left").click();
    await page.getByTestId("wm-size").fill("8");
    await page.getByTestId("wm-opacity").fill("1");
    assert(await player.getByTestId("watermark").getAttribute("data-position") === "top-left", "preview follows the position");
    await renderAndCheck("wm-tl", false, 15);

    const off = join(dir, "wm-off.mp4"), br = join(dir, "wm-br.mp4"), empty = join(dir, "wm-empty.mp4"), tl = join(dir, "wm-tl.mp4");
    const offBR = region(off, ...BR), offTL = region(off, ...TL);
    const brOnBR = diff(offBR, region(br, ...BR)), emptyOnBR = diff(offBR, region(empty, ...BR));
    const tlOnTL = diff(offTL, region(tl, ...TL)), tlOnBR = diff(offBR, region(tl, ...BR));
    assert(brOnBR > 2, `the bottom-right watermark is in the file (region change ${brOnBR.toFixed(2)})`);
    assert(emptyOnBR < 0.5, `an empty text leaves the file as if switched off (region change ${emptyOnBR.toFixed(2)})`);
    assert(tlOnTL > 2, `the top-left watermark is in the file (region change ${tlOnTL.toFixed(2)})`);
    assert(tlOnBR < 0.5, `a top-left watermark leaves the bottom-right untouched (region change ${tlOnBR.toFixed(2)})`);
    assert(diff(offTL, region(br, ...TL)) < 0.5, "a bottom-right watermark leaves the top-left untouched");
    // Remembered for the editing session: the same settings are back after a reload, so re-rendering needs no re-typing.
    await page.reload(); await openFolds(page);
    await until(async () => (await page.getByTestId("wm-text").inputValue()) === "@ArkaSenja", "text remembered");
    assert(await page.getByTestId("wm-enabled").isChecked() && await page.getByTestId("wm-pos-top-left").getAttribute("aria-pressed") === "true", "switch and position remembered");
    assert(await page.getByTestId("wm-size").inputValue() === "8" && await page.getByTestId("wm-opacity").inputValue() === "1", "size and transparency remembered");
    // Leave the session clean for the steps that follow.
    await page.getByTestId("wm-enabled").uncheck();
    return `file change: bottom-right ${brOnBR.toFixed(1)}, top-left ${tlOnTL.toFixed(1)}, empty ${emptyOnBR.toFixed(2)}, cross-talk ${tlOnBR.toFixed(2)}`;
  });

  await step("the AI director arranges the video, shows its reasons, takes feedback, can be undone and edited by hand", async () => {
    const ai = await (await browser.newContext()).newPage();
    ai.on("pageerror", e => pageErrors.push(e.message));
    // A device key (no sign-in needed) and a fake AI service that answers according to the request.
    await ai.addInitScript(() => localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })));
    const requests = [];
    let fail = false;
    await ai.route("https://generativelanguage.googleapis.com/**", async route => {
      const prompt = JSON.parse(route.request().postData() ?? "{}").contents?.[0]?.parts?.[0]?.text ?? "";
      requests.push(prompt);
      if (fail) return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }) });
      const calm = /lebih tenang/.test(prompt);
      const plan = calm
        ? { style: "editorial", palette: "ivory", note: "Dibuat lebih tenang.", scenes: [{ index: 0, template: "statement", icon: "none", reason: "Tenang, tanpa ikon", imageIdea: "orang melamun" }, { index: 1, template: "statement", icon: "none", reason: "Satu fokus", imageIdea: "dua jalan" }, { index: 2, template: "statement", icon: "none", reason: "Penutup lembut", imageIdea: "layar ponsel" }] }
        : { style: "kinetic", palette: "obsidian", note: "Pembuka tegas, angka jadi sorotan, ajakan di akhir.", scenes: [{ index: 0, template: "number", reason: "Angka 80% jadi sorotan", imageIdea: "jam pasir, orang sibuk" }, { index: 1, template: "question", reason: "Pertanyaan memancing jawaban", imageIdea: "persimpangan jalan" }, { index: 2, template: "cta", reason: "Ajakan di akhir", imageIdea: "tombol ikuti" }] };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }) });
    });
    await ai.goto(BASE); await openFolds(ai);
    await ai.getByTestId("voice-none").click();
    await ai.getByTestId("script").fill("Kamu rugi 80% waktu tiap hari.\nPilih jalan lama atau jalan baru?\nIkuti untuk tips berikutnya!");
    await ai.getByTestId("duration").selectOption("15");
    await ai.getByTestId("director-run").waitFor({ timeout: 5000 });
    const before = { style: await ai.getByTestId("style").inputValue(), palette: await ai.getByTestId("palette").inputValue() };
    await ai.getByTestId("director-run").click();
    await ai.getByTestId("director-note").waitFor({ timeout: 10000 });
    assert(/angka jadi sorotan/.test(await ai.getByTestId("director-note").textContent()), "AI direction summary shown");
    assert(await ai.getByTestId("style").inputValue() === "kinetic" && await ai.getByTestId("palette").inputValue() === "obsidian", "AI chose style and palette");
    const reasons = await ai.getByTestId("scene-director").allTextContents();
    assert(reasons.length === 3 && /Angka 80%/.test(reasons[0]), `one reason per scene: ${JSON.stringify(reasons)}`);
    assert((await ai.getByTestId("scene-image-idea").allTextContents())[1].includes("persimpangan"), "picture idea shown");
    const templates = await ai.locator('[data-testid="scene-template"] option:checked').allTextContents();
    assert(templates[0] === "Angka" && templates[1] === "Tanya" && templates[2] === "Ajakan", `templates applied: ${templates}`);
    assert(requests.length === 1 && requests[0].includes("Panduan kerja") && requests[0].includes("Kamu rugi 80% waktu"), "playbook and sentences sent");
    assert(!requests[0].includes("k".repeat(30)), "the key is never part of the prompt");
    // The preview really shows the chosen template.
    await ai.getByTestId("scene-item").nth(0).locator(".scene-row").click();
    await ai.locator('.player-wrap [data-visual="number"]').waitFor({ timeout: 5000 });
    // Feedback: the second pass carries the creator's words and the current choices.
    await ai.getByTestId("director-feedback").fill("lebih tenang, kurangi animasi");
    await ai.getByTestId("director-run").click();
    await ai.getByText("Dibuat lebih tenang.").waitFor({ timeout: 10000 });
    assert(requests.length === 2 && requests[1].includes("lebih tenang, kurangi animasi") && requests[1].includes('"sekarang"'), "feedback and current choices sent");
    assert(await ai.getByTestId("style").inputValue() === "editorial", "second pass applied");
    // A manual change replaces the AI's reason for that scene only.
    await ai.getByTestId("scene-template").nth(1).selectOption("quote");
    assert((await ai.getByTestId("scene-director").allTextContents()).length === 2, "manual change drops that scene's AI reason");
    // Each revision is a version: undo twice goes back through both passes to before the first one, and redo is offered.
    await ai.getByTestId("director-undo").click();
    await ai.getByTestId("director-redo").waitFor({ timeout: 5000 });
    await ai.getByTestId("director-undo").click();
    assert(await ai.getByTestId("style").inputValue() === before.style && await ai.getByTestId("palette").inputValue() === before.palette, "undo restores style and palette");
    assert(await ai.getByTestId("scene-director").count() === 0 && await ai.getByTestId("director-note").count() === 0, "undo clears the reasons");
    const after = await ai.locator('[data-testid="scene-template"] option:checked').allTextContents();
    assert(after.every(t => t.startsWith("Otomatis")), `templates back to automatic: ${after}`);
    // A service error is explained and changes nothing.
    fail = true;
    await ai.getByTestId("director-run").click();
    await ai.getByTestId("director-error").waitFor({ timeout: 15000 });
    assert(await ai.getByTestId("scene-director").count() === 0, "failure applies nothing");
    // Without a key the panel says what is needed.
    const noKey = await (await browser.newContext()).newPage();
    await noKey.goto(BASE); await openFolds(noKey);
    await noKey.getByTestId("director-needs-key").waitFor({ timeout: 5000 });
    await ai.close(); await noKey.close();
    return `3 scenes arranged with reasons, feedback pass, undo, error explained, no-key message`;
  });

  await step("Pexels: save the key on the server, the AI's search phrases fill the scenes, swap by hand, credits shown, rendered", async () => {
    const SB = "https://smwealrfgnzxquqqscxs.supabase.co";
    // Two solid-colour "photos": scene 1 gets the green one, a hand swap on scene 2 gets the blue one.
    const jpg = c => { const f = join(dir, `stock-${c}.jpg`); execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${c}:s=1080x1920`, "-frames:v", "1", f]); return readFileSync(f); };
    const bytes = { green: jpg("green"), blue: jpg("blue") };
    const colorOf = id => (id === 11 ? "green" : "blue");
    const photoRec = id => ({ id, alt: `foto ${id}`, url: `https://www.pexels.com/photo/x-${id}/`, photographer: `Fotografer ${id}`, photographer_url: `https://www.pexels.com/@f${id}`, src: { original: `https://images.pexels.com/photos/${id}/p.jpeg`, medium: `https://images.pexels.com/photos/${id}/p.jpeg?h=350`, portrait: `https://images.pexels.com/photos/${id}/p.jpeg?w=800` } });
    const seen = { searches: [], images: [], saved: 0, hasKey: false, generate: 0 };
    const ctx2 = await browser.newContext({ acceptDownloads: true });
    await ctx2.route("https://images.pexels.com/**", r => r.fulfill({ status: 200, contentType: "image/jpeg", body: bytes[colorOf(Number(new URL(r.request().url()).pathname.split("/")[2]))], headers: { "access-control-allow-origin": "*" } }));
    await ctx2.route(SB + "/**", async route => {
      const req = route.request(), u = new URL(req.url());
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, GET, OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const send = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      if (u.pathname === "/auth/v1/token") return send(200, { access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { email: "saya@contoh.id" } });
      if (u.pathname.startsWith("/rest/v1/")) return send(200, []);
      const m = JSON.parse(req.postData() ?? "{}");
      if (u.pathname === "/functions/v1/gemini") {
        if (m.action === "status") return send(200, { hasKey: true, provider: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-x" });
        seen.generate++;
        const plan = { style: "kinetic", palette: "obsidian", note: "Hangat dan jelas.", scenes: [{ index: 0, template: "statement", icon: "none", reason: "Pembuka hangat", imageIdea: "kopi pagi", imageQuery: "morning coffee" }, { index: 1, template: "statement", icon: "none", reason: "Penutup rapi", imageIdea: "laptop kerja", imageQuery: "laptop desk" }] };
        return send(200, { choices: [{ message: { content: JSON.stringify(plan) } }] });
      }
      if (u.pathname !== "/functions/v1/pexels") return send(404, {});
      if (m.action === "status") return send(200, { hasKey: seen.hasKey });
      if (m.action === "forget") { seen.hasKey = false; return send(200, { ok: true }); }
      if (m.action === "save-key") { if (m.apiKey.startsWith("bad")) return send(400, { error: { status: "KEY_REJECTED", message: "Pexels menolak kunci ini. Periksa kuncinya di pexels.com/api." } }); seen.saved++; seen.hasKey = true; return send(200, { ok: true }); }
      if (m.action === "search") {
        seen.searches.push(m.query);
        // The first scene's phrase finds the green photo (11) first; any other phrase finds blue (22) then green.
        const ids = /coffee/.test(m.query) ? [11, 22] : [22, 11];
        return send(200, { photos: ids.map(id => { const p = photoRec(id); return { id, alt: p.alt, photographer: p.photographer, photographerUrl: p.photographer_url, pexelsUrl: p.url, thumb: p.src.medium, image: p.src.original, fallback: p.src.portrait }; }), remaining: 190 });
      }
      if (m.action === "image") {
        seen.images.push(m.url);
        const id = Number(new URL(m.url).pathname.split("/")[2]);
        return route.fulfill({ status: 200, headers: { ...cors, "content-type": "image/jpeg" }, body: bytes[colorOf(id)] });
      }
      return send(400, {});
    });
    const p = await ctx2.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE); await openFolds(p);
    await p.getByTestId("voice-none").click();
    await p.getByTestId("style").selectOption("hybrid");
    await p.getByTestId("script").fill("Kopi pagi membuatmu semangat.\nLaptop siap untuk bekerja.");
    await p.getByTestId("duration").selectOption("15");
    // Signed out: the panel says what is needed.
    await p.getByTestId("pexels-needs-login").waitFor({ timeout: 5000 });
    await p.getByTestId("cloud-open").click();
    await p.getByTestId("cloud-email").fill("saya@contoh.id");
    await p.getByTestId("cloud-password").fill("benar-sekali");
    await p.getByTestId("cloud-signin").click();
    // Signed in without a Pexels key: a wrong key is explained, a good one is saved, and is never shown again.
    await p.getByTestId("pexels-key").waitFor({ timeout: 10000 });
    assert(await p.getByTestId("pexels-save").isDisabled(), "save waits for a key");
    await p.getByTestId("pexels-key").fill("bad" + "x".repeat(30));
    await p.getByTestId("pexels-save").click();
    await p.getByTestId("pexels-error").filter({ hasText: "menolak" }).waitFor({ timeout: 5000 });
    await p.getByTestId("pexels-key").fill("pexels_" + "z".repeat(40));
    await p.getByTestId("pexels-save").click();
    await p.getByTestId("pexels-fill").waitFor({ timeout: 5000 });
    assert(seen.saved === 1 && !(await p.content()).includes("z".repeat(40)), "key saved once and not left on the page");
    // No search phrases yet: the panel points to the director instead of guessing.
    assert(await p.getByTestId("pexels-fill").isDisabled() && await p.getByTestId("pexels-no-query").isVisible(), "fill waits for phrases");
    await p.getByTestId("director-run").click();
    await p.getByTestId("scene-image-idea").first().waitFor({ timeout: 10000 });
    const label = await p.getByTestId("pexels-fill").textContent();
    assert(/2 scene/.test(label), `fill offers both scenes: ${label}`);
    await p.getByTestId("pexels-fill").click();
    await p.getByTestId("pexels-summary").waitFor({ timeout: 30000 });
    assert(/2 gambar dipasang/.test(await p.getByTestId("pexels-summary").textContent()), "summary");
    assert(seen.searches.join("|") === "morning coffee|laptop desk", `AI phrases were searched: ${seen.searches}`);
    assert(await p.locator(".scene-thumb").count() === 2, "both scenes have a picture");
    // Scene 2's best match (22, blue) is not used elsewhere; scene 1 got the green photo (11).
    const credits = await p.getByTestId("scene-credit").allTextContents();
    assert(credits[0] === "Foto: Fotografer 11 di Pexels" && credits[1] === "Foto: Fotografer 22 di Pexels", `credits: ${credits}`);
    assert((await p.getByTestId("scene-credit").first().locator("a").getAttribute("href")).startsWith("https://www.pexels.com/"), "credit links to Pexels");
    // Swap scene 2's picture by hand: the picker is prefilled with the AI phrase and shows credits.
    await p.getByTestId("scene-image-pexels").nth(1).click();
    await p.getByTestId("photo-grid").waitFor({ timeout: 10000 });
    assert(await p.getByTestId("photo-query").inputValue() === "laptop desk", "picker prefilled with the AI phrase");
    assert(await p.getByTestId("photo-choice").count() === 2, "two results");
    await p.getByTestId("photo-choice").nth(1).click(); // the second result for "laptop desk" is photo 11 (green)
    await p.getByTestId("photo-picker").waitFor({ state: "detached", timeout: 10000 });
    assert((await p.getByTestId("scene-credit").allTextContents())[1] === "Foto: Fotografer 11 di Pexels", "swapped credit");
    // Render: both scenes show their green photo.
    const info = await (async () => {
      await p.getByTestId("render").click();
      await p.getByTestId("result").waitFor({ timeout: 300000 });
      const [download] = await Promise.all([p.waitForEvent("download"), p.getByTestId("download").click()]);
      const out = join(dir, "stock.mp4");
      await download.saveAs(out);
      const px = at => [...execFileSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", out, "-frames:v", "1", "-vf", "crop=1080:200:0:0,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])];
      return { p1: px(3), p2: px(11), dur: probe(out).duration };
    })();
    for (const [name, [r, g, b]] of [["scene 1", info.p1], ["scene 2", info.p2]]) assert(g > r + 20 && g > b + 20, `${name} should show a green photo, got ${r},${g},${b}`);
    assert(Math.abs(info.dur - 15) < 0.3, `duration ${info.dur}`);
    // Forgetting the key brings the key form back.
    await p.getByTestId("pexels-forget").click();
    await p.getByTestId("pexels-key").waitFor({ timeout: 5000 });
    assert(seen.hasKey === false, "key forgotten on the server");
    await ctx2.close();
    return `phrases ${seen.searches.join(" / ")}, ${seen.images.length} images fetched through the server, credits shown, MP4 ${info.dur.toFixed(1)}s with the photos`;
  });

  await step("affiliate mode: the AI writes from the product facts only, risky claims are flagged and removable, the product photo and the director follow", async () => {
    const ctxA = await browser.newContext();
    await ctxA.addInitScript(() => { if (!localStorage.getItem("noai")) localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })); });
    const prompts = [];
    const FIRST = ["Air cepat hangat saat kerja?", "Termos Aqualux menjaga air tetap dingin 12 jam.", "Termos terbaik, dijamin awet!", "Bahan stainless steel anti karat.", "Harganya Rp 89.000, diskon 50% hari ini!", "Cek keranjang kuning."];
    const SECOND = ["Air cepat hangat?", "Termos Aqualux jaga dingin 12 jam.", "Rp 89.000 saja.", "Cek keranjang kuning."];
    await ctxA.route("https://generativelanguage.googleapis.com/**", async route => {
      const prompt = JSON.parse(route.request().postData() ?? "{}").contents?.[0]?.parts?.[0]?.text ?? "";
      prompts.push(prompt);
      const answer = obj => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
      if (prompt.includes("DATA PRODUK")) return answer(/lebih singkat/.test(prompt) ? { title: "Termos Dingin", lines: SECOND } : { title: "Termos Dingin 12 Jam", lines: FIRST });
      return answer({ style: "kinetic", palette: "obsidian", note: "Jualan jelas.", scenes: [0, 1, 2, 3].map(index => ({ index, template: index === 3 ? "cta" : "statement", icon: "none", reason: "Alur jualan", imageIdea: "botol minum", imageQuery: "water bottle desk" })) });
    });
    const p = await ctxA.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE); await openFolds(p);
    await p.getByTestId("voice-none").click();
    await p.getByTestId("duration").selectOption("15");
    await p.getByTestId("mode-affiliate").click();
    await p.getByTestId("aff-product").fill("Botol Minum Termos Aqualux 750 ml");
    await p.getByTestId("aff-price").fill("Rp 89.000");
    await p.getByTestId("aff-promo").fill("Diskon 10% sampai akhir bulan");
    assert(await p.getByTestId("aff-write").isDisabled() && /minimal satu/.test(await p.getByTestId("aff-problem").textContent()), "writing waits for at least one real fact");
    await p.getByTestId("aff-benefits").fill("Menjaga air tetap dingin 12 jam\nBahan stainless steel anti karat");
    await p.getByTestId("aff-write").click();
    await p.getByTestId("aff-draft").waitFor({ timeout: 10000 });
    assert(prompts.length === 1 && prompts[0].includes("HANYA dari DATA PRODUK") && prompts[0].includes("Rp 89.000") && prompts[0].includes("Cek keranjang kuning"), "the prompt carries the facts, the rule and the platform's call to action");
    assert(!prompts[0].includes("k".repeat(30)), "the key is not in the prompt");
    const flagged = await p.locator('[data-testid="aff-draft-line"].flagged').count();
    assert(await p.getByTestId("aff-draft-line").count() === 6 && flagged === 2, `6 lines, 2 flagged: ${flagged}`);
    const draftText = await p.getByTestId("aff-draft").textContent();
    assert(/terbaik/.test(draftText) && /dijamin/.test(draftText) && /50%/.test(draftText), "the draft says what is risky");
    assert(!/Rp 89\.000\W+tidak ada di data/.test(draftText), "the real price is not flagged");
    // Feedback: a clean rewrite.
    await p.getByTestId("aff-feedback").fill("lebih singkat");
    await p.getByTestId("aff-regenerate").click();
    await p.locator('[data-testid="aff-draft"] >> text=Tidak ada klaim berisiko').waitFor({ timeout: 10000 });
    assert(prompts.length === 2 && prompts[1].includes("lebih singkat"), "feedback sent");
    // The first draft again, then use it: the script and title are filled and the live guard flags the claims.
    await p.getByTestId("aff-feedback").fill("kembali ke versi panjang");
    await p.getByTestId("aff-regenerate").click();
    await p.getByTestId("aff-draft-line").nth(5).waitFor({ timeout: 10000 });
    await p.getByTestId("aff-use").click();
    assert((await p.getByTestId("script").inputValue()).split("\n").length === 6, "script replaced by the draft");
    assert(await p.getByTestId("title").inputValue() === "Termos Dingin 12 Jam", "title set");
    await p.getByTestId("aff-finding").first().waitFor({ timeout: 5000 });
    assert(await p.getByTestId("aff-finding").count() === 3, `3 findings: ${await p.getByTestId("aff-finding").count()}`);
    // Removing a flagged line removes it from the script and its findings.
    await p.getByTestId("aff-remove").first().click();
    assert((await p.getByTestId("script").inputValue()).split("\n").length === 5 && !/terbaik/.test(await p.getByTestId("script").inputValue()), "flagged line removed from the script");
    assert(await p.getByTestId("aff-finding").count() === 1, "one finding left (the invented 50%)");
    await p.getByTestId("aff-remove").first().click();
    await p.getByTestId("aff-guard-ok").waitFor({ timeout: 5000 });
    // The creator's own product photo goes behind the scenes that name the product and the last scene.
    const photo = join(dir, "produk.png");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=orange:s=1200x1600", "-frames:v", "1", photo]);
    await p.getByTestId("aff-photo-input").setInputFiles(photo);
    await p.getByTestId("aff-photo-msg").waitFor({ timeout: 10000 });
    assert(/2 scene/.test(await p.getByTestId("aff-photo-msg").textContent()), `photo message: ${await p.getByTestId("aff-photo-msg").textContent()}`);
    assert(await p.locator(".scene-thumb").count() === 2, "two scenes got the product photo");
    // The AI director knows this is a selling video.
    await p.getByTestId("director-run").click();
    await p.getByTestId("director-note").waitFor({ timeout: 10000 });
    const dir1 = prompts.at(-1);
    assert(dir1.includes("video AFFILIATE") && dir1.includes("Botol Minum Termos Aqualux 750 ml"), "director prompt has the affiliate rules");
    const templates = await p.locator('[data-testid="scene-template"] option:checked').allTextContents();
    assert(templates.at(-1) === "Ajakan", `buying prompt closes the video: ${templates}`);
    // The product facts are remembered on this device.
    await p.reload();
    await until(async () => (await p.getByTestId("aff-product").inputValue()) === "Botol Minum Termos Aqualux 750 ml" && /Rp 89\.000/.test(await p.getByTestId("aff-price").inputValue()), "facts remembered after a reload");
    assert(await p.getByTestId("aff-disclosure").isVisible(), "disclosure reminder shown");
    await ctxA.close();
    // Without an AI key the claim guard still works.
    const ctxB = await browser.newContext();
    const q = await ctxB.newPage();
    await q.goto(BASE); await openFolds(q);
    await q.getByTestId("mode-affiliate").click();
    await q.getByTestId("aff-needs-key").waitFor({ timeout: 5000 });
    await q.getByTestId("aff-product").fill("Serum Wajah Glow");
    await q.getByTestId("aff-benefits").fill("Tekstur ringan");
    await q.getByTestId("script").fill("Serum ini menyembuhkan jerawat dan memutihkan kulit.\nTekstur ringan.");
    await q.getByTestId("aff-finding").first().waitFor({ timeout: 5000 });
    assert(await q.getByTestId("aff-finding").count() === 2, `health claims flagged without an AI key: ${await q.getByTestId("aff-finding").count()}`);
    await ctxB.close();
    return `AI script from facts (6 lines, 2 flagged), rewrite with feedback, 3 findings then removable, product photo on 2 scenes, director told, facts remembered, guard works without a key`;
  });

  await step("mode switch: ordinary and affiliate content each have their own place, the work carries over, the last mode is remembered", async () => {
    const ctxM = await browser.newContext();
    await ctxM.addInitScript(() => localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })));
    const prompts = [];
    await ctxM.route("https://generativelanguage.googleapis.com/**", async route => {
      prompts.push(JSON.parse(route.request().postData() ?? "{}").contents?.[0]?.parts?.[0]?.text ?? "");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ style: "kinetic", palette: "obsidian", note: "Ok.", scenes: [{ index: 0, template: "statement", icon: "none", reason: "Tenang" }, { index: 1, template: "statement", icon: "none", reason: "Tenang" }] }) }] } }] }) });
    });
    const m = await ctxM.newPage();
    m.on("pageerror", e => pageErrors.push(e.message));
    await m.goto(BASE);
    const checked = id => m.getByTestId(id).getAttribute("aria-checked");
    const runDirector = async () => {
      const n = prompts.length;
      await m.getByTestId("director-run").click();
      await m.waitForFunction(() => !document.querySelector('[data-testid="director-run"]')?.textContent?.includes("menyusun"));
      for (let i = 0; i < 50 && prompts.length === n; i++) await m.waitForTimeout(100);
      assert(prompts.length === n + 1, "one AI request per run");
      await m.getByTestId("director-note").waitFor({ timeout: 10000 });
      return prompts.at(-1);
    };
    // Ordinary content is the default: the video source is there, the product data is not.
    assert(await checked("mode-normal") === "true" && await checked("mode-affiliate") === "false", "ordinary content by default");
    assert(await m.getByTestId("source-video").count() === 1 && await m.locator(".field-label.normal-only", { hasText: "Video sumber" }).isVisible(), "video source shown for ordinary content");
    assert(!(await m.getByTestId("affiliate-panel").isVisible()), "product data hidden for ordinary content");
    assert(/Naskah/.test(await m.getByTestId("step-1").textContent()) && !/Produk/.test(await m.getByTestId("step-1").textContent()), "step 1 is the script");
    // The optional groups start folded and say what they hold.
    for (const id of ["fold-look", "fold-music", "fold-duration"]) assert(await m.getByTestId(id).evaluate(d => d.open) === false, `${id} starts folded`);
    assert(/Hybrid/.test(await m.getByTestId("fold-look").locator("summary").textContent()), "look summary names the style");
    await m.getByTestId("fold-look").locator("summary").click();
    await m.getByTestId("style").selectOption("popup");
    assert(await m.getByTestId("fold-look").evaluate(d => d.open) === true, "an opened group stays open while editing");
    assert(/Pop-up/.test(await m.getByTestId("fold-look").locator("summary").textContent()), "summary follows the choice");
    await m.getByTestId("voice-none").click();
    await m.getByTestId("script").fill("Kalimat pertama saya.\nKalimat kedua saya.");
    assert(!(await runDirector()).includes("AFFILIATE"), "ordinary content gets no selling rules");
    // Affiliate has its own place; the script and the settings come along.
    await m.getByTestId("mode-affiliate").click();
    assert(await checked("mode-affiliate") === "true", "affiliate selected");
    await m.getByTestId("affiliate-panel").waitFor({ state: "visible", timeout: 5000 });
    assert(!(await m.locator(".field-label.normal-only", { hasText: "Video sumber" }).isVisible()), "video source hidden in affiliate mode");
    assert(/Produk dan naskah/.test(await m.getByTestId("step-1").textContent()), "step 1 becomes product and script");
    assert(await m.getByTestId("script").inputValue() === "Kalimat pertama saya.\nKalimat kedua saya.", "the script carried over");
    assert(await m.getByTestId("style").inputValue() === "kinetic", "the AI pass's settings carried over");
    await m.getByTestId("aff-product").fill("Botol Termos");
    await m.getByTestId("aff-benefits").fill("Menjaga air tetap dingin");
    const selling = await runDirector();
    assert(selling.includes("video AFFILIATE") && selling.includes("Botol Termos"), "affiliate mode tells the director it is a selling video");
    // Back to ordinary: the product data is kept but the selling rules stop.
    await m.getByTestId("mode-normal").click();
    assert(await m.getByTestId("script").inputValue() === "Kalimat pertama saya.\nKalimat kedua saya.", "the script is still there");
    assert(!(await m.getByTestId("affiliate-panel").isVisible()), "product data hidden again");
    assert(!(await runDirector()).includes("AFFILIATE"), "ordinary content gets no selling rules even with product data filled in");
    // The last mode is remembered.
    await m.getByTestId("mode-affiliate").click();
    await m.reload();
    await until(async () => (await checked("mode-affiliate")) === "true" && await m.getByTestId("affiliate-panel").isVisible(), "affiliate remembered after a reload");
    await until(async () => (await m.getByTestId("aff-product").inputValue()) === "Botol Termos", "product data remembered too");
    await m.getByTestId("mode-normal").click();
    await m.reload();
    await until(async () => (await checked("mode-normal")) === "true" && await m.locator(".field-label.normal-only", { hasText: "Video sumber" }).isVisible(), "ordinary remembered after a reload");
    await ctxM.close();
    return "default ordinary; product data and video source each only in their own mode; script and settings carried over; selling rules only in affiliate mode; last mode remembered; folds closed with summaries";
  });

  await step("affiliate research: the app searches and reads pages (no AI browsing), the AI only summarizes quoted text, sourced facts, a price hint, real product pictures with credits", async () => {
    const SB = "https://smwealrfgnzxquqqscxs.supabase.co";
    const OFFICIAL = "https://www.aqualux.example/produk/termos-750";
    const STORE = "https://tokoresmi.example/aqualux-750";
    const OTHER = "https://lain.example/termos-aqualux";
    const orange = join(dir, "produk-asli.jpg");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=orange:s=1080x1920", "-frames:v", "1", orange]);
    const jpgBytes = readFileSync(orange);
    const PAGE_TEXT = "Termos Aqualux 750 ml\nKapasitas 750 ml dengan bahan stainless steel 304.\nTutup rapat anti bocor, menjaga minuman tetap dingin hingga 12 jam.\nTermos terbaik nomor 1 di Indonesia.";
    const seen = { searches: [], pages: [], images: [], extraction: [], other: [], failExtraction: false, blockSearch: false };
    const ctxR = await browser.newContext({ acceptDownloads: true });
    await ctxR.route("https://cdn.aqualux.example/**", r => r.fulfill({ status: 200, contentType: "image/jpeg", body: jpgBytes, headers: { "access-control-allow-origin": "*" } }));
    await ctxR.route(SB + "/**", async route => {
      const req = route.request(), u = new URL(req.url());
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, GET, OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const send = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      if (u.pathname === "/auth/v1/token") return send(200, { access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { email: "saya@contoh.id" } });
      if (u.pathname.startsWith("/rest/v1/")) return send(200, []);
      const m = JSON.parse(req.postData() ?? "{}");
      if (u.pathname === "/functions/v1/gemini") {
        if (m.action === "status") return send(200, { hasKey: true, provider: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-x" });
        const prompt = m.body.messages[0].content;
        seen.other.push(m.model);
        if (prompt.includes("HANYA dari teks halaman")) {
          seen.extraction.push(prompt);
          if (seen.failExtraction) return send(402, { error: { message: "insufficient credits" } });
          const facts = [
            { page: 0, text: "Bahan stainless steel 304", quote: "dengan bahan stainless steel 304" },
            { page: 0, text: "Tutup rapat anti bocor", quote: "Tutup rapat anti bocor" },
            { page: 0, text: "Tahan benturan keras", quote: "tahan benturan keras sekali" },
            { page: 0, text: "Termos terbaik nomor 1", quote: "Termos terbaik nomor 1 di Indonesia" },
          ];
          return send(200, { choices: [{ message: { content: JSON.stringify({ facts }) } }] });
        }
        const lines = ["Air cepat hangat saat kerja?", "Termos Aqualux muat 750 ml.", "Bahannya stainless steel 304.", "Cek keranjang kuning sekarang."];
        return send(200, { choices: [{ message: { content: JSON.stringify({ title: "Termos Aqualux", lines }) } }] });
      }
      if (u.pathname !== "/functions/v1/product") return send(404, {});
      if (m.action === "search") {
        seen.searches.push(m.query);
        if (seen.blockSearch) return send(502, { error: { status: "SEARCH_BLOCKED", message: "Mesin pencari membatasi pencarian otomatis saat ini." } });
        const hit = (url, title) => ({ title, url, host: new URL(url).hostname.replace(/^www\./, ""), snippet: "" });
        return send(200, { hits: [hit(OFFICIAL, "Aqualux Termos 750 ml"), hit(STORE, "Termos Aqualux - Toko Resmi"), hit("https://www.pinterest.com/pin/1", "Termos Aqualux"), hit(OTHER, "Termos Aqualux lain")] });
      }
      if (m.action === "page") {
        seen.pages.push(m.url);
        if (m.url.startsWith("https://tokoresmi.example")) return send(502, { error: { status: "PAGE_BLOCKED", message: "Situs menolak dibaca otomatis." } });
        const first = m.url === OFFICIAL || m.url === OFFICIAL + "/";
        return send(200, { page: { url: m.url, host: new URL(m.url).hostname, title: "Termos Aqualux 750 ml", brand: "Aqualux", description: "", price: first ? { amount: "89000", currency: "IDR" } : null,
          specs: first ? ["Kapasitas: 750 ml", "Warna: Hitam", "Garansi: 1 tahun"] : [], images: first ? ["https://cdn.aqualux.example/1.jpg", "https://cdn.aqualux.example/2.jpg"] : [], text: first ? PAGE_TEXT : "Halaman lain tentang termos dan botol minum untuk dijual di toko." } });
      }
      if (m.action === "image") { seen.images.push(m.url); return route.fulfill({ status: 200, headers: { ...cors, "content-type": "image/jpeg" }, body: jpgBytes }); }
      return send(400, {});
    });
    const p = await ctxR.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE); await openFolds(p);
    await p.getByTestId("voice-none").click();
    await p.getByTestId("duration").selectOption("15");
    await p.getByTestId("mode-affiliate").click();
    await p.getByTestId("cloud-open").click();
    await p.getByTestId("cloud-email").fill("saya@contoh.id");
    await p.getByTestId("cloud-password").fill("benar-sekali");
    await p.getByTestId("cloud-signin").click();
    await p.getByTestId("aff-product").fill("Termos Aqualux 750 ml");
    // A link that is not an address is called out and blocks nothing else.
    await p.getByTestId("aff-link").fill("termos aqualux");
    await p.getByTestId("aff-link-problem").waitFor({ timeout: 5000 });
    assert(await p.getByTestId("aff-research-run").isDisabled(), "research waits for a proper link");
    await p.getByTestId("aff-link").fill("www.aqualux.example/produk/termos-750");
    await p.getByTestId("aff-research-run").click();
    await p.getByTestId("aff-result").waitFor({ timeout: 15000 });
    // The app did the browsing: two searches, the pasted page first, the best other pages, never social media or a page twice.
    assert(seen.searches.length === 2 && /spesifikasi/.test(seen.searches[0]) && /specifications/.test(seen.searches[1]), `two searches by the app: ${seen.searches}`);
    assert(seen.pages[0] === OFFICIAL, `the pasted page (address completed) was read first: ${seen.pages[0]}`);
    assert(seen.pages.length === 3 && seen.pages.includes(STORE) && seen.pages.includes(OTHER) && !seen.pages.some(x => /pinterest/.test(x)), `best pages read, social media never: ${seen.pages}`);
    assert(seen.pages.filter(x => x.includes("aqualux.example")).length === 1, "the pasted page is not read a second time");
    // The AI only summarized: one ordinary request about the pages' text, and no web-search model or plugin.
    assert(seen.extraction.length === 1 && seen.extraction[0].includes("Kapasitas 750 ml dengan bahan stainless steel 304"), "the AI got the pages' text once");
    assert(seen.other.every(mod => mod === "google/gemini-x") && !/perplexity|plugins|web_search/.test(seen.extraction[0]), "the creator's normal model, no web search by the AI");
    assert(/menolak dibaca otomatis/.test(await p.getByTestId("aff-note").first().textContent()), "a page that refused is reported");
    assert(await p.getByTestId("aff-note").filter({ hasText: "1 ringkasan AI dibuang" }).count() === 1, "the summary without a real quote was dropped and reported");
    assert(/Merek: Aqualux/.test(await p.getByTestId("aff-brand").textContent()), "brand shown");
    // Facts with their sources and quotes; promotional and claim-like ones are held back.
    const facts = await p.getByTestId("aff-fact").allTextContents();
    const ticked = await p.locator('[data-testid="aff-fact"] input').evaluateAll(els => els.map(e => e.checked));
    const idx = t => facts.findIndex(x => x.includes(t));
    assert(idx("Kapasitas: 750 ml") === 0 && ticked[0], "the page's own specification comes first and is ticked");
    assert(ticked[idx("Bahan stainless steel 304")] && /Kutipan halaman: “dengan bahan stainless steel 304”/.test(facts[idx("Bahan stainless steel 304")]), "a quoted fact shows the page's own words and is ticked");
    assert(idx("Tahan benturan") === -1, "a fabricated quote never appears");
    assert(!ticked[idx("terbaik nomor 1")] && /Kata promosi/.test(facts[idx("terbaik nomor 1")]), "promotional wording is held back");
    assert(!ticked[idx("Garansi: 1 tahun")] && /Kata promosi atau klaim/.test(facts[idx("Garansi: 1 tahun")]), "a warranty line reads as a guarantee claim: not ticked by default");
    assert(facts.filter(x => /Bahan stainless steel 304/.test(x)).length === 1, "no duplicates");
    await p.getByTestId("aff-use-facts").click();
    const benefits = await p.getByTestId("aff-benefits").inputValue();
    assert(/Kapasitas: 750 ml/.test(benefits) && /Warna: Hitam/.test(benefits) && /Bahan stainless steel 304/.test(benefits) && /Tutup rapat anti bocor/.test(benefits), `ticked facts were added: ${benefits}`);
    assert(!/terbaik/.test(benefits) && !/Garansi/.test(benefits), "unticked facts were not added");
    // The price is only a hint until the creator uses it.
    assert(await p.getByTestId("aff-price").inputValue() === "", "the price is never filled in by itself");
    assert(/Rp 89\.000/.test(await p.getByTestId("aff-price-hint").textContent()), "the price hint shows what was found, in rupiah");
    await p.getByTestId("aff-use-price").click();
    assert(await p.getByTestId("aff-price").inputValue() === "Rp 89.000", "the price goes into the field when asked");
    // The script is written from these facts, then the product's own picture goes on its scenes.
    await p.getByTestId("aff-write").click();
    await p.getByTestId("aff-draft").waitFor({ timeout: 10000 });
    await p.getByTestId("aff-use").click();
    assert(await p.getByTestId("aff-image").count() === 2, "the page's pictures are offered");
    await p.getByTestId("aff-image").first().click();
    await p.getByTestId("aff-research-msg").filter({ hasText: "dipasang" }).waitFor({ timeout: 15000 });
    assert(seen.images.length === 1 && seen.images[0] === "https://cdn.aqualux.example/1.jpg", `the picture came through the server: ${seen.images}`);
    assert(/2 scene/.test(await p.getByTestId("aff-research-msg").textContent()), `message: ${await p.getByTestId("aff-research-msg").textContent()}`);
    assert(await p.locator(".scene-thumb").count() === 2, "two scenes got the product picture");
    const credit = p.getByTestId("scene-credit").first();
    assert(/Gambar: aqualux\.example/.test(await credit.textContent()), `credit names the source: ${await credit.textContent()}`);
    assert((await credit.locator("a").getAttribute("href")) === OFFICIAL, "the credit links to the page the picture came from");
    // When the AI cannot be used the pages' own specifications are still there; when the search is limited the pasted page still works.
    seen.failExtraction = true; seen.blockSearch = true;
    await p.getByTestId("aff-research-run").click();
    await p.getByTestId("aff-note").filter({ hasText: "AI tidak bisa merangkum" }).waitFor({ timeout: 15000 });
    assert(await p.getByTestId("aff-note").filter({ hasText: "membatasi pencarian" }).count() === 1, "the limited search engine is reported");
    assert(await p.getByTestId("aff-fact").count() >= 3, "the pasted page's own specifications are kept");
    assert(await p.getByTestId("aff-research-model").count() === 0, "there is no web-search model to set any more");
    // The product data is remembered.
    await p.reload();
    await until(async () => (await p.getByTestId("aff-link").inputValue()) === "www.aqualux.example/produk/termos-750", "the link is remembered");
    await until(async () => /Kapasitas: 750 ml/.test(await p.getByTestId("aff-benefits").inputValue()), "the facts are remembered");
    await ctxR.close();
    return `${seen.searches.length} searches by the app, ${seen.pages.length} pages read, the AI only summarized (1 fabricated quote dropped), price only on request, 1 real picture through the server on 2 scenes with credit, AI and search failures keep the pages' own facts`;
  });

  await step("the safe-zone guide is a preview-only overlay and text stays inside the safe area", async () => {
    const g = await browser.newPage();
    g.on("pageerror", e => pageErrors.push(e.message));
    await g.goto(BASE); await openFolds(g);
    await g.getByTestId("voice-none").click();
    assert(await g.getByTestId("safe-guide").count() === 0, "guide is off by default");
    await g.getByTestId("safe-guide-toggle").locator("input").check();
    await g.getByTestId("safe-guide").waitFor({ timeout: 5000 });
    await g.getByTestId("safe-guide-legend").waitFor({ timeout: 5000 });
    // Every fitted headline in the preview sits inside the 1080 px frame minus the 130 px side insets.
    const box = await g.locator(".player-wrap [data-family]").first().evaluate(el => { const r = el.getBoundingClientRect(), f = el.closest(".player-wrap").getBoundingClientRect(); return { left: (r.left - f.left) / f.width, right: (f.right - r.right) / f.width, top: (r.top - f.top) / f.height, bottom: (f.bottom - r.bottom) / f.height }; });
    assert(box.left >= 130 / 1080 - 0.01 && box.right >= 130 / 1080 - 0.01, `content keeps the side insets: ${JSON.stringify(box)}`);
    assert(box.top >= 220 / 1920 - 0.01 && box.bottom >= 380 / 1920 - 0.01, `content keeps the top and bottom insets: ${JSON.stringify(box)}`);
    await g.close();
  });

  await step("there is no limit on the number of scenes, and a long script still renders its timeline", async () => {
    const ctxL = await browser.newContext();
    const L = await ctxL.newPage();
    L.on("pageerror", e => pageErrors.push(e.message));
    await L.goto(BASE); await openFolds(L);
    await L.getByTestId("voice-none").click();
    const many = Array.from({ length: 60 }, (_, i) => `Kalimat nomor ${i + 1} di sini.`).join("\n");
    await L.getByTestId("script").fill(many);
    await until(async () => (await L.getByTestId("scene-item").count()) === 60, "60 scenes listed");
    assert(await L.getByTestId("blocker").count() === 0, `no blocker for 60 scenes: ${await L.getByTestId("blocker").allTextContents()}`);
    assert(!(await L.content()).includes("Batas 20 scene"), "the old limit message is gone");
    const badge = await L.locator(".preview-badge").innerText();
    assert(/\d+\.\ds/.test(badge), `the preview has a length: ${badge}`);
    // The player really plays it.
    await L.locator(".player-wrap").hover();
    await L.locator(".player-wrap button").first().click();
    await L.waitForTimeout(800);
    await ctxL.close();
    return `60 scenes accepted, ${badge.trim()}`;
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
