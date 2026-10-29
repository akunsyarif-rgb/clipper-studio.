// End-to-end check of the SEO and distribution pack in /motion: production server + Chromium, with a fake AI service.
// Needs `npm run build` first. Checks what the creator sees: per-platform cards with copy buttons, the score and quick fix, the
// platform rules that are enforced (hashtags, title length), what is sent (and not sent), and clear errors.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3214);
const BASE = `http://localhost:${PORT}/motion`;
const openFolds = p => p.evaluate(() => document.querySelectorAll("details").forEach(d => { d.open = true; }));
const lorem = n => Array.from({ length: n }, (_, i) => `kata${i}`).join(" ");

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
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const pageErrors = [];
  const page = await ctx.newPage();
  page.on("pageerror", e => pageErrors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })));
  const prompts = [];
  let mode = "good";
  await page.route("https://generativelanguage.googleapis.com/**", async route => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    const prompt = body.contents?.[0]?.parts?.[0]?.text ?? "";
    prompts.push(prompt);
    if (mode === "quota") return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }) });
    const youtube = /YouTube Shorts/.test(prompt.split("PANDUAN")[0]);
    const pack = youtube
      ? { title: "J".repeat(55), description: lorem(120), thumbnailText: "BANGUN PAGI", pinComment: "Kamu bangun jam berapa?", seoReadinessScore: 97, quickFix: "Sebut kata kunci di detik 1." }
      : { hookText: "Malas bangun pagi? Coba ini", voiceoverHook: "Kalau kamu susah bangun pagi, dengarkan ini.", caption: lorem(120), hashtags: ["#FYP", "#disiplin", "Bangun Pagi", "#produktif", "#jakarta", "#motivasi", "#ekstra"], thumbnailText: "BANGUN PAGI", searchTopics: ["cara bangun pagi", "disiplin pagi", "kebiasaan produktif"], seoReadinessScore: 88, quickFix: "Tambahkan pertanyaan di detik pertama." };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(pack) }] } }] }) });
  });

  await page.goto(BASE); await openFolds(page);
  await page.getByTestId("voice-none").click();
  await page.getByTestId("title").fill("Disiplin pagi");
  await page.getByTestId("script").fill("Jangan tunggu semangat datang.\nMulailah, meski langkahmu kecil.\nDisiplin membuatmu tetap bergerak.");

  await step("the panel sits under the render area, with the topic from the title and every platform on offer", async () => {
    await page.getByTestId("fold-seo").waitFor({ timeout: 5000 });
    await openFolds(page);
    assert(await page.getByTestId("seo-topic").inputValue() === "Disiplin pagi", "topic follows the title");
    for (const id of ["tiktok", "instagram", "youtube", "x", "linkedin"]) assert(await page.getByTestId("seo-platform-" + id).isVisible(), id);
    assert(/tidak punya data tren langsung/.test(await page.getByTestId("fold-seo").innerText()), "says the AI has no live trend data");
    assert(/video dan audio tidak dikirim/.test(await page.getByTestId("fold-seo").innerText()), "says what is sent");
  });

  await step("TikTok: the pack appears as cards with copy buttons, a score and a quick fix; rules are enforced", async () => {
    await page.getByTestId("seo-audience").fill("Pekerja muda, Jakarta");
    await page.getByTestId("seo-trends").fill("Ramadan");
    await page.getByTestId("seo-run").click();
    await page.getByTestId("seo-result").waitFor({ timeout: 10000 });
    const sent = prompts.at(-1);
    assert(sent.includes("Pekerja muda, Jakarta") && sent.includes("Ramadan") && sent.includes("Jangan tunggu semangat datang. Mulailah, meski langkahmu kecil.") && sent.includes("Disiplin pagi"), "all inputs and the spoken script were sent");
    assert(!sent.includes("k".repeat(30)), "the key is never part of the prompt");
    assert(/TikTok/.test(sent) && /100-150 kata/.test(sent), "the TikTok rules were sent");
    for (const key of ["hookText", "voiceoverHook", "caption", "hashtags", "thumbnailText", "searchTopics"]) await page.getByTestId("seo-card-" + key).waitFor({ timeout: 2000 });
    const tags = await page.getByTestId("seo-card-hashtags").locator("li").allInnerTexts();
    assert(tags.join(" ") === "#disiplin #BangunPagi #produktif #jakarta #motivasi", "#FYP removed, tags cleaned, capped at five: " + tags.join(" "));
    assert(await page.getByTestId("seo-score").innerText().then(t => t.startsWith("88")), "score shown");
    assert(/Tambahkan pertanyaan/.test(await page.getByTestId("seo-fix").innerText()), "quick fix shown");
    return `tags ${tags.join(" ")}`;
  });

  await step("each element copies on its own, and the whole pack copies as text and as JSON", async () => {
    await page.getByTestId("seo-copy-hookText").click();
    await page.getByText("Tersalin ✓").first().waitFor({ timeout: 3000 });
    assert(await page.evaluate(() => navigator.clipboard.readText()) === "Malas bangun pagi? Coba ini", "one element on the clipboard");
    await page.getByTestId("seo-copy-hashtags").click();
    assert(await page.evaluate(() => navigator.clipboard.readText()) === "#disiplin #BangunPagi #produktif #jakarta #motivasi", "hashtags copy on one line");
    await page.getByTestId("seo-copy-json").click();
    const json = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    assert(json.platform === "tiktok" && json.hookText === "Malas bangun pagi? Coba ini" && json.hashtags.length === 5 && json.seoReadinessScore === 88, "JSON has one key per element");
    await page.getByTestId("seo-copy-all").click();
    assert(/Skor kesiapan SEO: 88\/100/.test(await page.evaluate(() => navigator.clipboard.readText())), "plain text pack");
  });

  await step("YouTube: a title over 49 characters is reported and lowers the score, never cut", async () => {
    await page.getByTestId("seo-platform-youtube").click();
    assert(await page.getByTestId("seo-result").count() === 0, "each platform has its own result");
    await page.getByTestId("seo-run").click();
    await page.getByTestId("seo-card-title").waitFor({ timeout: 10000 });
    assert(/YouTube Shorts/.test(prompts.at(-1)) && /kurang dari 50 karakter/.test(prompts.at(-1)), "the YouTube rules were sent");
    assert((await page.getByTestId("seo-text-title").innerText()).length === 55, "the title is shown as written");
    assert(await page.getByTestId("seo-score").innerText().then(t => t.startsWith("92")), "score lowered from 97 by one failed rule (100 - 8): " + await page.getByTestId("seo-score").innerText());
    assert(await page.getByTestId("seo-adjusted").isVisible(), "the correction is explained");
    await openFolds(page);
    assert((await page.getByTestId("seo-check-failed").allInnerTexts()).some(t => /Judul.*55 karakter/.test(t)), "the failed rule is listed");
    // The TikTok pack is still there when going back.
    await page.getByTestId("seo-platform-tiktok").click();
    await page.getByTestId("seo-card-hashtags").waitFor({ timeout: 2000 });
  });

  await step("a service error is explained and changes nothing; an empty script blocks the request", async () => {
    mode = "quota";
    await page.getByTestId("seo-platform-x").click();
    await page.getByTestId("seo-run").click();
    await page.getByTestId("seo-error").waitFor({ timeout: 20000 });
    assert(await page.getByTestId("seo-result").count() === 0, "nothing shown after a failure");
    mode = "good";
    await page.getByTestId("script").fill("");
    await page.getByTestId("seo-run").waitFor({ state: "detached", timeout: 3000 }).catch(() => undefined);
    assert(await page.getByTestId("seo-run").count() === 0 || await page.getByTestId("seo-run").isDisabled(), "cannot run without a script");
  });

  await step("without an AI key the panel says what is needed", async () => {
    const p = await (await browser.newContext()).newPage();
    await p.goto(BASE);
    await p.getByTestId("fold-seo").waitFor({ timeout: 8000 });
    await openFolds(p);
    await p.getByTestId("seo-needs-key").waitFor({ timeout: 8000 });
    assert(await p.getByTestId("seo-run").count() === 0, "no run button");
  });

  await step("start from a trend: the AI proposes angles from the creator's own trend text, one fills script and title, and the SEO pack opens with the same platform, niche and trend", async () => {
    const ctxT = await browser.newContext();
    await ctxT.addInitScript(() => localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })));
    const trendPrompts = [];
    const IDEAS = [1, 2, 3].map(n => ({ angle: `Sudut ${n}`, title: `Gajian Aman ${n}`, hook: "Gajian habis tanggal 5?", whyFits: "Cocok dengan gajian akhir bulan", lines: ["Gajian habis tanggal 5?", `Coba pecah jadi tiga pos ${n}.`, "Pos satu untuk kebutuhan wajib.", "Pos dua untuk tabungan.", "Simpan dan bagikan ya."] }));
    await ctxT.route("https://generativelanguage.googleapis.com/**", async route => {
      const prompt = JSON.parse(route.request().postData() ?? "{}").contents?.[0]?.parts?.[0]?.text ?? "";
      if (prompt.includes("TREN_DARI_PEMBUAT")) { trendPrompts.push(prompt); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ideas: IDEAS }) }] } }] }) }); }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }) });
    });
    const p = await ctxT.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE); await openFolds(p);
    await p.getByTestId("fold-trend").waitFor({ timeout: 8000 }); await openFolds(p);
    const order = await p.evaluate(() => { const a = document.querySelector('[data-testid="fold-trend"]'), b = document.querySelector('[data-testid="script"]'); return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); });
    assert(order, "the trend step comes before the script");
    assert(/tidak punya data tren langsung/.test(await p.getByTestId("fold-trend").innerText()), "says the AI has no live trend data");
    assert(await p.getByTestId("trend-write").isDisabled() && /niche/.test(await p.getByTestId("trend-problem").textContent()), "waits for a niche");
    await p.getByTestId("trend-niche").fill("tips keuangan");
    assert(await p.getByTestId("trend-write").isDisabled() && /tren/.test(await p.getByTestId("trend-problem").textContent()), "waits for a trend text");
    await p.getByTestId("trend-platform-instagram").click();
    await p.getByTestId("trend-chip-gajian-akhir-bulan").click();
    assert(await p.getByTestId("trend-text").inputValue() === "Gajian akhir bulan", "the chip adds its text");
    await p.getByTestId("trend-audience").fill("pekerja muda, Jakarta");
    await p.getByTestId("trend-write").click();
    await p.getByTestId("trend-ideas").waitFor({ timeout: 10000 });
    assert(trendPrompts.length === 1 && trendPrompts[0].includes("Gajian akhir bulan") && trendPrompts[0].includes("Instagram Reels") && trendPrompts[0].includes("tips keuangan") && !trendPrompts[0].includes("k".repeat(30)), "the prompt carries the creator's facts and not the key");
    assert(await p.getByTestId("trend-idea").count() === 3, "three angles");
    await p.getByTestId("trend-use").nth(1).click();
    assert((await p.getByTestId("script").inputValue()).startsWith("Gajian habis tanggal 5?\nCoba pecah jadi tiga pos 2."), "script filled from the chosen idea");
    assert(await p.getByTestId("title").inputValue() === "Gajian Aman 2", "title filled");
    await p.getByTestId("voice-none").click();
    await p.getByTestId("fold-seo").waitFor({ timeout: 8000 });
    await openFolds(p);
    assert(await p.getByTestId("seo-topic").inputValue() === "tips keuangan" && await p.getByTestId("seo-audience").inputValue() === "pekerja muda, Jakarta" && await p.getByTestId("seo-trends").inputValue() === "Gajian akhir bulan", "SEO pack inherits niche, audience and trend");
    assert(await p.getByTestId("seo-platform-instagram").getAttribute("aria-pressed") === "true", "SEO pack inherits the platform");
    await p.getByTestId("mode-affiliate").click();
    assert(!(await p.getByTestId("fold-trend").isVisible()), "hidden in affiliate mode");
    await ctxT.close();
  });

  await step("a failed trend request is explained and keeps the fields", async () => {
    const ctxF = await browser.newContext();
    await ctxF.addInitScript(() => localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })));
    await ctxF.route("https://generativelanguage.googleapis.com/**", route => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }) }));
    const p = await ctxF.newPage();
    await p.goto(BASE); await p.getByTestId("fold-trend").waitFor({ timeout: 8000 }); await openFolds(p);
    await p.getByTestId("trend-niche").fill("masak hemat");
    await p.getByTestId("trend-text").fill("harga cabai naik");
    await p.getByTestId("trend-write").click();
    await p.getByTestId("trend-error").waitFor({ timeout: 25000 });
    assert(await p.getByTestId("trend-idea").count() === 0, "no ideas after a failure");
    await p.reload(); await p.getByTestId("fold-trend").waitFor({ timeout: 8000 }); await openFolds(p);
    assert(await p.getByTestId("trend-niche").inputValue() === "masak hemat" && await p.getByTestId("trend-text").inputValue() === "harga cabai naik", "fields remembered on this device");
    await ctxF.close();
  });

  await step("without an AI key the trend step says what is needed", async () => {
    const p = await (await browser.newContext()).newPage();
    await p.goto(BASE); await p.getByTestId("fold-trend").waitFor({ timeout: 8000 }); await openFolds(p);
    await p.getByTestId("trend-needs-key").waitFor({ timeout: 8000 });
    assert(await p.getByTestId("trend-write").count() === 0, "no write button");
  });

  await step("no uncaught page errors", async () => { assert(pageErrors.length === 0, pageErrors.join(" | ")); });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
