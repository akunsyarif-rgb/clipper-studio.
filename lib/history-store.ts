// Reads and writes the production history in IndexedDB (text only) and, when the creator is signed in, keeps it in step with
// the other devices through Supabase (see lib/history-sync.ts for how two copies are merged). Every call fails soft: a blocked or
// full database, or no connection, just means nothing is remembered or synced this time. Updates are serialised so two quick
// events (render finished, then SEO saved) never overwrite each other.
import { kvGet, kvSet } from "./session-store";
import { cloud } from "./cloud";
import { cleanList, type HistoryEntry } from "./history";
import { planSync, type Tombstones } from "./history-sync";

const KEY = "history";
const TOMBS = "history-deleted";
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

export async function loadHistory(): Promise<HistoryEntry[]> {
  try { return cleanList(await kvGet<unknown>(KEY)); } catch { return []; }
}
async function loadTombs(): Promise<Tombstones> {
  try {
    const v = await kvGet<unknown>(TOMBS);
    if (!v || typeof v !== "object") return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, t]) => typeof t === "number")) as Tombstones;
  } catch { return {}; }
}
export async function saveHistory(list: HistoryEntry[]): Promise<boolean> {
  const ok = await kvSet(KEY, list).catch(() => false);
  if (ok) listeners.forEach(f => f());
  return ok;
}
export function onHistoryChange(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

function enqueue<T>(job: () => Promise<T>, fallback: T): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => undefined);
  return run.catch(() => fallback);
}

/** Applies `change` to the stored list, one update at a time, then schedules a sync. Resolves with the new list. */
export function updateHistory(change: (list: HistoryEntry[]) => HistoryEntry[]): Promise<HistoryEntry[]> {
  return enqueue(async () => { const next = change(await loadHistory()); await saveHistory(next); scheduleSync(); return next; }, []);
}

/** Deletes videos from the history and remembers the deletion, so the other devices delete them too. */
export function deleteHistory(ids: string[]): Promise<HistoryEntry[]> {
  return enqueue(async () => {
    const gone = new Set(ids), now = Date.now();
    const tombs = await loadTombs();
    for (const id of gone) tombs[id] = now;
    await kvSet(TOMBS, tombs).catch(() => false);
    const next = (await loadHistory()).filter(e => !gone.has(e.id));
    await saveHistory(next); scheduleSync();
    return next;
  }, []);
}

// ---- sync ---------------------------------------------------------------------------------------------------------------
export type SyncState = { phase: "off" | "idle" | "syncing" | "done" | "error"; at?: number; message?: string };
let state: SyncState = { phase: "off" };
const syncListeners = new Set<() => void>();
const setState = (s: SyncState) => { state = s; syncListeners.forEach(f => f()); };
export const syncState = () => state;
export function onSyncChange(f: () => void): () => void { syncListeners.add(f); return () => { syncListeners.delete(f); }; }

/** Pulls the server's copy, merges it with this device's, stores the result and pushes what the server lacks. */
export function syncHistory(): Promise<SyncState> {
  return enqueue(async () => {
    if (!cloud.user()) { setState({ phase: "off" }); return state; }
    setState({ phase: "syncing" });
    const remote = await cloud.pullHistory();
    if (!remote) { setState({ phase: "error", message: "Sinkron gagal: server tidak terjangkau atau sesi masuk berakhir. Riwayat di perangkat ini aman." }); return state; }
    const plan = planSync(await loadHistory(), await loadTombs(), remote);
    if (plan.changedLocal) await saveHistory(plan.entries);
    await kvSet(TOMBS, plan.tombstones).catch(() => false);
    if (plan.push.length && !(await cloud.pushHistory(plan.push))) { setState({ phase: "error", message: "Sebagian riwayat belum terkirim ke server. Akan dicoba lagi." }); return state; }
    setState({ phase: "done", at: Date.now() });
    return state;
  }, { phase: "error", message: "Sinkron gagal." } as SyncState);
}

let timer: ReturnType<typeof setTimeout> | null = null;
export function scheduleSync(delayMs = 2500) {
  if (typeof window === "undefined" || !cloud.user()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncHistory(); }, delayMs);
}

let started = false;
/** Syncs now and again whenever the creator signs in; safe to call from every page. */
export function startHistorySync() {
  if (started || typeof window === "undefined") return;
  started = true;
  let last = cloud.user();
  if (last) void syncHistory(); else setState({ phase: "off" });
  cloud.subscribe(() => { const now = cloud.user(); if (now !== last) { last = now; if (now) void syncHistory(); else setState({ phase: "off" }); } });
}
