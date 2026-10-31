// Pixabay stock-photo search. The API key is read only by this server route; it never reaches the browser.
export type PixabayImageType = "all" | "photo" | "illustration" | "vector";

export type PixabayPhoto = {
  id: number;
  alt: string;
  photographer: string;
  pageUrl: string;
  thumb: string;
  image: string;
};

export class PixabayError extends Error {
  constructor(readonly kind: "missing-key" | "rate-limit" | "network" | "server", message: string) {
    super(message);
    this.name = "PixabayError";
  }
}

async function request(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch("/api/pixabay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new PixabayError("network", "Tidak bisa terhubung ke pencarian Pixabay. Periksa koneksi.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    const code = payload?.error?.code;
    const message = payload?.error?.message || "Pencarian Pixabay gagal.";
    if (code === "MISSING_KEY") throw new PixabayError("missing-key", message);
    if (code === "RATE_LIMIT" || response.status === 429) throw new PixabayError("rate-limit", message);
    throw new PixabayError("server", message);
  }
  return response;
}

export async function searchPixabayPhotos(query: string, options: { perPage?: number; page?: number; imageType?: PixabayImageType; signal?: AbortSignal } = {}) {
  const response = await request({ action: "search", query, imageType: options.imageType ?? "all", perPage: options.perPage ?? 6, page: options.page ?? 1 }, options.signal);
  const body = await response.json() as { photos?: PixabayPhoto[]; totalHits?: number; remaining?: number | null };
  return { photos: Array.isArray(body.photos) ? body.photos : [], totalHits: body.totalHits ?? 0, remaining: body.remaining ?? null };
}

export async function downloadPixabayPhoto(photo: PixabayPhoto, signal?: AbortSignal): Promise<File> {
  const response = await request({ action: "image", url: photo.image }, signal);
  const blob = await response.blob();
  if (blob.size < 500 || !blob.type.startsWith("image/")) throw new PixabayError("server", "Gambar Pixabay yang diterima rusak.");
  return new File([blob], `pixabay-${photo.id}.jpg`, { type: blob.type });
}

export const pixabayCredit = (photo: Pick<PixabayPhoto, "photographer" | "pageUrl">) => ({
  text: `Gambar: ${photo.photographer} di Pixabay`,
  href: photo.pageUrl || "https://pixabay.com/",
});


export type PixabayVideo = { id: number; tags: string; photographer: string; pageUrl: string; duration: number; url: string; thumbnail: string; width: number; height: number; size: number };

export async function searchPixabayVideos(query: string, options: { perPage?: number; page?: number; signal?: AbortSignal } = {}) {
  const response = await request({ action: "video-search", query, perPage: options.perPage ?? 8, page: options.page ?? 1 }, options.signal);
  const body = await response.json() as { videos?: PixabayVideo[]; totalHits?: number; remaining?: number | null };
  return { videos: Array.isArray(body.videos) ? body.videos : [], totalHits: body.totalHits ?? 0, remaining: body.remaining ?? null };
}

export const pixabayVideoCredit = (video: Pick<PixabayVideo, "photographer" | "pageUrl">) => ({ text: `Video: ${video.photographer} di Pixabay`, href: video.pageUrl || "https://pixabay.com/" });
