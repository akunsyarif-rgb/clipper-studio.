// End-to-end check of the Stage 4 layout: one numbered flow 1-5 (AI helpers inside the step they belong to), the phone stepper
// (one step per screen with a progress bar), the style pictures with "Coba gaya lain" and one undo, and the three actions after a render.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3226);
const BASE = `http://localhost:${PORT}/motion`;
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
const results = [];
let failed = false;
async function step(name, fn) {
  const t = Date.now();
  try { const info = await fn(); results.push(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${info ? " — " + info : ""}`); }
  catch (err) { failed = true; results.push(`FAIL ${name}: ${err instanceof Error ? err.message : err}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const openAdvanced = p => p.getByTestId("advanced-settings").evaluate(d => { d.open = true; });

try {
  if (await fetch(BASE).then(() => true, () => false)) throw new Error(`Port ${PORT} is already in use; stop the old server first.`);
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const pageErrors = [];
  const newPage = async (viewport, mobile = false) => {
    const ctx = await browser.newContext({ viewport, acceptDownloads: true, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await ctx.route("https://www.remotion.pro/**", r => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE);
    await p.getByTestId("advanced-settings").waitFor({ state: "attached", timeout: 15000 });
    await openAdvanced(p);
    return { ctx, p };
  };

  await step("tablet: one numbered flow 1-5, every helper inside the step it belongs to, all steps on screen", async () => {
    const { ctx, p } = await newPage({ width: 1100, height: 1400 });
    const titles = { 1: /1\s*Naskah/, 2: /2\s*Gambar/, 3: /3\s*Suara dan musik/, 4: /4\s*Gaya/, 5: /5\s*Render/ };
    for (const n of [1, 2, 3, 4, 5]) {
      const t = p.getByTestId(`step-${n}`);
      await t.waitFor({ timeout: 5000 });
      assert(titles[n].test(await t.innerText()), `step ${n} is titled: ${await t.innerText()}`);
      assert(await t.isVisible(), `step ${n} is on screen`);
    }
    assert(!(await p.getByTestId("flow-stepper").isVisible()), "no stepper on a tablet");
    const inStep = (n, id) => p.getByTestId(`flow-step-${n}`).getByTestId(id).count();
    assert(await inStep(1, "script") === 1 && await inStep(1, "fold-cinematic") === 1, "script and Cinematic Studio are in step 1");
    assert(await inStep(2, "pixabay-auto") === 1 && await inStep(2, "fold-iconify") === 1 && await inStep(2, "scenes") === 1 && await inStep(2, "ai-director") === 1, "the AI director (its keywords feed the picture tools), pictures, icons and the scene list are in step 2");
    assert(await inStep(3, "fold-music") === 1 && await inStep(3, "fold-duration") === 1, "voice and music are in step 3");
    assert(await inStep(4, "ai-director") === 0 && await inStep(4, "fold-look") === 1 && await inStep(4, "style-picker") === 1, "the look is in step 4 (the AI director moved to step 2, before the manual look settings it would overwrite)");
    assert(await inStep(5, "render") === 1 && await inStep(5, "pre-checklist") === 1, "render and its checklist are in step 5");
    await ctx.close();
  });

  await step("phone: one step per screen with a progress bar, Kembali and Selanjutnya, no sideways scroll on any step", async () => {
    const { ctx, p } = await newPage({ width: 390, height: 844 }, true);
    await p.getByTestId("flow-stepper").waitFor({ timeout: 5000 });
    const prog = async () => Number(await p.getByTestId("flow-progress").getAttribute("aria-valuenow"));
    const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(await prog() === 1 && /Langkah 1 dari 5/.test(await p.getByTestId("flow-stepper").innerText()), "starts on step 1 of 5");
    assert(await p.getByTestId("flow-step-1").isVisible() && !(await p.getByTestId("flow-step-2").isVisible()), "only step 1 is shown");
    assert(await overflow() <= 1, "step 1 does not scroll sideways: " + await overflow());
    await p.getByTestId("flow-nav-1").getByTestId("flow-next").click();
    assert(await prog() === 2 && await p.getByTestId("flow-step-2").isVisible() && !(await p.getByTestId("flow-step-1").isVisible()), "Selanjutnya shows step 2 only");
    assert(await overflow() <= 1, "step 2 does not scroll sideways: " + await overflow());
    await p.getByTestId("flow-nav-2").getByTestId("flow-back").click();
    assert(await prog() === 1 && await p.getByTestId("flow-step-1").isVisible(), "Kembali returns to step 1");
    for (const n of [3, 4, 5]) {
      await p.getByTestId(`flow-dot-${n}`).click();
      assert(await prog() === n && await p.getByTestId(`flow-step-${n}`).isVisible(), `step ${n} is reachable from the dots`);
      assert(await overflow() <= 1, `step ${n} does not scroll sideways: ${await overflow()}`);
    }
    assert(await p.getByTestId("render").isVisible() && await p.getByTestId("flow-nav-5").getByTestId("flow-next").count() === 0, "step 5 has the Render button and no further Selanjutnya");
    await ctx.close();
  });

  await step("style pictures: each style and palette is drawn; choosing one changes the studio; Coba gaya lain can be undone once", async () => {
    const { ctx, p } = await newPage({ width: 1100, height: 1400 });
    for (const id of ["hybrid", "kinetic", "popup", "cinematic", "editorial"]) assert(await p.getByTestId(`style-card-${id}`).locator("svg").count() === 1, `${id} has a small drawing`);
    assert(await p.locator('[data-testid^="palette-chip-"]').count() === 12, "twelve palette chips");
    const clock = () => p.locator(".player-wrap").first().innerText().then(t => { const m = /(\d+):(\d\d)\s*\/\s*\d+:\d\d/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; });
    assert(await clock() === 0, "the preview starts paused on the first frame");
    await p.getByTestId("style-card-kinetic").click();
    assert(await p.getByTestId("style").inputValue() === "kinetic", "the style card sets the style");
    await p.waitForFunction(() => { const m = /(\d+):(\d\d)\s*\/\s*\d+:\d\d/.exec(document.querySelector(".player-wrap")?.innerText ?? ""); return !!m && Number(m[1]) * 60 + Number(m[2]) >= 1; }, null, { timeout: 4000 });
    await p.waitForFunction(() => document.querySelector(".player-wrap video, .player-wrap [data-visual], .player-wrap div") !== null, null, { timeout: 2000 });
    await p.getByTestId("palette-chip-gold").click();
    assert(await p.getByTestId("palette").inputValue() === "gold", "the palette chip sets the palette");
    // The preview itself changes colour at once (the picture inside the player is redrawn with the new palette).
    const hashOf = () => p.locator(".player-wrap").first().screenshot().then(b => b.toString("base64").length + ":" + b.subarray(1000, 1400).toString("hex"));
    await p.getByTestId("palette-chip-obsidian").click();
    await p.waitForTimeout(500);
    const dark = await hashOf();
    await p.getByTestId("palette-chip-pearl").click();
    await p.waitForTimeout(500);
    assert((await hashOf()) !== dark, "choosing another palette redraws the preview");
    await p.getByTestId("palette-chip-gold").click();
    const before = [await p.getByTestId("style").inputValue(), await p.getByTestId("palette").inputValue()];
    await p.getByTestId("style-try-other").click();
    const after = [await p.getByTestId("style").inputValue(), await p.getByTestId("palette").inputValue()];
    assert(after[0] !== before[0] || after[1] !== before[1], "Coba gaya lain gives a different look: " + before + " -> " + after);
    await p.getByTestId("style-undo").click();
    assert(await p.getByTestId("style").inputValue() === before[0] && await p.getByTestId("palette").inputValue() === before[1], "Urungkan gaya restores the previous look");
    await ctx.close();
  });

  await step("after a render: the download stays, three action buttons replace the paragraph, the save box opens only on request", async () => {
    const { ctx, p } = await newPage({ width: 1100, height: 1400 });
    await p.getByTestId("voice-none").click();
    await p.getByTestId("script").fill("Satu kalimat pendek.\nDua kalimat pendek.\nPesan sekarang.");
    await p.getByTestId("render").click();
    await p.getByTestId("result").waitFor({ timeout: 300000 });
    assert(await p.getByTestId("download").isVisible(), "the MP4 download is still there");
    for (const id of ["post-save", "post-another", "post-seo"]) assert(await p.getByTestId(id).isVisible(), id + " is a button");
    assert(await p.getByTestId("next-steps").count() === 0, "the old paragraph is gone");
    assert(await p.getByTestId("hub-open").count() === 0, "the save box is not open yet");
    await p.getByTestId("post-save").click();
    await p.getByTestId("hub-open").waitFor({ timeout: 5000 });
    await p.getByTestId("post-seo").click();
    await p.waitForFunction(() => document.querySelector('[data-testid="fold-seo"]')?.open === true, null, { timeout: 5000 });
    const styleBefore = [await p.getByTestId("style").inputValue(), await p.getByTestId("palette").inputValue()];
    await p.getByTestId("post-another").click();
    await p.waitForFunction(([s, pl]) => document.querySelector('[data-testid="style"]').value !== s || document.querySelector('[data-testid="palette"]').value !== pl, styleBefore, { timeout: 5000 });
    assert(await p.getByTestId("result").count() === 0 && /Gaya diganti/.test(await p.getByTestId("status").innerText()), "the style changed, the old result is released and the status says what to do next");
    await ctx.close();
  });

  await step("no uncaught page errors", async () => {
    const real = pageErrors.filter(m => m !== "Failed to fetch");
    assert(real.length === 0, real.join(" | "));
  });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
