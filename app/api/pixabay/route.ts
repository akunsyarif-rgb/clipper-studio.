import { cleanPixabayImageUrl, normalizePixabayPhotos, normalizePixabayVideos } from "@/lib/pixabay-server";

export const runtime = "nodejs";

const API = "https://pixabay.com/api/";
const VIDEO_API = "https://pixabay.com/api/videos/";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function fail(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) return fail(503, "MISSING_KEY", "PIXABAY_API_KEY belum tersedia pada environment deployment ini.");

  let body: { action?: unknown; query?: unknown; imageType?: unknown; perPage?: unknown; page?: unknown; url?: unknown };
  try { body = await request.json(); } catch { return fail(400, "BAD_REQUEST", "Permintaan tidak valid."); }

  if (body.action === "search") {
    const query = String(body.query ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (query.length < 2) return fail(400, "BAD_QUERY", "Masukkan minimal dua karakter untuk pencarian.");
    const perPage = Math.min(20, Math.max(3, Math.round(Number(body.perPage) || 6)));
    const page = Math.min(5, Math.max(1, Math.round(Number(body.page) || 1)));
    const imageType = ["all", "photo", "illustration", "vector"].includes(String(body.imageType)) ? String(body.imageType) : "all";
    const params = new URLSearchParams({
      key: apiKey, q: query, lang: "en", image_type: imageType, orientation: "vertical",
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
        photos: normalizePixabayPhotos(data),
        totalHits: Number((data as { totalHits?: unknown }).totalHits) || 0,
        remaining: Number.isFinite(remaining) && upstream.headers.has("x-ratelimit-remaining") ? remaining : null,
      });
    } catch {
      return fail(502, "UPSTREAM_UNREACHABLE", "Tidak dapat menghubungi Pixabay dari server.");
    }
  }

  if (body.action === "video-search") {
    const query = String(body.query ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (query.length < 2) return fail(400, "BAD_QUERY", "Masukkan minimal dua karakter untuk pencarian video.");
    const perPage = Math.min(20, Math.max(3, Math.round(Number(body.perPage) || 8)));
    const page = Math.min(5, Math.max(1, Math.round(Number(body.page) || 1)));
    const params = new URLSearchParams({ key: apiKey, q: query, lang: "en", video_type: "all", safesearch: "true", order: "popular", per_page: String(perPage), page: String(page) });
    try {
      const upstream = await fetch(`${VIDEO_API}?${params}`, { next: { revalidate: 86_400 } });
      if (upstream.status === 429) return fail(429, "RATE_LIMIT", "Batas permintaan Pixabay tercapai. Tunggu sebelum mencoba lagi.");
      if (!upstream.ok) return fail(502, "UPSTREAM_ERROR", "Pencarian video Pixabay gagal.");
      const data = await upstream.json();
      return Response.json({ videos: normalizePixabayVideos(data), totalHits: Number((data as { totalHits?: unknown }).totalHits) || 0, remaining: Number(upstream.headers.get("x-ratelimit-remaining")) || null });
    } catch { return fail(502, "UPSTREAM_UNREACHABLE", "Tidak dapat menghubungi Pixabay dari server."); }
  }

  if (body.action === "image") {
    const url = cleanPixabayImageUrl(body.url);
    if (!url) return fail(400, "BAD_URL", "Alamat gambar Pixabay tidak valid.");
    try {
      // Fetch selected bytes through the server; never leave a permanent Pixabay CDN hotlink in the composition.
      let upstream = await fetch(url, { redirect: "manual", cache: "no-store" });
      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("location");
        let redirected: string | null = null;
        try { redirected = location ? cleanPixabayImageUrl(new URL(location, url).toString()) : null; } catch { redirected = null; }
        if (!redirected) return fail(502, "IMAGE_REDIRECT", "Pixabay mengarahkan gambar ke alamat yang tidak diizinkan.");
        upstream = await fetch(redirected, { redirect: "error", cache: "no-store" });
      }
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

