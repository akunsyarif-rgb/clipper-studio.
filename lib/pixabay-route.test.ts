import { describe, expect, it } from "vitest";
import { cleanPixabayImageUrl, cleanPixabayVideoUrl, normalizePixabayPhotos, normalizePixabayVideos } from "./pixabay-server";

describe("Pixabay response validation", () => {
  it("accepts only HTTPS CDN image URLs", () => {
    expect(cleanPixabayImageUrl("https://cdn.pixabay.com/photo/2020/1/a.jpg")).toBe("https://cdn.pixabay.com/photo/2020/1/a.jpg");
    expect(cleanPixabayImageUrl("https://pixabay.com/get/abc_1280.jpg")).toBe("https://pixabay.com/get/abc_1280.jpg");
    for (const url of ["http://cdn.pixabay.com/photo/a.jpg", "https://evil.test/photo/a.jpg", "https://cdn.pixabay.com.evil.test/photo/a.jpg", "https://cdn.pixabay.com/video/a.jpg", "https://pixabay.com/evil/a.jpg", "https://u:p@cdn.pixabay.com/photo/a.jpg"]) {
      expect(cleanPixabayImageUrl(url)).toBeNull();
    }
  });

  it("normalizes valid results and drops unsafe URLs", () => {
    const photos = normalizePixabayPhotos({ hits: [
      { id: 12, tags: "green forest", user: "author", pageURL: "https://pixabay.com/photos/forest-12/", previewURL: "https://cdn.pixabay.com/photo/preview.jpg", largeImageURL: "https://pixabay.com/get/large_1280.jpg" },
      { id: 13, previewURL: "https://evil.test/a.jpg", largeImageURL: "https://evil.test/b.jpg" },
      { id: "bad", previewURL: "https://cdn.pixabay.com/photo/a.jpg", largeImageURL: "https://cdn.pixabay.com/photo/b.jpg" },
    ] });
    expect(photos).toEqual([{
      id: 12, alt: "green forest", photographer: "author", pageUrl: "https://pixabay.com/photos/forest-12/",
      thumb: "https://cdn.pixabay.com/photo/preview.jpg", image: "https://pixabay.com/get/large_1280.jpg",
    }]);
  });

  it("normalizes safe Pixabay video renditions and rejects untrusted hosts", () => {
    expect(cleanPixabayVideoUrl("https://cdn.pixabay.com/video/2024/01/01/a_medium.mp4")).toBe("https://cdn.pixabay.com/video/2024/01/01/a_medium.mp4");
    expect(cleanPixabayVideoUrl("https://cdn.pixabay.com.evil.test/video/a.mp4")).toBeNull();
    expect(normalizePixabayVideos({ hits: [
      { id: 42, tags: "ocean waves", user: "creator", pageURL: "https://pixabay.com/videos/id-42/", duration: 12, videos: { medium: { url: "https://cdn.pixabay.com/video/2024/01/01/a_medium.mp4", thumbnail: "https://cdn.pixabay.com/video/2024/01/01/a_medium.jpg", width: 1280, height: 720, size: 1000 } } },
      { id: 43, videos: { medium: { url: "https://evil.test/a.mp4", thumbnail: "https://evil.test/a.jpg" } } },
    ] })).toEqual([{ id: 42, alt: "ocean waves", photographer: "creator", pageUrl: "https://pixabay.com/videos/id-42/", url: "https://cdn.pixabay.com/video/2024/01/01/a_medium.mp4", thumbnail: "https://cdn.pixabay.com/video/2024/01/01/a_medium.jpg", duration: 12, width: 1280, height: 720, size: 1000 }]);
  });

  it("handles malformed payloads", () => {
    expect(normalizePixabayPhotos(null)).toEqual([]);
    expect(normalizePixabayPhotos({ hits: "bad" })).toEqual([]);
  });
});
