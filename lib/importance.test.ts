import { describe, expect, it } from "vitest";
import { amountsIn, DENSITIES, explainScene, judgeScenes, MIN_ANIMATED_SECONDS, planAnimations, type Density, type SceneInput } from "./importance";
import { splitScript } from "./script";
import { resolveVisual, sceneTopics } from "./visuals";

// A real transcript (Indonesian, spoken, with the recogniser's slips left in).
const SCRIPT = `Balik lagi ya, event kita mau beli barang, ketika lu punya 100 juta tadi gue bilang.
Lupa ngeluaran udah oke, lalu 5 jutaan ini sebulan, ya lalu bisa hidup 20 bulan.
Ada TV iPhone keluar, harga 15 juta bisa. Adau, nonton!
Kati kalau mau beli barang itu.
Jadi beli barang tuh bukan ketika lu punya duit ya, banyak yang pikir oke ketika gue punya 100 juta, gak apa-apa gue beli handful 15 juta.
Tapi yang harusnya lu hitung adalah berapa bulan dari hidup lu yang lu buang.
Ketika pengeluaran nonton 5 juta, hape 15 juta Itu tiga bulan hidup lola.
20-40 dolar, lu jarang mikro seperti itu. Gue dari kecil gue mikro gitu.
Ketika gue memilis satu, ini berapa bulan dari hidup kok sih? Barangnya deh.
Jadi gua satu untuk konsep antara uang, energi dan juga waktu.
dari situ lu akan lebih peduli tentang uang karena kalau lu gak peduli sama uang-uang, ga kan peduli sama lu
lu gak ngerti sama uang-uang juga gak ngerti lu lu gak suka mikirin uang, uang gak kan suka mikirin lu juga
Gue bukan bilang lu ga menikmati  uang sama sekali Gue nikmati kok uang ketika gue mau up`;

const inputs = (texts: string[]): SceneInput[] => {
  const topics = sceneTopics(texts);
  return texts.map((t, i) => ({ text: t, visual: resolveVisual(t, undefined, topics[i]), seconds: Math.max(1.2, t.split(/\s+/).length * 0.4) }));
};
const texts = splitScript(SCRIPT);
const scenes = inputs(texts);
const at = (needle: string) => texts.findIndex(t => t.includes(needle));
const count = (d: Density) => planAnimations(scenes, d).cuts.filter(c => c === "overlay").length;

describe("amountsIn", () => {
  it("lists what a sentence counts, normalised", () => {
    expect(amountsIn("ketika lu punya 100 juta tadi")).toEqual(["100 juta"]);
    expect(amountsIn("lalu 5 jutaan ini sebulan, bisa hidup 20 bulan")).toEqual(["5 juta", "20 bulan"]);
    expect(amountsIn("Itu tiga bulan hidup")).toEqual(["tiga bulan"]);
    expect(amountsIn("naik 30% dalam 2 tahun")).toEqual(["30 %", "2 tahun"].map(x => x.replace(" %", " %")));
    expect(amountsIn("satu langkah kecil")).toEqual([]);
  });
});

describe("what deserves an animation in a spoken script", () => {
  it("scores amounts of money and the idea the script is about high, filler low", () => {
    const j = judgeScenes(scenes);
    expect(j[at("100 juta tadi")].score).toBeGreaterThanOrEqual(0.9);
    expect(j[at("konsep antara uang")].reasons).toContain("rangkuman konsep");
    for (const filler of ["Adau, nonton", "Kati kalau mau", "Barangnya deh"]) expect(j[at(filler)].score, filler).toBeLessThan(0.4);
  });

  it("does not count an amount as news when everything in the sentence was already shown", () => {
    const j = judgeScenes(scenes);
    expect(j[at("Jadi beli barang tuh bukan")].score).toBeLessThan(0.6); // 100 juta and 15 juta again
    expect(j[at("Itu tiga bulan hidup")].score).toBeGreaterThanOrEqual(0.9); // the same money, now as months
  });

  it("animates a few moments, not nearly every sentence (balanced)", () => {
    const n = count("balanced");
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n / scenes.length).toBeLessThanOrEqual(0.45);
    const { cuts } = planAnimations(scenes, "balanced");
    expect(cuts[at("Adau, nonton")]).toBe("video");
    expect(cuts[at("Kati kalau mau")]).toBe("video");
    expect(cuts[at("Barangnya deh")]).toBe("video");
    expect(cuts[at("100 juta tadi")]).toBe("overlay");
  });

  it("shows fewer with 'sedikit' and more with 'banyak', never fewer than the stricter setting", () => {
    expect(count("sparse")).toBeLessThanOrEqual(count("balanced"));
    expect(count("balanced")).toBeLessThanOrEqual(count("rich"));
    expect(count("rich")).toBeGreaterThan(count("sparse"));
    expect(count("rich") / scenes.length).toBeLessThanOrEqual(0.6);
  });

  it("keeps animations apart and within the share of the video each setting allows", () => {
    for (const [d, gap, share] of [["sparse", 8, 0.18], ["balanced", 5, 0.3], ["rich", 3, 0.45]] as [Density, number, number][]) {
      const { cuts } = planAnimations(scenes, d);
      const starts: number[] = []; let t = 0; for (const s of scenes) { starts.push(t); t += s.seconds; }
      const picked = cuts.map((c, i) => (c === "overlay" ? i : -1)).filter(i => i >= 0);
      for (let a = 0; a < picked.length; a++) for (let b = a + 1; b < picked.length; b++) expect(Math.abs(starts[picked[a]] - starts[picked[b]]), d).toBeGreaterThanOrEqual(gap);
      expect(picked.length * 4, d).toBeLessThanOrEqual(Math.max(4, t * share) + 1e-9);
    }
  });

  it("is the same every time", () => {
    expect(planAnimations(scenes, "balanced")).toEqual(planAnimations(scenes, "balanced"));
  });
});

describe("other kinds of moments", () => {
  const plan = (lines: string[], d: Density = "balanced") => planAnimations(inputs(lines), d).cuts;
  const pad = (n: number) => Array.from({ length: n }, () => "Ya begitulah ceritanya sebenarnya tadi.");

  it("always takes a popular name and what the creator marked by hand", () => {
    const lines = [...pad(6), "Cari di YouTube ya.", ...pad(6), "Ini *kuncinya* sekali.", ...pad(6)];
    const cuts = plan(lines);
    expect(cuts[6]).toBe("overlay");
    expect(cuts[13]).toBe("overlay");
  });
  it("takes a call to action and a comparison, leaves a plain remark alone", () => {
    const lines = [...pad(6), "Jangan lupa follow untuk tips berikutnya.", ...pad(6), "Yang penting bukan motivasi besar, tapi sistem kecil.", ...pad(6)];
    const cuts = plan(lines);
    expect(cuts[6]).toBe("overlay");
    expect(cuts[13]).toBe("overlay");
    expect(cuts[0]).toBe("video");
    expect(cuts[9]).toBe("video");
  });
  it("does not repeat the same concept icon on neighbouring scenes", () => {
    const cuts = plan(["Kita bicara soal waktu.", "Waktu itu berharga sekali.", "Waktu tidak bisa kembali lagi."], "rich");
    expect(cuts.filter(c => c === "overlay").length).toBeLessThanOrEqual(1);
  });
  it("handles an empty script and a single scene", () => {
    expect(planAnimations([], "balanced").cuts).toEqual([]);
    expect(planAnimations(inputs(["Ada 73% orang berhenti."]), "sparse").cuts).toEqual(["overlay"]);
  });
});

describe("explaining the choice", () => {
  it("says why a scene is animated and why not", () => {
    const { cuts, judgements } = planAnimations(scenes, "balanced");
    const yes = cuts.indexOf("overlay"), no = cuts.indexOf("video");
    expect(explainScene(judgements[yes], true)).toMatch(/^Animasi: .*\(skor \d\.\d\d\)$/);
    expect(explainScene(judgements[no], false)).toMatch(/^Tanpa animasi: /);
    expect(explainScene({ score: 0, reasons: [] }, false)).toBe("Tanpa animasi: tidak ada yang perlu ditunjukkan");
  });
  it("offers three settings", () => {
    expect(DENSITIES.map(d => d.id)).toEqual(["sparse", "balanced", "rich"]);
  });
});

describe("scenes too brief to show anything", () => {
  it("never get an animation or a graphic, however strong they would be", () => {
    const scenes: SceneInput[] = ["Kita mulai dari sini ya.", "Harganya hanya Rp 89.000 saja.", "Jadi begitu."].map(text => ({ text, seconds: 3, visual: resolveVisual(text) }));
    const normal = planAnimations(scenes, "rich");
    expect(normal.cuts[1]).not.toBe("video");
    const brief = planAnimations(scenes.map((s, i) => (i === 1 ? { ...s, seconds: MIN_ANIMATED_SECONDS - 0.4 } : s)), "rich");
    expect(brief.cuts[1]).toBe("video");
  });
});
