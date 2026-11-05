// End-to-end check of Cinematic Studio: production server + Chromium. A brief becomes a beat-aligned storyboard, is applied to the
// studio (script, look, motion presets, scene lengths), survives a reload, and renders to an MP4 whose length matches the beat plan.
// Needs `npm run build` first, plus ffmpeg/ffprobe on PATH.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  const page = await (await browser.newContext({ acceptDownloads: true, viewport: { width: 820, height: 1180 } })).newPage();
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
    assert(/Tempo 60 ketukan per menit/.test(await page.getByTestId("cine-beat").innerText()), "cinematic tempo");
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

  await step("the signature presets really draw in the preview: black flood on the reveal scene, glass card on a feature scene, nothing blurred", async () => {
    const fxs = await page.getByTestId("cine-fx").evaluateAll(els => els.map(e => e.value));
    const flood = fxs.indexOf("flood"), glass = fxs.indexOf("liquid-glass");
    assert(flood >= 0 && glass >= 0, "the plan uses a flood and a glass scene: " + fxs);
    await page.getByTestId("scene-item").nth(flood).locator(".scene-row").click();
    await page.locator(".player-wrap [data-fx-flood]").first().waitFor({ timeout: 8000 });
    await page.getByTestId("scene-item").nth(glass).locator(".scene-row").click();
    await page.locator(".player-wrap [data-fx-glass]").first().waitFor({ timeout: 8000 });
    assert((await page.locator(".player-wrap [style*='blur(']").count()) === 0, "no blur filter anywhere in the preview");
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

  await step("the motion library applies a built-in look to the active storyboard and keeps the creator's own preset", async () => {
    await page.getByTestId("preset-select").selectOption("content:education");
    await page.getByTestId("preset-apply").click();
    await page.getByTestId("cine-apply").click();
    assert((await page.getByTestId("palette").inputValue()) === "pearl" && (await page.getByTestId("style").inputValue()) === "hybrid", "the template's look is applied");
    await page.getByTestId("preset-name").fill("Gaya uji");
    await page.getByTestId("preset-save").click();
    await page.getByTestId("cine-note").waitFor({ timeout: 3000 });
    const opts = await page.getByTestId("preset-select").locator("option").allInnerTexts();
    assert(opts.includes("Gaya uji"), "own preset listed: " + opts.join(","));
  });

  await step("the plan survives a reload (offered back with the session)", async () => {
    await page.waitForTimeout(2500); // autosave is debounced
    await page.reload(); await openFolds(page);
    await page.getByTestId("restore-offer").waitFor({ timeout: 10000 });
    await page.getByTestId("restore-session").click();
    await page.getByTestId("fold-cinematic").evaluate(d => { d.open = true; });
    await page.getByTestId("cine-clear").waitFor({ timeout: 10000 });
    assert((await page.getByTestId("cine-list").locator("li").count()) === planned, "same storyboard after reload");
    assert((await page.getByTestId("preset-select").locator("option").allInnerTexts()).includes("Gaya uji"), "own preset still there after reload");
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

  await step("not only products: another kind of film changes the labels and the wording (education)", async () => {
    await page.getByTestId("fold-cinematic").evaluate(d => { d.open = true; });
    await page.getByTestId("cine-genre").selectOption("edukasi");
    assert((await page.getByText("Pertanyaan atau pembuka").count()) >= 1 && (await page.getByText("Langkah atau poin penting").count()) >= 1, "labels follow the kind of film");
    await page.getByTestId("cine-product").fill("Fotosintesis");
    await page.getByTestId("cine-tagline").fill("");
    await page.getByTestId("cine-build").click();
    const list = await page.getByTestId("cine-list").innerText();
    assert(/Apa itu Fotosintesis\?/.test(list) && /Inilah kuncinya\./.test(list), "education wording: " + list.slice(0, 120));
    assert(/pembuka/.test(list) && /kuncinya|ringkasan/.test(list), "act names fit the genre");
  });

  await step("a command becomes a plan to approve first: one AI call, nothing applied until the creator says so; a paid model needs an explicit permission", async () => {
    let calls = 0;
    await page.route("https://generativelanguage.googleapis.com/**", async route => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (route.request().method() === "GET") return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ models: [{ name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] }) });
      calls++;
      const brief = { genre: "produk", product: "Kopi Pagi", tagline: "Mulai harimu hangat", problem: "", features: ["Biji pilihan", "Seduh tiga menit"], proof: "", cta: "Pesan sekarang", tone: "warm", seconds: 30, visuals: [{ term: "coffee cup", kind: "photo" }, { term: "pouring coffee", kind: "video" }, { term: "morning light", kind: "photo" }] };
      await route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(brief) }] } }] }) });
    });
    await page.evaluate(() => { localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "K".repeat(30), model: "gemini-2.5-pro", consent: true })); window.dispatchEvent(new Event("clipper:ai-access")); });
    await page.getByTestId("fold-cinematic").evaluate(d => { d.open = true; });
    const scriptBefore = await page.getByTestId("script").inputValue();
    await page.getByTestId("command-input").fill("Buat video produk kopi 30 detik, suasana hangat, ajak orang memesan");
    await page.getByTestId("command-paid-ok").waitFor({ timeout: 5000 });
    // The model in use is chosen right here (no trip to the settings); a model that is not free is labelled.
    await page.getByTestId("ai-model-pick").first().waitFor({ timeout: 5000 });
    assert(/gemini-2\.5-pro · bisa ditagih/.test(await page.getByTestId("ai-model-pick").first().innerText()), "the model in use is shown with its label");
    await page.getByTestId("ai-model-pick").first().focus();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="ai-model-pick"] option')].some(o => /gemini-2\.5-flash/.test(o.textContent)), null, { timeout: 8000 });
    await page.getByTestId("command-run").click();
    await page.getByTestId("cine-error").waitFor({ timeout: 5000 });
    assert(/bukan model gratis/.test(await page.getByTestId("cine-error").innerText()) && calls === 0, "a paid model is not used without the creator's permission");
    // Picking a model in the list is an explicit choice: it is saved for every AI feature and counts as the permission for a paid one.
    await page.getByTestId("ai-model-pick").first().selectOption("gemini-2.5-flash");
    await page.waitForFunction(() => /gemini-2\.5-flash/.test(JSON.parse(localStorage.getItem("clipper:gemini:v1") || "{}").model || ""), null, { timeout: 5000 });
    await page.getByTestId("command-paid-ok").waitFor({ state: "detached", timeout: 5000 }); // the choice is the permission, so the question goes away
    await page.getByTestId("command-run").click();
    await page.getByTestId("command-terms").waitFor({ timeout: 15000 });
    assert(calls === 1, "one AI call for the whole plan: " + calls);
    assert(/Belum ada yang diubah/.test(await page.getByTestId("cine-note").innerText()), "says nothing is applied yet");
    assert((await page.getByTestId("script").inputValue()) === scriptBefore, "the studio's script is untouched before approval");
    assert((await page.getByTestId("cine-product").inputValue()) === "Kopi Pagi" && (await page.getByTestId("cine-list").locator("li").count()) >= 4, "the form and the storyboard are filled from the command");
    assert(/coffee cup \(foto\)/.test(await page.getByTestId("command-terms").innerText()) && /pouring coffee \(video\)/.test(await page.getByTestId("command-terms").innerText()), "what is looked for is offered, with photo or video for each");
    // Pixabay is faked: a real tiny JPEG so the app accepts the "download".
    const jpg = join(dir, "p.jpg");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x3377aa:s=320x480", "-frames:v", "1", jpg]);
    const jpgBytes = readFileSync(jpg);
    const pix = [];
    await page.route("**/api/pixabay", async route => {
      const body = JSON.parse(route.request().postData() || "{}");
      pix.push(body);
      if (body.action === "video-search") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ videos: [{ id: 901, tags: "x", photographer: "Videografer", pageUrl: "https://pixabay.com/v/901", duration: 8, url: "https://cdn.pixabay.com/video/901.mp4", thumbnail: "t", width: 720, height: 1280, size: 1000 }, { id: 902, tags: "y", photographer: "V2", pageUrl: "https://pixabay.com/v/902", duration: 90, url: "https://cdn.pixabay.com/video/902.mp4", thumbnail: "t", width: 720, height: 1280, size: 10 }], totalHits: 2, remaining: 80 }) });
      if (body.action === "search") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ photos: [1, 2, 3, 4, 5, 6].map(n => ({ id: n + pix.length * 10, alt: "x", photographer: "Fotografer", pageUrl: "https://pixabay.com/p/" + n, thumb: "t", image: "https://pixabay.com/img/" + n + ".jpg" })), totalHits: 6, remaining: 90 }) });
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: jpgBytes });
    });
    await page.getByTestId("cine-apply").click();
    await page.waitForFunction(() => /Mulai harimu hangat/.test(document.querySelector('[data-testid="script"]').value), null, { timeout: 5000 });
    // The photos are filled in on their own, from the command's picture words; each can be swapped or removed afterwards.
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="scene-image-remove"]').length >= 3, null, { timeout: 30000 });
    assert(pix.some(b => b.action === "search" && /coffee cup|morning light/.test(JSON.stringify(b))), "the photo search used the command's picture words: " + JSON.stringify(pix.find(b => b.action === "search")));
    assert(pix.some(b => b.action === "video-search" && /pouring coffee/.test(JSON.stringify(b))), "a short clip was looked for where the agent judged it fits: " + JSON.stringify(pix.map(b => b.action)));
    await page.getByTestId("pixabay-auto-summary").waitFor({ timeout: 30000 });
    const sum = await page.getByTestId("pixabay-auto-summary").innerText();
    assert(/\d+ foto/.test(sum) && /\d+ video/.test(sum), "photos and short clips are mixed: " + sum);
    assert(await page.getByTestId("scene-image-pexels").first().isVisible(), "a photo can be swapped scene by scene");
    await page.evaluate(() => localStorage.removeItem("clipper:gemini:v1"));
  });

  await step("an AI problem has a way forward: a running timer with Batal, and a failed call offers retry, change model or carry on without AI", async () => {
    let mode = "slow";
    await page.route("https://generativelanguage.googleapis.com/**", async route => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors }).catch(() => {});
      if (req.method() === "GET") return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] }) }).catch(() => {});
      if (mode === "slow") { await new Promise(r => setTimeout(r, 6000)); return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" }).catch(() => {}); }
      return route.fulfill({ status: 500, headers: cors, contentType: "application/json", body: JSON.stringify({ error: { message: "boom" } }) }).catch(() => {});
    });
    await page.evaluate(() => { localStorage.setItem("clipper:gemini:v1", JSON.stringify({ apiKey: "K".repeat(30), model: "uji:free", consent: true })); window.dispatchEvent(new Event("clipper:ai-access")); });
    await page.getByTestId("fold-cinematic").evaluate(d => { d.open = true; });
    await page.getByTestId("command-input").fill("Buat video produk teh 30 detik, suasana tenang");
    await page.getByTestId("command-run").click();
    await page.getByTestId("ai-busy").waitFor({ timeout: 5000 });
    await page.waitForFunction(() => /\d+ dtk/.test(document.querySelector('[data-testid="ai-busy"]')?.textContent ?? ""), null, { timeout: 5000 });
    await page.getByTestId("ai-cancel").click();
    await page.getByTestId("ai-busy").waitFor({ state: "hidden", timeout: 5000 });
    assert(/Dibatalkan/.test(await page.getByTestId("cine-note").innerText()), "cancel is acknowledged and nothing changed");
    mode = "fail";
    await page.getByTestId("command-input").fill("Buat video produk kopi 30 detik, suasana hangat");
    await page.getByTestId("command-run").click();
    await page.getByTestId("ai-error-retry").waitFor({ timeout: 20000 });
    assert(/Layanan AI sedang sibuk/.test(await page.getByTestId("cine-error").innerText()), "the problem is explained in plain words");
    await page.getByTestId("ai-error-model").click();
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "ai-model-pick", null, { timeout: 3000 });
    await page.getByTestId("ai-error-dismiss").click();
    assert(await page.getByTestId("cine-error").count() === 0, "carrying on without AI clears the problem");
    await page.evaluate(() => localStorage.removeItem("clipper:gemini:v1"));
  });

  await step("no horizontal scroll on iPhone-size viewport", async () => {
    await page.setViewportSize({ width: 390, height: 844 }); // the phone layout shows one step at a time
    await page.waitForTimeout(300);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    const wide = w[0] <= w[1] + 1 ? [] : await page.evaluate(() => [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest("nav")).slice(0, 6).map(e => `${e.tagName}.${String(e.className).slice(0, 30)}[${e.dataset.testid ?? ""}]`));
    assert(w[0] <= w[1] + 1, `scrollWidth ${w[0]} > ${w[1]}: ${wide.join(", ")}`);
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
