// Stock photos from Pexels for scene pictures. The creator's Pexels key lives on the server (the `pexels` function);
// this file only asks that function to search and to hand over a chosen photo, as the signed-in user.
import { cloud } from "./cloud";

export type PexelsPhoto = { id: number; alt: string; photographer: string; photographerUrl: string; pexelsUrl: string; thumb: string; image: string; fallback: string };

export type PexelsErrorKind = "signed-out" | "no-key" | "key" | "limit" | "network" | "server";
export class PexelsError extends Error {
  constructor(readonly kind: PexelsErrorKind, message: string) { super(message); this.name = "PexelsError"; }
}

type Fn = (name: string, body: unknown, opts?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<Response | null>;
const defaultFn: Fn = (name, body, opts) => cloud.fn(name, body, opts);

/** The server's answer turned into a message the creator can act on. */
async function failure(res: Response | null): Promise<PexelsError> {
  if (!res) return new PexelsError("signed-out", "Sesi masuk berakhir. Masuk lagi.");
  let code = "", message = "";
  try { const e = ((await res.json()) as { error?: { status?: string; message?: string } }).error; code = e?.status ?? ""; message = e?.message ?? ""; } catch { /* not JSON */ }
  if (code === "NO_KEY") return new PexelsError("no-key", "Belum ada kunci Pexels. Simpan dulu di panel Gambar otomatis.");
  if (code === "BAD_KEY" || code === "KEY_REJECTED") return new PexelsError("key", message || "Pexels menolak kunci ini.");
  if (code === "RATE_LIMIT" || res.status === 429) return new PexelsError("limit", message || "Batas pencarian Pexels tercapai. Coba lagi nanti.");
  if (res.status === 401) return new PexelsError("signed-out", "Masuk dulu untuk memakai pencarian gambar.");
  if (res.status === 404) return new PexelsError("server", "Fungsi pencarian gambar belum dipasang di server.");
  return new PexelsError("server", message || "Pencarian gambar bermasalah. Coba lagi.");
}

/** true / false when signed in; null when signed out or the server cannot be reached. */
export async function pexelsStatus(fn: Fn = defaultFn): Promise<boolean | null> {
  try {
    const res = await fn("pexels", { action: "status" }, { timeoutMs: 15_000 });
    if (!res?.ok) return null;
    return ((await res.json()) as { hasKey?: boolean }).hasKey === true;
  } catch { return null; }
}

export async function savePexelsKey(key: string, fn: Fn = defaultFn): Promise<void> {
  const k = key.trim();
  if (!/^[\w-]{20,200}$/.test(k)) throw new PexelsError("key", "Kunci tidak valid. Tempel seluruh kunci API Pexels (tanpa spasi).");
  let res: Response | null;
  try { res = await fn("pexels", { action: "save-key", apiKey: k }, { timeoutMs: 30_000 }); }
  catch { throw new PexelsError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res?.ok) throw await failure(res);
}

export async function forgetPexelsKey(fn: Fn = defaultFn): Promise<void> {
  let res: Response | null;
  try { res = await fn("pexels", { action: "forget" }, { timeoutMs: 20_000 }); }
  catch { throw new PexelsError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res?.ok) throw await failure(res);
}

export async function searchPhotos(query: string, o: { perPage?: number; page?: number; signal?: AbortSignal; fn?: Fn } = {}): Promise<{ photos: PexelsPhoto[]; remaining: number | null }> {
  let res: Response | null;
  try { res = await (o.fn ?? defaultFn)("pexels", { action: "search", query, perPage: o.perPage ?? 6, page: o.page ?? 1 }, { signal: o.signal, timeoutMs: 40_000 }); }
  catch { throw new PexelsError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res?.ok) throw await failure(res);
  const body = (await res.json().catch(() => null)) as { photos?: PexelsPhoto[]; remaining?: number | null } | null;
  return { photos: Array.isArray(body?.photos) ? body.photos : [], remaining: typeof body?.remaining === "number" ? body.remaining : null };
}

/** The chosen photo as a file: the 1080×1920 crop first, the smaller portrait version if that one fails. */
export async function downloadPhoto(photo: PexelsPhoto, o: { signal?: AbortSignal; fn?: Fn } = {}): Promise<File> {
  let last: PexelsError | null = null;
  for (const url of [photo.image, photo.fallback]) {
    if (o.signal?.aborted) throw new PexelsError("network", "Dibatalkan.");
    let res: Response | null;
    try { res = await (o.fn ?? defaultFn)("pexels", { action: "image", url }, { signal: o.signal, timeoutMs: 60_000 }); }
    catch { last = new PexelsError("network", "Tidak bisa mengambil gambar. Periksa koneksi internet."); continue; }
    if (!res?.ok) { last = await failure(res); if (last.kind === "signed-out") throw last; continue; }
    const blob = await res.blob();
    if (blob.size < 500 || !blob.type.startsWith("image/")) { last = new PexelsError("server", "Gambar yang diterima rusak."); continue; }
    return new File([blob], `pexels-${photo.id}.jpg`, { type: blob.type });
  }
  throw last ?? new PexelsError("server", "Gambar gagal diambil.");
}

/** The credit shown with a photo and kept in the brief. */
export const creditText = (p: Pick<PexelsPhoto, "photographer">) => `Foto: ${p.photographer} di Pexels`;
