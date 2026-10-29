import { describe, expect, it } from "vitest";
import { clipId, filterEntries, logDownload, logRender, logSeo, logTrend, MAX_ENTRIES, removeEntry, scriptId, toCsv, cleanList, type HistoryEntry } from "./history";
import type { SeoResult } from "./seo";

const seo = (platform: SeoResult["platform"], score = 88): SeoResult => ({ platform, score, modelScore: score, quickFix: "x", checks: [], cards: [
  { key: "hookText", label: "Hook", kind: "text", value: "Malas bangun pagi?" }, { key: "caption", label: "Caption", kind: "text", value: 'Caption "dengan kutip"\nbaris dua' }, { key: "hashtags", label: "Tag", kind: "hashtags", value: ["#disiplin", "#pagi"] }] });
const b = (script: string, now: number, title = "Judul") => ({ id: scriptId(script), kind: "motion" as const, title, script, now });
const v = { name: "a-1080x1920.mp4", size: 1000, label: "1080×1920 · 15 dtk" };

describe("history", () => {
  it("gives the same id to the same words however they are spaced or marked", () => {
    expect(scriptId("Halo *dunia*\n\nApa kabar [jeda 1s]")).toBe(scriptId("halo dunia apa kabar"));
    expect(scriptId("satu dua")).not.toBe(scriptId("satu tiga"));
    expect(clipId("a.mp4", 1, 5)).not.toBe(clipId("a.mp4", 1, 6));
  });
  it("a render creates the entry; the same file rendered again is not duplicated", () => {
    let l = logRender([], b("Satu dua", 1), v);
    l = logRender(l, b("Satu dua", 2), v);
    expect(l).toHaveLength(1); expect(l[0].videos).toHaveLength(1); expect(l[0].videos[0].saved).toBe(false); expect(l[0].createdAt).toBe(1); expect(l[0].updatedAt).toBe(2);
  });
  it("a download marks the file saved and keeps it saved if the same file is rendered again", () => {
    let l = logRender([], b("Satu dua", 1), v);
    l = logDownload(l, b("Satu dua", 2), v);
    expect(l[0].videos[0].saved).toBe(true);
    l = logRender(l, b("Satu dua", 3), v);
    expect(l[0].videos[0].saved).toBe(true);
    const fresh = logDownload([], b("Lain", 4), v);
    expect(fresh[0].videos[0].saved).toBe(true);
  });
  it("keeps SEO packs per platform for the same video, and the trend inputs", () => {
    let l = logSeo([], b("Satu dua", 1), "tiktok", seo("tiktok"));
    l = logSeo(l, b("Satu dua", 2), "youtube", seo("youtube", 70));
    l = logSeo(l, b("Satu dua", 3), "tiktok", seo("tiktok", 95));
    l = logTrend(l, b("Satu dua", 4), { platform: "tiktok", niche: "n", audience: "", trend: "t" });
    expect(l).toHaveLength(1);
    expect(Object.keys(l[0].seo).sort()).toEqual(["tiktok", "youtube"]);
    expect(l[0].seo.tiktok?.result.score).toBe(95);
    expect(l[0].trend?.niche).toBe("n");
  });
  it("different videos stay separate, newest first, and the list is capped", () => {
    let l: HistoryEntry[] = [];
    for (let i = 0; i < MAX_ENTRIES + 10; i++) l = logRender(l, b(`naskah ${i} unik`, i + 1), { ...v, name: `f${i}.mp4` });
    expect(l).toHaveLength(MAX_ENTRIES);
    expect(l[0].updatedAt).toBeGreaterThan(l[1].updatedAt);
  });
  it("filters by text (title, script, SEO text) and by status", () => {
    let l = logRender([], b("Bangun pagi hari", 1, "Pagi"), v);
    l = logDownload(l, b("Bangun pagi hari", 2, "Pagi"), v);
    l = logSeo(l, b("Resep kopi", 3, "Kopi"), "tiktok", seo("tiktok"));
    l = logRender(l, b("Belum diunduh", 4, "Draf"), { ...v, name: "d.mp4" });
    const f = (text: string, status: "all" | "saved" | "unsaved" | "no-seo" = "all") => filterEntries(l, { text, status }).map(e => e.title).sort();
    expect(f("")).toEqual(["Draf", "Kopi", "Pagi"]);
    expect(f("kopi")).toEqual(["Kopi"]);
    expect(f("malas bangun")).toEqual(["Kopi"]);
    expect(f("", "saved")).toEqual(["Pagi"]);
    expect(f("", "unsaved")).toEqual(["Draf"]);
    expect(f("", "no-seo")).toEqual(["Draf", "Pagi"]);
  });
  it("exports a CSV with one row per pack, quotes escaped and line breaks kept on one line", () => {
    let l = logSeo([], b("Satu dua", 1), "tiktok", seo("tiktok"));
    l = logDownload(l, b("Satu dua", 2), v);
    const rows = toCsv(l).split("\r\n");
    expect(rows[0]).toContain("platform");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"Caption ""dengan kutip"" ⏎ baris dua"');
    expect(rows[1]).toContain('"ya"');
    expect(rows[1]).toContain('"#disiplin #pagi"');
    expect(toCsv(logRender([], b("Tanpa seo", 1), v)).split("\r\n")).toHaveLength(2);
  });
  it("removes an entry and drops damaged entries when loading", () => {
    const l = logRender([], b("Satu dua", 1), v);
    expect(removeEntry(l, l[0].id)).toEqual([]);
    expect(cleanList([l[0], { id: 1 }, null, "x"])).toHaveLength(1);
    expect(cleanList("nope")).toEqual([]);
  });
});
