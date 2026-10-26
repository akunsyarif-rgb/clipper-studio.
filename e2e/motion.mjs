// End-to-end check of /motion: production server + Chromium + @remotion/web-renderer.
// Needs `npm run build` first, plus ffmpeg/ffprobe on PATH to create the narration fixture and verify the MP4.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
const notAudio = join(dir, "catatan.txt");
writeFileSync(notAudio, "bukan audio");

function probe(file) {
  const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration", "-of", "json", file]).toString());
  const v = out.streams.find(s => s.codec_type === "video");
  const a = out.streams.find(s => s.codec_type === "audio");
  return { duration: Number(out.format.duration), width: v?.width, height: v?.height, fps: v?.r_frame_rate, video: v?.codec_name, audio: a?.codec_name ?? null };
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
  const browser = await chromium.launch();
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

  await step("rejects a non-audio file", async () => {
    await page.getByTestId("script").fill("Halo semua.\nIni video uji dengan narasi.\nDurasi mengikuti audio.");
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
    await page.getByText("6.0 dtk · durasi video mengikuti audio").waitFor({ timeout: 10000 });
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
