import { describe, expect, it } from "vitest";
import { contrast, SAFE } from "./layout";
import { hasOverlay, MAX_OVERLAY_FRAMES, overlayBand, overlayColors, overlayKeyword, OVERLAY_HEIGHT, SCRIM } from "./overlay";
import { HEIGHT, PALETTES } from "./script";
import { detectVisual, resolveVisual } from "./visuals";

describe("overlayBand", () => {
  it("keeps both positions inside the safe areas", () => {
    for (const pos of ["top", "lower"] as const) {
      const b = overlayBand(pos);
      expect(b.top).toBeGreaterThanOrEqual(SAFE.top);
      expect(b.top + b.height).toBeLessThanOrEqual(HEIGHT - SAFE.bottom);
      expect(b.height).toBe(OVERLAY_HEIGHT);
    }
  });

  it("puts the top band at the top and the lower band above the captions without touching them", () => {
    const top = overlayBand("top"), lower = overlayBand("lower");
    expect(top.top).toBe(SAFE.top);
    expect(lower.top).toBeGreaterThan(top.top + top.height);
    // The caption block starts at 1920 - 380 - 24 - 170 = 1346; the band ends above it with a gap.
    expect(lower.top + lower.height).toBeLessThan(HEIGHT - SAFE.bottom - 24 - 170);
  });

  it("keeps an animation short, like graphic cutaways", () => {
    expect(MAX_OVERLAY_FRAMES).toBe(120);
  });
});

describe("overlayColors", () => {
  it.each(Object.entries(PALETTES))("%s: text and accent are readable over the dark veil", (_, p) => {
    const c = overlayColors(p);
    expect(contrast(c.text, SCRIM)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.accent, SCRIM)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a bright accent and replaces a dark one by the palette's light tone", () => {
    expect(overlayColors(PALETTES.violet).accent).toBe(PALETTES.violet.accent);
    expect(overlayColors(PALETTES.pearl).accent).toBe(PALETTES.pearl.bg1);
    expect(overlayColors(PALETTES.ivory).accent).toBe(PALETTES.ivory.bg1);
  });
});

describe("overlayKeyword", () => {
  it("returns the first emphasised word as written, in capitals", () => {
    expect(overlayKeyword("Uang itu penting sekali.", { emphasis: ["uang"] })).toBe("UANG");
    expect(overlayKeyword("Semua *Disiplin*, bukan bakat.", { emphasis: ["disiplin"] })).toBe("DISIPLIN");
  });
  it("is null without emphasis or when the word is not in the text", () => {
    expect(overlayKeyword("Tidak ada penekanan.", { emphasis: [] })).toBeNull();
    expect(overlayKeyword("Tidak ada penekanan.", { emphasis: ["lain"] })).toBeNull();
  });
  it("strips punctuation around the word", () => {
    expect(overlayKeyword("Mulailah, sekarang!", { emphasis: ["sekarang"] })).toBe("SEKARANG");
  });
});

describe("hasOverlay", () => {
  it("is true for scenes the visual detector found something in", () => {
    for (const t of ["Ada 73% orang berhenti.", "Pertama, mulai.", "Siapa yang mau?", "Ikuti untuk tips.", "Uang itu penting."]) expect(hasOverlay(detectVisual(t))).toBe(true);
  });
  it("is false for a plain statement and for forced templates without their data", () => {
    expect(hasOverlay(detectVisual("Ya begitulah."))).toBe(false);
    expect(hasOverlay({ template: "number", icon: null, emphasis: [] })).toBe(false);
    expect(hasOverlay({ template: "compare", icon: null, emphasis: [] })).toBe(false);
  });
});

import { beatFrame, MIN_OVERLAY_FRAMES, OVERLAY_LEAD_FRAMES, overlayAnchors, overlayWindows } from "./overlay";
import type { Scene } from "./script";
import { matchBrands } from "./brands";

const sc = (text: string, durationInFrames: number, extra: Partial<Scene> = {}): Scene => ({ text, durationInFrames, cut: "overlay", ...extra });
/** Word start frames spread evenly at `per` frames each, as a transcript would give them. */
const timed = (text: string, per: number, first = 0): number[] => text.split(/\s+/).filter(Boolean).map((_, i) => first + i * per);

describe("overlayAnchors", () => {
  it("anchors on the word the animation is about", () => {
    expect(overlayAnchors("Ada 73% orang berhenti.", detectVisual("Ada 73% orang berhenti."))).toEqual({ start: 1 });
    expect(overlayAnchors("Mari kita ikuti kemajuan ini bersama dan simpan di sini.", detectVisual("Mari kita ikuti kemajuan ini bersama dan simpan di sini.")).start).toBeGreaterThanOrEqual(0);
    expect(overlayAnchors("Uang itu penting sekali.", detectVisual("Uang itu penting sekali."))).toEqual({ start: 0 });
    // "orang" (people) and "uang" (money) tie, and the earlier word wins.
    expect(overlayAnchors("Semua orang butuh uang untuk hidup.", detectVisual("Semua orang butuh uang untuk hidup."))).toEqual({ start: 1 });
    expect(overlayAnchors("Pertama, tentukan target.", detectVisual("Pertama, tentukan target."))).toEqual({ start: 0 });
  });
  it("anchors a call to action on its word and a comparison on bukan / tapi", () => {
    const cta = "Biar tidak ketinggalan, follow untuk tips lainnya!";
    expect(overlayAnchors(cta, detectVisual(cta))).toEqual({ start: 3 });
    const cmp = "Yang penting, bukan motivasi besar, tapi sistem kecil.";
    expect(overlayAnchors(cmp, detectVisual(cmp))).toEqual({ start: 2, second: 5 });
  });
  it("anchors a call to action on its own word even when a name comes later", () => {
    const t = "Jangan lupa follow dan simpan di Instagram ya.";
    expect(overlayAnchors(t, detectVisual(t))).toEqual({ start: 2 });
  });
  it("anchors on a name wherever it is said", () => {
    const t = "Kita upload di YouTube dan TikTok setiap hari.";
    const v = detectVisual(t);
    expect(v.brands?.map(b => b.id)).toEqual(["youtube", "tiktok"]);
    expect(overlayAnchors(t, v)).toEqual({ start: 3 });
  });
});

describe("overlayWindows: the animation waits for its word", () => {
  const text = "Jadi begini ceritanya tadi pagi saya buka YouTube dan menemukan sesuatu.";
  const visuals = [detectVisual(text)];

  it("starts just before the word is spoken, not at the start of the scene", () => {
    // 11 words, 20 frames apart: YouTube is word 7, said at frame 140; the scene lasts 240 frames.
    const scene = sc(text, 240, { wordStarts: timed(text, 20) });
    const [w] = overlayWindows([scene], visuals, 240);
    expect(w.offset).toBe(140 - OVERLAY_LEAD_FRAMES);
    expect(w.from).toBe(136);
    expect(w.length).toBe(240 - 136);
  });

  it("adds the scene's own start on the video's timeline", () => {
    const scenes = [sc("Halo semuanya.", 90, { cut: "video" }), sc(text, 240, { wordStarts: timed(text, 20) })];
    const [w] = overlayWindows(scenes, [detectVisual("Halo semuanya."), visuals[0]], 400);
    expect(w.scene).toBe(1);
    expect(w.from).toBe(90 + 136);
    expect(w.offset).toBe(136);
  });

  it("lasts at most four seconds and never past the end of the video", () => {
    const scene = sc(text, 600, { wordStarts: timed(text, 20) });
    expect(overlayWindows([scene], visuals, 600)[0].length).toBe(120);
    expect(overlayWindows([scene], visuals, 200)[0].length).toBe(200 - 136);
  });

  it("can run on into the next scene when its word is said near the end", () => {
    const late = sc("Sekarang buka YouTube.", 60, { wordStarts: [0, 20, 40] });
    const next = sc("Lalu tekan tombol langganan.", 120, { cut: "video", wordStarts: [0, 30, 60, 90] });
    const [w] = overlayWindows([late, next], [detectVisual(late.text), detectVisual(next.text)], 180);
    expect(w.from).toBe(36);
    expect(w.length).toBe(120); // beyond the first scene's last frame (60)
  });

  it("stops where the next animation starts", () => {
    const a = sc(text, 240, { wordStarts: timed(text, 20) });
    const b = sc("Ada 73% orang berhenti.", 120, { wordStarts: [0, 10, 20, 30] });
    const [first, second] = overlayWindows([a, b], [visuals[0], detectVisual(b.text)], 360);
    expect(first.from + first.length).toBe(second.from);
    expect(first.length).toBeGreaterThanOrEqual(MIN_OVERLAY_FRAMES);
  });

  it("never draws over a scene that takes over the whole picture", () => {
    const a = sc("Sekarang buka YouTube.", 60, { wordStarts: [0, 20, 40] });
    const graphic = sc("Penjelasan panjang.", 120, { cut: "graphic" });
    const [w] = overlayWindows([a, graphic], [detectVisual(a.text), detectVisual(graphic.text)], 180);
    expect(w.from + w.length).toBe(60);
    const clip = overlayWindows([a, { ...graphic, cut: "clip" }], [detectVisual(a.text), detectVisual(graphic.text)], 180)[0];
    expect(clip.from + clip.length).toBe(60);
  });

  it("drops an animation that would be left with almost no time", () => {
    const a = sc("Sekarang buka YouTube.", 60, { wordStarts: [0, 20, 58] });
    const graphic = sc("Penjelasan.", 120, { cut: "graphic" });
    expect(overlayWindows([a, graphic], [detectVisual(a.text), detectVisual(graphic.text)], 180)).toEqual([]);
  });

  it("ignores scenes that are not set to an animation", () => {
    expect(overlayWindows([sc(text, 240, { cut: "video" }), sc(text, 240, { cut: undefined })], [visuals[0], visuals[0]], 480)).toEqual([]);
  });

  it("without transcript timing it follows the even spread captions use", () => {
    const [w] = overlayWindows([sc(text, 240)], visuals, 240);
    expect(w.offset).toBeGreaterThan(80); // YouTube is the 8th of 11 words
    expect(w.offset).toBeLessThan(200);
  });
});

describe("beatFrame", () => {
  it("is when a word is spoken, counted from the start of the animation", () => {
    const scene = sc("satu dua tiga empat", 200, { wordStarts: [10, 50, 90, 130] });
    expect(beatFrame(scene, 2, 86)).toBe(4);
    expect(beatFrame(scene, 0, 86)).toBe(0);
  });
});

describe("popular names", () => {
  const ids = (t: string) => matchBrands(t).map(b => b.id);
  it("recognises the names people say", () => {
    expect(ids("Upload ke YouTube dan TikTok.")).toEqual(["youtube", "tiktok"]);
    expect(ids("Bagikan lewat WhatsApp atau Instagram, bisa juga Telegram.")).toEqual(["whatsapp", "instagram", "telegram"]);
    expect(ids("Cek di IG, FB, dan Twitter.")).toEqual(["instagram", "facebook", "x"]);
    expect(ids("Belanja di Shopee atau Tokopedia.")).toEqual(["marketplace"]);
    expect(ids("Aku dengar podcast di Spotify sambil googling.")).toEqual(["podcast", "spotify", "google"]);
    expect(ids("Naik Gojek, bukan grab.")).toEqual(["ride"]);
    expect(ids("Aku pesan grab ke bandara.")).toEqual(["ride"]);
    expect(ids("Tanya ChatGPT dulu.")).toEqual(["chatai"]);
  });
  it("matches phrases and the word positions", () => {
    expect(matchBrands("Lihat tik tok sebentar")).toEqual([{ id: "tiktok", word: "tik", index: 1 }]);
    expect(matchBrands("masuk FYP hari ini")[0]).toMatchObject({ id: "tiktok", index: 1 });
  });
  it("does not fire on ordinary words that merely contain short names", () => {
    expect(ids("Kita grab attention with a good hook.")).toEqual([]);
    expect(ids("The wallet is warm and fast.")).toEqual([]);
    expect(ids("Ini jawaban yang nyata.")).toEqual([]);
    expect(ids("Mulai hari ini.")).toEqual([]);
  });
  it("is limited to three names, once each, in the order said", () => {
    expect(ids("YouTube, TikTok, Instagram, Facebook dan YouTube lagi.")).toEqual(["youtube", "tiktok", "instagram"]);
  });
});

describe("a popular name wins over the generic icon", () => {
  it("shows the platform, not the video camera, and keeps the name as the emphasised word", () => {
    const v = detectVisual("Konten video terbaik ada di YouTube.");
    expect(v.icon).toBe("youtube");
    expect(v.brands).toEqual([{ id: "youtube", word: "youtube", index: 5 }]);
    expect(v.emphasis).toEqual(["youtube"]);
  });
  it("keeps a call to action and shows the name as well", () => {
    const v = detectVisual("Subscribe ke YouTube kami.");
    expect(v.template).toBe("cta");
    expect(v.brands?.[0].id).toBe("youtube");
  });
  it("is replaced by an icon the creator picks by hand", () => {
    const v = resolveVisual("Upload ke YouTube.", { icon: "money" });
    expect(v.icon).toBe("money");
    expect(v.brands).toBeUndefined();
  });
  it("counts as something to show", () => {
    expect(hasOverlay(detectVisual("Upload ke TikTok."))).toBe(true);
  });
});
