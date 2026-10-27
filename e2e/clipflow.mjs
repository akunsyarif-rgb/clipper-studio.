// End-to-end check of the AI clip flow: a long-ish video, the AI (faked) listens to real MP3 audio cut by FFmpeg WASM,
// suggests clips, the creator approves, and a clip is cut and handed to the motion studio with its subtitles.
// Needs `npm run build` first and ffmpeg on PATH for the fixture.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3213);
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "clipflow-e2e-"));
const video = join(dir, "video-panjang.mp4");
const shortVideo = join(dir, "video-pendek.mp4");
for (const [path, seconds] of [[video, 100], [shortVideo, 30]]) execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `testsrc=size=320x240:rate=30:duration=${seconds}`, "-f", "lavfi", "-i", `sine=frequency=300:duration=${seconds}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path]);

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
const results = [];
let failed = false;
async function step(name, fn) {
  const t = Date.now();
  try { const info = await fn(); results.push(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${info ? " — " + info : ""}`); }
  catch (err) { failed = true; results.push(`FAIL ${name}: ${err instanceof Error ? err.message : err}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const SB = "https://smwealrfgnzxquqqscxs.supabase.co";
const LINES = [
  { start: 2, end: 10, text: "Halo semuanya selamat datang di video ini." },
  { start: 12, end: 25, text: "Hari ini saya bahas tiga tips keuangan penting." },
  { start: 30, end: 50, text: "Tips pertama adalah catat semua pengeluaran Anda." },
  { start: 55, end: 80, text: "Tips kedua sisihkan tabungan di awal bulan." },
];
const seen = { audio: [], moments: 0, status: 0, captions: 0, ytMomentLines: 0 };
/** Captions of a 100 s video, a line every 5 s. */
const CAPTIONS = Array.from({ length: 20 }, (_, i) => ({ start: i * 5, end: i * 5 + 4, text: `Kalimat ke ${i} tentang topik penting.` }));
const pastedText = CAPTIONS.map(l => `${Math.floor(l.start / 60)}:${String(l.start % 60).padStart(2, "0")}\n${l.text}`).join("\n");

try {
  for (let i = 0; i < 60 && !(await fetch(BASE).then(() => true, () => false)); i++) await new Promise(r => setTimeout(r, 500));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const pageErrors = [];
  await ctx.route(SB + "/**", async route => {
    const req = route.request(), u = new URL(req.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, GET, OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const send = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname === "/auth/v1/token") return send(200, { access_token: "AT", refresh_token: "RT", expires_in: 3600, user: { email: "saya@contoh.id" } });
    if (u.pathname.startsWith("/rest/v1/")) return send(200, []);
    if (u.pathname === "/functions/v1/youtube") {
      const body = JSON.parse(req.postData());
      seen.captions++;
      if (/BLOCKEDvid1/.test(body.url)) return send(502, { error: { status: "BLOCKED", message: "YouTube menolak" } });
      return send(200, { videoId: "okvideo0001", title: "Video Uji YouTube", seconds: 100, language: "id", auto: true, lines: CAPTIONS });
    }
    if (u.pathname !== "/functions/v1/gemini") return send(404, {});
    const m = JSON.parse(req.postData());
    if (m.action === "status") { seen.status++; return send(200, { hasKey: true, provider: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-x" }); }
    if (m.action === "generate") {
      const content = m.body.messages[0].content;
      const parts = Array.isArray(content) ? content : [{ type: "text", text: content }];
      const text = parts.find(p => p.type === "text").text;
      const answer = obj => send(200, { choices: [{ message: { content: JSON.stringify(obj) } }] });
      const audio = parts.find(p => p.type === "input_audio");
      if (audio) {
        const raw = Buffer.from(audio.input_audio.data, "base64");
        seen.audio.push({ format: audio.input_audio.format, bytes: raw.length, head: raw.subarray(0, 3).toString("latin1") });
        return answer({ lines: LINES });
      }
      if (text.includes('"moments"')) {
        const lines = JSON.parse(text.split("\n").at(-1));
        if (lines.length > 6) { seen.ytMomentLines = lines.length; return answer({ moments: [{ start: 1, end: 4, title: "Bagian awal penting", reason: "dari teks YouTube" }, { start: 6, end: 9, title: "Bagian akhir penting", reason: "dari teks YouTube" }] }); }
        seen.moments++; return answer({ moments: [{ start: 1, end: 2, title: "Tiga tips keuangan", reason: "pembuka kuat" }, { start: 3, end: 3, title: "Sisihkan tabungan dulu", reason: "tips praktis" }] });
      }
      return answer({ lines: [] });
    }
    return send(400, {});
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => pageErrors.push(e.message));

  await step("without signing in, the flow says what it needs and manual cutting stays open", async () => {
    await page.goto(BASE);
    await page.getByTestId("file-input").setInputFiles(video);
    await page.getByText("Video siap").waitFor({ timeout: 15000 }).catch(() => undefined);
    await page.getByTestId("flow-needs-ai").waitFor({ timeout: 15000 });
    assert(await page.getByTestId("asr-panel").isVisible(), "manual transcript panel is open without an AI key");
  });

  await step("signed in, the AI listens to MP3 audio, suggests clips, and the creator adjusts and approves", async () => {
    await page.getByTestId("cloud-open").click();
    await page.getByTestId("cloud-email").fill("saya@contoh.id");
    await page.getByTestId("cloud-password").fill("benar-sekali");
    await page.getByTestId("cloud-signin").click();
    await page.getByTestId("flow-consent").waitFor({ timeout: 10000 });
    assert(await page.getByTestId("flow-analyze").isDisabled(), "analysis waits for consent");
    await page.getByTestId("flow-consent").check();
    await page.getByTestId("flow-analyze").click();
    await page.getByTestId("flow-item").first().waitFor({ timeout: 120000 });
    assert(seen.audio.length === 1, "one audio part for a 100 s video: " + seen.audio.length);
    const a = seen.audio[0];
    assert(a.format === "mp3" && a.bytes > 100_000 && a.bytes < 1_000_000, "real MP3 audio was sent: " + JSON.stringify(a));
    assert(a.head === "ID3" || a.head.charCodeAt(0) === 0xff, "the audio is MP3 data: " + JSON.stringify(a.head));
    assert((await page.getByTestId("flow-item").count()) === 2, "two clips suggested");
    const first = await page.getByTestId("flow-item").first().innerText();
    assert(/Tiga tips keuangan/.test(first) && /00:00:12/.test(first) && /00:00:50/.test(first), "first clip has title and times: " + first);
    assert(!(await page.content()).includes("benar-sekali"), "no password on the page");
    await page.getByTestId("flow-item").first().getByText("Sesuaikan waktu").click();
    await page.getByTestId("flow-item").first().getByTestId("flow-end-plus").click();
    await page.getByTestId("flow-item").first().getByText("Selesai +2 dtk").waitFor();
    assert(/00:00:52/.test(await page.getByTestId("flow-item").first().innerText()), "the end moved by two seconds");
    await page.getByTestId("flow-play").first().click();
    await page.waitForTimeout(500);
    assert(await page.locator("video").first().evaluate(v => v.currentTime >= 11.5), "preview jumped to the clip's start");
    await page.getByTestId("flow-add").click();
    await page.locator(".clip-list-heading").waitFor({ timeout: 5000 });
    const rows = await page.locator(".clip-row").allInnerTexts();
    assert(rows.length === 2 && /Tiga tips keuangan/.test(rows[0]) && /Sisihkan tabungan dulu/.test(rows[1]), "approved clips are in the list: " + rows.join(" | "));
  });

  await step("a clip is cut (9:16) and handed to the motion studio with its subtitles", async () => {
    await page.locator(".clip-row").first().getByTestId("clip-motion").click();
    await page.waitForURL("**/motion", { timeout: 180000 });
    await page.getByTestId("handoff-note").waitFor({ timeout: 20000 });
    const script = await page.getByTestId("script").inputValue();
    assert(/catat semua pengeluaran/.test(script) && !/Halo semuanya/.test(script), "the clip's own subtitles became the script: " + script);
    assert((await page.getByTestId("title").inputValue()) === "Tiga tips keuangan", "the title came along");
    await page.getByTestId("scene-cut").first().waitFor({ timeout: 15000 });
    const seconds = await page.locator("video").first().evaluate(v => new Promise(res => { if (v.readyState >= 1) res(v.duration); else v.onloadedmetadata = () => res(v.duration); }));
    assert(seconds > 36 && seconds < 42, "the video is the cut clip (about 40 s): " + seconds);
    await page.reload();
    assert((await page.getByTestId("handoff-note").count()) === 0, "the hand-off is used once");
  });

  await step("from a YouTube link: captions are refused, the pasted transcript works, AI suggests, and the wrong file is refused", async () => {
    const p = await ctx.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE);
    await p.getByTestId("yt-url").fill("https://youtu.be/BLOCKEDvid1");
    assert(await p.getByTestId("yt-panel").evaluate(d => d.open), "the YouTube panel is open before a file is chosen");
    await p.getByTestId("yt-fetch").click();
    await p.getByTestId("yt-error").waitFor({ timeout: 10000 });
    assert(/Tempel transkripnya/.test(await p.getByTestId("yt-error").innerText()), "a refused server points to pasting: " + await p.getByTestId("yt-error").innerText());
    await p.getByText("Atau tempel transkrip dari YouTube").click();
    await p.getByTestId("yt-paste").fill(pastedText);
    await p.getByTestId("yt-use-paste").click();
    await p.getByTestId("yt-source").waitFor({ timeout: 5000 });
    assert(/transkrip tempelan/.test(await p.getByTestId("yt-source").innerText()), "pasted text is used: " + await p.getByTestId("yt-source").innerText());
    // The server path, on a link it answers: the video's title and automatic captions.
    await p.getByTestId("yt-url").fill("https://youtu.be/okvideo0001");
    await p.getByTestId("yt-fetch").click();
    await p.getByText("Video Uji YouTube").waitFor({ timeout: 10000 });
    assert(/teks otomatis YouTube/.test(await p.getByTestId("yt-source").innerText()), "says the captions are automatic");
    await p.getByTestId("yt-suggest").click();
    await p.getByTestId("flow-item").first().waitFor({ timeout: 20000 });
    assert(seen.ytMomentLines > 6 && seen.ytMomentLines <= 12, "captions were merged into sentence-sized lines before asking: " + seen.ytMomentLines);
    assert((await p.getByTestId("flow-item").count()) === 2, "two clips suggested");
    const href = await p.getByTestId("yt-open").first().getAttribute("href");
    assert(/^https:\/\/youtu\.be\/okvideo0001\?t=\d+$/.test(href), "opens YouTube at the start: " + href);
    assert(!(await p.content()).match(/benar-sekali/), "no password on the page");

    // Approving asks for the file; a file of the wrong length is refused and the clips keep waiting.
    const chooser = p.waitForEvent("filechooser");
    await p.getByTestId("yt-continue").click();
    await (await chooser).setFiles(shortVideo);
    await p.getByText("File ini berdurasi").waitFor({ timeout: 20000 });
    assert((await p.locator(".clip-row").count()) === 0, "no clips from a file of the wrong length");
    await p.getByTestId("file-input").setInputFiles(video);
    await p.locator(".clip-row").first().waitFor({ timeout: 30000 });
    const rows = await p.locator(".clip-row").allInnerTexts();
    assert(rows.length === 2 && /Bagian awal penting/.test(rows[0]) && /Bagian akhir penting/.test(rows[1]), "the approved clips were added once the right file came: " + rows.join(" | "));
    assert((await p.getByTestId("yt-pending").count()) === 0, "nothing is left waiting");

    // The clip carries the YouTube captions of its own stretch to the motion studio.
    await p.locator(".clip-row").first().getByTestId("clip-motion").click();
    await p.waitForURL("**/motion", { timeout: 180000 });
    await p.getByTestId("handoff-note").waitFor({ timeout: 20000 });
    const script = await p.getByTestId("script").inputValue();
    assert(/Kalimat ke \d+ tentang topik penting/.test(script), "captions of the clip became its script: " + script.slice(0, 80));
    await p.close();
  });

  await step("no uncaught page errors", async () => { assert(pageErrors.length === 0, pageErrors.join(" | ")); });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
