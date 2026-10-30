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
const photo = join(dir, "foto.png");
const longVideo = join(dir, "video-250s.mp4");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0x228844:s=270x480", "-frames:v", "1", photo]);
for (const [path, seconds] of [[video, 100], [shortVideo, 30], [longVideo, 250]]) execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `testsrc=size=320x240:rate=30:duration=${seconds}`, "-f", "lavfi", "-i", `sine=frequency=300:duration=${seconds}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path]);

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
  { start: 30, end: 50, text: "Jadi tips pertama adalah catat semua pengeluaran Anda." },
  { start: 55, end: 80, text: "Tips kedua sisihkan tabungan di awal bulan." },
];
async function until(check, message) { for (let i = 0; i < 80; i++) { if (await check().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(message); }
const seen = { audio: [], moments: 0, status: 0, captions: 0, ytMomentLines: 0, failAudioAt: 0, audioRequests: 0 };
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
      if (audio && seen.failAudioAt) {
        // Fails the n-th audio request of the run (the creator's service has a problem), once.
        if (++seen.audioRequests === seen.failAudioAt) { seen.failAudioAt = 0; return send(403, { error: { message: "ditolak" } }); }
      }
      if (audio) {
        const raw = Buffer.from(audio.input_audio.data, "base64");
        seen.audio.push({ format: audio.input_audio.format, bytes: raw.length, head: raw.subarray(0, 3).toString("latin1") });
        return answer({ lines: LINES });
      }
      if (text.includes('"moments"')) {
        const lines = JSON.parse(text.split("\n").at(-1));
        if (lines.length > 6) { seen.ytMomentLines = lines.length; return answer({ moments: [{ start: 1, end: 4, title: "Bagian awal penting", reason: "dari teks YouTube" }, { start: 6, end: 9, title: "Bagian akhir penting", reason: "dari teks YouTube" }] }); }
        seen.moments++; return answer({ moments: [{ start: 2, end: 2, title: "Tiga tips keuangan", reason: "pembuka kuat" }, { start: 3, end: 3, title: "Sisihkan tabungan dulu", reason: "tips praktis" }] });
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
    assert(/Tiga tips keuangan/.test(first) && /00:00:11/.test(first) && /00:00:50/.test(first), "first clip has title and times (start moved back to the sentence that introduces the topic, with a lead-in): " + first);
    assert(/dimundurkan 1 kalimat/.test(first) && /Mulai: “Hari ini saya bahas/.test(first) && /Berakhir: “Jadi tips pertama/.test(first), "says the start was moved and shows what is said at both ends: " + first);
    assert(!(await page.content()).includes("benar-sekali"), "no password on the page");
    await page.getByTestId("flow-item").first().getByText("Sesuaikan waktu", { exact: true }).click();
    // One sentence later: the start goes to the line that begins "Jadi tips pertama" (30 s, with its lead-in), and one earlier brings it back.
    await page.getByTestId("flow-item").first().getByTestId("flow-start-later").click();
    await page.getByTestId("flow-item").first().getByText(/Mulai: “Jadi tips pertama/).waitFor({ timeout: 3000 });
    assert(/00:00:29/.test(await page.getByTestId("flow-item").first().innerText()), "start stepped one sentence later");
    await page.getByTestId("flow-item").first().getByTestId("flow-start-earlier").click();
    await page.getByTestId("flow-item").first().getByText(/Mulai: “Hari ini saya bahas/).waitFor({ timeout: 3000 });
    assert(!(await page.getByTestId("flow-item").first().getByTestId("flow-note-item").count()), "the note goes once the creator has chosen the start");
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
    // The creator last used affiliate content; a clip with its video is ordinary content, so affiliate steps aside.
    await page.evaluate(() => localStorage.setItem("clipper:motion:mode:v1", "affiliate"));
    await page.locator(".clip-row").first().getByTestId("clip-motion").click();
    await page.waitForURL("**/motion", { timeout: 180000 });
    await page.getByTestId("handoff-note").waitFor({ timeout: 20000 });
    assert(await page.getByTestId("mode-normal").getAttribute("aria-checked") === "true", "a clip with its video opens as ordinary content");
    assert(await page.getByTestId("mode-affiliate").isDisabled() && /tidak tersedia/.test(await page.getByTestId("mode-hint").textContent()), "affiliate is switched off with a reason while a source video is used");
    assert(!(await page.getByTestId("affiliate-panel").isVisible()), "the product data is not shown over a source video");
    assert(await page.getByTestId("asr-precise").isVisible(), "sentence-level captions offer the one-tap precise timing");
    assert(/Presisikan waktu subtitle/.test(await page.getByTestId("handoff-note").innerText()), "the note points to that button");
    const script = await page.getByTestId("script").inputValue();
    assert(/catat semua pengeluaran/.test(script) && !/Halo semuanya/.test(script), "the clip's own subtitles became the script: " + script);
    assert((await page.getByTestId("title").inputValue()) === "Tiga tips keuangan", "the title came along");
    await page.getByTestId("scene-cut").first().waitFor({ timeout: 15000 });
    // The video is exactly as long as its source (no frozen tail), and a script that drifts from the transcript is called out.
    const badge = await page.locator(".preview-badge").innerText();
    assert(/\b(3[6-9]|4[0-2])\.\ds\b/.test(badge), "the preview is as long as the 40 s clip: " + badge);
    assert((await page.getByTestId("timing-lost").count()) === 0, "caption timing follows the transcript right after the hand-off");
    await page.getByTestId("script").fill("Kalimat yang sama sekali lain dan tidak pernah diucapkan di video ini.");
    await page.getByTestId("timing-lost").waitFor({ timeout: 5000 });
    assert(/\b(3[6-9]|4[0-2])\.\ds\b/.test(await page.locator(".preview-badge").innerText()), "even without usable timing the video spans its source: " + await page.locator(".preview-badge").innerText());
    await page.getByTestId("timing-restore").click();
    assert(/catat semua pengeluaran/.test(await page.getByTestId("script").inputValue()), "the script came back from the transcript");
    assert((await page.getByTestId("timing-lost").count()) === 0, "timing follows the transcript again");
    const seconds = await page.locator("video").first().evaluate(v => new Promise(res => { if (v.readyState >= 1) res(v.duration); else v.onloadedmetadata = () => res(v.duration); }));
    assert(seconds > 40 && seconds < 52, "the file is the clip (about 40 s) plus up to 3 s of footage on each side: " + seconds);
    assert(await page.getByTestId("trim-panel").isVisible() && await page.getByTestId("trim-original").count() === 0, "the trim panel starts on the clip itself");
    const sum = await page.getByTestId("trim-summary").innerText();
    assert(/3[6-9]\.\d dtk dipakai dari 4\d\.\d dtk/.test(sum) || /4[0-2]\.\d dtk dipakai dari/.test(sum), "the summary shows the clip inside the footage: " + sum);
    // Pictures (own or Pexels) also work over a source video: choosing one makes that scene a full-screen cutaway.
    assert(await page.getByTestId("scene-image").count() > 0 && await page.getByTestId("scene-image-pexels").first().isVisible(), "picture controls and Pexels are offered over a source video");
    await page.getByTestId("scene-image-input").nth(1).setInputFiles(photo);
    await page.getByTestId("scene-credit").count();
    await until(async () => (await page.getByTestId("scene-cut").nth(1).inputValue()) === "graphic", "a scene with a picture becomes a cutaway");
    assert(await page.getByTestId("scene-image-remove").count() === 1, "the picture is attached to that scene only");
    // The transcript has word times, so the range can be snapped to the first and last word; the video stays within the clip's footage and its timing stays valid.
    await page.getByTestId("trim-snap").waitFor({ timeout: 5000 });
    const before = await page.getByTestId("trim-summary").innerText();
    if (await page.getByTestId("trim-snap").isEnabled()) await page.getByTestId("trim-snap").click();
    await page.waitForTimeout(500);
    const after = await page.getByTestId("trim-summary").innerText();
    const secs = Number(/(\d+):(\d+\.\d) dtk dipakai/.exec(after)?.[1] ?? 0) * 60 + Number(/(\d+):(\d+\.\d) dtk dipakai/.exec(after)?.[2] ?? 0);
    assert(secs > 10 && secs < 46, "after snapping to words the range is still the speech: " + before + " -> " + after);
    assert((await page.getByTestId("timing-lost").count()) === 0, "caption timing still follows the transcript after snapping");
    await page.reload();
    assert((await page.getByTestId("handoff-note").count()) === 0, "the hand-off is used once");
  });

  await step("a long video is listened to in parts of at most two minutes; a part that fails does not throw the finished parts away", async () => {
    const p = await ctx.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE);
    await p.getByTestId("file-input").setInputFiles(longVideo);
    await p.getByText("Video siap").waitFor({ timeout: 15000 }).catch(() => undefined);
    await p.getByTestId("flow-consent").waitFor({ timeout: 15000 });
    await p.getByTestId("flow-consent").check();
    assert(/±2 bagian audio/.test(await p.getByTestId("clip-flow").innerText()), "250 s = 2 parts: " + (await p.getByTestId("clip-flow").innerText()).slice(0, 300));
    seen.audio.length = 0; seen.audioRequests = 0; seen.failAudioAt = 2;
    await p.getByTestId("flow-analyze").click();
    await p.getByTestId("flow-error").waitFor({ timeout: 120000 });
    const msg = await p.getByTestId("flow-error").innerText();
    assert(/^Bagian 2 dari 2:/.test(msg) && /tersimpan/.test(msg) && /melanjutkan/.test(msg), "names the part and says the finished one is kept: " + msg);
    const before = seen.audio.length;
    await p.getByTestId("flow-analyze").click();
    await p.getByTestId("flow-item").first().waitFor({ timeout: 120000 });
    assert(seen.audio.length - before === 1, "only the failed part is sent again: " + (seen.audio.length - before));
    await p.close();
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
