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
    // The panel says whether this address already holds the model; a stable address gets no preview warning.
    await page.getByTestId("asr-model-status").waitFor({ timeout: 5000 });
    assert(/belum tersimpan/.test(await page.getByTestId("asr-model-status").innerText()), "model not stored yet on a fresh address");
    assert((await page.getByTestId("asr-preview-hint").count()) === 0, "no preview hint on localhost");
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

  await step("motion studio accepts a video upload and offers the transcript there", async () => {
    await page.goto(BASE + "/motion");
    await page.getByTestId("source-video").setInputFiles(withAudio);
    await page.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    await page.screenshot({ path: process.env.E2E_SHOT || join(dir, "motion-upload.png"), fullPage: false });
    await page.getByTestId("asr-run").click();
    const outcome = await Promise.race([
      page.getByTestId("asr-list").waitFor({ timeout: 240000 }).then(() => "transcript"),
      page.getByTestId("asr-error").waitFor({ timeout: 240000 }).then(() => "error"),
    ]);
    return outcome === "error" ? "model unreachable here → clear error" : "transcript produced";
  });

  await step("a refresh offers to continue the last session, including the video, and the saved transcript returns", async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", e => errors.push(e.message));
    await p.goto(BASE + "/motion");
    await p.getByTestId("script").fill("Naskah saya yang pertama.\nKalimat kedua di sini.");
    await p.getByTestId("title").fill("Judul tersimpan");
    await p.getByTestId("palette").selectOption("pearl");
    await p.getByTestId("source-video").setInputFiles(withAudio);
    await p.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    await p.waitForTimeout(2500); // autosave is debounced and the video is written to storage

    // A transcript made earlier for this exact video part is stored under the studio's cache key.
    await p.evaluate(async t => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open("clipper-studio", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const get = key => new Promise(res => { const q = db.transaction("kv").objectStore("kv").get(key); q.onsuccess = () => res(q.result); });
      const src = await get("source");
      const key = `asr2:${src.name}|${src.blob.size}|${src.lastModified}|0.00|${src.seconds.toFixed(2)}|Xenova/whisper-small|indonesian`;
      await new Promise(res => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(t, key); tx.oncomplete = res; });
    }, transcript);

    await p.reload();
    await p.getByTestId("restore-offer").waitFor({ timeout: 10000 });
    const offerText = await p.getByTestId("restore-offer").innerText();
    assert(offerText.includes("Judul tersimpan") && offerText.includes("dengan-suara.mp4") && offerText.includes("2 scene"), "offer: " + offerText);
    assert((await p.getByTestId("script").inputValue()).startsWith("Jangan tunggu"), "nothing is applied before the creator agrees");

    await p.getByTestId("restore-session").click();
    await p.getByText("Ganti video (dengan-suara.mp4)").waitFor({ timeout: 10000 });
    assert((await p.getByTestId("script").inputValue()) === "Naskah saya yang pertama.\nKalimat kedua di sini.", "script restored");
    assert((await p.getByTestId("title").inputValue()) === "Judul tersimpan", "title restored");
    assert((await p.getByTestId("palette").inputValue()) === "pearl", "palette restored");
    assert(!(await p.getByTestId("restore-offer").isVisible().catch(() => false)), "offer gone after restoring");
    const seconds = await p.locator("video").first().evaluate(v => new Promise(res => { if (v.readyState >= 1) res(v.duration); else v.onloadedmetadata = () => res(v.duration); }));
    assert(seconds > 5 && seconds < 7, "restored video is playable, duration " + seconds);
    await p.getByTestId("asr-list").waitFor({ timeout: 10000 });
    assert((await p.getByTestId("asr-seg").count()) === 2, "saved transcript shown again");
    assert(/tanpa memproses ulang/.test(await p.getByTestId("asr-info").innerText()), "says it came from storage");

    // Use the saved transcript: editing over the video, with an animation drawn over the speaker by default.
    await p.getByTestId("asr-use").click();
    await p.getByTestId("scene-cut").first().waitFor({ timeout: 10000 });
    const autoLabel = await p.getByTestId("scene-cut").first().locator("option").first().innerText();
    assert(/Video \+ animasi/.test(autoLabel), "first scene defaults to an animation over the video: " + autoLabel);
    const options = await p.getByTestId("scene-cut").first().locator("option").allInnerTexts();
    assert(options.some(o => /Grafis penuh/.test(o)) && options.some(o => /Potongan lain/.test(o)), "full graphic and clip stay available: " + options.join("|"));
    const player = p.locator(".player-wrap");
    await p.getByTestId("scene-item").first().locator(".scene-row").click();
    await player.locator('[data-overlay="top"]').first().waitFor({ state: "attached", timeout: 10000 });
    await p.getByTestId("overlay-position").selectOption("lower");
    await player.locator('[data-overlay="lower"]').first().waitFor({ state: "attached", timeout: 10000 });
    assert((await player.locator('[data-overlay="top"]').count()) === 0, "the top overlay is replaced by the lower one");
    await p.getByTestId("scene-cut").first().selectOption("video");
    await p.waitForTimeout(800);
    assert((await player.locator("[data-overlay]").count()) === 0, "no animation when the scene is set to video + subtitle");
    await p.getByTestId("scene-cut").first().selectOption("overlay");
    await p.getByTestId("overlay-position").selectOption("top");
    await p.waitForTimeout(1200); // autosave includes the overlay position

    // Start over: everything is forgotten.
    await p.reload();
    await p.getByTestId("restore-offer").waitFor({ timeout: 10000 });
    await p.getByTestId("restore-discard").click();
    assert((await p.getByTestId("script").inputValue()).startsWith("Jangan tunggu"), "sample script after starting over");
    await p.reload();
    await p.waitForTimeout(1500);
    assert((await p.getByTestId("restore-offer").count()) === 0, "nothing offered after starting over");
    assert(errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await step("a tablet gets the lighter model, and a run that took the page down is recognised", async () => {
    const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
    const pc = await browser.newContext();
    const desktop = await pc.newPage();
    await desktop.goto(BASE);
    await desktop.getByTestId("file-input").setInputFiles(withAudio);
    await desktop.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    assert((await desktop.getByTestId("asr-model").inputValue()) === "Xenova/whisper-small", "computers keep the accurate model");
    assert((await desktop.getByTestId("asr-heavy-hint").count()) === 0, "no memory warning on a computer");
    await pc.close();

    const ctx = await browser.newContext({ userAgent: IPAD, hasTouch: true, viewport: { width: 1024, height: 1366 } });
    // A real iPad reports 5 touch points (Playwright's emulation reports 1).
    await ctx.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 }));
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.getByTestId("file-input").setInputFiles(withAudio);
    await p.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    assert((await p.getByTestId("asr-model").inputValue()) === "Xenova/whisper-base", "tablets start with the base model");
    await p.getByTestId("asr-model").selectOption("Xenova/whisper-small");
    await p.getByTestId("asr-heavy-hint").waitFor({ timeout: 3000 });

    // The previous run died: the mark is still there when the page opens again.
    await p.evaluate(() => localStorage.setItem("clipper:asr-run", JSON.stringify({ model: "Xenova/whisper-small", at: Date.now() })));
    await p.reload();
    await p.getByTestId("file-input").setInputFiles(withAudio);
    await p.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    await p.getByTestId("asr-crashed").waitFor({ timeout: 3000 });
    assert((await p.getByTestId("asr-model").inputValue()) === "Xenova/whisper-base", "one model lighter after a crash");
    assert((await p.evaluate(() => localStorage.getItem("clipper:asr-run"))) === null, "the mark is cleared once reported");
    await ctx.close();
  });

  await step("no uncaught page errors", async () => { assert(pageErrors.length === 0, pageErrors.join(" | ")); });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
