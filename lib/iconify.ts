// Icons for scenes from Iconify (https://iconify.design): a free public API, no key. Only line-icon sets with permissive licences
// (no attribution needed) are used, so the icon can be drawn by the studio's own LineIcon and ends up as inline vector paths
// in the preview and the MP4: no image is loaded at render time, so a canvas can never be tainted (iPad/Safari included).
import type { IconNode } from "lucide";

const API = "https://api.iconify.design";

/** Line-icon sets on a 24x24 grid, all MIT/ISC (use, change and ship freely; no credit required). */
export const ICON_SETS: Record<string, { name: string; license: string }> = {
  lucide: { name: "Lucide", license: "ISC" },
  tabler: { name: "Tabler Icons", license: "MIT" },
  feather: { name: "Feather", license: "MIT" },
  iconoir: { name: "Iconoir", license: "MIT" },
};
const PREFIXES = Object.keys(ICON_SETS);
export const ICON_PREFIX = "iconify:";

export class IconifyError extends Error {
  constructor(readonly kind: "network" | "timeout" | "format" | "unsupported", message: string) { super(message); this.name = "IconifyError"; }
}

type Fetch = typeof fetch;
const NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** "prefix:name" -> its parts, only for allowed sets and well-formed names. */
export function parseIconName(full: string): { prefix: string; name: string } | null {
  const m = NAME.exec(full);
  return m && PREFIXES.includes(m[1]) ? { prefix: m[1], name: m[2] } : null;
}

/** Direct SVG address of an icon (used for thumbnails). `color` may be "#rrggbb" or a name; it is encoded for the query string. */
export function getSvgDirectUrl(iconFullName: string, color = "#ffffff", size = 64): string {
  const p = parseIconName(iconFullName);
  if (!p) throw new IconifyError("unsupported", "Nama ikon tidak dikenal.");
  const w = Math.min(512, Math.max(8, Math.round(size) || 64));
  return `${API}/${p.prefix}/${p.name}.svg?color=${encodeURIComponent(color)}&width=${w}`;
}

// ---- small bounded cache + de-duplication, so the same search or icon is never fetched twice ----------------------------
const MAX_CACHE = 80;
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
export function resetIconifyCache() { cache.clear(); inflight.clear(); }
async function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = load().then(v => { cache.set(key, v); if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string); return v; }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function getJson(url: string, fetchImpl: Fetch, signal?: AbortSignal): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal });
    if (!res.ok) throw new IconifyError("network", `Layanan ikon menjawab ${res.status}. Coba lagi nanti.`);
    try { return await res.json(); } catch { throw new IconifyError("format", "Jawaban layanan ikon tidak terbaca."); }
  } catch (e) {
    if (e instanceof IconifyError) throw e;
    if (signal?.aborted) throw new IconifyError("timeout", "Dibatalkan.");
    if (ctl.signal.aborted) throw new IconifyError("timeout", "Layanan ikon terlalu lama menjawab.");
    throw new IconifyError("network", "Tidak bisa terhubung ke layanan ikon. Periksa koneksi internet (atau pemblokir iklan).");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}

/** Icons for a keyword, best first, as "prefix:name", limited to the allowed sets. */
export async function searchSvgIcons(keyword: string, limit = 12, o: { fetchImpl?: Fetch; signal?: AbortSignal } = {}): Promise<string[]> {
  const q = keyword.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!q) return [];
  const n = Math.min(48, Math.max(1, Math.round(limit)));
  const url = `${API}/search?query=${encodeURIComponent(q)}&limit=${n}&prefixes=${PREFIXES.join(",")}`;
  const json = await once(`s:${q.toLowerCase()}:${n}`, () => getJson(url, o.fetchImpl ?? fetch, o.signal)) as { icons?: unknown };
  if (!Array.isArray(json?.icons)) throw new IconifyError("format", "Jawaban pencarian ikon tidak terbaca.");
  return json.icons.filter((x): x is string => typeof x === "string" && !!parseIconName(x));
}

// ---- icon body -> the studio's own icon format ----------------------------------------------------------------------------------
const SHAPES = ["path", "circle", "ellipse", "line", "polyline", "polygon", "rect"] as const;
const KEEP = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points"]);
const SAFE_VALUE = /^[\d\s.,eE+\-a-zA-Z]*$/; // path data, numbers and points only

/** Reads the drawing parts out of an Iconify `body` (plain SVG shapes). Anything else (scripts, images, filters) is ignored. */
export function bodyToNode(body: string): IconNode {
  const out: IconNode = [];
  for (const m of body.matchAll(/<(path|circle|ellipse|line|polyline|polygon|rect)\b([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) if (KEEP.has(a[1]) && SAFE_VALUE.test(a[2])) attrs[a[1]] = a[2];
    if (m[1] === "path" ? !attrs.d : Object.keys(attrs).length === 0) continue;
    // Fills in line sets are small dots drawn as stroke-only parts; this studio draws everything as a line.
    out.push([m[1] as (typeof SHAPES)[number], attrs]);
  }
  return out;
}

export type LoadedIcon = { id: string; label: string; node: IconNode };
/** Downloads one icon and turns it into a drawable icon. The id is what a scene stores ("iconify:lucide:rocket"). */
export async function fetchIcon(iconFullName: string, o: { fetchImpl?: Fetch; signal?: AbortSignal } = {}): Promise<LoadedIcon> {
  const p = parseIconName(iconFullName);
  if (!p) throw new IconifyError("unsupported", "Hanya set ikon garis berlisensi bebas yang dipakai.");
  const json = await once(`i:${iconFullName}`, () => getJson(`${API}/${p.prefix}.json?icons=${encodeURIComponent(p.name)}`, o.fetchImpl ?? fetch, o.signal)) as {
    icons?: Record<string, { body?: string; width?: number; height?: number }>; width?: number; height?: number;
  };
  const icon = json?.icons?.[p.name];
  if (!icon || typeof icon.body !== "string") throw new IconifyError("format", "Ikon tidak ditemukan.");
  const w = icon.width ?? json.width ?? 24, h = icon.height ?? json.height ?? 24;
  if (w !== 24 || h !== 24) throw new IconifyError("unsupported", "Ukuran ikon tidak didukung.");
  const node = bodyToNode(icon.body);
  if (node.length === 0) throw new IconifyError("unsupported", "Ikon ini tidak bisa digambar sebagai garis.");
  return { id: ICON_PREFIX + iconFullName, label: `${p.name} (${ICON_SETS[p.prefix].name})`, node };
}

/**
 * The icon for one scene: the dictionary's exact names first (one request each, no search), then the search's best result.
 * Returns null when nothing fits; network and timeout errors are thrown so the caller can stop.
 */
export async function resolveSceneIcon(lookup: { exact: string[]; query: string }, o: { fetchImpl?: Fetch; signal?: AbortSignal } = {}): Promise<LoadedIcon | null> {
  for (const name of lookup.exact) {
    try { return await fetchIcon(name, o); }
    catch (e) { if (e instanceof IconifyError && (e.kind === "network" || e.kind === "timeout")) throw e; }
  }
  if (!lookup.query.trim()) return null;
  for (const name of (await searchSvgIcons(lookup.query, 3, o)).slice(0, 2)) {
    try { return await fetchIcon(name, o); }
    catch (e) { if (e instanceof IconifyError && (e.kind === "network" || e.kind === "timeout")) throw e; }
  }
  return null;
}

export const isCustomIcon = (id: string) => id.startsWith(ICON_PREFIX);
