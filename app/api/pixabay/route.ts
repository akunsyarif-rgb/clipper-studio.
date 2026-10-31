import { NextRequest } from "next/server";

export const runtime = "nodejs";

const API = "https://pixabay.com/api/";
const IMAGE_HOST = "cdn.pixabay.com";
const PIXABAY_HOST = "pixabay.com";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const fail = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

function cleanImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const cdnPhoto = url.hostname === IMAGE_HOST && url.pathname.startsWith("/photo/");
    const pixabayDownload = url.hostname === PIXABAY_HOST && url.pathname.startsWith("/get/");
    if (!cdnPhoto && !pixabayDownload) return null;
    return url.toString();
  } catch { return null; }
}

type RawHit = { id?: unknown; tags?: unknown; pageURL?: unknown; user?: unknown; previewURL?: unknown; webformatURL?: unknown; largeImageURL?: unknown };
function pageUrl(raw: unknown): string {
  try {
    const url = new URL(String(raw));
    return url.protocol === "https:" && url.hostname === "pixabay.com" ? url.toString() : "https://pixabay.com/";
  } catch { return "https://pixabay.com/"; }
}
function normalizePhotos(payload: unknown) {
  const hits = (payload as { hits?: unknown } | null)?.hits;
  if (!Array.isArray(hits)) return [];
  return (hits as RawHit[]).flatMap(hit => {
    if (typeof hit?.id !== "number") return [];
    const thumb = cleanImageUrl(hit.previewURL);
    const image = cleanImageUrl(hit.largeImageURL) ?? cleanImageUrl(hit.webformatURL);
    if (!thumb || !image) return [];
    return [{
      id: hit.id,
      alt: String(hit.tags ?? "").replace(/\s+/g, " ").slice(0, 120),
      photographer: String(hit.user ?? "Kontributor Pixabay").slice(0, 80),
      pageUrl: pageUrl(hit.pageURL),
      thumb,
      image,
    }];
  });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) return fail(503, "MISSING_KEY", "PIXABAY_API_KEY belum tersedia pada environment deployment ini.");

  let body: { action?: unknown; query?: unknown; perPage?: unknown; page?: unknown; url?: unknown };
  try { body = await request.json(); } catch { return fail(400, "BAD_REQUEST", "Permintaan tidak valid."); }

  if (body.action === "search") {
    const query = String(body.query ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (query.length < 2) return fail(400, "BAD_QUERY", "Masukkan minimal dua karakter untuk pencarian.");
    const perPage = Math.min(20, Math.max(3, Math.round(Number(body.perPage) || 6)));
    const page = Math.min(5, Math.max(1, Math.round(Number(body.page) || 1)));
    const params = new URLSearchParams({
      key: apiKey, q: query, lang: "en", image_type: "all", orientation: "vertical",
      safesearch: "true", order: "popular", per_page: String(perPage), page: String(page),
    });
    try {
      // Pixabay requires API search responses to be cached for at least 24 hours.
      const upstream = await fetch(`${API}?${params}`, { next: { revalidate: 86_400 } });
      if (upstream.status === 429) return fail(429, "RATE_LIMIT", "Batas permintaan Pixabay tercapai. Tunggu sebelum mencoba lagi.");
      if (!upstream.ok) return fail(502, "UPSTREAM_ERROR", "Pixabay sedang bermasalah. Coba lagi nanti.");
      const data = await upstream.json();
      const remaining = Number(upstream.headers.get("x-ratelimit-remaining"));
      return Response.json({
        photos: normalizePhotos(data),
        totalHits: Number((data as { totalHits?: unknown }).totalHits) || 0,
        remaining: Number.isFinite(remaining) && upstream.headers.has("x-ratelimit-remaining") ? remaining : null,
      });
    } catch {
      return fail(502, "UPSTREAM_UNREACHABLE", "Tidak dapat menghubungi Pixabay dari server.");
    }
  }

  if (body.action === "image") {
    const url = cleanImageUrl(body.url);
    if (!url) return fail(400, "BAD_URL", "Alamat gambar Pixabay tidak valid.");
    try {
      // Fetch selected bytes through the server; never leave a permanent Pixabay CDN hotlink in the composition.
      const upstream = await fetch(url, { redirect: "error", cache: "no-store" });
      if (!upstream.ok) return fail(502, "IMAGE_FAILED", "Gambar Pixabay gagal diambil.");
      const contentType = upstream.headers.get("content-type") ?? "";
      if (!/^image\/(jpeg|png|webp)/i.test(contentType)) return fail(502, "IMAGE_FAILED", "Sumber tidak mengembalikan berkas gambar.");
      const bytes = await upstream.arrayBuffer();
      if (bytes.byteLength < 500 || bytes.byteLength > MAX_IMAGE_BYTES) return fail(413, "IMAGE_SIZE", "Ukuran gambar tidak sesuai batas aman.");
      return new Response(bytes, { headers: { "content-type": contentType.split(";")[0], "cache-control": "private, no-store" } });
    } catch {
      return fail(502, "UPSTREAM_UNREACHABLE", "Tidak dapat mengunduh gambar Pixabay.");
    }
  }

  return fail(400, "UNKNOWN_ACTION", "Aksi Pixabay tidak dikenal.");
}

export const __test__ = { cleanImageUrl, normalizePhotos };
