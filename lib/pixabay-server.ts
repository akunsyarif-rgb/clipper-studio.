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
