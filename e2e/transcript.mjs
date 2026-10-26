// End-to-end check of the auto-transcript flow: production server + Chromium + FFmpeg WASM.
// Needs `npm run build` first and ffmpeg on PATH for the fixtures. The Whisper model is downloaded from the
// Hugging Face Hub; when that host is unreachable (sandbox/CI), the test checks the clear error instead of a transcript.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3212);
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "transcript-e2e-"));
const withAudio = join(dir, "dengan-suara.mp4");
const silent = join(dir, "tanpa-suara.mp4");
const common = ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=6"];
execFileSync("ffmpeg", [...common, "-f", "lavfi", "-i", "sine=frequency=300:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", withAudio]);
execFileSync("ffmpeg", [...common, "-c:v", "libx264", "-pix_fmt", "yuv420p", silent]);

const words = [["Jangan", 0.2], ["tunggu", 0.6], ["semangat", 1.0], ["datang.", 1.6], ["Mulailah", 3.0], ["sekarang", 3.6]]
  .map(([text, start], i, a) => ({ text, start, end: a[i + 1] ? a[i + 1][1] : 4.4 }));
const transcript = { language: "id", granularity: "word", duration: 5, segments: [
  { start: 0.2, end: 2.2, text: "Jangan tunggu semangat datang.", words: words.slice(0, 4) },
  { start: 3, end: 4.4, text: "Mulailah sekarang", words: words.slice(4) },
] };

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
  for (let i = 0; i < 60 && !(await fetch(BASE).then(() => true, () => false)); i++) await new Promise(r => setTimeout(r, 500));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));

  await step("transcript panel appears after choosing a video", async () => {
    await page.goto(BASE);
    assert(!(await page.getByTestId("asr-panel").isVisible()), "panel hidden before upload");
    await page.getByTestId("file-input").setInputFiles(withAudio);
    await page.getByTestId("asr-panel").waitFor({ timeout: 10000 });
  });

  await step("audio is extracted locally, then transcript or a clear model error is shown", async () => {
    await page.getByText("Video siap").waitFor({ timeout: 15000 });
    await page.getByTestId("asr-run").click();
    await page.getByTestId("asr-progress").waitFor({ timeout: 10000 });
    const outcome = await Promise.race([
      page.getByTestId("asr-list").waitFor({ timeout: 240000 }).then(() => "transcript"),
      page.getByTestId("asr-error").waitFor({ timeout: 240000 }).then(() => "error"),
    ]);
    if (outcome === "error") {
      const text = await page.getByTestId("asr-error").innerText();
      assert(/Model ucapan gagal diunduh|Transkripsi gagal|Tidak ada ucapan/.test(text), "unexpected error text: " + text);
      assert(!(await page.getByTestId("asr-progress").isVisible()), "progress cleared after error");
      assert(await page.getByTestId("asr-run").isEnabled(), "can retry after error");
      return "model unreachable here → " + text.slice(0, 60);
    }
    assert((await page.getByTestId("asr-seg").count()) > 0, "segments listed");
    return "transcript produced";
  });

  await step("video without audio gives a clear message", async () => {
    await page.reload();
    await page.getByTestId("file-input").setInputFiles(silent);
    await page.getByText("Video siap").waitFor({ timeout: 15000 });
    await page.getByTestId("asr-run").click();
    await page.getByTestId("asr-error").waitFor({ timeout: 120000 });
    const text = await page.getByTestId("asr-error").innerText();
    assert(/tidak memiliki suara/.test(text), "message: " + text);
  });

  await step("motion studio imports the transcript with word timing", async () => {
    await page.goto(BASE + "/motion");
    await page.evaluate(t => sessionStorage.setItem("clipper:transcript:v1", JSON.stringify({ v: 1, source: "dengan-suara.mp4", transcript: t })), transcript);
    await page.reload();
    await page.getByTestId("transcript-offer").waitFor({ timeout: 10000 });
    await page.getByTestId("transcript-import").click();
    assert((await page.getByTestId("script").inputValue()) === "Jangan tunggu semangat datang.\nMulailah sekarang", "script from transcript");
    await page.getByTestId("transcript-status").filter({ hasText: "mengikuti waktu kata" }).waitFor({ timeout: 5000 });
    await page.getByTestId("script").fill("Naskah lain sama sekali");
    await page.getByTestId("transcript-status").filter({ hasText: "sudah diubah" }).waitFor({ timeout: 5000 });
  });

  await step("no uncaught page errors", async () => { assert(pageErrors.length === 0, pageErrors.join(" | ")); });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
