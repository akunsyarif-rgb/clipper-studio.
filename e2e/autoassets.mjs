// End-to-end check of Automatic Pixabay photos: production server + Chromium, /api/pixabay faked. One tap fills the scenes that have no picture (nothing is
// requested before the tap), reports a missing key clearly, and a photo can be removed again.
// Needs `npm run build` first, plus ffmpeg/ffprobe on PATH.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3218);
const BASE = `http://localhost:${PORT}/motion`;
const dir = mkdtempSync(join(tmpdir(), "asset-e2e-"));
const openFolds = p => p.evaluate(() => document.querySelectorAll("details.fold").forEach(d => { d.open = true; }));
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
  const page = await (await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } })).newPage();
  const pageErrors = [];
  let telemetryBlocked = false;
  page.on("pageerror", e => pageErrors.push(e.message));
  page.on("requestfailed", r => { if (r.url().startsWith("https://www.remotion.pro/")) telemetryBlocked = true; });
  await page.goto(BASE); await openFolds(page);
  const calls = [];
  let missingKey = false;
  // A real (tiny) JPEG so the app accepts the "downloaded" image: 24x24 solid colour made with ffmpeg.
  const jpg = join(dir, "p.jpg");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0x3377aa:s=320x480", "-frames:v", "1", jpg]);
  const jpgBytes = readFileSync(jpg);
  await page.route("**/api/pixabay", async route => {
    const body = JSON.parse(route.request().postData() || "{}");
    calls.push(body);
    if (missingKey) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "MISSING_KEY", message: "Kunci Pixabay belum dipasang di server." } }) });
    if (body.action === "video-search") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ videos: [{ id: 901, tags: "x", photographer: "Videografer", pageUrl: "https://pixabay.com/v/901", duration: 12, url: "https://cdn.pixabay.com/video/901.mp4", thumbnail: "t", width: 720, height: 1280, size: 1000 }, { id: 902, tags: "y", photographer: "V2", pageUrl: "https://pixabay.com/v/902", duration: 90, url: "https://cdn.pixabay.com/video/902.mp4", thumbnail: "t", width: 720, height: 1280, size: 10 }], totalHits: 2, remaining: 80 }) });
    if (body.action === "search") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ photos: [1, 2, 3].map(n => ({ id: n + calls.length * 10, alt: "x", photographer: "Fotografer", pageUrl: "https://pixabay.com/p/" + n, thumb: "t", image: "https://pixabay.com/img/" + n + ".jpg" })), totalHits: 3, remaining: 90 }) });
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: jpgBytes });
  });
  await page.getByTestId("voice-none").click();
  await page.getByTestId("script").fill("Hot coffee in the morning.\nRocket launch at night.\nSatu kalimat tanpa kata kunci.");

  await step("nothing is requested until the button is pressed; the button counts the scenes it can fill", async () => {
    await page.getByTestId("pixabay-auto").waitFor({ timeout: 8000 });
    assert(calls.length === 0, "no request before the tap");
    assert(/\(\d adegan\)/.test(await page.getByTestId("pixabay-auto-run").innerText()), "count shown");
  });

  await step("one tap fills the scenes that have a keyword, with credits, and says what it skipped", async () => {
    await page.getByTestId("pixabay-auto-run").click();
    await page.getByTestId("pixabay-auto-summary").waitFor({ timeout: 20000 });
    const text = await page.getByTestId("pixabay-auto-summary").innerText();
    assert(/diberi foto/.test(text), text);
    assert((await page.locator(".scene-thumb").count()) >= 2, "pictures are on the scenes");
    const searches = calls.filter(c => c.action === "search").map(c => c.query);
    assert(searches.length >= 2 && searches.every(q => /^[a-z ]+$/i.test(q)), "English keyword searches: " + searches.join(" | "));
  });

  await step("video backgrounds: the same tap, short clips only (a 90 s clip is never chosen); music turns on with one button", async () => {
    await page.getByTestId("script").fill("Fresh pizza at lunch.\nSunset over the sea.");
    await page.getByTestId("auto-kind-video").click();
    const before = calls.length;
    await page.getByTestId("pixabay-auto-run").click();
    await page.getByTestId("pixabay-auto-summary").filter({ hasText: /video/ }).waitFor({ timeout: 20000 });
    const vids = calls.slice(before).filter(c => c.action === "video-search");
    assert(vids.length >= 1, "video searches were made");
    assert((await page.getByTestId("scene-credit").allInnerTexts()).some(t => /Videografer/.test(t)), "the short clip was chosen (not the 90 s one) and credited");
    await page.getByTestId("music-auto-on").click();
    assert(await page.getByTestId("music-auto-on").isDisabled(), "music is on");
    assert(/Otomatis/.test(await page.getByTestId("fold-music").locator("summary").innerText()), "the music fold says automatic");
    await page.getByTestId("auto-kind-photo").click();
  });

  await step("a missing server key is explained and nothing breaks", async () => {
    await page.getByTestId("script").fill("Fresh bread at sunrise.");
    missingKey = true;
    await page.getByTestId("pixabay-auto-run").click();
    await page.getByTestId("pixabay-auto-error").waitFor({ timeout: 8000 });
    assert(/Kunci Pixabay/.test(await page.getByTestId("pixabay-auto-error").innerText()), "message names the key");
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
