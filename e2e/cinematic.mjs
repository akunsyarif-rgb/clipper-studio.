// End-to-end check of Cinematic Studio: production server + Chromium. A brief becomes a beat-aligned storyboard, is applied to the
// studio (script, look, motion presets, scene lengths), survives a reload, and renders to an MP4 whose length matches the beat plan.
// Needs `npm run build` first, plus ffmpeg/ffprobe on PATH.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3214);
const BASE = `http://localhost:${PORT}/motion`;
const dir = mkdtempSync(join(tmpdir(), "cine-e2e-"));
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
  await page.getByTestId("fold-cinematic").evaluate(d => { d.open = true; });

  let planned = 0;
  await step("an empty brief is refused; a brief builds a storyboard with a beat map and no blocking issue", async () => {
    await page.getByTestId("cine-build").click();
    await page.getByTestId("cine-error").waitFor({ timeout: 3000 });
    await page.getByTestId("cine-product").fill("Nova");
    await page.getByTestId("cine-tagline").fill("Satu ketukan untuk semuanya.");
    await page.getByTestId("cine-problem").fill("Terlalu banyak aplikasi.");
    await page.getByTestId("cine-features").fill("Cepat dan responsif.\nAman sejak awal.");
    await page.getByTestId("cine-proof").fill("Dipakai 10.000 tim.");
    await page.getByTestId("cine-cta").fill("Coba gratis hari ini.");
    await page.getByTestId("cine-seconds").selectOption("15");
    await page.getByTestId("cine-build").click();
    await page.getByTestId("cine-list").waitFor({ timeout: 3000 });
    planned = await page.getByTestId("cine-list").locator("li").count();
    assert(planned === 7, "hook, problem, reveal, 2 features, proof, cta = 7, got " + planned);
    assert(/60 BPM/.test(await page.getByTestId("cine-beat").innerText()), "cinematic tempo");
    const issues = await page.getByTestId("cine-issues").innerText().catch(() => "");
    assert(!/⛔/.test(issues), "no blocking issue: " + issues);
    return issues.replace(/\s+/g, " ");
  });

  await step("applying it sets the script, look and one motion preset per scene", async () => {
    await page.getByTestId("cine-apply").click();
    await page.getByTestId("cine-clear").waitFor({ timeout: 3000 });
    const script = await page.getByTestId("script").inputValue();
    assert(script.split("\n").length === planned && script.startsWith("Satu ketukan"), "script from the brief: " + script.slice(0, 40));
    assert((await page.getByTestId("style").inputValue()) === "cinematic" && (await page.getByTestId("palette").inputValue()) === "obsidian", "concept look applied");
    assert((await page.getByTestId("typography").inputValue()) === "modern", "one type family");
    const fxs = await page.getByTestId("cine-fx").evaluateAll(els => els.map(e => e.value));
    assert(fxs.length === planned && fxs[0] !== "morph", "a preset per scene, no morph first: " + fxs);
    return fxs.join(",");
  });

  await step("a new storyboard can replace an already active cinematic plan", async () => {
    await page.getByTestId("cine-product").fill("Nova Studio");
    await page.getByTestId("cine-tagline").fill("Kreasi tanpa batas.");
    await page.getByTestId("cine-build").click();
    assert((await page.getByTestId("cine-list").innerText()).includes("Kreasi tanpa batas."), "new draft is visible while cinematic mode is active");
    const apply = page.getByTestId("cine-apply");
    assert(await apply.isVisible(), "update action is available");
    assert((await apply.innerText()).includes("Perbarui"), "action is labelled as an update");
    await apply.click();
    assert((await page.getByTestId("script").inputValue()).startsWith("Kreasi tanpa batas."), "new plan replaces the active script");
    return "active plan updated without clearing cinematic mode";
  });

  await step("the plan survives a reload (offered back with the session)", async () => {
    await page.waitForTimeout(2500); // autosave is debounced
    await page.reload(); await openFolds(page);
    await page.getByTestId("restore-offer").waitFor({ timeout: 10000 });
    await page.getByTestId("restore-session").click();
    await page.getByTestId("fold-cinematic").evaluate(d => { d.open = true; });
    await page.getByTestId("cine-clear").waitFor({ timeout: 10000 });
    assert((await page.getByTestId("cine-list").locator("li").count()) === planned, "same storyboard after reload");
    assert((await page.getByTestId("cine-product").inputValue()) === "Nova Studio", "product brief restored");
    assert((await page.getByTestId("cine-tagline").inputValue()) === "Kreasi tanpa batas.", "tagline restored");
    assert((await page.getByTestId("cine-problem").inputValue()) === "Terlalu banyak aplikasi.", "problem restored");
    assert((await page.getByTestId("cine-features").inputValue()).includes("Cepat dan responsif."), "features restored");
    assert((await page.getByTestId("cine-proof").inputValue()) === "Dipakai 10.000 tim.", "proof restored");
    assert((await page.getByTestId("cine-cta").inputValue()) === "Coba gratis hari ini.", "CTA restored");
    const acts = await page.getByTestId("cine-list").locator("li").evaluateAll(els => els.map(el => el.getAttribute("data-act")));
    assert(acts.join(",") === "hook,problem,reveal,feature,feature,proof,cta", "scene act roles restored: " + acts.join(","));
  });

  await step("renders an MP4 as long as the beat plan, with the automatic cinematic backsound", async () => {
    assert(/Otomatis/.test(await page.getByTestId("fold-music").locator("summary").innerText()), "automatic backsound is on");
    await page.getByTestId("render").click();
    await page.getByTestId("result").waitFor({ timeout: 300000 });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
    const out = join(dir, "cine.mp4");
    await download.saveAs(out);
    const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", out]).toString());
    const v = j.streams.find(s => s.codec_type === "video"), a = j.streams.find(s => s.codec_type === "audio");
    const d = Number(j.format.duration);
    assert(v.codec_name === "h264" && v.width === 1080 && v.height === 1920, `video ${v.codec_name} ${v.width}x${v.height}`);
    assert(a?.codec_name === "aac", "has the backsound");
    assert(Math.abs(d - 15) < 1.1, `length follows the beat plan (about 15 s): ${d}`);
    return `${d.toFixed(2)} s h264/aac 1080x1920`;
  });

  await step("clearing the mode keeps the script", async () => {
    await page.getByTestId("cine-clear").click();
    await page.getByTestId("cine-apply").waitFor({ timeout: 3000 });
    assert((await page.getByTestId("script").inputValue()).startsWith("Kreasi tanpa batas."), "script kept");
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
