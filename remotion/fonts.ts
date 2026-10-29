// Loads the self-hosted fonts of a type pack (lib/fonts.ts) before anything is measured or drawn. Idempotent and browser-only;
// outside a browser it resolves at once. The composition holds the frame back (delayRender) until its fonts are ready, so a
// preview, a browser render and a command-line render all draw the same glyphs, and text is fitted with the real metrics.
import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { facesFor, type TypePack } from "../lib/fonts";

/** Remotion's own base for public files when rendering from the command line; the web app serves them from the site root. */
function fontUrl(file: string): string {
  try { return staticFile(`fonts/${file}`); } catch { return `/fonts/${file}`; }
}

const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
/** Called when new fonts arrived: cached text measurements made with fallback fonts must be thrown away. */
export function onFontsLoaded(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function ensureFonts(pack: TypePack): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  const jobs = facesFor(pack).map(spec => {
    const key = `${spec.family}|${spec.file}`;
    let p = loading.get(key);
    if (!p) {
      p = (async () => {
        const face = new FontFace(spec.family, `url(${fontUrl(spec.file)}) format("woff2")`, { weight: spec.weight, display: "block" });
        await face.load();
        document.fonts.add(face);
      })();
      // A failed download is not remembered forever: the next attempt tries again (the stack falls back to system fonts meanwhile).
      p.catch(() => loading.delete(key));
      loading.set(key, p);
    }
    return p;
  });
  return Promise.all(jobs).then(() => { listeners.forEach(fn => fn()); });
}

/** Holds the frame until the pack's fonts are loaded, then re-renders so text is fitted again with the real metrics. */
export function useFonts(pack: TypePack): void {
  const [, bump] = useState(0);
  const needed = pack.families.length > 0;
  const [handle] = useState(() => (needed && typeof document !== "undefined" ? delayRender(`fonts: ${pack.id}`, { timeoutInMilliseconds: 30_000 }) : null));
  useEffect(() => {
    let alive = true;
    ensureFonts(pack).catch(() => undefined).finally(() => {
      if (alive) bump(n => n + 1);
      if (handle !== null) { try { continueRender(handle); } catch { /* already released */ } }
    });
    return () => { alive = false; };
  }, [pack, handle]);
}
