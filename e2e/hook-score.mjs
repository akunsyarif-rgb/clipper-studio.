// End-to-end check of the opening-line meter in the motion studio: it scores the first line of the script as it will be said (no
// emphasis marks, no [jeda] tags), explains the weakest property and the one change to make first, says plainly that it is a heuristic,
// stays silent for a placeholder script, and follows what is typed. Production server + Chromium; needs `npm run build` first.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3229);
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
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 1400 } })).newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  await page.goto(BASE);
  await page.getByTestId("advanced-settings").evaluate(d => { d.open = true; });
  const score = async () => Number(await page.getByTestId("hook-score").innerText());

  await step("the first line of the script is scored, and a weak greeting is told apart from a specific line that speaks to the viewer", async () => {
    await page.getByTestId("hook-meter").waitFor();
    await page.getByTestId("script").fill("Halo guys, selamat datang di video ini, hari ini kita akan membahas tips yang luar biasa\nBaris kedua tidak ikut dinilai.");
    await page.waitForFunction(() => /Lemah/.test(document.querySelector('[data-testid="hook-band"]')?.textContent ?? ""), null, { timeout: 5000 });
    const weak = await score();
    await page.getByTestId("script").fill("Kamu kehilangan 40% hasil panenmu sebelum sempat dijual, dan penyebabnya bukan hama.\nBaris kedua.");
    await page.waitForFunction(() => !/Lemah/.test(document.querySelector('[data-testid="hook-band"]')?.textContent ?? ""), null, { timeout: 5000 });
    const strong = await score();
    assert(strong > weak + 20, `the specific line (${strong}) scores well above the greeting (${weak})`);
    return `${weak} vs ${strong}`;
  });

  await step("it scores the line as it will be said: emphasis marks and [jeda] tags are ignored, blank lines skipped", async () => {
    await page.getByTestId("script").fill("\n\n*Kamu* kehilangan 40% hasil panenmu sebelum sempat dijual, dan penyebabnya bukan hama. [jeda 1s]\nBaris kedua.");
    const a = await score();
    await page.getByTestId("script").fill("Kamu kehilangan 40% hasil panenmu sebelum sempat dijual, dan penyebabnya bukan hama.\nBaris kedua.");
    assert(a === await score(), "the same line scores the same with marks, tags and blank lines around it");
  });

  await step("opening it shows five bars, the one change to make first, the shape it resembles, and that it is a heuristic", async () => {
    await page.getByTestId("script").fill("Jadwal minum obat harus teratur.\nBaris kedua.");
    await page.getByTestId("hook-meter").locator("summary").click();
    for (const key of ["spesifik", "menyapa", "taruhan", "penasaran", "ringkas"]) assert(await page.getByTestId("hook-prop-" + key).isVisible(), "bar " + key);
    assert(/Ubah dulu/.test(await page.getByTestId("hook-fix").innerText()), "the first change is named");
    assert(/mirip rumus|Belum mirip rumus/.test(await page.getByTestId("hook-formula").innerText()), "the shape is named or its absence said");
    const note = await page.getByTestId("hook-note").innerText();
    assert(/heuristik, bukan prediksi/.test(note) && /berbahasa Inggris/.test(note) && /tidak ada yang dikirim/.test(note), "the note is honest about what it is: " + note);
  });

  await step("nothing is scored for a placeholder script or a line under three words, and nothing is sent anywhere", async () => {
    const requests = [];
    page.on("request", r => { if (!r.url().startsWith(BASE.replace("/motion", "")) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) requests.push(r.url()); });
    await page.getByTestId("script").fill("Dua kata\nBaris kedua.");
    await page.waitForFunction(() => !document.querySelector('[data-testid="hook-meter"]'), null, { timeout: 5000 });
    await page.getByTestId("script").fill("Tulis naskah yang cukup panjang untuk dinilai di sini ya");
    await page.getByTestId("hook-meter").waitFor();
    assert(!requests.some(u => /gemini|functions|supabase|openrouter/i.test(u)), "no AI or server request came from scoring: " + requests.join(", "));
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
