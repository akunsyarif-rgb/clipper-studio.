// End-to-end check of picking pictures for scenes on a phone: the search results can be hidden and shown again (without a new search),
// the results are one swipeable row instead of a tall grid, the scene's picture row is laid out (no stray file input, the credit has
// room), "Lihat di pratinjau" brings the preview on screen, a stock clip (video) is drawn behind an ordinary scene, and the long
// analysis text of the scene list can be hidden. Production server + Chromium, /api/pixabay faked.
// Needs `npm run build` first, plus ffmpeg on PATH.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium, devices } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3227);
const BASE = `http://localhost:${PORT}/motion`;
const dir = mkdtempSync(join(tmpdir(), "img-results-e2e-"));
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
  // Real files so the app accepts the "downloaded" picture and the clip: a 640x960 test card and a 3 s VP8 clip (Playwright's Chromium has no H.264).
  const jpgPath = join(dir, "p.jpg"), webmPath = join(dir, "v.webm");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x960", "-frames:v", "1", jpgPath]);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=360x640:r=30", "-t", "3", "-c:v", "libvpx", "-b:v", "300k", webmPath]);
  const jpg = readFileSync(jpgPath), webm = readFileSync(webmPath);

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
  const pageErrors = [];
  let telemetryBlocked = false;
  page.on("pageerror", e => pageErrors.push(e.message));
  page.on("requestfailed", r => { if (r.url().startsWith("https://www.remotion.pro/")) telemetryBlocked = true; });
  const searches = [];
  await page.route("**/api/pixabay", async route => {
    const body = JSON.parse(route.request().postData() || "{}");
    searches.push(body.action);
    if (body.action === "search") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ photos: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: n, alt: "x" + n, photographer: "Fotografer", pageUrl: "https://pixabay.com/p/" + n, thumb: "https://cdn.pixabay.com/photo/t" + n + ".jpg", image: "https://cdn.pixabay.com/photo/i" + n + ".jpg" })), totalHits: 8 }) });
    if (body.action === "video-search") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ videos: [901, 902].map(id => ({ id, tags: "city", photographer: "Videografer", pageUrl: "https://pixabay.com/v/" + id, duration: 3, url: `https://cdn.pixabay.com/video/${id}.mp4`, thumbnail: `https://cdn.pixabay.com/video/t${id}.jpg`, width: 360, height: 640, size: 300000 })), totalHits: 2 }) });
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: jpg });
  });
  await page.route("https://cdn.pixabay.com/photo/**", r => r.fulfill({ status: 200, contentType: "image/jpeg", body: jpg, headers: { "access-control-allow-origin": "*" } }));
  await page.route("https://cdn.pixabay.com/video/t*.jpg", r => r.fulfill({ status: 200, contentType: "image/jpeg", body: jpg, headers: { "access-control-allow-origin": "*" } }));
  await page.route("https://cdn.pixabay.com/video/*.mp4", r => r.fulfill({ status: 200, contentType: "video/webm", body: webm, headers: { "access-control-allow-origin": "*", "accept-ranges": "bytes" } }));
  // Clip 902 is gone from the CDN: it must not break the preview.
  await page.route("https://cdn.pixabay.com/video/902.mp4", r => r.fulfill({ status: 404, body: "gone" }));

  await page.goto(BASE);
  await page.getByTestId("advanced-settings").evaluate(d => { d.open = true; });
  await page.getByTestId("script").fill("Hot coffee in the morning.\nRocket launch at night.\nCity lights glow.");
  await page.getByTestId("flow-dot-4").click(); // the pictures are step 4 (script, director and look, voice, pictures, render)

  await step("photo results are one swipeable row on a phone and can be hidden and shown again without a new search", async () => {
    await page.getByTestId("scene-image-pixabay").first().click();
    await page.getByTestId("pixabay-query").fill("coffee morning");
    await page.getByTestId("pixabay-search").click();
    await page.getByTestId("pixabay-photo-grid").waitFor();
    const h = (await page.getByTestId("pixabay-photo-grid").boundingBox()).height;
    assert(h < 260, `grid is a single row (height ${Math.round(h)} px)`);
    const before = searches.filter(a => a === "search").length;
    await page.getByTestId("pixabay-photo-toggle").click();
    assert(await page.getByTestId("pixabay-photo-grid").count() === 0, "results hidden");
    assert(/Tampilkan/.test(await page.getByTestId("pixabay-photo-toggle").innerText()), "the button now offers to show them");
    await page.getByTestId("pixabay-photo-toggle").click();
    assert(await page.getByTestId("pixabay-photo-grid").isVisible(), "results shown again");
    assert(searches.filter(a => a === "search").length === before, "no new search was made");
  });

  await step("a chosen picture: no stray file input, the credit has room, and 'Lihat di pratinjau' brings the preview on screen", async () => {
    await page.getByTestId("pixabay-photo-choice").first().click();
    await page.locator(".scene-thumb").first().waitFor();
    const row = page.getByTestId("scene-image").first();
    assert(!(await row.locator("input[type=file]").isVisible()), "the file input is not shown");
    const credit = await row.getByTestId("scene-credit").boundingBox();
    assert(credit.width > 150, `credit text has room (width ${Math.round(credit.width)} px)`);
    await page.getByTestId("scene-image-preview").first().click();
    await page.waitForFunction(() => { const b = document.querySelector(".player-wrap").getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; }, null, { timeout: 5000 });
  });

  await step("a stock clip is drawn behind an ordinary scene (not only over a source video)", async () => {
    await page.getByTestId("scene-video-pixabay").nth(1).scrollIntoViewIfNeeded();
    await page.getByTestId("scene-video-pixabay").nth(1).click();
    await page.getByTestId("pixabay-video-query").fill("city");
    await page.getByTestId("pixabay-video-search").click();
    await page.getByTestId("pixabay-video-toggle").waitFor();
    await page.getByTestId("pixabay-video-toggle").click();
    assert(await page.getByTestId("pixabay-video-grid").count() === 0, "video results can be hidden too");
    await page.getByTestId("pixabay-video-toggle").click();
    await page.getByTestId("pixabay-video-choice").first().click();
    await page.getByTestId("scene-image-preview").nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll(".player-wrap video, .player-wrap canvas").length > 0, null, { timeout: 8000 });
  });

  await step("a stock clip that cannot be loaded does not throw: the scene keeps its text and the preview stays up", async () => {
    await page.getByTestId("scene-video-pixabay").nth(2).scrollIntoViewIfNeeded();
    await page.getByTestId("scene-video-pixabay").nth(2).click();
    await page.getByTestId("pixabay-video-query").fill("city");
    await page.getByTestId("pixabay-video-search").click();
    await page.getByTestId("pixabay-video-toggle").waitFor();
    await page.getByTestId("pixabay-video-choice").nth(1).click();
    await page.getByTestId("scene-image-preview").nth(2).click();
    await page.waitForTimeout(2500);
    assert(await page.locator(".player-wrap").isVisible(), "the preview is still there");
  });

  await step("the long analysis text of the scene list is hidden by default, can be shown, and the whole list can be hidden", async () => {
    await page.getByTestId("scenes").scrollIntoViewIfNeeded();
    assert(!(await page.locator(".narrative-continuity").first().isVisible()), "detail is hidden by default");
    await page.getByTestId("scenes-detail-toggle").click();
    assert(await page.locator(".narrative-continuity").first().isVisible(), "detail can be shown");
    await page.getByTestId("scenes-toggle").click();
    assert(await page.getByTestId("scenes").count() === 0, "list hidden");
    await page.getByTestId("scenes-toggle").click();
    assert(await page.getByTestId("scenes").isVisible(), "list shown again");
  });

  await step("no uncaught page errors", async () => {
    const real = pageErrors.filter(m => !(telemetryBlocked && m === "Failed to fetch"));
    assert(real.length === 0, real.join(" | "));
  });
  await browser.close();
} catch (e) { failed = true; results.push("FAIL setup: " + (e instanceof Error ? e.stack : e)); } finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
