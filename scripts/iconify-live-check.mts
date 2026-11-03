// Temporary: checks the real Iconify API with the app's own code (shapes of the answers, every icon name in the dictionary).
import { fetchIcon, searchSvgIcons, getSvgDirectUrl } from "../lib/iconify";
import { ICON_WORDS } from "../lib/icon-keywords";

const names = [...new Set(Object.values(ICON_WORDS))].sort();
const bad: string[] = [];
console.log("SEARCH rocket:", JSON.stringify(await searchSvgIcons("rocket", 6)));
console.log("SEARCH trending up:", JSON.stringify(await searchSvgIcons("trending up", 4)));
console.log("SVG URL:", getSvgDirectUrl("lucide:rocket", "#8fe0bd", 48), (await fetch(getSvgDirectUrl("lucide:rocket", "#8fe0bd", 48))).status);
const raw = await (await fetch("https://api.iconify.design/lucide.json?icons=rocket,triangle-alert,alert-triangle")).json() as Record<string, unknown>;
console.log("RAW KEYS:", Object.keys(raw).join(","), "ICONS:", Object.keys((raw.icons as object) ?? {}).join(","), "ALIASES:", JSON.stringify(raw.aliases));
for (const n of names) {
  try { const i = await fetchIcon("lucide:" + n); if (i.node.length === 0) bad.push(n + " (empty)"); }
  catch (e) { bad.push(`${n}: ${(e as Error).message}`); }
}
console.log(`DICT CHECK: ${names.length} names, ${bad.length} not usable`);
for (const b of bad) console.log("  MISSING", b);
for (const full of ["tabler:rocket", "feather:clock", "iconoir:coffee"]) { try { const i = await fetchIcon(full); console.log("OTHER OK", full, i.node.length); } catch (e) { console.log("OTHER FAIL", full, (e as Error).message); } }
