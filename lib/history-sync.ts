// Merging the production history between devices (pure). Each video is one entry; two devices may both have changed it, so
// entries are merged field by field (newest title and script, the newest SEO pack per platform, every render/download line),
// and a deleted video is remembered as a "tombstone" so the other device does not bring it back, unless it was changed after.
import { MAX_ENTRIES, isEntry, type HistoryEntry, type VideoLog } from "./history";
import type { SeoPlatform } from "./seo";

export type Tombstones = Record<string, number>;
export type RemoteRow = { id: string; data: unknown; deleted: boolean; updated_ms: number };

export function mergeEntry(a: HistoryEntry, b: HistoryEntry): HistoryEntry {
  const [newer, older] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
  const videos = new Map<string, VideoLog>();
  for (const v of [...older.videos, ...newer.videos]) {
    const k = v.name + "|" + v.size, have = videos.get(k);
    videos.set(k, have ? { ...(v.at >= have.at ? v : have), saved: have.saved || v.saved } : v);
  }
  const seo: HistoryEntry["seo"] = { ...older.seo };
  for (const [p, s] of Object.entries(newer.seo)) { const have = seo[p as SeoPlatform]; if (s && (!have || s.at >= have.at)) seo[p as SeoPlatform] = s; }
  return {
    ...newer, createdAt: Math.min(a.createdAt, b.createdAt), updatedAt: Math.max(a.updatedAt, b.updatedAt),
    title: newer.title || older.title, script: newer.script || older.script, trend: newer.trend ?? older.trend,
    videos: [...videos.values()].sort((x, y) => y.at - x.at).slice(0, 20), seo,
  };
}

export type Plan = { entries: HistoryEntry[]; tombstones: Tombstones; push: RemoteRow[]; changedLocal: boolean };

/** What the device should now hold, and which rows the server is missing or has outdated. */
export function planSync(local: HistoryEntry[], localTombs: Tombstones, remote: RemoteRow[]): Plan {
  const tombs: Tombstones = { ...localTombs };
  const remoteById = new Map<string, HistoryEntry>();
  const remoteTombIds = new Set<string>();
  for (const r of remote) {
    if (r.deleted) { tombs[r.id] = Math.max(tombs[r.id] ?? 0, r.updated_ms); remoteTombIds.add(r.id); }
    else if (isEntry(r.data) && r.data.id === r.id) remoteById.set(r.id, r.data);
  }
  const localById = new Map(local.map(e => [e.id, e]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  const entries: HistoryEntry[] = [], push: RemoteRow[] = [];
  for (const id of ids) {
    const l = localById.get(id), r = remoteById.get(id);
    const merged = l && r ? mergeEntry(l, r) : (l ?? r)!;
    if (tombs[id] !== undefined && tombs[id] >= merged.updatedAt) continue; // deleted since its last change
    delete tombs[id]; // changed after a deletion: it lives again
    entries.push(merged);
    if (!r || JSON.stringify(r) !== JSON.stringify(merged)) push.push({ id, data: merged, deleted: false, updated_ms: merged.updatedAt });
  }
  for (const [id, ts] of Object.entries(tombs)) if (!remoteTombIds.has(id) || !remote.some(r => r.id === id && r.deleted && r.updated_ms >= ts)) push.push({ id, data: null, deleted: true, updated_ms: ts });
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  const kept = entries.slice(0, MAX_ENTRIES);
  const same = kept.length === local.length && kept.every((e, i) => JSON.stringify(e) === JSON.stringify(local[i]));
  const recent = Object.fromEntries(Object.entries(tombs).sort((a, b) => b[1] - a[1]).slice(0, 500));
  return { entries: kept, tombstones: recent, push, changedLocal: !same };
}
