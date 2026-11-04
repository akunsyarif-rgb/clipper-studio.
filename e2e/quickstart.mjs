// End-to-end check of "Mulai Cepat" and the AI card: production server + Chromium. Three steps (write, approve the plan, preview and
// render), the AI card with its three choices, the advanced settings folded away, and every "needs AI" hint leading back to the card.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3225);
const BASE = `http://localhost:${PORT}/motion`;
const dir = mkdtempSync(join(tmpdir(), "quick-e2e-"));
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
const results = [];
let failed = false;
async function step(name, fn) {
  const t = Date.now();
  try { const info = await fn(); results.push(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${info ? " — " + info : ""}`); }
  catch (err) { failed = true; results.push(`FAIL ${name}: ${err instanceof Error ? err.message : err}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };

try {
  if (await fetch(BASE).then(() => true, () => false)) throw new Error(`Port ${PORT} is already in use; stop the old server first.`);
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 820, height: 1180 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  await page.route("https://www.remotion.pro/**", r => r.abort());
  await page.goto(BASE);

  await step("a newcomer sees the AI card and the three steps first; the many settings are folded away", async () => {
    await page.getByTestId("quick-start").waitFor({ timeout: 15000 });
    await page.getByTestId("ai-choice-free").waitFor({ timeout: 15000 });
    for (const id of ["ai-choice-free", "ai-choice-own", "ai-choice-skip"]) assert(await page.getByTestId(id).isVisible(), id + " is offered");
    assert(await page.getByTestId("quick-step-1").isVisible(), "step 1 is shown");
    for (const id of ["quick-example-produk", "quick-example-cerita", "quick-example-edukasi", "quick-example-profil"]) assert(await page.getByTestId(id).isVisible(), id);
    assert(!(await page.getByTestId("script").isVisible()), "the script box and the 90 other settings are hidden at first");
    assert(await page.getByTestId("advanced-settings").evaluate(d => d.open === false), "advanced settings start closed");
    await page.getByTestId("advanced-settings").locator(":scope > summary").click();
    await page.getByTestId("script").waitFor({ timeout: 5000 });
    await page.getByTestId("advanced-settings").locator(":scope > summary").click();
  });

  await step("every 'needs AI' hint is one short line that leads back to the AI card", async () => {
    await page.getByTestId("advanced-settings").evaluate(d => { d.open = true; });
    await page.getByTestId("fold-cinematic").evaluate(d => { d.open = true; });
    const hint = page.getByTestId("director-needs-key");
    await hint.waitFor({ timeout: 5000 });
    assert(!/Belum ada kunci AI/.test(await hint.innerText()) && /Siapkan AI di atas/.test(await hint.innerText()), "short hint: " + await hint.innerText());
    await hint.getByTestId("ai-needed-go").click();
    await page.waitForFunction(() => document.activeElement?.closest("#ai-setup") !== null, null, { timeout: 3000 });
    await page.getByTestId("advanced-settings").evaluate(d => { d.open = false; });
  });

  await step("without AI: an example fills the plain form, the plan is read in plain words, Setuju applies it, then preview and a real MP4", async () => {
    await page.getByTestId("quick-example-produk").click();
    assert((await page.getByTestId("quick-product").inputValue()) === "Kopi Susu Pagi", "the example filled the form");
    await page.getByTestId("quick-seconds").selectOption("15");
    await page.getByTestId("quick-plan").click();
    await page.getByTestId("quick-step-2").waitFor({ timeout: 5000 });
    assert((await page.getByTestId("quick-scenes").locator("li").count()) >= 3, "the plan lists every scene");
    assert(!/BPM|beat|preset/i.test(await page.getByTestId("quick-step-2").innerText()), "no jargon in the plan");
    await page.getByTestId("advanced-settings").evaluate(d => { d.open = true; });
    const scriptBefore = await page.getByTestId("script").inputValue();
    await page.getByTestId("advanced-settings").evaluate(d => { d.open = false; });
    await page.getByTestId("quick-approve").click();
    await page.getByTestId("quick-preview").locator("video, [data-testid], div").first().waitFor({ timeout: 10000 });
    await page.getByTestId("advanced-settings").evaluate(d => { d.open = true; });
    assert((await page.getByTestId("script").inputValue()) !== scriptBefore && /Mulai harimu dengan hangat/.test(await page.getByTestId("script").inputValue()), "Setuju put the plan into the studio");
    await page.getByTestId("advanced-settings").evaluate(d => { d.open = false; });
    await page.getByTestId("quick-render").waitFor({ timeout: 5000 });
    await page.getByTestId("quick-render").click();
    await page.getByTestId("quick-result").waitFor({ timeout: 300000 });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("quick-download").click()]);
    const out = join(dir, "cepat.mp4");
    await download.saveAs(out);
    const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).stdout.toString().trim());
    assert(dur > 10 && dur < 22, "the MP4 is about the 15 s that was asked for: " + dur);
    return `MP4 ${dur.toFixed(1)} s`;
  });

  await step("the AI card: skipping is remembered; saving a key shows the model list; the plan then comes from the AI, once", async () => {
    await page.getByTestId("ai-choice-skip").click();
    await page.reload();
    await page.getByTestId("ai-setup").waitFor({ timeout: 10000 });
    assert(/Tanpa AI/.test(await page.getByTestId("ai-setup").innerText()), "skipping survives a reload");
    let calls = 0;
    await page.route("https://generativelanguage.googleapis.com/**", async route => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors }).catch(() => {});
      if (req.method() === "GET") return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] }) }).catch(() => {});
      calls++;
      const brief = { genre: "produk", product: "Teh Melati", tagline: "Tenang di setiap seduhan", problem: "", features: ["Daun pilihan"], proof: "", cta: "Cicipi sekarang", tone: "warm", seconds: 30, visuals: [{ term: "tea cup", kind: "photo" }] };
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(brief) }] } }] }) }).catch(() => {});
    });
    await page.getByTestId("ai-choice-own").click();
    await page.getByTestId("ai-save").click();
    await page.getByTestId("ai-setup-error").waitFor({ timeout: 3000 });
    await page.getByTestId("ai-key").fill("K".repeat(30));
    await page.getByTestId("ai-consent").check();
    await page.getByTestId("ai-save").click();
    await page.getByTestId("ai-setup-ready").waitFor({ timeout: 8000 });
    assert(await page.getByTestId("ai-model-pick").isVisible(), "the model list lives in the AI card");
    assert(!(await page.content()).includes("K".repeat(30)), "the key is never shown on the page");
    await page.getByTestId("quick-example-produk").click();
    assert(/kopi susu/i.test(await page.getByTestId("quick-command").inputValue()), "an example fills the command");
    await page.getByTestId("quick-plan").click();
    await page.getByTestId("quick-step-2").waitFor({ timeout: 15000 });
    assert(calls === 1, "one AI call for the plan: " + calls);
    assert(/Teh Melati/.test(await page.getByTestId("quick-step-2").innerText()), "the plan comes from the AI's brief");
    await page.getByTestId("quick-back").click();
    await page.getByTestId("quick-step-1").waitFor({ timeout: 3000 });
  });

  await step("an AI problem in the quick start has a way forward", async () => {
    await page.unroute("https://generativelanguage.googleapis.com/**");
    await page.route("https://generativelanguage.googleapis.com/**", async route => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors }).catch(() => {});
      return route.fulfill({ status: 500, headers: cors, contentType: "application/json", body: JSON.stringify({ error: { message: "boom" } }) }).catch(() => {});
    });
    await page.getByTestId("quick-command").fill("Video produk teh melati 30 detik, suasana tenang dan hangat");
    await page.getByTestId("quick-plan").click();
    await page.getByTestId("ai-error-retry").waitFor({ timeout: 20000 });
    await page.getByTestId("ai-error-dismiss").click();
    assert(await page.getByTestId("quick-ai-error").count() === 0, "carrying on clears the problem");
  });

  await step("no uncaught page errors", async () => {
    const real = pageErrors.filter(m => m !== "Failed to fetch");
    assert(real.length === 0, real.join(" | "));
  });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  rmSync(dir, { recursive: true, force: true });
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
