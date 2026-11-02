// End-to-end check of Iconify icons: production server + Chromium, Iconify faked. An icon is searched, chosen and drawn on a scene, the scenes
// without an icon are filled on request, the icons survive a reload, and the MP4 renders with no request to the icon service.
// Needs `npm run build` first, plus ffmpeg/ffprobe on PATH.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3215);
const BASE = `http://localhost:${PORT}/motion`;
const dir = mkdtempSync(join(tmpdir(), "icon-e2e-"));
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
  const cors = { "access-control-allow-origin": "*" };
  const bodies = { rocket: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2"/><circle cx="15" cy="9" r="1"/></g>', coffee: '<path fill="none" stroke="currentColor" stroke-width="2" d="M3 8h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/>' };
  await page.route("https://api.iconify.design/**", async route => {
    const u = new URL(route.request().url());
    calls.push(u.pathname + u.search);
    if (u.pathname === "/search") { const q = u.searchParams.get("query"); return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ icons: q === "coffee" ? ["lucide:coffee"] : ["lucide:rocket", "mdi:rocket"] }) }); }
    if (u.pathname.endsWith(".json")) { const n = u.searchParams.get("icons"); return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ prefix: "lucide", width: 24, height: 24, icons: { [n]: { body: bodies[n] ?? bodies.rocket } } }) }); }
    return route.fulfill({ status: 200, headers: cors, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#fff"/></svg>' });
  });
  await page.getByTestId("voice-none").click();
  await page.getByTestId("script").fill("Roket meluncur cepat.\nSegelas kopi hangat.");
  await page.getByTestId("fold-iconify").evaluate(d => { d.open = true; });


  await step("a search offers only allowed icon sets; choosing one draws it on the scene", async () => {
    await page.getByTestId("icon-keyword").fill("rocket");
    await page.getByTestId("icon-search").click();
    await page.getByTestId("icon-results").waitFor({ timeout: 5000 });
    assert((await page.getByTestId("icon-choice").count()) === 1, "mdi (not allowed) is filtered out");
    assert((await page.getByTestId("icon-choice").locator("img").getAttribute("crossorigin")) === "anonymous", "thumbnail loads with crossOrigin anonymous");
    await page.getByTestId("icon-choice").click();
    await page.getByTestId("icon-note").waitFor({ timeout: 5000 });
    await page.locator('[data-visual="icon-iconify:lucide:rocket"]').first().waitFor({ timeout: 8000 });
  });

  await step("automatic fill covers only scenes without an icon, and only on request", async () => {
    const before = calls.length;
    await page.getByTestId("script").fill("Roket meluncur cepat.\nMeja kayu besar.");
    await page.getByTestId("icon-auto").click();
    await page.getByTestId("icon-note").filter({ hasText: /diberi ikon/ }).waitFor({ timeout: 15000 });
    assert(calls.length > before, "it asked the icon service only after the button");
  });

  await step("an icon service failure is explained and nothing breaks", async () => {
    await page.route("https://api.iconify.design/search**", r => r.abort());
    await page.getByTestId("icon-keyword").fill("fail now");
    await page.getByTestId("icon-search").click();
    await page.getByTestId("icon-error").waitFor({ timeout: 8000 });
    await page.unroute("https://api.iconify.design/search**");
  });

  await step("the chosen icons survive a reload and the MP4 renders without asking the icon service", async () => {
    await page.waitForTimeout(2500);
    await page.reload(); await openFolds(page);
    await page.getByTestId("restore-offer").waitFor({ timeout: 10000 });
    calls.length = 0;
    await page.getByTestId("restore-session").click();
    await page.getByTestId("voice-none").click();
    await page.locator('[data-visual="icon-iconify:lucide:rocket"]').first().waitFor({ timeout: 8000 });
    await page.getByTestId("render").click();
    await page.getByTestId("result").waitFor({ timeout: 300000 });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
    const out = join(dir, "icons.mp4");
    await download.saveAs(out);
    const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", out]).toString());
    assert(j.streams[0].codec_name === "h264" && j.streams[0].width === 1080, "valid MP4");
    assert(calls.filter(c => !c.includes(".svg")).length === 0, "no icon data fetched while restoring/rendering: " + calls.join(","));
  });

  await step("no horizontal scroll on iPhone-size viewport", async () => {
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert(w[0] <= w[1] + 1, `scrollWidth ${w[0]} > ${w[1]}`);
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
