// Product pages for affiliate videos: the shop's or brand's own page, read by the `product` function on the server, and the
// pictures that page uses. This file only asks that function, as the signed-in user.
import { cloud } from "./cloud";

export type ProductPage = {
  url: string; host: string; title: string; brand: string; description: string;
  price: { amount: string; currency: string } | null;
  /** "name: value" facts the page lists itself (structured data, specification tables). */
  specs: string[];
  images: string[];
  /** The page's readable text, so a fact can be checked against what the page really says. */
  text: string;
};
export type SearchHit = { title: string; url: string; host: string; snippet: string };

export type ProductErrorKind = "signed-out" | "bad-url" | "blocked" | "network" | "server";
export class ProductError extends Error {
  constructor(readonly kind: ProductErrorKind, message: string) { super(message); this.name = "ProductError"; }
}

export type Fn = (name: string, body: unknown, opts?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<Response | null>;
const defaultFn: Fn = (name, body, opts) => cloud.fn(name, body, opts);

async function failure(res: Response | null): Promise<ProductError> {
  if (!res) return new ProductError("signed-out", "Sesi masuk berakhir. Masuk lagi.");
  let code = "", message = "";
  try { const e = ((await res.json()) as { error?: { status?: string; message?: string } }).error; code = e?.status ?? ""; message = e?.message ?? ""; } catch { /* not JSON */ }
  if (code === "BAD_URL") return new ProductError("bad-url", message || "Tautan harus alamat https publik.");
  if (code === "PAGE_BLOCKED" || code === "IMAGE_FAILED" || code === "SEARCH_BLOCKED") return new ProductError("blocked", message || "Situs menolak dibaca otomatis.");
  if (res.status === 401) return new ProductError("signed-out", "Masuk dulu untuk membaca halaman produk.");
  if (res.status === 404) return new ProductError("server", "Fungsi pembaca halaman produk belum dipasang di server.");
  return new ProductError("server", message || "Halaman produk tidak bisa dibaca. Coba lagi.");
}

/** A tidy address from what was pasted (adds https:// when it is missing); null when it is not an address. */
export function normalizeLink(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(t) ? `https://${t}` : null;
  if (!withScheme) return null;
  try { const u = new URL(withScheme); return u.protocol === "https:" || u.protocol === "http:" ? u.toString().replace(/^http:/, "https:") : null; } catch { return null; }
}

export async function readProductPage(url: string, o: { signal?: AbortSignal; fn?: Fn } = {}): Promise<ProductPage> {
  let res: Response | null;
  try { res = await (o.fn ?? defaultFn)("product", { action: "page", url }, { signal: o.signal, timeoutMs: 40_000 }); }
  catch { throw new ProductError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res?.ok) throw await failure(res);
  const page = ((await res.json().catch(() => null)) as { page?: ProductPage } | null)?.page;
  if (!page) throw new ProductError("server", "Halaman produk tidak bisa dibaca. Coba lagi.");
  return { ...page, specs: page.specs ?? [], images: page.images ?? [], text: page.text ?? "" };
}

/** Web search done by the server (no AI): the best matching pages for a query. */
export async function searchWeb(query: string, o: { signal?: AbortSignal; fn?: Fn } = {}): Promise<SearchHit[]> {
  let res: Response | null;
  try { res = await (o.fn ?? defaultFn)("product", { action: "search", query }, { signal: o.signal, timeoutMs: 40_000 }); }
  catch { throw new ProductError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res?.ok) throw await failure(res);
  const hits = ((await res.json().catch(() => null)) as { hits?: SearchHit[] } | null)?.hits;
  return Array.isArray(hits) ? hits : [];
}

/** One of the page's pictures as a file, fetched by the server (so the shop's hotlink rules do not matter). */
export async function downloadProductImage(url: string, o: { signal?: AbortSignal; fn?: Fn; name?: string } = {}): Promise<File> {
  let res: Response | null;
  try { res = await (o.fn ?? defaultFn)("product", { action: "image", url }, { signal: o.signal, timeoutMs: 60_000 }); }
  catch { throw new ProductError("network", "Tidak bisa mengambil gambar. Periksa koneksi internet."); }
  if (!res?.ok) throw await failure(res);
  const blob = await res.blob();
  if (blob.size < 500 || !blob.type.startsWith("image/")) throw new ProductError("server", "Gambar yang diterima rusak.");
  return new File([blob], o.name ?? "produk.jpg", { type: blob.type });
}
