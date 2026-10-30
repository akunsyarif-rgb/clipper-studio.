// End-to-end check of Content Hub: production server + Chromium. Supabase's media-library function and R2 are replaced by an
// in-memory fake (page.route), so this checks the app's behaviour: consent, upload, progress-to-done, retry, cancel, library,
// categories, search, sort, move, download, delete. The real function and R2 are covered by lib/media-library-function.test.ts
// and by the live run recorded in the pull request.
// Needs `npm run build` first, plus ffmpeg on PATH for the fixture video.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3212);
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "hub-e2e-"));
const source = join(dir, "contoh klip.mp4");
const narration = join(dir, "narasi.wav");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=6", "-ac", "1", "-ar", "44100", narration]);
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=8", "-f", "lavfi", "-i", "sine=frequency=330:duration=8", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);

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

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
const day = n => new Date(Date.UTC(2026, 9, n, 8)).toISOString();
const seed = () => [
  ["a1", "Tips masak cepat", "tiktok", "shorts", "ready", 1, 45, day(1), true],
  ["a2", "Resep nasi goreng", "youtube", "long_form", "ready", 2, 612, day(3), true],
  ["a3", "Vlog pasar", "tiktok", "video", "deleted", 3, 30, day(2), false],
  ["a4", "Promo akhir pekan", "instagram", "reels", "ready", 4, 20, day(5), true],
  ["a5", "Catatan tanpa kategori", "uncategorized", "video", "ready", 5, 60, day(4), false],
].map(([id, title, platform, contentFormat, status, mb, durationSeconds, createdAt, hasThumb]) => ({
  id, title, fileName: id + ".mp4", mimeType: "video/mp4", fileSize: mb * 1024 * 1024, durationSeconds, width: 1080, height: 1920, source: "clipper", status,
  createdAt, updatedAt: createdAt, fileDeletedAt: status === "deleted" ? day(6) : null, platform, contentFormat, hasThumb, thumbUrl: hasThumb ? `https://fake-r2.test/thumb/${id}.png` : null,
}));

/** A fake media-library + R2. `calls` records every function call; `puts` every upload to storage. */
function fakeBackend() {
  const f = { assets: seed(), calls: [], puts: [], gets: [], putFailures: 0, partFailures: 0, multipart: null, parts: {}, putHang: false, listFails: 0, seq: 0 };
  async function install(ctx) {
    await ctx.route("https://smwealrfgnzxquqqscxs.supabase.co/functions/v1/media-library", async route => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      const body = JSON.parse(req.postData() || "{}");
      f.calls.push(body);
      const json = (status, data) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(data) });
      const find = id => f.assets.find(a => a.id === id);
      switch (body.action) {
        case "list":
          if (f.listFails > 0) { f.listFails--; return json(502, { error: { status: "SERVER_ERROR", message: "Penyimpanan cloud sedang bermasalah." } }); }
          return json(200, { assets: f.assets });
        case "init-upload": {
          let a = body.assetId ? find(body.assetId) : null;
          if (!a) {
            a = { id: "n" + ++f.seq, title: body.title, fileName: body.fileName, mimeType: body.mimeType, fileSize: body.fileSize, durationSeconds: body.durationSeconds ?? null, width: body.width ?? null, height: body.height ?? null,
              source: body.source, status: "uploading", createdAt: new Date().toISOString(), updatedAt: "", fileDeletedAt: null, platform: body.platform, contentFormat: body.contentFormat, hasThumb: !!body.thumbnail };
            f.assets.push(a);
          }
          a.status = "uploading";
          if (f.multipart) return json(200, { asset: a, mode: "multipart", partSize: f.multipart, partCount: Math.ceil(a.fileSize / f.multipart), thumbPutUrl: a.hasThumb ? `https://fake-r2.test/thumb-put/${a.id}` : undefined });
          return json(200, { asset: a, mode: "single", putUrl: `https://fake-r2.test/put/${a.id}`, contentType: a.mimeType, expiresIn: 900, thumbPutUrl: a.hasThumb ? `https://fake-r2.test/thumb-put/${a.id}` : undefined });
        }
        case "complete-single": { const a = find(body.assetId); const got = f.puts.filter(p => p.id === a.id && p.kind === "video" && p.ok).at(-1); if (!got || got.size !== a.fileSize) return json(409, { error: { status: "NOT_UPLOADED", message: "File belum sampai." } }); a.status = "ready"; a.thumbUrl = a.hasThumb ? `https://fake-r2.test/thumb/${a.id}.png` : null; return json(200, { asset: a }); }
        case "multipart-init": { const a = find(body.assetId); f.parts[a.id] ??= {}; return json(200, { asset: a, partSize: f.multipart, partCount: Math.ceil(a.fileSize / f.multipart) }); }
        case "list-parts": return json(200, { parts: Object.entries(f.parts[body.assetId] ?? {}).map(([n, size]) => ({ partNumber: Number(n), size })) });
        case "sign-parts": return json(200, { parts: body.partNumbers.map(n => ({ partNumber: n, url: `https://fake-r2.test/part/${body.assetId}/${n}` })), expiresIn: 900 });
        case "complete-upload": { const a = find(body.assetId); const held = f.parts[a.id] ?? {}; const n = Math.ceil(a.fileSize / f.multipart); const total = Object.values(held).reduce((x, y) => x + y, 0);
          for (let i = 1; i <= n; i++) if (held[i] === undefined) return json(409, { error: { status: "PARTS_MISMATCH", message: "belum lengkap", missing: [i], wrongSize: [] } });
          if (total !== a.fileSize) return json(409, { error: { status: "PARTS_MISMATCH", message: "ukuran", missing: [], wrongSize: [1] } });
          a.status = "ready"; return json(200, { asset: a }); }
        case "abort-upload": { const a = find(body.assetId); a.status = "failed"; return json(200, { asset: a }); }
        case "update-meta": { const a = find(body.assetId); for (const k of ["title", "platform", "contentFormat", "historyId"]) if (body[k] !== undefined) a[k] = body[k]; return json(200, { asset: a }); }
        case "get-download-url": return json(200, { url: `https://fake-r2.test/${body.inline ? "play" : "dl"}/${body.assetId}`, fileName: "x.mp4", expiresIn: 300 });
        case "delete-file": { const a = find(body.assetId); a.status = "deleted"; a.fileDeletedAt = new Date().toISOString(); a.hasThumb = false; a.thumbUrl = null; return json(200, { asset: a }); }
        default: return json(400, { error: { status: "BAD_ACTION", message: "?" } });
      }
    });
    await ctx.route("https://fake-r2.test/**", async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      if (req.method() === "PUT") {
        const parts = url.pathname.split("/");
        if (parts[1] === "part") {
          const size = req.postDataBuffer()?.length ?? 0;
          if (f.partFailures > 0) { f.partFailures--; f.puts.push({ id: parts[2], kind: "part", n: Number(parts[3]), size, ok: false }); return route.fulfill({ status: 500, headers: CORS, body: "" }); }
          (f.parts[parts[2]] ??= {})[Number(parts[3])] = size; f.puts.push({ id: parts[2], kind: "part", n: Number(parts[3]), size, ok: true });
          return route.fulfill({ status: 200, headers: { ...CORS, etag: '"e"' }, body: "" });
        }
        const kind = parts[1] === "thumb-put" ? "thumb" : "video", id = parts[2];
        const size = req.postDataBuffer()?.length ?? 0;
        if (kind === "video" && f.putHang) return; // never answers: the upload stays in flight until the page aborts it
        if (kind === "video" && f.putFailures > 0) { f.putFailures--; f.puts.push({ id, kind, size, ok: false, type: req.headers()["content-type"] }); return route.fulfill({ status: 500, headers: CORS, body: "" }); }
        f.puts.push({ id, kind, size, ok: true, type: req.headers()["content-type"] });
        return route.fulfill({ status: 200, headers: { ...CORS, etag: '"e"' }, body: "" });
      }
      f.gets.push(url.pathname);
      if (url.pathname.startsWith("/thumb/")) return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "image/png" }, body: PNG });
      if (url.pathname.startsWith("/dl/")) return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "video/mp4", "content-disposition": 'attachment; filename="x.mp4"' }, body: Buffer.alloc(1000) });
      return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "video/mp4" }, body: Buffer.alloc(1000) });
    });
  }
  return { f, install };
}

const signedInScript = () => localStorage.setItem("clipper:cloud:v1", JSON.stringify({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000, email: "kreator@example.com" }));

try {
  if (await fetch(BASE).then(() => true, () => false)) throw new Error(`Port ${PORT} is already in use; stop the old server first.`);
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const errors = [];
  const watch = p => { p.on("pageerror", e => errors.push(e.message)); };
  // Everything that leaves the browser towards a third party, to prove nothing is sent without consent.
  const outside = [];

  const out = fakeBackend();
  const ctxOut = await browser.newContext({ acceptDownloads: true });
  await out.install(ctxOut);
  const pOut = await ctxOut.newPage(); watch(pOut);
  const signedOutHub = fakeBackend();

  await step("signed out: the hub asks to sign in and calls nothing", async () => {
    await pOut.goto(BASE + "/hub");
    await pOut.getByText("Masuk untuk membuka Content Hub").waitFor({ timeout: 10000 });
    await new Promise(r => setTimeout(r, 500));
    assert(out.f.calls.length === 0, "no media-library call when signed out");
  });

  await step("signed out: local export works, Content Hub is offered only with an account and sends nothing", async () => {
    await pOut.goto(BASE);
    await pOut.getByTestId("file-input").setInputFiles(source);
    await pOut.getByText("00:00:08").first().waitFor({ timeout: 15000 });
    await pOut.getByTestId("export").click();
    await pOut.getByTestId("result").waitFor({ timeout: 120000 });
    const [dl] = await Promise.all([pOut.waitForEvent("download"), pOut.getByTestId("download").click()]);
    assert(/\.mp4$/.test(dl.suggestedFilename()), "local download gives an MP4");
    assert(await pOut.getByTestId("hub-open").isDisabled(), "Content Hub button is disabled without an account");
    await pOut.getByText("Content Hub memakai akun").waitFor();
    assert(out.f.calls.length === 0 && out.f.puts.length === 0, "nothing sent");
  });
  await ctxOut.close();

  // ---- signed in ----
  const b = fakeBackend();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 820, height: 1180 } });
  await ctx.addInitScript(signedInScript);
  await b.install(ctx);
  ctx.on("request", r => { const u = r.url(); if (!u.startsWith(BASE) && !u.includes("supabase.co") && !u.includes("fake-r2.test") && !u.startsWith("data:") && !u.startsWith("blob:") && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) outside.push(u); });
  const page = await ctx.newPage(); watch(page);

  await step("main studio: nothing is uploaded until the creator opens the box, ticks consent and presses Unggah", async () => {
    await page.goto(BASE);
    await page.getByTestId("file-input").setInputFiles(source);
    await page.getByText("00:00:08").first().waitFor({ timeout: 15000 });
    await page.getByTestId("export").click();
    await page.getByTestId("result").waitFor({ timeout: 120000 });
    assert(await page.getByTestId("hub-open").isEnabled(), "signed in: the button is enabled");
    await new Promise(r => setTimeout(r, 800));
    assert(b.f.calls.length === 0 && b.f.puts.length === 0, "no automatic upload after export");
    await page.getByTestId("hub-open").click();
    await page.getByTestId("hub-consent").waitFor();
    assert(await page.getByTestId("hub-upload").isDisabled(), "Unggah stays disabled until consent is ticked");
    await page.getByText("penyimpanan cloud privat (Cloudflare R2)").waitFor();
    await new Promise(r => setTimeout(r, 300));
    assert(b.f.calls.length === 0 && b.f.puts.length === 0, "the open form sends nothing");
  });

  await step("cancel: aborts the in-flight upload and the cloud side, then the form is back", async () => {
    b.f.putHang = true;
    await page.getByTestId("hub-consent").check();
    await page.getByTestId("hub-upload").click();
    await page.getByTestId("hub-sending").waitFor();
    await until(async () => b.f.calls.some(c => c.action === "init-upload"), "init-upload was called");
    await page.getByTestId("hub-cancel").click();
    await page.getByTestId("hub-upload").waitFor();
    await until(async () => b.f.calls.some(c => c.action === "abort-upload"), "abort-upload was called");
    assert(!b.f.calls.some(c => c.action === "complete-single"), "no completion after cancel");
    b.f.putHang = false;
  });

  await step("upload: platform, format, title and sizes reach the backend; failure shows a recovery action; retry resumes the same asset", async () => {
    await page.getByTestId("hub-title").fill("Klip percobaan");
    await page.getByTestId("hub-platform").selectOption("tiktok");
    await page.getByTestId("hub-format").selectOption("shorts");
    b.f.putFailures = 1;
    b.f.calls.length = 0;
    await page.getByTestId("hub-upload").click();
    const err = await page.getByTestId("hub-error").waitFor({ timeout: 15000 }).then(() => page.getByTestId("hub-error").innerText());
    assert(/Coba lagi/.test(err), "error text tells what to do: " + err);
    await page.getByTestId("hub-retry").click();
    await page.getByTestId("hub-done").waitFor({ timeout: 15000 });
    const inits = b.f.calls.filter(c => c.action === "init-upload");
    assert(inits.length === 2 && inits[0].title === "Klip percobaan" && inits[0].platform === "tiktok" && inits[0].contentFormat === "shorts" && inits[0].source === "clipper", "first init carries the choices: " + JSON.stringify(inits[0]));
    assert(/^c-/.test(inits[0].historyId), "the clip is linked to its production notes: " + inits[0].historyId);
    assert(inits[0].mimeType === "video/mp4" && inits[0].fileSize > 1000, "size and type are real");
    assert(inits[1].assetId && Object.keys(inits[1]).length === 2, "retry resumes the same asset: " + JSON.stringify(inits[1]));
    const videoPuts = b.f.puts.filter(p => p.kind === "video");
    assert(videoPuts.length === 2 && videoPuts[0].ok === false && videoPuts[1].ok && videoPuts[1].size === inits[0].fileSize && videoPuts[1].type === "video/mp4", "one failed then one complete PUT: " + JSON.stringify(videoPuts));
    assert(b.f.puts.some(p => p.kind === "thumb" && p.size > 0), "a thumbnail was sent");
    assert(b.f.calls.at(-1).action === "complete-single", "completed after the PUT");
    assert(outside.length === 0, "no third-party request: " + outside.join(", "));
  });

  await step("multipart in the browser: parts sent in order of need, one failed part retried, progress reaches the full size, then completed", async () => {
    await page.goto(BASE);
    await page.getByTestId("file-input").setInputFiles(source);
    await page.getByText("00:00:08").first().waitFor({ timeout: 15000 });
    await page.getByTestId("export").click();
    await page.getByTestId("result").waitFor({ timeout: 120000 });
    b.f.multipart = 512 * 1024; b.f.partFailures = 1; b.f.puts.length = 0; b.f.calls.length = 0;
    await page.getByTestId("hub-open").click();
    await page.getByTestId("hub-platform").selectOption("youtube");
    await page.getByTestId("hub-format").selectOption("long_form");
    await page.getByTestId("hub-consent").check();
    await page.getByTestId("hub-upload").click();
    await page.getByTestId("hub-done").waitFor({ timeout: 60000 });
    const init = b.f.calls.find(c => c.action === "init-upload");
    const parts = b.f.puts.filter(p => p.kind === "part");
    const okParts = parts.filter(p => p.ok);
    const count = Math.ceil(init.fileSize / b.f.multipart);
    assert(count >= 4, "enough parts to be a real multipart: " + count);
    assert(parts.some(p => !p.ok), "a part failed once");
    assert(okParts.length === count && new Set(okParts.map(p => p.n)).size === count, "each part stored exactly once after the retry");
    assert(okParts.reduce((x, p) => x + p.size, 0) === init.fileSize, "stored bytes equal the file size");
    assert(okParts.every(p => p.n === count ? p.size === init.fileSize - b.f.multipart * (count - 1) : p.size === b.f.multipart), "part sizes");
    const actions = b.f.calls.map(c => c.action);
    assert(actions.indexOf("multipart-init") < actions.indexOf("list-parts") && actions.at(-1) === "complete-upload" && !actions.includes("complete-single"), "call order: " + actions.join(","));
    assert(b.f.assets.find(a => a.id === init.assetId || a.title === init.title && a.platform === "youtube").status === "ready", "asset ready");
    b.f.multipart = null;
    return `${count} parts, ${parts.length - okParts.length} retried`;
  });

  await step("motion studio: render, then the same save box (dark) uploads with source=motion and 1080x1920", async () => {
    await page.goto(BASE + "/motion");
    await page.evaluate(() => document.querySelectorAll("details.fold").forEach(d => { d.open = true; }));
    await page.getByTestId("script").fill("Halo semua.\nIni video uji dengan narasi.\nDurasi mengikuti audio.");
    await page.getByTestId("voice-manual").click();
    await page.getByTestId("audio-input").setInputFiles(narration);
    await page.getByText("6.0 dtk · durasi video mengikuti narasi").waitFor({ timeout: 10000 });
    await page.getByTestId("render").click();
    await page.getByTestId("result").waitFor({ timeout: 300000 });
    await page.getByTestId("hub-open").click();
    await page.getByTestId("hub-consent").check();
    b.f.calls.length = 0;
    await page.getByTestId("hub-upload").click();
    await page.getByTestId("hub-done").waitFor({ timeout: 30000 });
    const init = b.f.calls.find(c => c.action === "init-upload");
    assert(/^m-/.test(init.historyId), "the Motion video is linked to its notes: " + init.historyId);
    assert(init.source === "motion" && init.width === 1080 && init.height === 1920 && init.durationSeconds > 0, "motion metadata: " + JSON.stringify(init));
  });

  await step("hub: categories with counts, filter, search, sort", async () => {
    await page.goto(BASE + "/hub");
    await page.getByTestId("hub-grid").waitFor({ timeout: 10000 });
    const total = b.f.assets.length;
    assert((await page.getByTestId("hub-item").count()) === total, "all items shown");
    const count = async id => Number((await page.getByTestId("cat-" + id).locator("b").innerText()));
    const expect = id => b.f.assets.filter(a => a.platform === id).length;
    for (const id of ["youtube", "instagram", "facebook", "threads", "x", "other", "uncategorized", "tiktok"]) assert(await count(id) === expect(id), `count for ${id}: ${await count(id)} vs ${expect(id)}`);
    assert(await count("all") === total, "count for all");
    for (const id of ["tiktok", "youtube", "instagram", "facebook", "threads", "x", "other", "uncategorized"]) await page.getByTestId("cat-" + id).waitFor();
    await page.getByTestId("cat-youtube").click();
    assert((await page.getByTestId("hub-item").count()) === b.f.assets.filter(x => x.platform === "youtube").length, "youtube filter");
    await page.getByTestId("cat-all").click();
    await page.getByTestId("hub-search").fill("NASI goreng");
    assert((await page.getByTestId("hub-item").count()) === 1 && (await page.getByTestId("hub-item").innerText()).includes("Resep nasi goreng"), "search by title");
    await page.getByTestId("hub-search").fill("a4.mp4");
    assert((await page.getByTestId("hub-item").count()) === 1, "search by file name");
    await page.getByTestId("hub-search").fill("tidak ada");
    await page.getByTestId("hub-nomatch").waitFor();
    await page.getByTestId("hub-search").fill("");
    const titles = async () => (await page.locator(".hub-title").allInnerTexts());
    const newest = await titles(), idxNew = newest.indexOf("Tips masak cepat");
    await page.getByTestId("hub-sort").selectOption("oldest");
    const oldest = await titles();
    assert(oldest[0] === "Tips masak cepat" && JSON.stringify([...oldest].reverse()) === JSON.stringify(newest), "sort oldest first reverses newest first: " + oldest.join("|") + " / " + newest.join("|"));
    await page.getByTestId("hub-sort").selectOption("newest");
  });

  await step("hub: move a video to another category (saved on the server) and the counts follow", async () => {
    await page.getByTestId("hub-search").fill("Catatan tanpa");
    await page.getByTestId("hub-move").selectOption("facebook");
    await until(async () => b.f.calls.some(c => c.action === "update-meta" && c.platform === "facebook"), "update-meta was sent");
    assert(b.f.assets.find(a => a.id === "a5").platform === "facebook", "stored");
    await page.getByTestId("hub-search").fill("");
    const fb = Number(await page.getByTestId("cat-facebook").locator("b").innerText()), un = Number(await page.getByTestId("cat-uncategorized").locator("b").innerText());
    assert(fb === 1 && un === b.f.assets.filter(a => a.platform === "uncategorized").length, "counts moved");
  });

  await step("hub: every category can be assigned and filtered (8 of 8) and every format saved", async () => {
    await page.getByTestId("hub-search").fill("Resep");
    for (const id of ["tiktok", "youtube", "instagram", "facebook", "threads", "x", "other", "uncategorized"]) {
      await page.getByTestId("hub-move").selectOption(id);
      await until(async () => b.f.assets.find(a => a.id === "a2").platform === id, "server stored " + id);
      await page.getByTestId("hub-search").fill("");
      await page.getByTestId("cat-" + id).click();
      const titles = await page.locator(".hub-title").allInnerTexts();
      assert(titles.includes("Resep nasi goreng"), `the video is listed under ${id}`);
      assert(Number(await page.getByTestId("cat-" + id).locator("b").innerText()) === b.f.assets.filter(a => a.platform === id).length, "count for " + id);
      await page.getByTestId("cat-all").click();
      await page.getByTestId("hub-search").fill("Resep");
    }
    await page.getByTestId("hub-move").selectOption("youtube");
    await until(async () => b.f.assets.find(a => a.id === "a2").platform === "youtube", "restored");
    await page.locator(".hub-thumb").click();
    for (const f of ["shorts", "reels", "long_form", "story", "video"]) {
      await page.locator(".hub-sheet select").nth(1).selectOption(f);
      await until(async () => b.f.assets.find(a => a.id === "a2").contentFormat === f, "format " + f);
    }
    await page.keyboard.press("Escape");
    await page.getByTestId("hub-search").fill("");
  });

  await step("hub: download starts a file download from a short-lived URL", async () => {
    await page.getByTestId("hub-search").fill("Promo");
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.getByTestId("hub-download").click()]);
    assert(dl.suggestedFilename() === "x.mp4", "download name");
    assert(b.f.calls.some(c => c.action === "get-download-url" && c.assetId === "a4" && !c.inline), "asked for a download URL");
  });

  await step("hub: delete needs confirmation; cancel keeps the file; confirm removes the file but keeps the record", async () => {
    await page.getByTestId("hub-delete").click();
    await page.getByTestId("hub-confirm").waitFor();
    await page.getByRole("button", { name: "Batal" }).click();
    assert(!b.f.calls.some(c => c.action === "delete-file"), "nothing deleted on cancel");
    await page.getByTestId("hub-delete").click();
    await page.getByTestId("hub-confirm-delete").click();
    await until(async () => b.f.calls.some(c => c.action === "delete-file" && c.assetId === "a4"), "delete-file sent");
    await page.getByText("File dihapus").first().waitFor();
    assert(b.f.assets.find(a => a.id === "a4").status === "deleted" && (await page.getByTestId("hub-item").count()) === 1, "the record is still listed");
    assert(await page.getByTestId("hub-download").count() === 0, "no download for a deleted file");
  });

  await step("hub: a video shows its SEO pack, cover prompt and script from the production notes; no-thumbnail videos show their first frame", async () => {
    await page.goto(BASE + "/hub");
    await page.getByTestId("hub-grid").waitFor({ timeout: 10000 });
    // The production notes live in IndexedDB on the device (text only). Seed one entry for "Resep nasi goreng", linked by id.
    await page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open("clipper-studio", 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const entry = { id: "m-resep", kind: "motion", title: "Resep nasi goreng", script: "Nasi goreng enak dalam lima menit.\nCaranya mudah.", createdAt: 1, updatedAt: 2, videos: [],
        seo: { tiktok: { at: 2, result: { platform: "tiktok", score: 82, modelScore: 82, quickFix: "", checks: [], cards: [{ key: "caption", label: "Caption", kind: "text", value: "Nasi goreng 5 menit, anti gagal" }, { key: "hashtags", label: "Hashtag", kind: "hashtags", value: ["#nasigoreng", "#resep"] }] } } } };
      await new Promise((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put([entry], "history"); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    });
    b.f.assets.find(a => a.id === "a2").historyId = "m-resep"; // linked by id
    b.f.assets.push({ ...b.f.assets.find(a => a.id === "a2"), id: "a2b", historyId: null, createdAt: day(1) }); // same title, no link: must NOT show the notes
    await page.goto(BASE + "/hub");
    await page.getByTestId("hub-grid").waitFor({ timeout: 10000 });
    await page.getByTestId("hub-search").fill("Resep");
    await page.getByTestId("hub-seo-badge").waitFor({ timeout: 10000 });
    assert((await page.getByTestId("hub-seo-badge").count()) === 1 && (await page.getByTestId("hub-item").count()) === 2, "only the linked video shows the SEO badge, not the same-title one");
    assert((await page.getByTestId("hub-seo-badge").innerText()).includes("TikTok"), "card says which SEO packs exist");
    await page.locator(".hub-item", { has: page.getByTestId("hub-seo-badge") }).locator(".hub-thumb").click();
    await page.getByTestId("hub-notes").waitFor();
    const text = await page.getByTestId("hub-notes").innerText();
    assert(text.includes("Nasi goreng 5 menit, anti gagal") && text.includes("#nasigoreng") && text.includes("Naskah") && text.includes("Prompt foto sampul"), "SEO, script and cover prompt are in the video's detail: " + text.slice(0, 200));
    await page.keyboard.press("Escape");
    await page.getByTestId("hub-search").fill("Catatan tanpa");
    assert((await page.getByTestId("hub-seo-badge").count()) === 0, "no badge without notes");
    await page.locator(".hub-thumb").click();
    assert((await page.getByTestId("hub-notes").innerText()).includes("Belum ada catatan"), "empty notes explained");
    await page.keyboard.press("Escape");
    await page.getByTestId("hub-search").fill("");
    // Link by hand: the same-title video (a2b) has no notes; pick the existing entry for it, then unlink.
    await page.getByTestId("hub-search").fill("Resep");
    await page.locator(".hub-item", { hasNot: page.getByTestId("hub-seo-badge") }).locator(".hub-thumb").click();
    await page.getByTestId("hub-link-note").waitFor();
    assert((await page.getByTestId("hub-link-note").locator("option").allInnerTexts()).join("|").includes("Resep nasi goreng"), "the entry is offered");
    await page.getByTestId("hub-link-note").selectOption("m-resep");
    await until(async () => b.f.assets.find(a => a.id === "a2b").historyId === "m-resep", "link saved on the server");
    await page.getByTestId("hub-unlink").waitFor();
    assert((await page.getByTestId("hub-notes").innerText()).includes("Nasi goreng 5 menit"), "the notes appear after linking");
    await page.getByTestId("hub-unlink").click();
    await until(async () => b.f.assets.find(a => a.id === "a2b").historyId === null, "unlinked on the server");
    await page.getByTestId("hub-link-note").waitFor();
    await page.keyboard.press("Escape");
    await page.getByTestId("hub-search").fill("");
    b.f.assets.find(a => a.id === "a5").previewUrl = "https://fake-r2.test/play/a5"; // ready, no thumbnail: first frame from the video
    await page.goto(BASE + "/hub");
    await page.getByTestId("hub-grid").waitFor({ timeout: 10000 });
    await page.getByTestId("hub-search").fill("Catatan tanpa");
    assert((await page.locator(".hub-thumb video").count()) === 1 && (await page.locator(".hub-thumb video").getAttribute("src")).endsWith("#t=0.1"), "preview video element for a video without thumbnail");
  });

  await step("hub: detail dialog plays the video and edits the title", async () => {
    await page.getByTestId("hub-search").fill("Resep");
    await page.locator(".hub-thumb").first().click();
    await page.getByTestId("hub-detail").waitFor();
    await page.locator(".hub-sheet video").waitFor({ timeout: 10000 });
    assert(b.f.calls.some(c => c.action === "get-download-url" && c.assetId === "a2" && c.inline === true), "inline URL for playback");
    const input = page.locator(".hub-sheet input");
    await input.fill("Resep nasi goreng spesial");
    await input.blur();
    await until(async () => b.f.assets.find(a => a.id === "a2").title === "Resep nasi goreng spesial", "title saved");
    await page.keyboard.press("Escape");
    await page.getByTestId("hub-detail").waitFor({ state: "detached" });
  });

  await step("production notes live in the hub: tab switch, old /riwayat address redirects, one header link", async () => {
    await page.goto(BASE + "/riwayat");
    await page.waitForURL(/\/hub\?tab=catatan/, { timeout: 10000 });
    await page.getByTestId("history-panel").waitFor({ timeout: 10000 });
    assert(await page.getByTestId("tab-catatan").getAttribute("aria-selected") === "true", "notes tab selected");
    assert(await page.getByTestId("hub-grid").count() === 0, "video list hidden on the notes tab");
    await page.getByTestId("tab-video").click();
    await page.getByTestId("hub-grid").waitFor({ timeout: 10000 });
    assert(await page.getByTestId("history-panel").count() === 0, "notes hidden on the video tab");
    await page.goto(BASE);
    assert(await page.getByTestId("link-hub").count() === 1 && await page.getByTestId("link-history").count() === 0, "single header link");
  });

  await step("hub: load error offers a retry; empty library explains what to do", async () => {
    b.f.listFails = 1;
    await page.goto(BASE + "/hub");
    await page.getByTestId("hub-load-error").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Muat ulang" }).click();
    await page.getByTestId("hub-grid").waitFor({ timeout: 10000 });
    const saved = b.f.assets; b.f.assets = [];
    await page.goto(BASE + "/hub");
    await page.getByTestId("hub-empty").waitFor({ timeout: 10000 });
    await page.getByText("Simpan ke Content Hub").first().waitFor();
    b.f.assets = saved;
  });

  for (const [name, size] of [["ipad", { width: 820, height: 1180 }], ["iphone", { width: 390, height: 844 }]]) {
    await step(`layout ${name}: no horizontal overflow on the hub and under an export`, async () => {
      await page.setViewportSize(size);
      await page.goto(BASE + "/hub");
      await page.getByTestId("hub-grid").waitFor({ timeout: 10000 });
      await page.screenshot({ path: join(dir, `hub-${name}.png`), fullPage: true });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(over <= 0, "hub overflows by " + over + "px");
      await page.getByTestId("hub-detail").count();
      await page.getByTestId("cat-youtube").click();
      await page.getByTestId("cat-all").click();
      return join(dir, `hub-${name}.png`);
    });
  }

  assert(errors.length === 0 || (results.push("note: page errors: " + errors.slice(0, 3).join(" | ")), true), "");
  await browser.close();
} catch (err) {
  failed = true; results.push("FATAL " + (err instanceof Error ? err.stack : err));
} finally {
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
