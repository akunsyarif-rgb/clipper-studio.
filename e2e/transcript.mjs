// End-to-end check of the auto-transcript flow: production server + Chromium + FFmpeg WASM.
// Needs `npm run build` first and ffmpeg on PATH for the fixtures. The Whisper model is downloaded from the
// Hugging Face Hub; when that host is unreachable (sandbox/CI), the test checks the clear error instead of a transcript.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3212);
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "transcript-e2e-"));
const withAudio = join(dir, "dengan-suara.mp4");
const silent = join(dir, "tanpa-suara.mp4");
const common = ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=6"];
execFileSync("ffmpeg", [...common, "-f", "lavfi", "-i", "sine=frequency=300:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", withAudio]);
execFileSync("ffmpeg", [...common, "-c:v", "libx264", "-pix_fmt", "yuv420p", silent]);

const words = [["Jangan", 0.2], ["tunggu", 0.6], ["semangat", 1.0], ["datang.", 1.6], ["Mulailah", 3.0], ["sekarang", 3.6]]
  .map(([text, start], i, a) => ({ text, start, end: a[i + 1] ? a[i + 1][1] : 4.4 }));
const transcript = { language: "id", granularity: "word", duration: 5, segments: [
  { start: 0.2, end: 2.2, text: "Jangan tunggu semangat datang.", words: words.slice(0, 4) },
  { start: 3, end: 4.4, text: "Mulailah sekarang", words: words.slice(4) },
] };

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
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));

  await step("transcript panel appears after choosing a video", async () => {
    await page.goto(BASE);
    assert(!(await page.getByTestId("asr-panel").isVisible()), "panel hidden before upload");
    await page.getByTestId("file-input").setInputFiles(withAudio);
    await page.getByTestId("asr-panel").waitFor({ timeout: 10000 });
    // The panel says whether this address already holds the model; a stable address gets no preview warning.
    await page.getByTestId("asr-model-status").waitFor({ timeout: 5000 });
    assert(/belum tersimpan/.test(await page.getByTestId("asr-model-status").innerText()), "model not stored yet on a fresh address");
    assert((await page.getByTestId("asr-preview-hint").count()) === 0, "no preview hint on localhost");
  });

  await step("audio is extracted locally, then transcript or a clear model error is shown", async () => {
    await page.getByText("Video siap").waitFor({ timeout: 15000 });
    await page.getByTestId("asr-run").click();
    await page.getByTestId("asr-progress").waitFor({ timeout: 10000 });
    const outcome = await Promise.race([
      page.getByTestId("asr-list").waitFor({ timeout: 240000 }).then(() => "transcript"),
      page.getByTestId("asr-error").waitFor({ timeout: 240000 }).then(() => "error"),
    ]);
    if (outcome === "error") {
      const text = await page.getByTestId("asr-error").innerText();
      assert(/Model ucapan gagal diunduh|Transkripsi gagal|Tidak ada ucapan/.test(text), "unexpected error text: " + text);
      assert(!(await page.getByTestId("asr-progress").isVisible()), "progress cleared after error");
      assert(await page.getByTestId("asr-run").isEnabled(), "can retry after error");
      return "model unreachable here → " + text.slice(0, 60);
    }
    assert((await page.getByTestId("asr-seg").count()) > 0, "segments listed");
    return "transcript produced";
  });

  await step("video without audio gives a clear message", async () => {
    await page.reload();
    await page.getByTestId("file-input").setInputFiles(silent);
    await page.getByText("Video siap").waitFor({ timeout: 15000 });
    await page.getByTestId("asr-run").click();
    await page.getByTestId("asr-error").waitFor({ timeout: 120000 });
    const text = await page.getByTestId("asr-error").innerText();
    assert(/tidak memiliki suara/.test(text), "message: " + text);
  });

  await step("motion studio imports the transcript with word timing", async () => {
    await page.goto(BASE + "/motion");
    await page.evaluate(t => sessionStorage.setItem("clipper:transcript:v1", JSON.stringify({ v: 1, source: "dengan-suara.mp4", transcript: t })), transcript);
    await page.reload();
    await page.getByTestId("transcript-offer").waitFor({ timeout: 10000 });
    await page.getByTestId("transcript-import").click();
    assert((await page.getByTestId("script").inputValue()) === "Jangan tunggu semangat datang.\nMulailah sekarang", "script from transcript");
    await page.getByTestId("transcript-status").filter({ hasText: "mengikuti waktu kata" }).waitFor({ timeout: 5000 });
    await page.getByTestId("script").fill("Naskah lain sama sekali");
    await page.getByTestId("transcript-status").filter({ hasText: "sudah diubah" }).waitFor({ timeout: 5000 });
  });

  await step("motion studio accepts a video upload and offers the transcript there", async () => {
    await page.goto(BASE + "/motion");
    await page.getByTestId("source-video").setInputFiles(withAudio);
    await page.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    await page.screenshot({ path: process.env.E2E_SHOT || join(dir, "motion-upload.png"), fullPage: false });
    await page.getByTestId("asr-run").click();
    const outcome = await Promise.race([
      page.getByTestId("asr-list").waitFor({ timeout: 240000 }).then(() => "transcript"),
      page.getByTestId("asr-error").waitFor({ timeout: 240000 }).then(() => "error"),
    ]);
    return outcome === "error" ? "model unreachable here → clear error" : "transcript produced";
  });

  await step("a refresh offers to continue the last session, including the video, and the saved transcript returns", async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", e => errors.push(e.message));
    await p.goto(BASE + "/motion");
    await p.getByTestId("script").fill("Naskah saya yang pertama.\nKalimat kedua di sini.");
    await p.getByTestId("title").fill("Judul tersimpan");
    await p.getByTestId("palette").selectOption("pearl");
    await p.getByTestId("source-video").setInputFiles(withAudio);
    await p.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    await p.waitForTimeout(2500); // autosave is debounced and the video is written to storage

    // A transcript made earlier for this exact video part is stored under the studio's cache key.
    await p.evaluate(async t => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open("clipper-studio", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const get = key => new Promise(res => { const q = db.transaction("kv").objectStore("kv").get(key); q.onsuccess = () => res(q.result); });
      const src = await get("source");
      const key = `asr2:${src.name}|${src.blob.size}|${src.lastModified}|0.00|${src.seconds.toFixed(2)}|Xenova/whisper-small|indonesian`;
      await new Promise(res => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(t, key); tx.oncomplete = res; });
    }, transcript);

    await p.reload();
    await p.getByTestId("restore-offer").waitFor({ timeout: 10000 });
    const offerText = await p.getByTestId("restore-offer").innerText();
    assert(offerText.includes("Judul tersimpan") && offerText.includes("dengan-suara.mp4") && offerText.includes("2 scene"), "offer: " + offerText);
    assert((await p.getByTestId("script").inputValue()).startsWith("Jangan tunggu"), "nothing is applied before the creator agrees");

    await p.getByTestId("restore-session").click();
    await p.getByText("Ganti video (dengan-suara.mp4)").waitFor({ timeout: 10000 });
    assert((await p.getByTestId("script").inputValue()) === "Naskah saya yang pertama.\nKalimat kedua di sini.", "script restored");
    assert((await p.getByTestId("title").inputValue()) === "Judul tersimpan", "title restored");
    assert((await p.getByTestId("palette").inputValue()) === "pearl", "palette restored");
    assert(!(await p.getByTestId("restore-offer").isVisible().catch(() => false)), "offer gone after restoring");
    const seconds = await p.locator("video").first().evaluate(v => new Promise(res => { if (v.readyState >= 1) res(v.duration); else v.onloadedmetadata = () => res(v.duration); }));
    assert(seconds > 5 && seconds < 7, "restored video is playable, duration " + seconds);
    await p.getByTestId("asr-list").waitFor({ timeout: 10000 });
    assert((await p.getByTestId("asr-seg").count()) === 2, "saved transcript shown again");
    assert(/tanpa memproses ulang/.test(await p.getByTestId("asr-info").innerText()), "says it came from storage");

    // Gemini clean-up, with the endpoint faked: the key goes in a header, only text is sent, nothing is applied unasked.
    const KEY = "AIzaSyFAKE_E2E_KEY_0123456789abcdefgh";
    const sent = [];
    await p.route("https://generativelanguage.googleapis.com/**", async route => {
      const req = route.request();
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const body = JSON.parse(req.postData());
      sent.push({ url: req.url(), key: req.headers()["x-goog-api-key"], body: JSON.stringify(body) });
      const prompt = body.contents.at(-1).parts.at(-1).text;
      if (prompt.includes('{"scenes"')) {
        const scenes = JSON.parse(prompt.split("\n").at(-1)).map(x => ({ index: x.index, score: 0.05, reason: "basa-basi" }));
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ scenes }) }] } }] }) });
      }
      const lines = JSON.parse(prompt.split("\n").at(-1));
      const fixed = lines.map((t, i) => i === 0 ? t.replace(/\.?$/, "!") : t);
      await route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ lines: fixed }) }] } }] }) });
    });
    await p.getByText("Rapikan transkrip dengan Gemini").click();
    await p.getByTestId("gemini-key").fill(KEY);
    await p.getByTestId("gemini-save").click();
    await p.getByTestId("gemini-error").waitFor({ timeout: 3000 }); // consent is required first
    await p.getByTestId("gemini-consent").check();
    await p.getByTestId("gemini-save").click();
    await p.getByTestId("gemini-run").waitFor({ timeout: 3000 });
    assert(!(await p.content()).includes(KEY), "the key is never shown on the page");
    const before0 = await p.getByTestId("asr-seg").first().inputValue();
    await p.getByTestId("gemini-run").click();
    await p.getByTestId("gemini-change").first().waitFor({ timeout: 10000 });
    assert(sent.length === 1 && sent[0].key === KEY && !sent[0].url.includes(KEY), "key sent as a header only");
    assert(!sent[0].body.includes(KEY) && !/blob:|data:/.test(sent[0].body), "only the transcript text is sent");
    assert((await p.getByTestId("asr-seg").first().inputValue()) === before0, "nothing applied before the creator agrees");
    await p.getByTestId("gemini-apply").click();
    assert((await p.getByTestId("asr-seg").first().inputValue()).endsWith("!"), "accepted change applied");
    assert(/waktu kata dipertahankan/.test(await p.getByTestId("asr-info").innerText()), "says timing is kept");
    assert((await p.evaluate(() => localStorage.getItem("clipper:gemini:v1")) ?? "").includes(KEY), "key kept on this device");

    // Letting Gemini listen is a separate, explicit choice; the audio then travels with the request.
    assert(await p.getByTestId("gemini-run-audio").isDisabled(), "audio is off until the creator allows it");
    await p.getByTestId("gemini-audio-consent").check();
    await p.getByTestId("gemini-run-audio").click();
    await p.getByTestId("gemini-change").first().waitFor({ timeout: 60000 });
    const heard = JSON.parse(sent.at(-1).body).contents[0].parts;
    assert(sent.length === 2 && heard[0].inlineData?.mimeType === "audio/wav" && heard[0].inlineData.data.startsWith("UklGR"), "the audio is attached as a WAV");
    assert(/Detik mulai/.test(heard.at(-1).text), "each line carries its start time");

    // Use the saved transcript: editing over the video, with an animation drawn over the speaker by default.
    await p.getByTestId("asr-use").click();
    await p.getByTestId("scene-cut").first().waitFor({ timeout: 10000 });
    // Not every sentence is animated: each scene says whether it is and why, and the amount can be changed.
    const note = await p.getByTestId("scene-importance").first().innerText();
    assert(/^(Animasi|Tanpa animasi): /.test(note), "each scene explains its choice: " + note);
    assert((await p.getByTestId("animation-density").inputValue()) === "balanced", "balanced by default");
    assert((await p.getByTestId("brand-motion").inputValue()) === "simple", "calm brand animation by default");
    await p.getByTestId("animation-density").selectOption("rich");

    // A second opinion from Gemini on which sentences deserve an animation: averaged with the rules, shown per scene.
    const notesBefore = await p.getByTestId("scene-importance").allInnerTexts();
    assert(!notesBefore.some(t => /Gemini/.test(t)), "no Gemini opinion until asked");
    await p.getByTestId("gemini-judge-run").click();
    await p.getByTestId("gemini-judge-active").waitFor({ timeout: 10000 });
    const judgeCall = JSON.parse(sent.at(-1).body);
    assert(!JSON.stringify(judgeCall).includes("inlineData"), "judging sends text only");
    const notesAfter = await p.getByTestId("scene-importance").allInnerTexts();
    assert(notesAfter.some(t => /Gemini 0\.05: basa-basi/.test(t)), "scene list shows Gemini's reason: " + notesAfter.join(" | "));
    await p.getByTestId("gemini-judge-clear").click();
    assert(!(await p.getByTestId("scene-importance").allInnerTexts()).some(t => /Gemini/.test(t)), "rules only again after clearing");
    await p.getByTestId("gemini-forget").click();
    assert((await p.evaluate(() => localStorage.getItem("clipper:gemini:v1"))) === null, "key forgotten");

    // Signed in, the key lives on the owner's server: saved there, used through it, never kept in this browser.
    const SB2 = "https://smwealrfgnzxquqqscxs.supabase.co";
    const srv = { key: null, model: null, generated: 0, authed: true };
    await p.context().route(SB2 + "/**", async route => {
      const req = route.request(), u = new URL(req.url());
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, GET, OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const send = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      if (u.pathname === "/auth/v1/token") return send(200, { access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { email: "saya@contoh.id" } });
      if (u.pathname !== "/functions/v1/gemini") return send(404, {});
      if (req.headers().authorization !== "Bearer AT") { srv.authed = false; return send(401, { error: { status: "NOT_SIGNED_IN", message: "Masuk dulu." } }); }
      const m = JSON.parse(req.postData());
      if (m.action === "status") return send(200, { hasKey: !!srv.key, model: srv.model || "gemini-2.5-flash" });
      if (m.action === "save-key") { srv.key = m.apiKey; srv.model = m.model; return send(200, { ok: true, model: m.model }); }
      if (m.action === "forget") { srv.key = null; return send(200, { ok: true }); }
      if (m.action === "generate") {
        srv.generated++;
        const lines = JSON.parse(m.body.contents.at(-1).parts.at(-1).text.split("\n").at(-1));
        return send(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ lines: lines.map((t, i) => i === 0 ? t + "?" : t) }) }] } }] });
      }
      return send(400, {});
    });
    const directBefore = sent.length;
    await p.getByTestId("cloud-open").click();
    await p.getByTestId("cloud-email").fill("saya@contoh.id");
    await p.getByTestId("cloud-password").fill("benar-sekali");
    await p.getByTestId("cloud-signin").click();
    await p.getByTestId("cloud-signed-in").waitFor({ timeout: 5000 });
    await p.getByTestId("gemini-key").waitFor({ timeout: 5000 });
    assert(/server akun/.test(await p.locator(".gemini-setup").innerText()), "setup says the key goes to the server");
    await p.getByTestId("gemini-key").fill(KEY);
    await p.getByTestId("gemini-consent").check();
    await p.getByTestId("gemini-save").click();
    await p.getByTestId("gemini-run").waitFor({ timeout: 5000 });
    assert(srv.key === KEY, "the key reached the server");
    assert((await p.evaluate(() => localStorage.getItem("clipper:gemini:v1"))) === null, "the key is not kept in this browser");
    assert(/server/.test(await p.getByTestId("gemini-where").innerText()), "panel says the key is on the server");
    assert(!(await p.content()).includes(KEY), "the key is not on the page");
    await p.getByTestId("gemini-run").click();
    await p.getByTestId("gemini-change").first().waitFor({ timeout: 10000 });
    assert(srv.generated === 1 && sent.length === directBefore, "the call went through the server, not straight to Google");
    assert(srv.authed, "the server was called with the signed-in token");
    await p.getByTestId("gemini-forget").click();
    await p.getByTestId("gemini-key").waitFor({ timeout: 5000 });
    assert(srv.key === null, "forgetting removes the key from the server");
    const autoLabel = await p.getByTestId("scene-cut").first().locator("option").first().innerText();
    assert(/Video \+ animasi/.test(autoLabel), "first scene defaults to an animation over the video: " + autoLabel);
    const options = await p.getByTestId("scene-cut").first().locator("option").allInnerTexts();
    assert(options.some(o => /Grafis penuh/.test(o)) && options.some(o => /Potongan lain/.test(o)), "full graphic and clip stay available: " + options.join("|"));
    const player = p.locator(".player-wrap");
    await p.getByTestId("scene-item").first().locator(".scene-row").click();
    // The animation waits for the word it is about ("semangat", said 1 s in): at the start of the scene there is none.
    await p.waitForTimeout(600);
    assert((await player.locator("[data-overlay]").count()) === 0, "no animation before its word is spoken");
    await player.hover();
    await player.locator("button").first().click(); // play
    await player.locator('[data-overlay="top"]').first().waitFor({ state: "attached", timeout: 15000 });
    await player.locator("button").first().click(); // pause inside the animation
    await p.getByTestId("overlay-position").selectOption("lower");
    await player.locator('[data-overlay="lower"]').first().waitFor({ state: "attached", timeout: 10000 });
    assert((await player.locator('[data-overlay="top"]').count()) === 0, "the top overlay is replaced by the lower one");
    await p.getByTestId("scene-cut").first().selectOption("video");
    await p.waitForTimeout(800);
    assert((await player.locator("[data-overlay]").count()) === 0, "no animation when the scene is set to video + subtitle");
    await p.getByTestId("scene-cut").first().selectOption("overlay");
    await p.getByTestId("overlay-position").selectOption("top");
    await p.waitForTimeout(1200); // autosave includes the overlay position

    // Start over: everything is forgotten.
    await p.reload();
    await p.getByTestId("restore-offer").waitFor({ timeout: 10000 });
    await p.getByTestId("restore-discard").click();
    assert((await p.getByTestId("script").inputValue()).startsWith("Jangan tunggu"), "sample script after starting over");
    await p.reload();
    await p.waitForTimeout(1500);
    assert((await p.getByTestId("restore-offer").count()) === 0, "nothing offered after starting over");
    assert(errors.length === 0, errors.join(" | "));
    await ctx.close();
  });

  await step("a tablet gets the lighter model, and a run that took the page down is recognised", async () => {
    const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
    const pc = await browser.newContext();
    const desktop = await pc.newPage();
    await desktop.goto(BASE);
    await desktop.getByTestId("file-input").setInputFiles(withAudio);
    await desktop.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    assert((await desktop.getByTestId("asr-model").inputValue()) === "Xenova/whisper-small", "computers keep the accurate model");
    assert((await desktop.getByTestId("asr-heavy-hint").count()) === 0, "no memory warning on a computer");
    await pc.close();

    const ctx = await browser.newContext({ userAgent: IPAD, hasTouch: true, viewport: { width: 1024, height: 1366 } });
    // A real iPad reports 5 touch points (Playwright's emulation reports 1).
    await ctx.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 }));
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.getByTestId("file-input").setInputFiles(withAudio);
    await p.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    assert((await p.getByTestId("asr-model").inputValue()) === "Xenova/whisper-base", "tablets start with the base model");
    await p.getByTestId("asr-model").selectOption("Xenova/whisper-small");
    await p.getByTestId("asr-heavy-hint").waitFor({ timeout: 3000 });

    // The previous run died: the mark is still there when the page opens again.
    await p.evaluate(() => localStorage.setItem("clipper:asr-run", JSON.stringify({ model: "Xenova/whisper-small", at: Date.now() })));
    await p.reload();
    await p.getByTestId("file-input").setInputFiles(withAudio);
    await p.getByTestId("asr-panel").waitFor({ timeout: 15000 });
    await p.getByTestId("asr-crashed").waitFor({ timeout: 3000 });
    assert((await p.getByTestId("asr-model").inputValue()) === "Xenova/whisper-base", "one model lighter after a crash");
    assert((await p.evaluate(() => localStorage.getItem("clipper:asr-run"))) === null, "the mark is cleared once reported");
    await ctx.close();
  });

  await step("signing in syncs the session and transcripts between devices (Supabase faked); signed out sends nothing", async () => {
    const SB = "https://smwealrfgnzxquqqscxs.supabase.co";
    const db = { session: null, transcripts: {}, users: [] };
    const seen = [];
    const mock = async ctx => ctx.route(SB + "/**", async route => {
      const req = route.request(), u = new URL(req.url());
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      seen.push(req.method() + " " + u.pathname + u.search);
      const ok = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      const tokens = { access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { email: "saya@contoh.id" } };
      if (u.pathname === "/auth/v1/signup") { if (db.users.length) return ok(500, { error_code: "unexpected_failure", msg: "Database error saving new user" }); db.users.push("saya"); return ok(200, tokens); }
      if (u.pathname === "/auth/v1/token") { const b = JSON.parse(req.postData()); return b.password === "benar-sekali" ? ok(200, tokens) : ok(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" }); }
      if (req.headers().authorization !== "Bearer AT") return ok(401, {});
      if (u.pathname === "/rest/v1/app_sessions") {
        if (req.method() === "POST") { db.session = JSON.parse(req.postData()).data; return route.fulfill({ status: 201, headers: cors }); }
        return ok(200, db.session ? [{ data: db.session }] : []);
      }
      if (u.pathname === "/rest/v1/app_transcripts") {
        if (req.method() === "POST") { const b = JSON.parse(req.postData()); db.transcripts[b.cache_key] = b.data; return route.fulfill({ status: 201, headers: cors }); }
        const key = u.searchParams.get("cache_key").replace(/^eq\./, "");
        return ok(200, db.transcripts[key] ? [{ data: db.transcripts[key] }] : []);
      }
      return ok(404, {});
    });

    // Device A: wrong password is explained, then signing in, then writing a script is saved to the account.
    const a = await browser.newContext(); await mock(a);
    const pa = await a.newPage();
    await pa.goto(BASE + "/motion");
    await pa.getByTestId("cloud-open").click();
    await pa.getByTestId("cloud-email").fill("saya@contoh.id");
    await pa.getByTestId("cloud-password").fill("salah-banget");
    await pa.getByTestId("cloud-signin").click();
    assert(/salah/.test(await pa.getByTestId("cloud-error").innerText()), "wrong password explained");
    await pa.getByTestId("cloud-password").fill("benar-sekali");
    await pa.getByTestId("cloud-signup").click();
    await pa.getByTestId("cloud-signed-in").waitFor({ timeout: 5000 });
    assert(/Tersinkron/.test(await pa.locator(".local-tag").innerText()), "heading says synced");
    await pa.getByTestId("script").fill("Naskah dari perangkat pertama.\nKalimat kedua untuk diuji.");
    await pa.waitForFunction(() => true); await pa.waitForTimeout(3500);
    assert(db.session?.script?.startsWith("Naskah dari perangkat pertama"), "session reached the account");
    assert(!JSON.stringify(db).includes("benar-sekali"), "the password is never stored as data");
    db.transcripts["asr2:contoh.mp4|1|2|0.00|3.00|Xenova/whisper-base|indonesian"] = { language: "indonesian", granularity: "word", duration: 3, segments: [{ start: 0, end: 1, text: "dari akun", words: [{ text: "dari", start: 0, end: 0.5 }, { text: "akun", start: 0.5, end: 1 }] }] };
    await a.close();

    // Device B (a fresh browser): signed out it sends nothing; signed in it is offered the newer session from device A.
    const b = await browser.newContext(); await mock(b);
    const pb = await b.newPage();
    seen.length = 0;
    await pb.goto(BASE + "/motion");
    await pb.getByTestId("cloud-open").waitFor({ timeout: 10000 });
    await pb.waitForTimeout(1500);
    assert(seen.length === 0, "signed out: no request to the service: " + seen.join(", "));
    await pb.getByTestId("cloud-open").click();
    await pb.getByTestId("cloud-email").fill("saya@contoh.id");
    await pb.getByTestId("cloud-password").fill("benar-sekali");
    await pb.getByTestId("cloud-signin").click();
    await pb.getByTestId("restore-offer").waitFor({ timeout: 10000 });
    assert(/Dari akun Anda/.test(await pb.getByTestId("restore-offer").innerText()), "offer says it comes from the account");
    await pb.getByTestId("restore-session").click();
    assert((await pb.getByTestId("script").inputValue()).startsWith("Naskah dari perangkat pertama"), "script restored on the other device");
    await pb.getByTestId("cloud-signout").click();
    await pb.getByTestId("cloud-open").waitFor({ timeout: 3000 });
    assert((await pb.evaluate(() => localStorage.getItem("clipper:cloud:v1"))) === null, "signing out forgets the session");
    await b.close();

    // A closed sign-up (the owner's account exists) is explained.
    const c = await browser.newContext(); await mock(c);
    const pc = await c.newPage();
    await pc.goto(BASE);
    await pc.getByTestId("cloud-open").click();
    await pc.getByTestId("cloud-email").fill("orang@lain.id");
    await pc.getByTestId("cloud-password").fill("kata-sandi-lain");
    await pc.getByTestId("cloud-signup").click();
    assert(/masih pribadi/.test(await pc.getByTestId("cloud-error").innerText()), "closed sign-up explained");
    await c.close();
  });

  await step("no uncaught page errors", async () => { assert(pageErrors.length === 0, pageErrors.join(" | ")); });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
