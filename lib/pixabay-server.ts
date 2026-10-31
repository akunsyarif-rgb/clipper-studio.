const IMAGE_HOST = "cdn.pixabay.com";
const PIXABAY_HOST = "pixabay.com";

export function cleanPixabayImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const cdnPhoto = url.hostname === IMAGE_HOST && url.pathname.startsWith("/photo/");
    const pixabayDownload = url.hostname === PIXABAY_HOST && url.pathname.startsWith("/get/");
    return cdnPhoto || pixabayDownload ? url.toString() : null;
  } catch { return null; }
}

type RawHit = { id?: unknown; tags?: unknown; pageURL?: unknown; user?: unknown; previewURL?: unknown; webformatURL?: unknown; largeImageURL?: unknown };
function safePageUrl(raw: unknown): string {
  try {
    const url = new URL(String(raw));
    return url.protocol === "https:" && url.hostname === "pixabay.com" ? url.toString() : "https://pixabay.com/";
  } catch { return "https://pixabay.com/"; }
}

export function normalizePixabayPhotos(payload: unknown) {
  const hits = (payload as { hits?: unknown } | null)?.hits;
  if (!Array.isArray(hits)) return [];
  return (hits as RawHit[]).flatMap(hit => {
    if (typeof hit?.id !== "number") return [];
    const thumb = cleanPixabayImageUrl(hit.previewURL);
    const image = cleanPixabayImageUrl(hit.largeImageURL) ?? cleanPixabayImageUrl(hit.webformatURL);
    if (!thumb || !image) return [];
    return [{
      id: hit.id,
      alt: String(hit.tags ?? "").replace(/\s+/g, " ").slice(0, 120),
      photographer: String(hit.user ?? "Kontributor Pixabay").slice(0, 80),
      pageUrl: safePageUrl(hit.pageURL),
      thumb,
      image,
    }];
  });
}

const VIDEO_HOST = "cdn.pixabay.com";
export function cleanPixabayVideoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === VIDEO_HOST && !url.username && !url.password && !url.port && url.pathname.startsWith("/video/") && url.pathname.endsWith(".mp4") ? url.toString() : null;
  } catch { return null; }
}
type RawVideo = { id?: unknown; tags?: unknown; pageURL?: unknown; user?: unknown; duration?: unknown; videos?: { medium?: { url?: unknown; width?: unknown; height?: unknown; size?: unknown; thumbnail?: unknown }; small?: { url?: unknown; width?: unknown; height?: unknown; size?: unknown; thumbnail?: unknown } } };
export function normalizePixabayVideos(payload: unknown) {
  const hits = (payload as { hits?: unknown } | null)?.hits;
  if (!Array.isArray(hits)) return [];
  return (hits as RawVideo[]).flatMap(hit => {
    if (typeof hit?.id !== "number") return [];
    const rendition = hit.videos?.medium?.url ? hit.videos.medium : hit.videos?.small;
    const url = cleanPixabayVideoUrl(rendition?.url);
    if (!url) return [];
    let thumbnail = "";
    try { const thumb = new URL(String(rendition?.thumbnail ?? "")); if (thumb.protocol === "https:" && thumb.hostname === VIDEO_HOST && thumb.pathname.startsWith("/video/")) thumbnail = thumb.toString(); } catch { /* invalid thumbnail */ }
    return [{ id: hit.id, alt: String(hit.tags ?? "").replace(/\s+/g, " ").slice(0, 120), photographer: String(hit.user ?? "Kontributor Pixabay").slice(0, 80), pageUrl: safePageUrl(hit.pageURL), url, thumbnail, duration: Math.max(0, Number(hit.duration) || 0), width: Number(rendition?.width) || 0, height: Number(rendition?.height) || 0, size: Number(rendition?.size) || 0 }];
  });
}
