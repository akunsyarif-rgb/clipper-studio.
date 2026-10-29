import { describe, expect, it } from "vitest";
import { logDownload, logRender, logSeo, scriptId, type HistoryEntry } from "./history";
import { mergeEntry, planSync, type RemoteRow } from "./history-sync";
import type { SeoResult } from "./seo";

const seo = (platform: SeoResult["platform"], score: number): SeoResult => ({ platform, score, modelScore: score, quickFix: "", checks: [], cards: [] });
const b = (script: string, now: number, title = "T") => ({ id: scriptId(script), kind: "motion" as const, title, script, now });
const v = (name: string) => ({ name, size: 10, label: "x" });
const row = (e: HistoryEntry): RemoteRow => ({ id: e.id, data: e, deleted: false, updated_ms: e.updatedAt });

describe("history sync", () => {
  it("merges two devices that changed the same video: every SEO platform and file line is kept", () => {
    const phone = logSeo(logRender([], b("naskah satu dua", 10, "Judul HP"), v("a.mp4")), b("naskah satu dua", 11, "Judul HP"), "tiktok", seo("tiktok", 70))[0];
    let tablet = logSeo([], b("naskah satu dua", 20, "Judul tablet"), "youtube", seo("youtube", 80));
    tablet = logDownload(tablet, b("naskah satu dua", 21, "Judul tablet"), v("a.mp4"));
    const m = mergeEntry(phone, tablet[0]);
    expect(Object.keys(m.seo).sort()).toEqual(["tiktok", "youtube"]);
    expect(m.title).toBe("Judul tablet");
    expect(m.videos).toHaveLength(1); expect(m.videos[0].saved).toBe(true);
    expect(m.createdAt).toBe(10); expect(m.updatedAt).toBe(21);
  });
  it("the newer SEO pack wins for the same platform", () => {
    const x = logSeo([], b("s", 1), "tiktok", seo("tiktok", 50))[0], y = logSeo([], b("s", 5), "tiktok", seo("tiktok", 90))[0];
    expect(mergeEntry(x, y).seo.tiktok?.result.score).toBe(90);
    expect(mergeEntry(y, x).seo.tiktok?.result.score).toBe(90);
  });
  it("first sync pulls what the server has and pushes what only this device has", () => {
    const mine = logRender([], b("punya saya", 5), v("m.mp4"));
    const theirs = logRender([], b("punya server", 7), v("s.mp4"))[0];
    const p = planSync(mine, {}, [row(theirs)]);
    expect(p.entries.map(e => e.id).sort()).toEqual([mine[0].id, theirs.id].sort());
    expect(p.push.map(r => r.id)).toEqual([mine[0].id]);
    expect(p.changedLocal).toBe(true);
  });
  it("nothing to do when both sides already agree", () => {
    const e = logRender([], b("sama", 5), v("m.mp4"));
    const p = planSync(e, {}, [row(e[0])]);
    expect(p.push).toEqual([]); expect(p.changedLocal).toBe(false);
  });
  it("a video deleted on one device is not brought back by the other, and the deletion is pushed", () => {
    const e = logRender([], b("akan dihapus", 5), v("m.mp4"));
    const gone = planSync([], { [e[0].id]: 9 }, [row(e[0])]);
    expect(gone.entries).toEqual([]);
    expect(gone.push).toEqual([{ id: e[0].id, data: null, deleted: true, updated_ms: 9 }]);
    // The other device learns it from the server's tombstone row.
    const learn = planSync(e, {}, [{ id: e[0].id, data: null, deleted: true, updated_ms: 9 }]);
    expect(learn.entries).toEqual([]); expect(learn.changedLocal).toBe(true); expect(learn.push).toEqual([]); expect(learn.tombstones[e[0].id]).toBe(9);
  });
  it("a video changed after it was deleted lives again", () => {
    const e = logRender([], b("hidup lagi", 20), v("m.mp4"));
    const p = planSync(e, {}, [{ id: e[0].id, data: null, deleted: true, updated_ms: 9 }]);
    expect(p.entries).toHaveLength(1); expect(p.tombstones[e[0].id]).toBeUndefined();
    expect(p.push.map(r => r.deleted)).toEqual([false]);
  });
  it("ignores damaged server rows", () => {
    const p = planSync([], {}, [{ id: "x", data: { nope: 1 }, deleted: false, updated_ms: 1 }, { id: "y", data: null, deleted: false, updated_ms: 2 }]);
    expect(p.entries).toEqual([]); expect(p.push).toEqual([]);
  });
});
