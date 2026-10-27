// Where the speech model lives in the browser, and why it may have to be downloaded again. The model is kept in the
// browser's Cache Storage, which belongs to ONE web address: every preview deployment has its own address, so a new
// version looks like a new website and starts empty. Pure helpers plus two thin browser calls.

/** The cache Transformers.js stores model files in (env.cacheKey). */
export const MODEL_CACHE = "transformers-cache";

/**
 * True when `hostname` is the address of one deployment only. `deploymentHost` is that deployment's own host name,
 * known at build time (Vercel's VERCEL_URL): when the page is opened at exactly that address, it will not be reused
 * by the next version. Without it, the shape of a preview address (`name-4f684f9yx-team.vercel.app`) is the guide;
 * branch addresses (`-git-`) and the main domain stay put.
 */
export function isOneOffPreview(hostname: string, deploymentHost = ""): boolean {
  const host = hostname.toLowerCase();
  if (deploymentHost && host === deploymentHost.toLowerCase()) return true;
  if (deploymentHost) return false;
  if (!/\.vercel\.app$/.test(host) || /-git-/.test(host)) return false;
  return /-(?=[a-z0-9]*\d)[a-z0-9]{9}-[^.]+\.vercel\.app$/.test(host);
}

/** Whether the model's files are already in this address's cache; null when the browser cannot say. */
export async function modelIsCached(model: string, cacheStorage: Pick<CacheStorage, "open"> | undefined = typeof caches === "undefined" ? undefined : caches): Promise<boolean | null> {
  if (!cacheStorage) return null;
  try {
    const keys = await (await cacheStorage.open(MODEL_CACHE)).keys();
    const urls = keys.map(k => k.url);
    // The weights are the large files; the configuration alone does not make the model usable offline.
    return urls.some(u => u.includes(`/${model}/resolve/`) && /\.onnx(\?|$)/.test(u));
  } catch { return null; }
}

/** Asks the browser not to clear this site's storage when space is low. Safari and Chrome may still refuse; that is fine. */
export async function keepStorage(storage: Pick<StorageManager, "persist" | "persisted"> | undefined = typeof navigator === "undefined" ? undefined : navigator.storage): Promise<boolean | null> {
  try {
    if (!storage?.persist) return null;
    return (await storage.persisted?.()) || (await storage.persist());
  } catch { return null; }
}
