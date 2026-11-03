// The same four-place menu on every page, with the current page marked, usable without sideways scrolling of the page on a phone.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = Number(process.env.E2E_PORT || 3217);
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
const results = [];
let failed = false;
async function step(name, fn) { try { await fn(); results.push(`PASS ${name}`); } catch (e) { failed = true; results.push(`FAIL ${name}: ${e instanceof Error ? e.message : e}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const PAGES = [["/", "clipper"], ["/motion", "studio"], ["/assets", "assets"], ["/hub", "library"]];
try {
  for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}`); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  for (const [path, key] of PAGES) {
    await step(`${path}: menu present, ${key} marked current, page does not scroll sideways`, async () => {
      await page.goto(`http://localhost:${PORT}${path}`);
      await page.getByTestId("app-nav").waitFor({ timeout: 10000 });
      assert((await page.getByTestId("app-nav").locator("a").count()) === 4, "four menu items");
      assert((await page.getByTestId(`nav-${key}`).getAttribute("aria-current")) === "page", "current page marked");
      const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      assert(w[0] <= w[1] + 1, `scrollWidth ${w[0]} > ${w[1]}`);
    });
  }
  await step("one way to each place: no second link to the studio, library or home page content duplicated in headers", async () => {
    for (const [path, target] of [["/", "/motion"], ["/hub", "/motion"], ["/assets", "/motion"], ["/motion", "/hub"], ["/", "/hub"]]) {
      await page.goto(`http://localhost:${PORT}${path}`); await page.getByTestId("app-nav").waitFor();
      const n = await page.locator(`a[href="${target}"]`).count();
      assert(n === 1, `${path} has ${n} links to ${target}`);
    }
  });
  await step("every menu item leads to its page", async () => {
    await page.goto(`http://localhost:${PORT}/`);
    for (const [path, key] of PAGES.slice(1)) { await page.getByTestId(`nav-${key}`).click(); await page.waitForURL(`**${path}`); await page.getByTestId("app-nav").waitFor(); }
  });
  await browser.close();
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  console.log(results.join("\n"));
  process.exit(failed ? 1 : 0);
}
