// End-to-end check of the music and comedy editing profiles in /motion: production server + Chromium + FFmpeg WASM.
// Needs `npm run build` first and ffmpeg on PATH for the fixtures. Proves in real MP4s that the profiles change the picture only
// (zoom, a held frame), that the original audio and the length stay, and that a failed analysis applies nothing.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3224);
const BASE = `http://localhost:${PORT}`;
const openFolds = p => p.evaluate(() => document.querySelectorAll("details.fold").forEach(d => { d.open = true; }));
const dir = mkdtempSync(join(tmpdir(), "editing-e2e-"));
const ff = args => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
// Moving test pattern with a click every 0.5 s (120 BPM), 12 s.
const beatVideo = join(dir, "ketukan.mp4");
ff(["-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=12", "-f", "lavfi", "-i", "aevalsrc=0.8*sin(2*PI*1000*t)*exp(-60*mod(t\\,0.5)):s=44100:d=12",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", beatVideo]);
// Same picture with steady noise: no beat to read.
const noiseVideo = join(dir, "bising.mp4");
ff(["-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=12", "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.3:d=12",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", noiseVideo]);
// Talk with a pause after the punchline (speech-like tone bursts), 12 s.
const talkVideo = join(dir, "lawak.mp4");
ff(["-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=12", "-f", "lavfi", "-i", "aevalsrc=0.3*sin(2*PI*200*t)*(lt(t\\,4.2)+gt(t\\,6.2)):s=44100:d=12",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", talkVideo]);

const W = spec => spec.split(" ").map(tok => { const [text, time] = tok.split("@"); const [start, end] = time.split("-").map(Number); return { text, start, end }; });
const talkWords = W("Kamu@0-0.3 tahu@0.35-0.6 kenapa@0.65-1 dia@1.05-1.3 telat?@1.35-1.8 Ternyata@2.1-2.6 dia@2.65-2.9 nunggu@2.95-3.3 ojek@3.35-3.7 lewat.@3.75-4.2 "
  + "Terus@6.2-6.5 kita@6.55-6.8 lanjut@6.85-7.2 rapat@7.25-7.6 biasa@7.65-8 saja@8.05-8.4 tanpa@8.45-8.8 masalah@8.85-9.3 apa-apa@9.35-9.8 lagi.@9.85-10.2 Oke@10.4-10.7 selesai.@10.75-11.2");
const sentence = ws => ({ start: ws[0].start, end: ws[ws.length - 1].end, text: ws.map(w => w.text).join(" "), words: ws });
const talkTranscript = { language: "id", granularity: "word", duration: 12, segments: [sentence(talkWords.slice(0, 5)), sentence(talkWords.slice(5, 10)), sentence(talkWords.slice(10))] };

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
const results = [];
let failed = false;
const only = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY, "i") : null;
async function step(name, fn) {
  if (only && !only.test(name)) return;
  const t = Date.now();
  try { const info = await fn(); results.push(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${info ? " — " + info : ""}`); }
  catch (err) { failed = true; results.push(`FAIL ${name}: ${err instanceof Error ? err.message : err}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/** Mean absolute difference (0..255) of a crop of two frames of one MP4, or of two MP4s at one time. */
function frameDiff(a, ta, b, tb) {
  const grab = (f, t) => spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", f, "-frames:v", "1", "-vf", "crop=iw:ih/3:0:ih/6,scale=64:36,format=gray", "-f", "rawvideo", "-"], { encoding: "buffer" }).stdout;
  const x = grab(a, ta), y = grab(b, tb);
  if (!x.length || x.length !== y.length) throw new Error("frame grab failed");
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return s / x.length;
}
const seconds = f => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString().trim());
const audioDb = f => Number(/mean_volume: (-?[\d.]+) dB/.exec(spawnSync("ffmpeg", ["-i", f, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr)?.[1] ?? NaN);

try {
  for (let i = 0; i < 60 && !(await fetch(BASE).then(() => true, () => false)); i++) await new Promise(r => setTimeout(r, 500));
  const browser = await chromium.launch();
  const pageErrors = [];

  async function studio(file, handoff) {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const p = await ctx.newPage();
    p.on("pageerror", e => pageErrors.push(e.message));
    await p.goto(BASE + "/motion");
    if (handoff) {
      await p.evaluate(async ({ arr, transcript }) => {
        const db = await new Promise((res, rej) => { const r = indexedDB.open("clipper-studio", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const blob = new Blob([new Uint8Array(arr)], { type: "video/mp4" });
        await new Promise(res => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put({ blob, name: "lawak.mp4", type: "video/mp4", seconds: 12, title: "Lawak", transcript, at: Date.now() }, "handoff-clip"); tx.oncomplete = res; });
      }, { arr: [...readFileSync(file)], transcript: handoff });
      await p.reload();
    } else {
      await openFolds(p);
      await p.getByTestId("source-video").setInputFiles(file);
    }
    await openFolds(p);
    await p.getByTestId("edit-profile").waitFor({ timeout: 20000 });
    return { ctx, p };
  }
  async function render(p, name) {
    await p.getByTestId("render").click();
    await p.getByTestId("result").waitFor({ timeout: 300000 });
    const [d] = await Promise.all([p.waitForEvent("download"), p.getByTestId("download").click()]);
    const out = join(dir, name);
    await d.saveAs(out);
    return out;
  }

  await step("profiles are offered over a source video and standard changes nothing", async () => {
    const { ctx, p } = await studio(beatVideo);
    for (const id of ["standard", "music", "comedy"]) assert(await p.getByTestId("profile-" + id).isVisible(), id);
    assert(await p.getByTestId("profile-standard").getAttribute("aria-checked") === "true", "standard by default");
    assert(await p.getByTestId("edit-review").count() === 0, "no edits in standard");
    await ctx.close();
  });

  await step("music: the beat is read on the device, pulses land on downbeats, they can be reviewed, and the render zooms on them with the audio and length unchanged", async () => {
    const { ctx, p } = await studio(beatVideo);
    const plain = await render(p, "musik-tanpa-efek.mp4");
    await p.getByTestId("profile-music").click();
    await p.getByTestId("music-analyze").click();
    await p.getByTestId("music-summary").waitFor({ timeout: 120000 });
    const summary = await p.getByTestId("music-summary").innerText();
    const bpm = Number(/±(\d+) BPM/.exec(summary)?.[1]);
    assert(Math.abs(bpm - 120) <= 3, "tempo read: " + summary);
    await p.getByTestId("music-pulse").selectOption("strong");
    const items = await p.getByTestId("edit-item").allInnerTexts();
    assert(items.length >= 1 && items.every(t => /Denyut ketukan/.test(t)), "pulses listed for review: " + items.join(" | "));
    const first = Number(/(\d+):(\d+\.\d)/.exec(items[0]).slice(1).reduce((m, s, i) => (i === 0 ? Number(s) * 60 : m + Number(s)), 0));
    assert(Math.abs(first * 2 - Math.round(first * 2)) < 0.1, "the first pulse is on a beat (multiple of 0.5 s): " + first);
    const out = await render(p, "musik-denyut.mp4");
    assert(Math.abs(seconds(out) - seconds(plain)) < 0.1, `same length: ${seconds(out)} vs ${seconds(plain)}`);
    assert(Math.abs(audioDb(out) - audioDb(plain)) < 1, `same audio level: ${audioDb(out)} vs ${audioDb(plain)} dB`);
    const onPulse = frameDiff(out, first + 0.05, plain, first + 0.05), offPulse = frameDiff(out, first + 1.0, plain, first + 1.0);
    assert(onPulse > 4 && onPulse > offPulse * 3, `the picture is zoomed on the pulse only: on ${onPulse.toFixed(1)}, off ${offPulse.toFixed(1)}`);
    // Switching one off in the review removes it from the render plan.
    const before = await p.getByTestId("edit-toggle").count();
    await p.getByTestId("edit-toggle").first().uncheck();
    assert(/(\d+) dari (\d+) aktif/.test(await p.getByTestId("edit-review").locator("summary").innerText()) && before >= 1, "review count");
    // Musical moment: a 30 s moment does not fit a 12 s video; a 15 s one neither (the note says so) — the trim is untouched.
    await p.getByTestId("music-moment-length").selectOption("15");
    await p.getByTestId("music-moment").click();
    await p.getByTestId("edit-note").waitFor({ timeout: 3000 });
    await ctx.close();
    return `${summary}; zoom diff on ${onPulse.toFixed(1)} / off ${offPulse.toFixed(1)}`;
  });

  await step("music fallback: no readable beat applies nothing and says why", async () => {
    const { ctx, p } = await studio(noiseVideo);
    await p.getByTestId("profile-music").click();
    await p.getByTestId("music-analyze").click();
    await p.getByTestId("edit-error").waitFor({ timeout: 120000 });
    assert(/tidak terbaca|Tidak ada efek/.test(await p.getByTestId("edit-error").innerText()), "explains the fallback");
    assert(await p.getByTestId("edit-item").count() === 0, "no edits");
    await ctx.close();
  });

  await step("comedy: needs word timing; finds the punchline after the pause, keeps the pause, zooms and freezes the picture only", async () => {
    // Without a transcript the profile says what it needs and applies nothing.
    const bare = await studio(talkVideo);
    await bare.p.getByTestId("profile-comedy").click();
    await bare.p.getByTestId("comedy-needs-transcript").waitFor({ timeout: 3000 });
    assert(await bare.p.getByTestId("comedy-analyze").isDisabled(), "cannot analyse without words");
    await bare.ctx.close();

    const { ctx, p } = await studio(talkVideo, talkTranscript);
    const plain = await render(p, "komedi-tanpa-efek.mp4");
    await p.getByTestId("profile-comedy").click();
    await p.getByTestId("comedy-analyze").click();
    await p.getByTestId("comedy-summary").waitFor({ timeout: 60000 });
    assert(/^1 punchline/.test(await p.getByTestId("comedy-summary").innerText()), "one punchline: " + await p.getByTestId("comedy-summary").innerText());
    const item = await p.getByTestId("edit-item").first().innerText();
    assert(/Zoom punchline/.test(item) && /Ternyata dia nunggu ojek lewat/.test(item) && /0:03\.8/.test(item), "punch-in on the punchline's last word: " + item);
    await p.getByTestId("comedy-freeze").check();
    assert(await p.getByTestId("edit-item").count() === 2, "freeze added to the review");
    const out = await render(p, "komedi-efek.mp4");
    assert(Math.abs(seconds(out) - seconds(plain)) < 0.1, `the pause is kept: same length ${seconds(out)} vs ${seconds(plain)}`);
    assert(Math.abs(audioDb(out) - audioDb(plain)) < 1, `original audio kept: ${audioDb(out)} vs ${audioDb(plain)} dB`);
    // Before the punchline nothing changes; on it the picture is zoomed; during the freeze two moments show the same frame.
    const before = frameDiff(out, 1.0, plain, 1.0), during = frameDiff(out, 4.0, plain, 4.0);
    assert(before < 2 && during > 4, `zoom only on the punchline: before ${before.toFixed(1)}, during ${during.toFixed(1)}`);
    const held = frameDiff(out, 4.25, out, 4.6), moving = frameDiff(plain, 4.25, plain, 4.6);
    assert(held < moving / 3, `freeze holds the picture (sound keeps playing): held ${held.toFixed(2)} vs source motion ${moving.toFixed(2)}`);
    await ctx.close();
    return `zoom ${during.toFixed(1)}, freeze ${held.toFixed(2)} vs ${moving.toFixed(2)}`;
  });

  await step("the chosen profile and reviewed edits survive a reload", async () => {
    const { ctx, p } = await studio(talkVideo, talkTranscript);
    await p.getByTestId("profile-comedy").click();
    await p.getByTestId("comedy-analyze").click();
    await p.getByTestId("edit-item").first().waitFor({ timeout: 60000 });
    await p.getByTestId("edit-later").first().click();
    const moved = await p.getByTestId("edit-item").first().innerText();
    await p.waitForTimeout(2500);
    await p.reload();
    await p.getByTestId("restore-session").click();
    await openFolds(p);
    await p.getByTestId("edit-item").first().waitFor({ timeout: 15000 });
    assert(await p.getByTestId("profile-comedy").getAttribute("aria-checked") === "true", "profile restored");
    assert((await p.getByTestId("edit-item").first().innerText()).slice(0, 30) === moved.slice(0, 30), "moved edit restored");
    await ctx.close();
  });

  await step("no uncaught page errors", async () => {
    const real = pageErrors.filter(m => m !== "Failed to fetch"); // remotion.pro telemetry is unreachable here; harmless
    assert(real.length === 0, real.join(" | "));
  });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  rmSync(dir, { recursive: true, force: true });
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
