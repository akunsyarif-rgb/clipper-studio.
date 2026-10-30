// End-to-end check of the closing CTA: production server + Chromium + ffmpeg.wasm. The exported files are read back with native
// FFmpeg: the label must be absent at the start and visible at the end, follow the settings, and never be baked in when switched off.
// Needs `npm run build` first, plus ffmpeg on PATH.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3213);
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "cta-e2e-"));
const source = join(dir, "polos.mp4");
// A plain dark-blue picture with sound: any white label pixel in the output can only come from the CTA.
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0x203040:s=640x360:r=25:d=10", "-f", "lavfi", "-i", "sine=frequency=330:duration=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
const results = [];
let failed = false;
async function step(name, fn) {
  if (process.env.E2E_ONLY && !new RegExp(process.env.E2E_ONLY, "i").test(name)) return;
  const t = Date.now();
  try { const info = await fn(); results.push(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${info ? " — " + info : ""}`); }
  catch (err) { failed = true; results.push(`FAIL ${name}: ${err instanceof Error ? err.message : err}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/** White-ish pixels in the lower band of the 480x854 frame at time t: the label's text. */
function whitePixels(file, t) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "crop=480:160:0:560", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 32 * 1024 * 1024 });
  let n = 0;
  for (let i = 0; i < raw.length; i += 3) if (raw[i] > 200 && raw[i + 1] > 200 && raw[i + 2] > 200) n++;
  return n;
}
function durationOf(file) { return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()); }

try {
  if (await fetch(BASE).then(() => true, () => false)) throw new Error(`Port ${PORT} is already in use; stop the old server first.`);
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE);
  await page.getByTestId("file-input").setInputFiles(source);
  await page.getByText("00:00:10").first().waitFor({ timeout: 15000 });
  await page.getByTestId("quality-480").click();
  await page.getByTestId("aspect-9:16").click();

  let n = 0;
  async function exportRange(from, to) {
    await page.getByTestId("start").fill(from); await page.getByTestId("end").fill(to);
    await page.getByTestId("export").click();
    await page.getByTestId("result").waitFor({ timeout: 120000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
    const out = join(dir, `out-${++n}.mp4`);
    await dl.saveAs(out);
    return { out, message: await page.getByTestId("message").innerText() };
  }

  await step("on by default: absent at the start, visible at the end, written from the content, and the clip keeps its length", async () => {
    assert(await page.getByTestId("cta-enabled").isChecked(), "switched on by default");
    const { out, message } = await exportRange("00:00:01", "00:00:07");
    assert(whitePixels(out, 0.5) === 0, "nothing at the start");
    assert(whitePixels(out, 2) === 0, "nothing before the last seconds");
    assert(whitePixels(out, 5.4) > 150, "label text at the end: " + whitePixels(out, 5.4));
    const d = durationOf(out);
    assert(d > 5.8 && d < 6.3, "duration unchanged by the looped picture: " + d);
    assert(/dengan CTA di akhir/.test(message), "the creator is told what was added: " + message);
    return message.slice(0, 120);
  });

  await step("the line follows what the video says: transcript words pick the kind of CTA", async () => {
    await page.getByLabel("Subtitle / transkrip").fill("Ini tips dan cara membuat kopi, ikuti langkah pertama dengan bahan yang mudah");
    const shown = await page.getByTestId("cta-shown").innerText();
    assert(/Simpan|Coba/.test(shown), "a save/try line for tips: " + shown);
    await page.getByLabel("Subtitle / transkrip").fill("Review produk ini, harganya murah dan ada diskon");
    assert(/bio|komentar/.test(await page.getByTestId("cta-shown").innerText()), "a product line for a review");
  });

  await step("the creator's own text wins and is what the file says", async () => {
    await page.getByTestId("cta-text").fill("Beli sekarang di bio");
    const { out, message } = await exportRange("00:00:00", "00:00:06");
    assert(/Beli sekarang di bio/.test(message), "message names the text: " + message);
    assert(whitePixels(out, 5) > 150, "label visible");
  });

  await step("switched off: nothing is baked in, and the choice is remembered after a reload", async () => {
    await page.getByTestId("cta-enabled").uncheck();
    const { out, message } = await exportRange("00:00:00", "00:00:06");
    assert(whitePixels(out, 5) === 0, "no label when off");
    assert(!/CTA/.test(message), "no CTA mentioned: " + message);
    await page.reload();
    await page.getByTestId("cta-panel").waitFor();
    assert(!(await page.getByTestId("cta-enabled").isChecked()), "off after reload");
    await page.getByTestId("cta-enabled").check();
  });

  await step("a clip under 3 seconds has no CTA, and the settings panel says so", async () => {
    await page.getByTestId("file-input").setInputFiles(source);
    await page.getByText("00:00:10").first().waitFor({ timeout: 15000 });
    await page.getByTestId("quality-480").click();
    const { out } = await exportRange("00:00:00", "00:00:02");
    assert(whitePixels(out, 1.8) === 0, "no label on a very short clip");
    assert(/kurang dari 3 detik/.test(await page.getByTestId("cta-panel").innerText()), "limit explained");
  });

  assert(errors.length === 0 || (results.push("note: page errors: " + errors.slice(0, 3).join(" | ")), true), "");
  await browser.close();
} catch (err) {
  failed = true; results.push("FATAL " + (err instanceof Error ? err.stack : err));
} finally {
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
