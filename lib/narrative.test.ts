import { describe, expect, it } from "vitest";
import { planNarrative } from "./narrative";

describe("planNarrative", () => {
  it("plans a coherent arc from hook through tension, explanation, application and resolution", () => {
    const plan = planNarrative([
      "Mengapa kita sulit menjaga kebiasaan?",
      "Kita punya niat, tetapi sering kembali ke pola lama.",
      "Hal itu terjadi karena lingkungan memberi pemicu yang sama.",
      "Coba jauhkan ponsel dari meja belajar.",
      "Intinya, rancang lingkungan yang mendukung kebiasaan baik.",
    ]);
    expect(plan.map(p => p.role)).toEqual(["hook", "tension", "explanation", "application", "resolution"]);
    expect(plan[2].strategy).toBe("diagram");
    expect(plan[3].strategy).toBe("footage");
    expect(plan[4].intensity).toBe("quiet");
  });

  it("returns an explainable recommendation and continuity cue for every scene", () => {
    const plan = planNarrative(["Mulai dari masalah.", "Namun, ada cara lain."]);
    expect(plan).toHaveLength(2);
    for (const scene of plan) {
      expect(scene.reason.length).toBeGreaterThan(10);
      expect(scene.continuityCue.length).toBeGreaterThan(10);
    }
  });

  it("does not require every sentence to use a high-intensity motion", () => {
    const plan = planNarrative(["Kenapa ini terjadi?", "Hal itu terjadi karena kebiasaan.", "Intinya, buat perubahan kecil."]);
    expect(plan.map(p => p.intensity)).toEqual(["impact", "emphasis", "quiet"]);
  });

  it("distinguishes process, story, evidence, contrast and reflection beats", () => {
    const plan = planNarrative([
      "Mengapa kebiasaan sulit berubah?",
      "Kebiasaan lama bertahan karena pemicunya selalu sama.",
      "Pertama, ubah kebiasaan dengan menjauhkan ponsel dari meja.",
      "Ternyata, lingkungan adalah fondasi kebiasaan.",
      "Aku pernah gagal berkali-kali sebelum menemukan cara ini.",
      "Intinya, perubahan kecil lebih mudah dipertahankan.",
    ]);
    expect(plan.map(p => p.intent)).toEqual(["question", "cause-effect", "process", "insight", "story", "resolution"]);
    expect(plan[1].strategy).toBe("diagram");
    expect(plan[2].strategy).toBe("diagram");
    expect(plan[4].strategy).toBe("metaphor");
    expect(plan.every(p => p.visualCue.length > 20 && p.confidence.length > 0)).toBe(true);
    expect(plan[1].continuity).toEqual({ previousRelated: 0, nextRelated: 2 });
  });

  it("carries topic continuity across explicit references without rewriting the script", () => {
    const texts = ["Kebiasaan sulit dijaga setiap hari.", "Hal ini membuat perubahan terasa berat."];
    const plan = planNarrative(texts);
    expect(plan[1].continuity.previousRelated).toBe(0);
    expect(plan[1].continuityCue).toContain("habit");
    expect(texts[1]).toBe("Hal ini membuat perubahan terasa berat.");
  });

  it("flags weak interpretation, long beats, and claims needing source checks", () => {
    const plan = planNarrative([
      "Ini sangat penting untuk semuanya.",
      "Langkah pertama adalah memahami dasar. ".repeat(5),
      "73% orang berhasil menurut laporan ini.",
    ]);
    expect(plan[0].reviewFlags).toContain("Sinyal makna lemah; periksa pilihan visual secara manual.");
    expect(plan[1].reviewFlags).toContain("Naskah cukup panjang; pertimbangkan membaginya menjadi dua beat.");
    expect(plan[2].intent).toBe("evidence");
    expect(plan[2].reviewFlags).toContain("Pastikan sumber angka atau klaim tersedia sebelum publikasi.");
  });

  it("handles empty and single-scene scripts", () => {
    expect(planNarrative([])).toEqual([]);
    expect(planNarrative(["Mulai sekarang."])).toHaveLength(1);
  });
});
