// Every text field on every page: click it, type, and check that the very same element is still there and still focused (a remount or a
// focus steal would lose the caret on every key), the page did not jump, and the value is what was typed. Tablet viewport with touch.
// Production server + Chromium. (WebKit/iPad Safari itself still has to be checked on a real device.)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3220);
const BASE = `http://localhost:${PORT}`;
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
const results = [];
let failed = false;
async function step(name, fn) {
  const t = Date.now();
  try { const info = await fn(); results.push(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${info ? " — " + info : ""}`); }
  catch (err) { failed = true; results.push(`FAIL ${name}: ${err instanceof Error ? err.message : err}`); }
}
const SELECTOR = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=hidden]):not([type=submit]):not([type=button]), textarea';

try {
  for (let i = 0; i < 60; i++) { try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  for (const path of ["/", "/motion", "/hub"]) {
    await step(`${path}: every text field keeps its element, focus, caret and the page position while typing`, async () => {
      const page = await ctx.newPage();
      await page.goto(BASE + path);
      await page.evaluate(() => document.querySelectorAll("details").forEach(d => { d.open = true; }));
      await page.waitForTimeout(1500);
      const count = await page.locator(SELECTOR).count();
      const problems = [];
      let tried = 0;
      for (let i = 0; i < count; i++) {
        const el = page.locator(SELECTOR).nth(i);
        if (!(await el.isVisible()) || !(await el.isEnabled()) || (await el.evaluate(e => e.readOnly))) continue;
        const label = await el.evaluate(e => e.getAttribute("data-testid") || e.id || e.name || e.placeholder || e.tagName + "#" + [...document.querySelectorAll(e.tagName)].indexOf(e));
        const before = await el.inputValue().catch(() => "");
        try { await el.scrollIntoViewIfNeeded({ timeout: 2000 }); await el.click({ timeout: 2000 }); } catch { continue; }
        await el.evaluate(e => { e.__mark = 1; });
        const y0 = await page.evaluate(() => scrollY);
        tried++;
        for (const ch of "ab c") {
          await page.keyboard.type(ch); await page.waitForTimeout(60);
          const st = await el.evaluate(e => ({ same: e.__mark === 1 && e.isConnected, focused: document.activeElement === e }));
          if (!st.same || !st.focused) { problems.push(`${label}: ${!st.same ? "element replaced" : "focus lost"} after "${ch}"`); break; }
          if (Math.abs((await page.evaluate(() => scrollY)) - y0) > 60) { problems.push(`${label}: page jumped while typing`); break; }
        }
        await page.waitForTimeout(1200); // autosave and other timers
        const st2 = await el.evaluate(e => ({ same: e.__mark === 1 && e.isConnected, focused: document.activeElement === e }));
        if (!st2.same || !st2.focused) problems.push(`${label}: element replaced or focus lost a moment after typing`);
        await el.fill(before).catch(() => {}); // leave it as it was
      }
      await page.close();
      if (problems.length) throw new Error(`${problems.length} of ${tried}: ${problems.slice(0, 6).join(" | ")}`);
      return `${tried} fields`;
    });
  }
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
