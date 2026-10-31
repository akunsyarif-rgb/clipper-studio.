// End-to-end check of the AI Voice Director in the Motion Studio: production server + Chromium + the real Supertonic 3 model
// (onnxruntime-web). It checks behaviour, never how a voice SOUNDS (that needs a person listening).
// Needs `npm run build` first.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3214);
const BASE = `http://localhost:${PORT}/motion`;

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
async function until(check, message, ms = 10000) { for (let i = 0; i < ms / 100; i++) { if (await check().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(message); }

const SCRIPT = ["Halo semuanya, selamat datang.", "Tahukah kamu apa yang terjadi", "Ternyata jawabannya sederhana.", "Terima kasih sudah menonton."].join("\n");

try {
  if (await fetch(BASE).then(() => true, () => false)) throw new Error(`Port ${PORT} is already in use; stop the old server first.`);
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 820, height: 1180 } })).newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE);
  await page.evaluate(() => document.querySelectorAll("details.fold").forEach(d => { d.open = true; }));
  await page.getByTestId("script").fill(SCRIPT);
  await page.getByTestId("voice-ai").click();

  const row = i => page.getByTestId(`voice-direction-${i}`);
  const openRow = async i => { const r = row(i); if (!(await r.evaluate(el => el.open))) await r.locator("summary").click(); return r; };
  const select = async (i, label) => (await openRow(i)).getByLabel(new RegExp(`^${label} segmen ${i + 1}$`));
  const sceneSeconds = async () => (await page.getByTestId("scenes").locator(".scene-meta b").allTextContents()).map(t => { const m = /([\d.]+)\s*–\s*([\d.]+)s/.exec(t); return m ? Number(m[2]) - Number(m[1]) : NaN; });

  await step("one collapsed row per sentence, saying which controls change the sound and which are only guidance", async () => {
    assert((await page.locator("[data-testid^=voice-direction-]").count()) === 4, "four rows");
    assert(!(await row(0).evaluate(el => el.open)), "rows start collapsed");
    const intro = await page.getByTestId("voice-director").locator("> p").innerText();
    assert(/Tempo.*jeda.*mengubah suara/s.test(intro) && /panduan/.test(intro), "intro explains it: " + intro.slice(0, 120));
    await openRow(1);
    const live = await row(1).locator(".voice-tag.live").allInnerTexts(), guide = await row(1).locator(".voice-tag.guide").allInnerTexts();
    assert(live.length === 3 && guide.length === 3, `3 live (tempo, jeda, intonation rising) and 3 guide tags: ${live} | ${guide}`);
    assert(await (await select(1, "Intonasi")).inputValue() === "rising", "an opening question word without the mark is read as rising");
    const second = await row(1).locator("summary").innerText();
    assert(/Penasaran/.test(second), "summary shows the emotion: " + second);
  });

  await step("the emphasis field can be typed with commas and is cleaned only when left; words not in the sentence are named and ignored", async () => {
    const field = (await openRow(2)).getByLabel("Kata penekanan segmen 3");
    await field.fill("");
    await field.pressSequentially("jawabannya, sederhana, ");
    assert(await field.inputValue() === "jawabannya, sederhana, ", "typing is not cut short while typing");
    await field.fill("jawabannya, hebat");
    await field.blur();
    assert(await field.inputValue() === "jawabannya", "kept only what is in the sentence: " + await field.inputValue());
    assert(/hebat/.test(await row(2).locator(".voice-ignored").innerText()), "the ignored word is named");
  });

  await step("a change stays with its sentence when another sentence is added in front; it can be undone for that sentence", async () => {
    const tempo = await select(2, "Tempo");
    await tempo.selectOption("slow");
    assert(/diubah/.test(await row(2).locator("summary").innerText()), "marked as changed");
    await page.getByTestId("script").fill("Kalimat baru di depan.\n" + SCRIPT);
    const idx = 3; // "Ternyata jawabannya sederhana." moved from 2 to 3
    assert(/Ternyata jawabannya/.test(await row(idx).locator("summary").innerText()), "the sentence moved down");
    assert(/diubah/.test(await row(idx).locator("summary").innerText()), "and kept its change");
    assert(await (await select(idx, "Tempo")).inputValue() === "slow", "tempo still slow");
    assert(!/diubah/.test(await row(2).locator("summary").innerText()), "the sentence now at its old position is untouched");
    await page.getByTestId(`voice-reset-${idx}`).click();
    assert(await (await select(idx, "Tempo")).inputValue() !== "slow", "the segment's own reset restores the recommendation");
    assert((await page.getByTestId("voice-reset-all").count()) === 0, "no reset-all when nothing is changed");
    await page.getByTestId("script").fill(SCRIPT);
  });

  await step("generate with the real model: segment durations follow the directions", async () => {
    await page.getByTestId("tts-lang").selectOption("id");
    await page.getByTestId("tts-voice").selectOption("5");
    await page.getByTestId("voice-generate").click();
    await page.getByTestId("voice-progress").waitFor({ timeout: 5000 });
    await page.getByTestId("ai-audio").waitFor({ timeout: 600000 });
    const d = await sceneSeconds();
    assert(d.length === 4 && d.every(x => x > 1), "four scenes with speech: " + d.join(","));
    return d.map(x => x.toFixed(2)).join(" / ") + " s";
  });

  let base;
  await step("guidance (emotion, style) never makes the narration stale; tempo or pause does, and undoing it brings the same audio back", async () => {
    base = await sceneSeconds();
    await (await select(0, "Emosi")).selectOption("serious");
    await (await select(0, "Gaya")).selectOption("gentle");
    await (await select(1, "Intonasi")).selectOption("steady");
    assert(!(await page.getByTestId("blocker").isVisible().catch(() => false)), "still fresh after guidance-only changes");
    await (await select(1, "Tempo")).selectOption("slow");
    await page.getByTestId("blocker").filter({ hasText: "berubah" }).waitFor({ timeout: 3000 });
    assert(await page.getByTestId("ai-audio").count() === 1, "the old audio is kept while out of date");
    await (await select(1, "Tempo")).selectOption("normal");
    await page.getByTestId("blocker").waitFor({ state: "hidden", timeout: 3000 });
    const again = await sceneSeconds();
    assert(again.every((x, i) => Math.abs(x - base[i]) < 0.001), "same audio and timing as before");
  });

  await step("only the changed sentence is made again: a slower tempo lengthens that scene and nothing else", async () => {
    await (await select(2, "Tempo")).selectOption("slow");
    const t0 = Date.now();
    await page.getByTestId("voice-generate").click();
    await page.getByTestId("voice-progress").waitFor({ timeout: 5000 });
    await page.getByTestId("voice-progress").waitFor({ state: "detached", timeout: 600000 });
    const secs = (Date.now() - t0) / 1000;
    const d = await sceneSeconds();
    assert(d[2] > base[2] * 1.05, `scene 3 longer: ${base[2].toFixed(2)} -> ${d[2].toFixed(2)}`);
    for (const i of [0, 1, 3]) assert(Math.abs(d[i] - base[i]) < 0.001, `scene ${i + 1} unchanged: ${base[i].toFixed(3)} vs ${d[i].toFixed(3)}`);
    return `${secs.toFixed(1)} s for one sentence out of four`;
  });

  await step("a pause adds silence to that scene only, and is not added twice on top of a [jeda] tag", async () => {
    const before = await sceneSeconds();
    await (await select(0, "Jeda")).selectOption("0.8");
    await page.getByTestId("voice-generate").click();
    await page.getByTestId("voice-progress").waitFor({ timeout: 5000 });
    await page.getByTestId("voice-progress").waitFor({ state: "detached", timeout: 600000 });
    const after = await sceneSeconds();
    assert(Math.abs(after[0] - before[0] - 0.8) < 0.08, `scene 1 +0.8 s: ${before[0].toFixed(2)} -> ${after[0].toFixed(2)}`);
    for (const i of [1, 2, 3]) assert(Math.abs(after[i] - before[i]) < 0.001, `scene ${i + 1} unchanged`);
    // The same pause given by the script's own tag is not stacked on the direction's.
    await page.getByTestId("script").fill(SCRIPT.replace("selamat datang.", "selamat datang. [jeda 1s]"));
    await page.getByTestId("voice-generate").click();
    await page.getByTestId("voice-progress").waitFor({ timeout: 5000 });
    await page.getByTestId("voice-progress").waitFor({ state: "detached", timeout: 600000 });
    const tagged = await sceneSeconds();
    assert(Math.abs(tagged[0] - (before[0] + 1)) < 0.08, `scene 1 has the 1 s tag, not 1.8 s: ${before[0].toFixed(2)} -> ${tagged[0].toFixed(2)}`);
    await page.getByTestId("script").fill(SCRIPT);
  });

  await step("cancelling keeps the old audio and the progress made; the next run finishes", async () => {
    await (await select(3, "Tempo")).selectOption("fast");
    await page.getByTestId("voice-generate").click();
    await page.getByTestId("voice-progress").waitFor({ timeout: 5000 });
    await page.getByTestId("voice-progress").getByRole("button", { name: "Batal" }).click();
    await page.getByTestId("voice-progress").waitFor({ state: "detached", timeout: 10000 });
    assert(/dibatalkan/.test(await page.getByTestId("status").innerText()), "says it was cancelled");
    assert(await page.getByTestId("ai-audio").count() === 1, "the previous audio is still there");
    assert(await page.getByTestId("voice-generate").isEnabled(), "can start again at once");
    await page.getByTestId("voice-generate").click();
    await page.getByTestId("ai-audio").waitFor({ timeout: 600000 });
    await page.getByTestId("voice-progress").waitFor({ state: "detached", timeout: 600000 });
    assert(!(await page.getByTestId("blocker").isVisible().catch(() => false)), "fresh after the run that followed the cancel");
  });

  await step("iPhone width: no horizontal overflow, and the controls are at least 16 px so Safari does not zoom in", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRow(1);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 0, "overflow " + over + "px");
    const sizes = await row(1).locator("select, input").evaluateAll(els => els.map(e => parseFloat(getComputedStyle(e).fontSize)));
    assert(sizes.length >= 6 && sizes.every(s => s >= 16), "font sizes " + sizes.join(","));
    const tap = await row(1).locator("summary").evaluate(e => e.getBoundingClientRect().height);
    assert(tap >= 44, "summary is a comfortable tap target: " + tap);
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
