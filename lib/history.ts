// Production history: for every video the creator makes, the text that goes with it (script, trend note, the SEO and
// distribution pack per platform) and a log of when it was rendered and downloaded. Text only (never video, audio or
// pictures), kept on this device. Pure functions over a list of entries; lib/history-store.ts reads and writes the list.
import type { SeoPlatform, SeoResult } from "./seo";

export type VideoLog = { at: number; name: string; size: number; label: string; /** The creator tapped "Simpan" for this file. */ saved: boolean };
export type HistoryEntry = {
  id: string;
  kind: "motion" | "clip";
  title: string;
  script: string;
  createdAt: number;
  updatedAt: number;
  /** The trend step's inputs for this video, when it was started from a trend. */
  trend?: { platform: SeoPlatform; niche: string; audience: string; trend: string };
  videos: VideoLog[];
  seo: Partial<Record<SeoPlatform, { at: number; result: SeoResult }>>;
};

export const MAX_ENTRIES = 150;
const MAX_SCRIPT = 3000;

/** A stable id for a script: the same words give the same id however they are spaced; the *marks* for emphasis do not count. */
export function scriptId(script: string): string {
  const text = script.replace(/\[jeda[^\]]*\]/gi, "").replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `m-${text.length.toString(36)}-${h1.toString(36)}${h2.toString(36)}`;
}

export const clipId = (fileName: string, start: number, duration: number) => `c-${scriptId(`${fileName}|${Math.round(start * 10)}|${Math.round(duration * 10)}`).slice(2)}`;

type Base = { id: string; kind: HistoryEntry["kind"]; title: string; script: string; now: number };

function touch(list: HistoryEntry[], b: Base, change: (e: HistoryEntry) => HistoryEntry): HistoryEntry[] {
  const found = list.find(e => e.id === b.id);
  const base: HistoryEntry = found ?? { id: b.id, kind: b.kind, title: "", script: "", createdAt: b.now, updatedAt: b.now, videos: [], seo: {} };
  const next = change({ ...base, title: b.title.trim().slice(0, 80) || base.title, script: b.script.slice(0, MAX_SCRIPT) || base.script, updatedAt: b.now });
  return [next, ...list.filter(e => e.id !== b.id)].sort((a, c) => c.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES);
}

/** A video was rendered. The same file name rendered again replaces its earlier log line instead of adding a duplicate. */
export function logRender(list: HistoryEntry[], b: Base, v: Omit<VideoLog, "saved" | "at">): HistoryEntry[] {
  return touch(list, b, e => ({ ...e, videos: [{ ...v, at: b.now, saved: e.videos.some(x => x.name === v.name && x.size === v.size && x.saved) }, ...e.videos.filter(x => !(x.name === v.name && x.size === v.size))].slice(0, 20) }));
}

/** The creator tapped "Simpan" for a file: it is marked as downloaded (and logged if its render was not seen). */
export function logDownload(list: HistoryEntry[], b: Base, v: Omit<VideoLog, "saved" | "at">): HistoryEntry[] {
  return touch(list, b, e => {
    const has = e.videos.some(x => x.name === v.name && x.size === v.size);
    const videos = has ? e.videos.map(x => (x.name === v.name && x.size === v.size ? { ...x, saved: true, at: b.now } : x)) : [{ ...v, at: b.now, saved: true }, ...e.videos];
    return { ...e, videos: videos.slice(0, 20) };
  });
}

export function logSeo(list: HistoryEntry[], b: Base, platform: SeoPlatform, result: SeoResult): HistoryEntry[] {
  return touch(list, b, e => ({ ...e, seo: { ...e.seo, [platform]: { at: b.now, result } } }));
}

export function logTrend(list: HistoryEntry[], b: Base, trend: NonNullable<HistoryEntry["trend"]>): HistoryEntry[] {
  return touch(list, b, e => ({ ...e, trend }));
}

export const removeEntry = (list: HistoryEntry[], id: string) => list.filter(e => e.id !== id);

export function isEntry(x: unknown): x is HistoryEntry {
  const e = x as Partial<HistoryEntry> | null;
  return !!e && typeof e.id === "string" && (e.kind === "motion" || e.kind === "clip") && typeof e.title === "string" && typeof e.script === "string"
    && typeof e.createdAt === "number" && typeof e.updatedAt === "number" && Array.isArray(e.videos) && !!e.seo && typeof e.seo === "object";
}
export const cleanList = (x: unknown): HistoryEntry[] => (Array.isArray(x) ? x.filter(isEntry).slice(0, MAX_ENTRIES) : []);

export type Filter = { text: string; status: "all" | "saved" | "unsaved" | "no-seo" };
/** Entries matching a search text (title, script, SEO text) and a status filter. */
export function filterEntries(list: HistoryEntry[], f: Filter): HistoryEntry[] {
  const q = f.text.trim().toLowerCase();
  return list.filter(e => {
    const saved = e.videos.some(v => v.saved);
    if (f.status === "saved" && !saved) return false;
    if (f.status === "unsaved" && (saved || e.videos.length === 0)) return false;
    if (f.status === "no-seo" && Object.keys(e.seo).length > 0) return false;
    if (!q) return true;
    const hay = [e.title, e.script, e.trend?.niche ?? "", e.trend?.trend ?? "", ...Object.values(e.seo).flatMap(s => s ? s.result.cards.map(c => Array.isArray(c.value) ? c.value.join(" ") : c.value) : [])].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

const csvCell = (s: string) => `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ⏎ ")}"`;
/** One row per entry and platform pack (an entry with no pack still gets a row), for a spreadsheet. */
export function toCsv(list: HistoryEntry[]): string {
  const head = ["tanggal", "jenis", "judul", "diunduh", "file", "platform", "skor_seo", "hook", "caption", "hashtag", "judul_platform"];
  const rows: string[][] = [];
  const get = (r: SeoResult, ...keys: string[]) => { const c = r.cards.find(x => keys.includes(x.key)); return c ? (Array.isArray(c.value) ? c.value.join(" ") : c.value) : ""; };
  for (const e of list) {
    const date = new Date(e.updatedAt).toISOString().slice(0, 16).replace("T", " ");
    const saved = e.videos.filter(v => v.saved);
    const base = [date, e.kind === "clip" ? "klip" : "motion", e.title, saved.length ? "ya" : "tidak", e.videos.map(v => v.name).join(" | ")];
    const packs = Object.entries(e.seo);
    if (!packs.length) rows.push([...base, "", "", "", "", "", ""]);
    for (const [platform, s] of packs) if (s) rows.push([...base, platform, String(s.result.score), get(s.result, "hookText", "hook"), get(s.result, "caption", "description", "body", "tweet"), get(s.result, "hashtags", "topics"), get(s.result, "title")]);
  }
  return [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
}

export const toJson = (list: HistoryEntry[]) => JSON.stringify({ app: "clipper-studio", exportedAt: new Date().toISOString(), entries: list }, null, 2);
