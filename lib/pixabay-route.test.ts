import { describe, expect, it } from "vitest";
import { __test__ } from "../app/api/pixabay/route";

describe("Pixabay response validation", () => {
  it("accepts only HTTPS CDN image URLs", () => {
    expect(__test__.cleanImageUrl("https://cdn.pixabay.com/photo/2020/1/a.jpg")).toBe("https://cdn.pixabay.com/photo/2020/1/a.jpg");
    expect(__test__.cleanImageUrl("https://pixabay.com/get/abc_1280.jpg")).toBe("https://pixabay.com/get/abc_1280.jpg");
    for (const url of ["http://cdn.pixabay.com/photo/a.jpg", "https://evil.test/photo/a.jpg", "https://cdn.pixabay.com.evil.test/photo/a.jpg", "https://cdn.pixabay.com/video/a.jpg", "https://pixabay.com/evil/a.jpg", "https://u:p@cdn.pixabay.com/photo/a.jpg"]) {
      expect(__test__.cleanImageUrl(url)).toBeNull();
    }
  });

  it("normalizes valid results and drops unsafe URLs", () => {
    const photos = __test__.normalizePhotos({ hits: [
      { id: 12, tags: "green forest", user: "author", pageURL: "https://pixabay.com/photos/forest-12/", previewURL: "https://cdn.pixabay.com/photo/preview.jpg", largeImageURL: "https://pixabay.com/get/large_1280.jpg" },
      { id: 13, previewURL: "https://evil.test/a.jpg", largeImageURL: "https://evil.test/b.jpg" },
      { id: "bad", previewURL: "https://cdn.pixabay.com/photo/a.jpg", largeImageURL: "https://cdn.pixabay.com/photo/b.jpg" },
    ] });
    expect(photos).toEqual([{
      id: 12, alt: "green forest", photographer: "author", pageUrl: "https://pixabay.com/photos/forest-12/",
      thumb: "https://cdn.pixabay.com/photo/preview.jpg", image: "https://pixabay.com/get/large_1280.jpg",
    }]);
  });

  it("handles malformed payloads", () => {
    expect(__test__.normalizePhotos(null)).toEqual([]);
    expect(__test__.normalizePhotos({ hits: "bad" })).toEqual([]);
  });
});
