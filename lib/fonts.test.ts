import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TYPE_PACK, facesFor, FONT_FACES, resolveTypePack, TYPE_PACK_IDS, TYPE_PACKS } from "./fonts";
import { setActiveType, TYPE } from "./layout";

const dir = join(process.cwd(), "public", "fonts");

describe("self-hosted fonts", () => {
  it("every face in the manifest is a real woff2 file of a sensible size", () => {
    for (const f of FONT_FACES) {
      const path = join(dir, f.file);
      expect(existsSync(path), f.file).toBe(true);
      const size = statSync(path).size;
      expect(size, f.file).toBeGreaterThan(2_000);
      expect(size, f.file).toBeLessThan(80_000);
      expect(readFileSync(path).subarray(0, 4).toString("latin1"), f.file).toBe("wOF2");
    }
  });
  it("no font file is shipped without being used, and every family carries its open licence", () => {
    const used = new Set(FONT_FACES.map(f => f.file));
    const files = readdirSync(dir).filter(f => f.endsWith(".woff2"));
    expect(files.filter(f => !used.has(f))).toEqual([]);
    const licences = readdirSync(join(dir, "licenses"));
    for (const family of new Set(FONT_FACES.map(f => f.family))) {
      const slug = family.toLowerCase().replace(/ /g, "-");
      expect(licences, family).toContain(`${slug}.txt`);
      expect(readFileSync(join(dir, "licenses", `${slug}.txt`), "utf8"), family).toMatch(/SIL Open Font License/);
    }
  });
  it("a face covers every weight the studio asks for, so the browser never fakes bold", () => {
    for (const family of new Set(FONT_FACES.map(f => f.family))) {
      const covered = new Set<number>();
      for (const f of FONT_FACES.filter(x => x.family === family)) {
        const [lo, hi] = f.weight.split(" ").map(Number);
        for (let w = lo; w <= hi; w += 100) covered.add(w);
      }
      for (const w of [700, 800, 900]) expect(covered.has(w), `${family} ${w}`).toBe(true);
    }
  });
});

describe("type packs", () => {
  it("each pack's families exist in the manifest, and the classic pack needs no download", () => {
    for (const id of TYPE_PACK_IDS) {
      const pack = TYPE_PACKS[id];
      expect(pack.id).toBe(id);
      for (const family of pack.families) expect(facesFor(pack).some(f => f.family === family), `${id}/${family}`).toBe(true);
      // The fonts named in the stacks are the ones listed to load (system stacks aside).
      for (const slot of [pack.display, pack.sans, pack.serif]) {
        const first = /^'([^']+)'/.exec(slot)?.[1];
        if (first && pack.families.length) expect(pack.families, `${id}: ${first}`).toContain(first);
      }
    }
    expect(TYPE_PACKS.classic.families).toEqual([]);
    expect(TYPE_PACKS.classic.caps).toBe(false);
  });
  it("unknown, missing or old values fall back to the classic fonts", () => {
    expect(resolveTypePack(undefined).id).toBe(DEFAULT_TYPE_PACK);
    expect(resolveTypePack(null).id).toBe(DEFAULT_TYPE_PACK);
    expect(resolveTypePack("nope").id).toBe(DEFAULT_TYPE_PACK);
    expect(resolveTypePack("impact").id).toBe("impact");
  });
  it("TYPE follows the active pack", () => {
    setActiveType(TYPE_PACKS.impact);
    expect(TYPE.display).toContain("Anton");
    expect(TYPE.caps).toBe(true);
    setActiveType(TYPE_PACKS.classic);
    expect(TYPE.display).toContain("Arial Black");
    expect(TYPE.caps).toBe(false);
  });
});
