// Thin IndexedDB key-value wrapper (browser only). Every call fails soft: private mode, a full disk or a blocked
// database just means nothing is remembered; the studio keeps working.
import { asrCacheKey, touchCache, type SessionData, type SourceRecord, isSession } from "./session";
import type { Transcript } from "./transcript";
import { cloud } from "./cloud";

const DB_NAME = "clipper-studio";
const STORE = "kv";
let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

export const kvGet = <T>(key: string) => run<T>("readonly", s => s.get(key) as IDBRequest<T>);
export async function kvSet(key: string, value: unknown): Promise<boolean> {
  let ok = false;
  const db = await open();
  if (!db) return false;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => { ok = true; resolve(); };
      tx.onerror = tx.onabort = () => resolve();
    } catch { resolve(); }
  });
  return ok;
}
export const kvDel = (key: string) => run<undefined>("readwrite", s => s.delete(key) as IDBRequest<undefined>);

const SESSION = "session";
const CLIP_HANDOFF = "handoff-clip";
const SOURCE = "source";
const ASR_INDEX = "asr-index";

export async function loadSession(): Promise<SessionData | null> {
  const v = await kvGet<unknown>(SESSION);
  return isSession(v) ? v : null;
}
export const saveSession = (s: SessionData) => kvSet(SESSION, s);
export const loadSource = async () => (await kvGet<SourceRecord>(SOURCE)) ?? null;
export const saveSource = (s: SourceRecord) => kvSet(SOURCE, s);
export const deleteSource = () => kvDel(SOURCE);

/** A clip cut in the clipper, waiting for the motion studio to take it over (the video itself, so nothing is uploaded or re-chosen). */
export type ClipHandoff = { blob: Blob; name: string; type: string; seconds: number; title: string; transcript: Transcript | null; at: number };
const HANDOFF_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * The clip waits in memory first: moving from the clipper to the motion studio is an in-app navigation, so the very same file
 * is still there, whole. Safari on iPad can hand back a damaged or cut-short file when a large video is read back from
 * IndexedDB (FFmpeg then says "moov atom not found"), so storage is only the fallback, for a new tab or a reload.
 */
let waiting: ClipHandoff | null = null;

export async function saveClipHandoff(h: ClipHandoff): Promise<boolean> {
  waiting = h;
  void kvSet(CLIP_HANDOFF, h); // best effort; never needed while the app stays open
  return true;
}

const usable = (h: ClipHandoff | null | undefined): h is ClipHandoff =>
  !!h && h.blob instanceof Blob && h.blob.size > 0 && typeof h.name === "string" && Number.isFinite(h.seconds) && h.seconds > 0 && Date.now() - h.at < HANDOFF_MAX_AGE_MS;

/** Takes the waiting clip (once): it is removed as it is read, and one older than an hour is ignored. */
export async function takeClipHandoff(): Promise<ClipHandoff | null> {
  const fromMemory = waiting;
  waiting = null;
  if (fromMemory) { void kvDel(CLIP_HANDOFF); return usable(fromMemory) ? fromMemory : null; }
  const h = await kvGet<ClipHandoff>(CLIP_HANDOFF);
  if (h === undefined) return null;
  await kvDel(CLIP_HANDOFF);
  return usable(h) ? h : null;
}

/** Forgets the saved session and its video (the transcript cache stays: it only speeds up repeating the same video). */
export async function clearSession() { await kvDel(SESSION); await kvDel(SOURCE); }

export async function loadCachedTranscript(file: File, range: { start: number; duration: number }, model: string, language: string): Promise<Transcript | null> {
  const key = asrCacheKey(file, range, model, language);
  const t = await kvGet<Transcript>(key);
  if (t && Array.isArray(t.segments) && t.segments.length) return t;
  // Not on this device: a transcript made on another device (signed in only) is fetched and kept here too.
  const remote = await cloud.getTranscript(key);
  if (remote) await storeTranscript(key, remote);
  return remote;
}

export async function saveCachedTranscript(file: File, range: { start: number; duration: number }, model: string, language: string, t: Transcript) {
  const key = asrCacheKey(file, range, model, language);
  void cloud.putTranscript(key, t);
  await storeTranscript(key, t);
}

async function storeTranscript(key: string, t: Transcript) {
  if (!(await kvSet(key, t))) return;
  const { index, drop } = touchCache((await kvGet<string[]>(ASR_INDEX)) ?? [], key);
  for (const k of drop) await kvDel(k);
  await kvSet(ASR_INDEX, index);
}
