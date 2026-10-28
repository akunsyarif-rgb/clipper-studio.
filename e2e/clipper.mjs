// End-to-end check of the real export path: production server + Chromium + ffmpeg.wasm.
// Needs `npm run build` first, plus ffmpeg/ffprobe on PATH to create and verify fixture videos.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// Uses whatever Playwright is resolvable (global install or devDependency).
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = Number(process.env.E2E_PORT || 3210);
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "clipper-e2e-"));
const source = join(dir, "sample clip.mp4");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=12", "-f", "lavfi", "-i", "sine=frequency=330:duration=12",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
const notVideo = join(dir, "notes.txt");
writeFileSync(notVideo, "hello");

function probe(file) {
  const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration,format_name", "-of", "json", file]).toString());
  const v = out.streams.find(s => s.codec_type === "video");
  const a = out.streams.find(s => s.codec_type === "audio");
  return { duration: Number(out.format.duration), width: v?.width, height: v?.height, video: v?.codec_name, audio: a?.codec_name, format: out.format.format_name };
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
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", e => consoleErrors.push(e.message));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.goto(BASE);

  await step("rejects a non-video file", async () => {
    await page.getByTestId("file-input").setInputFiles(notVideo);
    await page.getByTestId("message").filter({ hasText: "Pilih berkas video" }).waitFor({ timeout: 5000 });
  });

  await step("loads a local video and reads its duration", async () => {
    await page.getByTestId("file-input").setInputFiles(source);
    await page.getByText("00:00:12").first().waitFor({ timeout: 15000 });
    assert(await page.getByTestId("end").inputValue() === "00:00:12", "end should clamp to the 12 s source");
  });

  await step("the video and cut settings survive a visit to the motion studio and back", async () => {
    await page.getByTestId("start").fill("00:00:02");
    await page.getByTestId("end").fill("00:00:09");
    await page.getByTestId("aspect-1:1").click();
    await page.getByTestId("motion-link").click();
    await page.waitForURL(/\/motion/, { timeout: 10000 });
    await page.getByRole("link", { name: /clipper/i }).first().click();
    await page.waitForURL(u => !u.pathname.startsWith("/motion"), { timeout: 10000 });
    await page.getByTestId("end").waitFor({ timeout: 10000 });
    await page.getByText("dipulihkan").first().waitFor({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelector("video")?.duration > 0, null, { timeout: 15000 });
    assert(await page.getByTestId("start").inputValue() === "00:00:02" && await page.getByTestId("end").inputValue() === "00:00:09", "cut range is kept");
    // Restore the defaults the following steps expect.
    await page.getByTestId("aspect-9:16").click();
    await page.getByTestId("start").fill("00:00:00");
    await page.getByTestId("end").fill("00:00:12");
  });

  await step("blocks an invalid range", async () => {
    await page.getByTestId("start").fill("00:00:08");
    await page.getByTestId("end").fill("00:00:04");
    await page.getByTestId("export").click();
    await page.getByTestId("message").filter({ hasText: "setelah waktu mulai" }).waitFor({ timeout: 3000 });
    assert(!(await page.getByTestId("progress").isVisible()), "export must not start");
  });

  async function exportAndCheck(label, { start, end, aspect, quality, fit, width, height }) {
    await page.getByTestId("start").fill(start);
    await page.getByTestId("end").fill(end);
    await page.getByTestId("aspect-" + aspect).click();
    await page.getByTestId("quality-" + quality).click();
    await page.getByTestId("fit-" + fit).click();
    await page.getByTestId("export").click();
    await page.getByTestId("result").waitFor({ timeout: 240000 });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
    const out = join(dir, label + ".mp4");
    await download.saveAs(out);
    const p = probe(out);
    const expected = Number(execFileSync("node", ["-e", `const t=s=>s.split(":").reduce((a,n)=>a*60+Number(n),0);console.log(t(${JSON.stringify(end)})-t(${JSON.stringify(start)}))`]).toString());
    assert(p.video === "h264" && p.audio === "aac", `codecs ${p.video}/${p.audio}`);
    assert(p.width === width && p.height === height, `size ${p.width}x${p.height}, expected ${width}x${height}`);
    assert(Math.abs(p.duration - expected) < 0.25, `duration ${p.duration}, expected ${expected}`);
    // The browser must be able to play the file it produced.
    const playable = await page.evaluate(async () => {
      const v = document.querySelector(".result-video");
      if (!v) return "no result video";
      if (v.readyState < 1) await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("media error")); setTimeout(() => rej(new Error("timeout")), 10000); });
      return `${v.videoWidth}x${v.videoHeight} ${v.duration.toFixed(2)}s`;
    });
    assert(playable.startsWith(`${width}x${height}`), `browser playback: ${playable}`);
    return `${download.suggestedFilename()} ${p.width}x${p.height} ${p.duration.toFixed(2)}s ${p.video}/${p.audio}, plays in browser`;
  }

  await step("exports 9:16 480p pad (first run loads engine)", () => exportAndCheck("a", { start: "00:00:02", end: "00:00:05", aspect: "9:16", quality: "480", fit: "pad", width: 480, height: 854 }));
  await step("exports 16:9 720p blur", () => exportAndCheck("b", { start: "1.5", end: "4", aspect: "16:9", quality: "720", fit: "blur", width: 1280, height: 720 }));
  await step("exports 1:1 480p crop", () => exportAndCheck("c", { start: "0:06", end: "0:09", aspect: "1:1", quality: "480", fit: "crop", width: 480, height: 480 }));

  await step("cancels a running export and retries it", async () => {
    await page.getByTestId("start").fill("0");
    await page.getByTestId("end").fill("12");
    await page.getByTestId("aspect-9:16").click();
    await page.getByTestId("quality-1080").click();
    await page.getByTestId("fit-blur").click();
    await page.getByTestId("export").click();
    await page.getByTestId("progress").waitFor({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await page.getByTestId("cancel").click();
    await page.getByTestId("message").filter({ hasText: "dibatalkan" }).waitFor({ timeout: 10000 });
    assert(!(await page.getByTestId("result").isVisible()), "no result after cancel");
    await page.getByTestId("quality-480").click();
    await page.getByTestId("retry").click();
    await page.getByTestId("result").waitFor({ timeout: 240000 });
    return "retry after cancel produced a result";
  });

  await step("no horizontal scroll on iPhone-size viewport", async () => {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await phone.goto(BASE);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 0, `page overflows by ${overflow}px`);
    await phone.screenshot({ path: join(process.env.E2E_SHOTS || dir, "clipper-mobile.png"), fullPage: true });
    await phone.close();
  });

  await step("no uncaught page errors", async () => { assert(consoleErrors.length === 0, consoleErrors.join(" | ")); });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
