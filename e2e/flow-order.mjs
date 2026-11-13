// End-to-end check of the order fixes in "Konten biasa": the "Mulai dari" chips take the creator to the right place, the pre-render
// checklist names the automatic voice that is not made yet (and offers to make it), and the kind of film chosen in the quick start is
// remembered on this device. Production server + Chromium; needs `npm run build` first.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3228);
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

try {
  if (await fetch(BASE).then(() => true, () => false)) throw new Error(`Port ${PORT} is already in use; stop the old server first.`);
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  await page.goto(BASE);
  await page.getByTestId("advanced-settings").evaluate(d => { d.open = true; });

  await step("the Mulai dari chips open the right place: trend, AI idea, own script", async () => {
    const chips = page.getByTestId("start-chips");
    await chips.waitFor();
    assert(await page.getByTestId("fold-trend").evaluate(d => !d.open), "the trend fold starts closed");
    await page.getByTestId("start-trend").click();
    assert(await page.getByTestId("fold-trend").evaluate(d => d.open), "Tren opens the trend fold");
    await page.getByTestId("start-idea").click();
    assert(await page.getByTestId("fold-cinematic").evaluate(d => d.open), "Ide (AI) opens the Cinematic Studio");
    await page.getByTestId("start-write").click();
    assert(await page.getByTestId("script").evaluate(el => document.activeElement === el), "Tulis sendiri focuses the script box");
    assert(await page.getByTestId("start-video").isVisible(), "Video is offered too");
  });

  await step("the checklist names the automatic voice that is not made yet and offers to make it; choosing no voice removes it", async () => {
    const box = page.getByTestId("pre-checklist");
    await box.waitFor();
    const voice = page.getByTestId("pre-check-voice");
    assert(await voice.count() === 1, "the voice check is listed (automatic voice is the default and is not made)");
    assert(/Buat suara otomatis/.test(await voice.innerText()), "it offers the fix: " + await voice.innerText());
    await page.getByTestId("voice-none").click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="pre-check-voice"]'), null, { timeout: 5000 });
  });

  await step("the kind of film chosen in the quick start is remembered", async () => {
    const sel = page.getByTestId("quick-genre");
    await sel.waitFor();
    assert(await sel.inputValue() === "produk", "starts with the product form");
    await sel.selectOption("cerita");
    await page.reload();
    await page.getByTestId("quick-genre").waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="quick-genre"]')?.value === "cerita", null, { timeout: 5000 });
  });

  await step("no uncaught page errors", async () => {
    const real = pageErrors.filter(m => m !== "Failed to fetch");
    assert(real.length === 0, real.join(" | "));
  });
  await browser.close();
} catch (e) { failed = true; results.push("FAIL setup: " + (e instanceof Error ? e.stack : e)); }
finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
