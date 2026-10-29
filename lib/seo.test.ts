import { describe, expect, it } from "vitest";
import { GeminiError } from "./gemini";
import { normalizeTag, parseSeo, SEO_FIELD_KEYS, SEO_PLATFORMS, seoProblem, seoPrompt, seoToJson, seoToText, TRANSCRIPT_LIMIT, type SeoInput } from "./seo";

const gem = (o: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
const lorem = (n: number) => Array.from({ length: n }, (_, i) => `kata${i}`).join(" ");
const base: SeoInput = { topic: "Disiplin pagi", transcript: "Jangan tunggu semangat datang. Mulailah, meski langkahmu kecil. Disiplin membuatmu tetap bergerak.", platform: "tiktok", audience: "Pekerja muda, Jakarta", trends: "Ramadan" };

describe("seoPrompt", () => {
  it("carries every input and the platform's own rules", () => {
    const p = seoPrompt(base);
    for (const s of ["Disiplin pagi", "Pekerja muda, Jakarta", "Ramadan", "Jangan tunggu semangat", "TikTok", "100-150 kata", "Jangan pakai #fyp"]) expect(p, s).toContain(s);
    for (const k of SEO_FIELD_KEYS("tiktok")) expect(p, k).toContain(`"${k}"`);
    expect(p).toContain("seoReadinessScore");
    expect(p).toContain("quickFix");
  });
  it("has different rules and keys per platform", () => {
    expect(seoPrompt({ ...base, platform: "youtube" })).toMatch(/kurang dari 50 karakter/);
    expect(seoPrompt({ ...base, platform: "instagram" })).toMatch(/Simpan \(Save\) dan Bagikan \(Share\)/);
    expect(seoPrompt({ ...base, platform: "x" })).toMatch(/kutipan \(quote\)/);
    expect(seoPrompt({ ...base, platform: "linkedin" })).toMatch(/Masalah, Wawasan, Langkah/);
    expect(new Set(SEO_PLATFORMS.map(p => SEO_FIELD_KEYS(p.id).join(","))).size).toBe(5);
  });
  it("does not let the model pretend to know live trends or invent facts, and says so", () => {
    const p = seoPrompt(base);
    expect(p).toMatch(/tidak punya data tren waktu nyata/);
    expect(p).toMatch(/Jangan mengarang angka/);
    expect(seoPrompt({ ...base, trends: "" })).toContain("(tidak diisi)");
  });
  it("limits what is sent and survives a quote-heavy script", () => {
    const p = seoPrompt({ ...base, transcript: '"""' + "x".repeat(TRANSCRIPT_LIMIT * 2) });
    expect(p.length).toBeLessThan(TRANSCRIPT_LIMIT + 4000);
    expect(p).not.toContain('"""""');
  });
});

describe("seoProblem", () => {
  it("needs a script and a known platform", () => {
    expect(seoProblem({ transcript: "   ", platform: "tiktok" })).toMatch(/naskah/i);
    expect(seoProblem({ transcript: "Satu kalimat yang cukup panjang.", platform: "tiktok" })).toBeNull();
    expect(seoProblem({ transcript: "Satu kalimat yang cukup panjang.", platform: "myspace" as never })).toMatch(/platform/i);
  });
});

describe("normalizeTag", () => {
  it("cleans tags and drops noise tags", () => {
    expect(normalizeTag("#Disiplin Pagi!")).toBe("#DisiplinPagi");
    expect(normalizeTag("produktif")).toBe("#produktif");
    expect(normalizeTag("##")).toBeNull();
    expect(normalizeTag("#123")).toBeNull();
    for (const t of ["#FYP", "#fyp", "#ForYou", "#foryoupage"]) expect(normalizeTag(t), t).toBeNull();
  });
});

describe("parseSeo: TikTok", () => {
  const good = { hookText: "Malas bangun pagi? Coba ini", voiceoverHook: "Kalau kamu susah bangun pagi, dengarkan ini.", caption: lorem(120), hashtags: ["#disiplin", "#produktif", "#bangunpagi", "#jakarta", "#motivasi"], thumbnailText: "BANGUN PAGI", searchTopics: ["cara bangun pagi", "disiplin pagi", "kebiasaan produktif"], seoReadinessScore: 88, quickFix: "Sebut kata kunci di 3 detik pertama." };
  it("accepts a good answer unchanged and keeps the model's score", () => {
    const r = parseSeo(gem(good), "tiktok");
    expect(r.checks.every(c => c.ok)).toBe(true);
    expect(r.score).toBe(88);
    expect(r.quickFix).toBe("Sebut kata kunci di 3 detik pertama.");
    expect(r.cards.map(c => c.key)).toEqual(SEO_FIELD_KEYS("tiktok"));
  });
  it("removes #fyp and extra hashtags, normalises the rest, and reports what it did", () => {
    const r = parseSeo(gem({ ...good, hashtags: ["#FYP", "Disiplin Pagi", "#disiplinpagi", "#a1", "#b2", "#c3", "#d4", "#e5"] }), "tiktok");
    const tags = r.cards.find(c => c.key === "hashtags")!.value as string[];
    expect(tags).toEqual(["#DisiplinPagi", "#a1", "#b2", "#c3", "#d4"]);
    expect(tags.length).toBeLessThanOrEqual(5);
    expect(r.checks.find(c => /kelebihan dibuang/.test(c.message))).toBeTruthy();
  });
  it("lowers the score for every failed rule and never cuts text silently", () => {
    const r = parseSeo(gem({ ...good, hookText: "x".repeat(80), caption: lorem(30), seoReadinessScore: 95 }), "tiktok");
    expect(r.checks.filter(c => !c.ok)).toHaveLength(2);
    expect(r.modelScore).toBe(95);
    expect(r.score).toBe(100 - 2 * 8);
    expect((r.cards.find(c => c.key === "hookText")!.value as string).length).toBe(80);
  });
  it("clamps odd scores and falls back to a check as the quick fix", () => {
    expect(parseSeo(gem({ ...good, seoReadinessScore: 250 }), "tiktok").modelScore).toBe(100);
    expect(parseSeo(gem({ ...good, seoReadinessScore: -3 }), "tiktok").modelScore).toBe(1);
    expect(parseSeo(gem({ ...good, seoReadinessScore: "tinggi" }), "tiktok").modelScore).toBe(60);
    const r = parseSeo(gem({ ...good, quickFix: "", caption: lorem(10) }), "tiktok");
    expect(r.quickFix).toMatch(/Caption/);
  });
  it("refuses an answer with nothing usable", () => {
    expect(() => parseSeo(gem({ seoReadinessScore: 50 }), "tiktok")).toThrow(GeminiError);
    expect(() => parseSeo(gem([1, 2]), "tiktok")).toThrow(GeminiError);
  });
});

describe("parseSeo: other platforms", () => {
  it("YouTube: the title must be under 50 characters", () => {
    const ok = { title: "Cara bangun pagi tanpa alarm", description: lorem(120), thumbnailText: "BANGUN PAGI", pinComment: "Kamu bangun jam berapa?", seoReadinessScore: 80, quickFix: "ok" };
    expect(parseSeo(gem(ok), "youtube").checks.every(c => c.ok)).toBe(true);
    const long = parseSeo(gem({ ...ok, title: "J".repeat(50) }), "youtube");
    expect(long.checks.find(c => /Judul/.test(c.message) && !c.ok)?.message).toMatch(/50 karakter/);
    expect(parseSeo(gem({ ...ok, title: "J".repeat(49) }), "youtube").checks.every(c => c.ok)).toBe(true);
  });
  it("Instagram: exactly three topics, a first line that is not cut, and a save/share call to action", () => {
    const ok = { hookText: "Bangun pagi", audioMatch: "Bangun pagi itu bisa dilatih", caption: `Rahasia bangun pagi tanpa tersiksa\nBaca sampai habis.\n- Tidur cukup\n- Taruh alarm jauh\nSimpan dan bagikan ke temanmu. ${lorem(60)}`, topics: ["Produktivitas", "Kebiasaan", "Pagi hari"], altText: "Seseorang meregangkan badan di pagi hari", hashtags: ["#produktif", "#kebiasaan", "#pagi"], seoReadinessScore: 82, quickFix: "-" };
    expect(parseSeo(gem(ok), "instagram").checks.every(c => c.ok)).toBe(true);
    const bad = parseSeo(gem({ ...ok, topics: ["a", "b"], caption: `${"L".repeat(140)}\n${lorem(70)}` }), "instagram");
    const failed = bad.checks.filter(c => !c.ok).map(c => c.message).join(" | ");
    expect(failed).toMatch(/Add Topics/);
    expect(failed).toMatch(/baris pertama/);
    expect(failed).toMatch(/Simpan dan Bagikan/);
  });
  it("X: at most two tags, and a tweet within 280 characters", () => {
    const r = parseSeo(gem({ hookTweet: "Disiplin bukan soal semangat.", altText: "Ilustrasi", keywords: ["#disiplin", "#produktif", "#fyp"], seoReadinessScore: 70, quickFix: "-" }), "x");
    expect(r.cards.find(c => c.key === "keywords")!.value).toEqual(["#disiplin", "#produktif"]);
    expect(parseSeo(gem({ hookTweet: "T".repeat(300), altText: "a", keywords: ["#a1"], seoReadinessScore: 70, quickFix: "-" }), "x").checks.some(c => !c.ok && /300\/280|300 karakter/.test(c.message))).toBe(true);
  });
  it("LinkedIn: a two-line hook and exactly three industry tags", () => {
    const ok = { hook: "Masalah: tim kehilangan fokus.\nPadahal solusinya sederhana.", body: lorem(100), hashtags: ["#produktivitas", "#kepemimpinan", "#kerja"], seoReadinessScore: 75, quickFix: "-" };
    expect(parseSeo(gem(ok), "linkedin").checks.every(c => c.ok)).toBe(true);
    expect(parseSeo(gem({ ...ok, hook: "a\nb\nc", hashtags: ["#a1"] }), "linkedin").checks.filter(c => !c.ok).length).toBe(2);
  });
});

describe("copy formats", () => {
  const r = parseSeo(gem({ hookTweet: "Disiplin bukan soal semangat.", altText: "Ilustrasi", keywords: ["#disiplin"], seoReadinessScore: 70, quickFix: "Tambah pertanyaan." }), "x");
  it("makes plain text and JSON with one entry per element", () => {
    const t = seoToText(r);
    expect(t).toContain("Hook tweet\nDisiplin bukan soal semangat.");
    expect(t).toContain("Skor kesiapan SEO: 70/100");
    const j = JSON.parse(seoToJson(r));
    expect(j).toMatchObject({ platform: "x", hookTweet: "Disiplin bukan soal semangat.", keywords: ["#disiplin"], seoReadinessScore: 70, quickFix: "Tambah pertanyaan." });
  });
});
