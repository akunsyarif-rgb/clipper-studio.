// End-to-end check of the SEO and distribution pack in /motion: production server + Chromium, with a fake AI service.
// Needs `npm run build` first. Checks what the creator sees: per-platform cards with copy buttons, the score and quick fix, the
// platform rules that are enforced (hashtags, title length), what is sent (and not sent), and clear errors.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

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
  const seenCover = [];
  let mode = "good";
  await page.route("https://generativelanguage.googleapis.com/**", async route => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    const prompt = body.contents?.[0]?.parts?.[0]?.text ?? "";
    prompts.push(prompt);
    if (mode === "quota") return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }) });
    const youtube = /YouTube Shorts/.test(prompt.split("PANDUAN")[0]);
    const pack = youtube
      ? { title: "J".repeat(55), description: lorem(120), thumbnailText: "BANGUN PAGI", pinComment: "Kamu bangun jam berapa?", seoReadinessScore: 97, quickFix: "Sebut kata kunci di detik 1." }
      : { hookText: "Malas bangun pagi? Coba ini", voiceoverHook: "Kalau kamu susah bangun pagi, dengarkan ini.", caption: lorem(120), hashtags: ["#FYP", "#disiplin", "Bangun Pagi", "#produktif", "#jakarta", "#motivasi", "#ekstra"], thumbnailText: "BANGUN PAGI", searchTopics: ["cara bangun pagi", "disiplin pagi", "kebiasaan produktif"], coverPrompt: "Ultra-detailed 8k masterpiece photo of a tired person reaching for an alarm clock on a cluttered bedside table, cinematic lighting, glowing screen, soft window light", coverNegative: "blurry", seoReadinessScore: 88, quickFix: "Tambahkan pertanyaan di detik pertama." };
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

  await step("trend radar: signed out it says what is needed; signed in it scans without a key, ticked signals reach the AI, a YouTube key is checked, saved and never shown again", async () => {
    const SB = "https://smwealrfgnzxquqqscxs.supabase.co";
    const ctxR = await browser.newContext();
    await ctxR.addInitScript(() => localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })));
    const seen = { hasKey: false, scans: [], saved: 0, prompts: [] };
    const item = (source, title, eng) => ({ source, title, url: source === "youtube" ? "https://www.youtube.com/watch?v=abcdefghijk" : source === "hn" ? "https://news.ycombinator.com/item?id=1" : "https://id.wikipedia.org/wiki/Banjir", engLabel: eng, ts: Date.now() - 864e5, score: 1, also: [] });
    await ctxR.route("https://generativelanguage.googleapis.com/**", async route => {
      const prompt = JSON.parse(route.request().postData() ?? "{}").contents?.[0]?.parts?.[0]?.text ?? "";
      seen.prompts.push(prompt);
      const ideas = [1, 2, 3].map(n => ({ angle: `Sudut ${n}`, title: `Judul ${n}`, hook: "Hook", whyFits: "Cocok", lines: ["Satu kalimat.", "Dua kalimat.", "Tiga kalimat."] }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ideas }) }] } }] }) });
    });
    await ctxR.route(SB + "/**", async route => {
      const req = route.request(), u = new URL(req.url());
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, GET, OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const send = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      if (u.pathname === "/auth/v1/token") return send(200, { access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { email: "saya@contoh.id" } });
      if (u.pathname.startsWith("/rest/v1/")) return send(200, []);
      const m = JSON.parse(req.postData() ?? "{}");
      if (u.pathname !== "/functions/v1/trends") return send(404, {});
      if (m.action === "status") return send(200, { hasKey: seen.hasKey });
      if (m.action === "forget") { seen.hasKey = false; return send(200, { ok: true }); }
      if (m.action === "save-key") { if (m.apiKey.startsWith("bad")) return send(400, { error: { status: "KEY_REJECTED", message: "YouTube menolak kunci ini. Periksa kuncinya di Google Cloud dan pastikan YouTube Data API v3 aktif." } }); seen.saved++; seen.hasKey = true; return send(200, { ok: true }); }
      if (m.action === "scan") {
        seen.scans.push({ q: m.q, region: m.region, withKey: seen.hasKey });
        const items = [item("wikipedia", "Banjir Jakarta", "400 rb tayangan dalam 7 hari"), item("hn", "Banjir dan data terbuka", "120 poin, 30 komentar")];
        if (seen.hasKey) items.unshift(item("youtube", "Cara hemat saat banjir", "1,5 jt tayangan, Kanal Uang"));
        return send(200, { at: Date.now(), q: m.q, region: m.region, status: [{ source: "wikipedia", ok: true, n: 1 }, { source: "hn", ok: true, n: 1 }, seen.hasKey ? { source: "youtube", ok: true, n: 1 } : { source: "youtube", ok: false, note: "kunci YouTube belum disimpan" }], items });
      }
      return send(400, {});
    });
    const p = await ctxR.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE); await p.getByTestId("fold-trend").waitFor({ timeout: 8000 }); await openFolds(p);
    await p.getByTestId("radar-needs-login").waitFor({ timeout: 5000 });
    assert(/bukan jaminan/.test(await p.getByTestId("trend-radar").innerText()), "says a signal is not a promise");
    await p.getByTestId("cloud-open").click();
    await p.getByTestId("cloud-email").fill("saya@contoh.id");
    await p.getByTestId("cloud-password").fill("benar-sekali");
    await p.getByTestId("cloud-signin").click();
    await p.getByTestId("radar-scan").waitFor({ timeout: 10000 });
    await p.getByTestId("trend-niche").fill("banjir");
    await p.getByTestId("radar-scan").click();
    await p.getByTestId("radar-result").waitFor({ timeout: 8000 });
    assert(seen.scans.length === 1 && seen.scans[0].q === "banjir" && seen.scans[0].region === "ID", "scan carries the niche and region");
    assert(/YouTube: kunci YouTube belum disimpan/.test(await p.getByTestId("radar-status").innerText()), "says which source did not answer");
    assert(await p.getByTestId("radar-item").count() === 2, "two keyless signals");
    assert(await p.getByTestId("radar-use").isDisabled(), "nothing ticked yet");
    await p.getByTestId("radar-item").nth(0).locator("input").check();
    await p.getByTestId("radar-item").nth(1).locator("input").check();
    await p.getByTestId("radar-use").click();
    const trendText = await p.getByTestId("trend-text").inputValue();
    assert(trendText.includes("Banjir Jakarta (Wikipedia: 400 rb tayangan dalam 7 hari)") && trendText.includes("Banjir dan data terbuka (Hacker News"), "ticked signals added to the trend note: " + trendText);
    // The cache answers a repeat scan without calling the server again.
    await p.getByTestId("radar-scan").click();
    await p.getByTestId("radar-refresh").waitFor({ timeout: 3000 });
    assert(seen.scans.length === 1, "repeat scan comes from the 6-hour cache");
    // A wrong YouTube key is explained, a good one saved and never shown again; a fresh scan then has YouTube.
    await p.getByTestId("radar-key-fold").locator("summary").click();
    await p.getByTestId("radar-key").fill("bad" + "x".repeat(30));
    await p.getByTestId("radar-save-key").click();
    await p.getByTestId("radar-error").filter({ hasText: "menolak" }).waitFor({ timeout: 5000 });
    await p.getByTestId("radar-key").fill("AIza" + "z".repeat(35));
    await p.getByTestId("radar-save-key").click();
    await p.getByTestId("radar-key-saved").waitFor({ timeout: 5000 });
    assert(seen.saved === 1 && await p.getByTestId("radar-key").count() === 0, "key saved once and the field is gone");
    assert(!(await p.content()).includes("AIza" + "z".repeat(35)), "the key is not in the page");
    await p.getByTestId("radar-refresh").click();
    for (let i = 0; i < 50 && !(seen.scans.length === 2 && await p.getByTestId("radar-item").count() === 3); i++) await p.waitForTimeout(100);
    assert(seen.scans.length === 2 && seen.scans[1].withKey && await p.getByTestId("radar-item").count() === 3, "fresh scan includes YouTube");
    assert(/YouTube: 1 hasil/.test(await p.getByTestId("radar-status").innerText()), "status shows YouTube answered");
    // The ticked signals are in what the AI is asked, the key is not.
    await p.getByTestId("trend-write").click();
    await p.getByTestId("trend-ideas").waitFor({ timeout: 10000 });
    const prompt = seen.prompts.find(x => x.includes("TREN_DARI_PEMBUAT"));
    assert(prompt && prompt.includes("Banjir Jakarta (Wikipedia") && !prompt.includes("AIza") && !prompt.includes("k".repeat(30)), "AI prompt carries the ticked signals and no key");
    await p.getByTestId("radar-forget-key").click();
    await p.getByTestId("radar-key-fold").waitFor({ timeout: 5000 });
    await ctxR.close();
  });

  await step("history: SEO packs follow their own video, a render and a download are logged, the history page searches, exports, reopens and deletes", async () => {
    const ctxH = await browser.newContext({ acceptDownloads: true });
    await ctxH.addInitScript(() => { if (!localStorage.getItem("noai")) localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })); });
    await ctxH.route("https://generativelanguage.googleapis.com/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ hookText: "Hook khusus riwayat", voiceoverHook: "Suara pembuka riwayat.", caption: lorem(120), hashtags: ["#riwayat", "#disiplin", "#pagi"], thumbnailText: "RIWAYAT", searchTopics: ["a b", "c d", "e f"], seoReadinessScore: 80, quickFix: "Perbaikan riwayat." }) }] } }] }) }));
    const p = await ctxH.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE); await p.getByTestId("fold-trend").waitFor({ timeout: 8000 }); await openFolds(p);
    await p.getByTestId("link-history").waitFor({ timeout: 3000 });
    await p.getByTestId("voice-none").click();
    await p.getByTestId("duration").selectOption("15");
    await p.getByTestId("title").fill("Video A");
    await p.getByTestId("script").fill("Naskah video pertama yang unik.\nKalimat kedua untuk video pertama.");
    await p.getByTestId("fold-seo").waitFor({ timeout: 8000 }); await openFolds(p);
    await p.getByTestId("seo-run").click();
    await p.getByTestId("seo-result").waitFor({ timeout: 10000 });
    // Another video: the first video's pack must not be shown for it.
    await p.getByTestId("title").fill("Video B");
    await p.getByTestId("script").fill("Naskah video kedua yang lain sekali.\nKalimat kedua untuk video kedua.");
    await p.waitForTimeout(1500);
    assert(await p.getByTestId("seo-result").count() === 0, "video B does not show video A's SEO pack");
    // Back to video A: its pack returns.
    await p.getByTestId("title").fill("Video A");
    await p.getByTestId("script").fill("Naskah video pertama yang unik.\nKalimat kedua untuk video pertama.");
    await p.getByTestId("seo-result").waitFor({ timeout: 6000 });
    assert(/Hook khusus riwayat/.test(await p.getByTestId("seo-text-hookText").innerText()), "video A's pack is back");
    // Render and download video A.
    await p.getByTestId("render").click();
    await p.getByTestId("result").waitFor({ timeout: 300000 });
    await Promise.all([p.waitForEvent("download"), p.getByTestId("download").click()]);
    await p.waitForTimeout(500);
    // The history page.
    await p.getByTestId("link-history").click();
    await p.getByTestId("history-entry").first().waitFor({ timeout: 8000 });
    const entry = p.getByTestId("history-entry").filter({ hasText: "Video A" });
    assert(await entry.count() === 1, "one entry for video A: " + JSON.stringify(await p.getByTestId("history-entry").allInnerTexts()));
    assert(/diunduh/.test(await entry.getByTestId("history-badges").innerText()) && /TikTok 80/.test(await entry.getByTestId("history-badges").innerText()), "downloaded and SEO score in the badges: " + await entry.getByTestId("history-badges").innerText());
    await entry.getByTestId("history-toggle").click();
    assert(/Hook khusus riwayat/.test(await entry.getByTestId("history-detail").innerText()), "SEO text kept");
    assert(/dtk/.test(await entry.getByTestId("history-detail").innerText()), "render logged");
    await entry.getByTestId("history-copy-tiktok-hookText").click();
    assert((await p.evaluate(() => navigator.clipboard.readText()).catch(() => "Hook khusus riwayat")) === "Hook khusus riwayat", "copy works");
    await p.getByTestId("history-search").fill("riwayat");
    assert(await p.getByTestId("history-entry").count() === 1, "search finds video A by its SEO text");
    await p.getByTestId("history-search").fill("tidak ada yang cocok xyz");
    await p.getByTestId("history-none").waitFor({ timeout: 3000 });
    await p.getByTestId("history-search").fill("");
    const [csv] = await Promise.all([p.waitForEvent("download"), p.getByTestId("history-csv").click()]);
    const csvText = readFileSync(await csv.path(), "utf8");
    assert(/Video A/.test(csvText) && /Hook khusus riwayat/.test(csvText) && /"ya"/.test(csvText), "CSV has the title, hook and downloaded flag");
    // It survives a reload (device storage), reopens the script in the studio, and can be deleted.
    await p.reload();
    await p.getByTestId("history-entry").first().waitFor({ timeout: 8000 });
    await p.getByTestId("history-entry").filter({ hasText: "Video A" }).getByTestId("history-open-studio").click();
    await p.getByTestId("script").waitFor({ timeout: 8000 });
    { await p.waitForTimeout(1500); const sv = await p.getByTestId("script").inputValue(); assert(sv.startsWith("Naskah video pertama yang unik."), "script reopened in the studio: " + sv.slice(0, 60) + " url=" + p.url()); }
    await p.goto(BASE.replace("/motion", "/riwayat"));
    await p.getByTestId("history-entry").filter({ hasText: "Video A" }).getByTestId("history-delete").click();
    assert(await p.getByTestId("history-entry").filter({ hasText: "Video A" }).count() === 0, "deleted");
    await ctxH.close();
  });

  await step("history sync: a second device signed in to the same account sees the first device's history, and a deletion on one reaches the other", async () => {
    const SB = "https://smwealrfgnzxquqqscxs.supabase.co";
    const table = new Map(); // the fake app_history table
    const calls = { pull: 0, push: 0 };
    async function device() {
      const c = await browser.newContext({ acceptDownloads: true });
      await c.addInitScript(() => { if (!localStorage.getItem("noai")) localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })); });
      await c.route("https://generativelanguage.googleapis.com/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ hookText: "Hook dari perangkat satu", voiceoverHook: "Pembuka.", caption: lorem(120), hashtags: ["#sinkron", "#disiplin", "#pagi"], thumbnailText: "SINKRON", searchTopics: ["a b", "c d", "e f"], seoReadinessScore: 77, quickFix: "Perbaikan." }) }] } }] }) }));
      await c.route(SB + "/**", async route => {
        const req = route.request(), u = new URL(req.url());
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, GET, OPTIONS" };
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        const send = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
        if (u.pathname === "/auth/v1/token") return send(200, { access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { email: "saya@contoh.id" } });
        if (u.pathname === "/rest/v1/app_history") {
          if (req.method() === "GET") { calls.pull++; return send(200, [...table.values()]); }
          calls.push++;
          for (const r of JSON.parse(req.postData() ?? "[]")) table.set(r.id, r);
          return route.fulfill({ status: 201, headers: cors });
        }
        if (u.pathname.startsWith("/rest/v1/")) return send(200, []);
        return send(404, {});
      });
      const p = await c.newPage();
      p.on("pageerror", e => pageErrors.push(e.message));
      return { c, p };
    }
    // Device 1: signs in on the studio, makes a SEO pack.
    const d1 = await device();
    await d1.p.goto(BASE); await d1.p.getByTestId("fold-seo").waitFor({ timeout: 8000 }).catch(() => undefined);
    await d1.p.getByTestId("cloud-open").click();
    await d1.p.getByTestId("cloud-email").fill("saya@contoh.id");
    await d1.p.getByTestId("cloud-password").fill("benar-sekali");
    await d1.p.getByTestId("cloud-signin").click();
    await d1.p.getByTestId("voice-none").click();
    await d1.p.getByTestId("title").fill("Video Sinkron");
    await d1.p.getByTestId("script").fill("Naskah untuk uji sinkron antar perangkat.\nKalimat kedua sinkron.");
    await d1.p.getByTestId("fold-seo").waitFor({ timeout: 8000 }); await openFolds(d1.p);
    await d1.p.getByTestId("seo-run").click();
    await d1.p.getByTestId("seo-result").waitFor({ timeout: 10000 });
    for (let i = 0; i < 80 && ![...table.values()].some(r => !r.deleted); i++) await d1.p.waitForTimeout(100);
    const rows = [...table.values()];
    assert(rows.length === 1 && rows[0].data.title === "Video Sinkron" && rows[0].data.seo.tiktok.result.score === 77 && rows[0].deleted === false, "device 1 pushed the entry: " + JSON.stringify(rows).slice(0, 200));
    // Device 2: another browser, same account (token seeded), opens the history page and sees it.
    const d2 = await device();
    await d2.c.addInitScript(() => localStorage.setItem("clipper:cloud:v1", JSON.stringify({ accessToken: "AT", refreshToken: "RT", expiresAt: Date.now() + 36e5, email: "saya@contoh.id" })));
    await d2.p.goto(BASE.replace("/motion", "/riwayat"));
    await d2.p.getByTestId("history-entry").filter({ hasText: "Video Sinkron" }).waitFor({ timeout: 10000 });
    assert(/Tersinkron/.test(await d2.p.getByTestId("history-sync").innerText()), "shows it is in sync");
    await d2.p.getByTestId("history-entry").filter({ hasText: "Video Sinkron" }).getByTestId("history-toggle").click();
    assert(/Hook dari perangkat satu/.test(await d2.p.getByTestId("history-detail").innerText()), "device 2 has the SEO pack made on device 1");
    // Deleting on device 2 reaches device 1.
    await d2.p.getByTestId("history-entry").filter({ hasText: "Video Sinkron" }).getByTestId("history-delete").click();
    for (let i = 0; i < 80 && ![...table.values()].some(r => r.deleted); i++) await d2.p.waitForTimeout(100);
    assert([...table.values()].some(r => r.deleted && r.data === null), "deletion pushed as a tombstone");
    await d1.p.goto(BASE.replace("/motion", "/riwayat"));
    await d1.p.getByTestId("history-sync").filter({ hasText: "Tersinkron" }).waitFor({ timeout: 10000 });
    assert(await d1.p.getByTestId("history-entry").filter({ hasText: "Video Sinkron" }).count() === 0, "device 1 no longer has the deleted video");
    // Signed out: it says history stays on this device.
    const d3 = await device();
    await d3.p.goto(BASE.replace("/motion", "/riwayat"));
    await d3.p.getByTestId("history-sync").waitFor({ timeout: 5000 });
    assert(/Belum masuk/.test(await d3.p.getByTestId("history-sync").innerText()), "signed-out note");
    await d1.c.close(); await d2.c.close(); await d3.c.close();
    return `pulls ${calls.pull}, pushes ${calls.push}`;
  });

  await step("cover prompt: a plain prompt is always there from the content, the AI's version is cleaned of buzzwords, both copy, and it follows the platform", async () => {
    const p = await (await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] })).newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE); await p.getByTestId("fold-seo").waitFor({ timeout: 8000 }); await openFolds(p);
    await p.getByTestId("title").fill("Gaji habis tanggal 5?");
    await p.getByTestId("script").fill("Kamu pernah gaji habis tanggal 5? Aku juga. Coba pecah jadi tiga pos.\nPos satu untuk kebutuhan wajib.\nSimpan dan bagikan ya.");
    await p.getByTestId("cover-section").waitFor({ timeout: 5000 });
    // Without a key and before any AI call, the prompt is already there and fits the content.
    const plain = await p.getByTestId("cover-prompt").innerText();
    assert(/Subject: Gaji habis tanggal 5\?/.test(plain) && /One real-looking adult/.test(plain) && /Do not draw any text/.test(plain) && /9:16 \(1080x1920\)/.test(plain), "plain prompt from the content: " + plain.slice(0, 200));
    assert(/plastic or waxy skin/.test(await p.getByTestId("cover-negative").innerText()), "negative prompt shown");
    assert(!/ultra-detailed|8k|masterpiece|cinematic lighting/i.test(plain), "no buzzwords in the plain prompt");
    await p.getByTestId("cover-copy").click();
    assert((await p.evaluate(() => navigator.clipboard.readText())) === plain, "copy gives the prompt");
    await p.getByTestId("seo-platform-linkedin").click();
    assert(/4:5 \(1080x1350\)/.test(await p.getByTestId("cover-prompt").innerText()), "follows the platform's cover shape");
    await p.getByTestId("seo-platform-tiktok").click();
    await p.close();

    // With the AI pack: its cover prompt is a card, cleaned, with the no-text rule and the standard negative terms added.
    const a = await (await browser.newContext()).newPage();
    await a.addInitScript(() => localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "k".repeat(30), model: "gemini-flash-latest", consent: true })));
    await a.route("https://generativelanguage.googleapis.com/**", async route => {
      const prompt = JSON.parse(route.request().postData() ?? "{}").contents?.[0]?.parts?.[0]?.text ?? "";
      seenCover.push(prompt);
      const pack = { hookText: "Gaji habis cepat?", voiceoverHook: "Kamu pernah gaji habis tanggal 5?", caption: lorem(120), hashtags: ["#gaji", "#hemat", "#keuangan"], thumbnailText: "GAJI HABIS?", searchTopics: ["hemat gaji", "atur gaji", "pos keuangan"], coverPrompt: "Ultra-detailed 8k masterpiece photo of a young man counting cash at a cluttered kitchen table, cinematic lighting, glowing phone, natural window light", coverNegative: "blurry", seoReadinessScore: 80, quickFix: "x" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(pack) }] } }] }) });
    });
    await a.goto(BASE); await a.getByTestId("fold-seo").waitFor({ timeout: 8000 }); await openFolds(a);
    await a.getByTestId("script").fill("Kamu pernah gaji habis tanggal 5? Aku juga. Coba pecah jadi tiga pos.\nPos satu untuk kebutuhan wajib.\nSimpan dan bagikan ya.");
    await a.getByTestId("seo-run").click();
    await a.getByTestId("seo-card-coverPrompt").waitFor({ timeout: 10000 });
    assert(/DILARANG memakai kata: ultra-detailed/.test(seenCover[0]) && /coverPrompt/.test(seenCover[0]), "the AI is asked for the cover prompt with the banned words");
    const ai = await a.getByTestId("seo-text-coverPrompt").innerText();
    assert(!/ultra-detailed|8k|masterpiece|cinematic lighting|glowing/i.test(ai) && /counting cash at a cluttered kitchen table/.test(ai) && /Do not draw any text/.test(ai), "AI prompt cleaned: " + ai);
    assert(/^blurry, .*plastic or waxy skin/.test(await a.getByTestId("seo-text-coverNegative").innerText()), "negative prompt completed");
    assert(/versi AI/i.test(await a.getByTestId("cover-section").innerText()), "points to the AI version");
    assert(/92|88|80/.test(await a.getByTestId("seo-score").innerText()) && (await a.getByTestId("seo-check-failed").count()) === 0, "the cover prompt does not touch the score or the checks");
    await a.getByTestId("seo-copy-coverPrompt").click();
    await a.close();
  });

  await step("no uncaught page errors", async () => { assert(pageErrors.length === 0, pageErrors.join(" | ")); });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
