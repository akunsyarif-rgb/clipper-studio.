// The whole journey in one go: choose a video in the Clipper, export a clip, continue in the studio with that clip as the base video
// (nothing picked again), render it, check the MP4, and follow the hint to the Library. Production server + Chromium + ffmpeg.wasm.
// Needs `npm run build` first, plus ffmpeg/ffprobe on PATH.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3219);
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "journey-e2e-"));
const source = join(dir, "perjalanan.mp4");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=6", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
const results = [];
let failed = false;
async function step(name, fn) {
  const t = Date.now();
  try { const info = await fn(); results.push(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${info ? " — " + info : ""}`); }
  catch (err) { failed = true; results.push(`FAIL ${name}: ${err instanceof Error ? err.message : err}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const probe = file => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", file]).toString());

try {
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ acceptDownloads: true, viewport: { width: 820, height: 1180 } })).newPage();
  const pageErrors = [];
  let telemetryBlocked = false;
  page.on("pageerror", e => pageErrors.push(e.message));
  page.on("requestfailed", r => { if (r.url().startsWith("https://www.remotion.pro/")) telemetryBlocked = true; });

  await step("Clipper: choose a video and export a 3 s clip; the next step is offered", async () => {
    await page.goto(BASE);
    await page.getByTestId("file-input").setInputFiles(source);
    await page.getByText("00:00:06").first().waitFor({ timeout: 15000 });
    await page.getByTestId("quality-480").click();
    await page.getByTestId("aspect-9:16").click();
    await page.getByTestId("start").fill("00:00:01"); await page.getByTestId("end").fill("00:00:04");
    await page.getByTestId("export").click();
    await page.getByTestId("result").waitFor({ timeout: 120000 });
    await page.getByTestId("next-studio").waitFor({ timeout: 5000 });
    assert(/langkah berikutnya/i.test(await page.getByTestId("next-steps").innerText()), "the next-steps strip is shown");
  });

  await step("one tap continues in the studio with the clip as the base video, nothing chosen again", async () => {
    await page.getByTestId("next-studio").click();
    await page.waitForURL(/\/motion/, { timeout: 15000 });
    await page.getByText(/Klip dari Clipper dimuat/).first().waitFor({ timeout: 15000 });
    await page.locator("video").first().waitFor({ timeout: 10000 });
  });

  await step("studio: render the clip; the MP4 plays, 1080x1920, about the clip's length, with its sound", async () => {
    await page.getByTestId("voice-none").click();
    await page.getByTestId("render").click();
    await page.getByTestId("result").waitFor({ timeout: 300000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
    const out = join(dir, "studio.mp4");
    await dl.saveAs(out);
    const j = probe(out), v = j.streams.find(s => s.codec_type === "video"), a = j.streams.find(s => s.codec_type === "audio");
    assert(v.codec_name === "h264" && v.width === 1080 && v.height === 1920, `video ${v.codec_name} ${v.width}x${v.height}`);
    assert(Math.abs(Number(j.format.duration) - 3) < 1, `length follows the clip (3 s): ${j.format.duration}`);
    assert(a?.codec_name === "aac", "the clip's sound is kept");
    return `${Number(j.format.duration).toFixed(2)} s h264/aac`;
  });

  await step("studio: the next step points to the Library and the menu gets there", async () => {
    assert(/Library|Content Hub/.test(await page.getByTestId("next-steps").innerText()), "the hint names the Library");
    await page.getByTestId("nav-library").click();
    await page.waitForURL(/\/hub/, { timeout: 10000 });
    await page.getByTestId("app-nav").waitFor();
  });

  await step("no uncaught page errors", async () => {
    const real = pageErrors.filter(m => !(telemetryBlocked && m === "Failed to fetch"));
    assert(real.length === 0, real.join(" | "));
  });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
