"use client";

import { useEffect } from "react";
import { holdWakeLock } from "@/lib/wake-lock";

/** Holds the screen awake while `active` is true (a render or a transcript); lets go when it ends or the component goes away. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let release: (() => Promise<void>) | null = null, cancelled = false;
    void holdWakeLock().then(r => { if (cancelled) void r(); else release = r; }).catch(() => { /* never breaks the job */ });
    return () => { cancelled = true; if (release) void release(); };
  }, [active]);
}
