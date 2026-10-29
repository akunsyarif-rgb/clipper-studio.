// Reads and writes the production history in IndexedDB (text only). Every call fails soft: a blocked or full database just
// means nothing is remembered. Updates are serialised so two quick events (render finished, then SEO saved) never overwrite each other.
import { kvGet, kvSet } from "./session-store";
import { cleanList, type HistoryEntry } from "./history";

const KEY = "history";
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

export async function loadHistory(): Promise<HistoryEntry[]> {
  try { return cleanList(await kvGet<unknown>(KEY)); } catch { return []; }
}
export async function saveHistory(list: HistoryEntry[]): Promise<boolean> {
  const ok = await kvSet(KEY, list).catch(() => false);
  if (ok) listeners.forEach(f => f());
  return ok;
}
/** Applies `change` to the stored list, one update at a time. Resolves with the new list. */
export function updateHistory(change: (list: HistoryEntry[]) => HistoryEntry[]): Promise<HistoryEntry[]> {
  const run = queue.then(async () => { const next = change(await loadHistory()); await saveHistory(next); return next; });
  queue = run.catch(() => undefined);
  return run.catch(() => []);
}
export function onHistoryChange(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }
