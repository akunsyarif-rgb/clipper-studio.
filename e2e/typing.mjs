// Typing on a tablet/phone: the field keeps focus, the page does not move, fields are 16 px (no Safari zoom), the Cinematic and Icon
// panels are styled (dark fields, readable buttons), and a sudden jump to the top while typing is undone. Production server + Chromium
// with touch emulation (WebKit/iPad Safari itself still has to be checked on a real device).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3216);
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
const IDS = ["script", "title", "cine-product", "cine-tagline", "cine-features", "icon-keyword"];

try {
  if (await fetch(BASE).then(() => true, () => false)) throw new Error(`Port ${PORT} is already in use; stop the old server first.`);
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true })).newPage();
  await page.goto(BASE);
  await page.evaluate(() => document.querySelectorAll("details.fold").forEach(d => { d.open = true; }));
  await page.waitForTimeout(1500);

  await step("typing keeps the same field, its focus and the scroll position (autosave included)", async () => {
    for (const id of IDS) {
      const el = page.getByTestId(id).first();
      await el.scrollIntoViewIfNeeded(); await el.click();
      await el.evaluate(e => { e.__mark = 1; });
      const y0 = await page.evaluate(() => scrollY);
      for (const ch of "tes ketik panjang") {
        await page.keyboard.type(ch); await page.waitForTimeout(40);
        const st = await page.evaluate(() => ({ y: scrollY, id: document.activeElement?.getAttribute("data-testid") }));
        assert(st.id === id, `${id}: focus moved to ${st.id}`);
        assert(Math.abs(st.y - y0) < 40, `${id}: page scrolled ${y0} -> ${st.y}`);
      }
      await page.waitForTimeout(1300); // past the autosave delay
      assert(await el.evaluate(e => e.__mark === 1 && document.activeElement === e), `${id}: field was replaced or lost focus after autosave`);
    }
  });

  await step("fields are 16 px on touch screens (Safari does not zoom in)", async () => {
    for (const id of IDS) assert((await page.getByTestId(id).first().evaluate(e => parseFloat(getComputedStyle(e).fontSize))) >= 16, `${id} under 16 px`);
  });

  await step("the Cinematic and Icon panels are styled: dark fields, small labels, readable disabled button", async () => {
    const f = await page.getByTestId("cine-product").evaluate(e => ({ bg: getComputedStyle(e).backgroundColor, label: parseFloat(getComputedStyle(e.closest("label")).fontSize) }));
    assert(f.bg !== "rgb(255, 255, 255)", "field is white: " + f.bg);
    assert(f.label <= 13, "label font " + f.label);
    const b = await page.getByTestId("icon-auto").evaluate(e => { const c = getComputedStyle(e); return { color: c.color, bg: c.backgroundColor }; });
    const lum = s => { const [r, g, bl] = s.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    assert(Math.abs(lum(b.color) - lum(b.bg)) > 60, `button text ${b.color} on ${b.bg} is hard to read`);
  });

  await step("a sudden jump to the top while typing is undone and the field gets its focus back", async () => {
    const el = page.getByTestId("cine-tagline");
    await el.scrollIntoViewIfNeeded(); await el.click();
    const y0 = await page.evaluate(() => scrollY);
    assert(y0 > 500, "test needs a scrolled page: " + y0);
    await page.keyboard.type("x");
    await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({ y: scrollY, id: document.activeElement?.getAttribute("data-testid") }));
    assert(Math.abs(st.y - y0) < 40, `page not restored: ${st.y} (was ${y0})`);
    assert(st.id === "cine-tagline", "focus not restored: " + st.id);
    // A person who scrolls on purpose a moment later is left alone.
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    assert((await page.evaluate(() => scrollY)) < 5, "normal scrolling was blocked");
  });

  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
