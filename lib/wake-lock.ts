// Keeps the screen on while a heavy job runs (the Screen Wake Lock API). Browsers that do not have it, or refuse it, are fine:
// nothing here ever throws, the job simply runs without the lock. The lock is dropped by the browser when the tab is hidden, so it
// is asked for again when the tab comes back.
type Sentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

export const wakeLockSupported = (nav: { wakeLock?: unknown } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean => !!nav?.wakeLock;

/** Starts holding the lock; the returned function lets go and never throws. */
export async function holdWakeLock(env: { nav?: { wakeLock?: unknown }; doc?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState"> } = {}): Promise<() => Promise<void>> {
  const nav = env.nav ?? (typeof navigator === "undefined" ? undefined : navigator);
  const doc = env.doc ?? (typeof document === "undefined" ? undefined : document);
  const api = nav?.wakeLock as WakeLockApi | undefined;
  if (!api) return async () => {};
  let sentinel: Sentinel | null = null, held = true;
  const acquire = async () => { try { sentinel = await api.request("screen"); } catch { sentinel = null; /* refused (low battery, hidden tab): carry on without it */ } };
  const onVisible = () => { if (held && doc?.visibilityState === "visible") void acquire(); };
  await acquire();
  doc?.addEventListener("visibilitychange", onVisible);
  return async () => {
    held = false;
    doc?.removeEventListener("visibilitychange", onVisible);
    try { await sentinel?.release(); } catch { /* already released */ }
    sentinel = null;
  };
}
