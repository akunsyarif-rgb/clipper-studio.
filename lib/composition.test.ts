import { describe, expect, it } from "vitest";
import { chooseFamily, splitCause } from "./composition";
import { planNarrative } from "./narrative";
import { detectVisual } from "./visuals";

const familyFor = (texts: string[]) => {
  const plan = planNarrative(texts);
  return texts.map((t, i) => chooseFamily(detectVisual(t), plan[i]));
};

describe("chooseFamily", () => {
  it("maps a typical narrative arc onto five distinct families", () => {
    const texts = [
      "Kenapa kebiasaan baik selalu terasa berat di awal?",
      "Bukan motivasi, tapi sistem kecil yang konsisten.",
      "Padahal kita sering menyalahkan diri sendiri.",
      "Otak menolak perubahan karena energi terbatas.",
      "73% orang berhenti sebelum minggu ketiga.",
      "Kesimpulannya, mulai dari langkah sekecil mungkin.",
    ];
    expect(familyFor(texts)).toEqual(["editorial", "comparison", "kinetic", "explainer", "data", "editorial"]);
  });

  it("uses the explainer for numbered steps", () => {
    expect(familyFor(["Hook pembuka.", "Pertama, tentukan target yang jelas."])[1]).toBe("explainer");
  });

  it("treats a call to action after the hook as a product/action showcase", () => {
    expect(familyFor(["Hook pembuka.", "Ini penting.", "Ikuti untuk tips berikutnya."])[2]).toBe("data");
  });

  it("does not stage a year as a statistic", () => {
    const v = detectVisual("Pada 1945 semuanya berubah.");
    expect(chooseFamily(v, { role: "continuation", strategy: "minimal" })).toBe("editorial");
  });

  it("needs real compare data before using the split layout", () => {
    expect(chooseFamily({ template: "compare", icon: null, emphasis: [] }, { role: "tension", strategy: "comparison" })).toBe("kinetic");
  });

  it("falls back to the given role when a scene has no narrative plan (older project JSON)", () => {
    expect(chooseFamily(detectVisual("Sebuah kalimat biasa."), undefined, "hook")).toBe("editorial");
    expect(chooseFamily(detectVisual("Sebuah kalimat biasa."), undefined, "tension")).toBe("kinetic");
  });
});

describe("sample motion timeline", () => {
  it("keeps the five supplied scenes visually distinct by family", () => {
    const scenes = [
      {
        text: "Jangan tunggu semangat datang.",
        visual: { template: "statement", icon: "wait", emphasis: ["tunggu"] },
        narrative: { role: "hook", strategy: "typography" },
      },
      {
        text: "Mulailah, meski langkahmu kecil.",
        visual: { template: "statement", icon: "start", emphasis: ["mulailah"] },
        narrative: { role: "tension", strategy: "comparison" },
      },
      {
        text: "Disiplin membuatmu tetap bergerak.",
        visual: { template: "statement", icon: "discipline", emphasis: ["disiplin"] },
        narrative: { role: "continuation", strategy: "minimal" },
      },
      {
        text: "Satu langkah hari ini lebih baik dari rencana sempurna.",
        visual: { template: "compare", icon: "step", emphasis: ["langkah"], compare: { bad: "rencana sempurna", good: "Satu langkah hari ini", neutral: false } },
        narrative: { role: "application", strategy: "diagram" },
      },
      {
        text: "Mulai sekarang.",
        visual: { template: "cta", icon: "start", emphasis: ["mulai"], cta: "MULAI SEKARANG" },
        narrative: { role: "application", strategy: "diagram" },
      },
    ];
    expect(scenes.map((scene, i) => chooseFamily(scene.visual as never, scene.narrative as never, i === 0 ? "hook" : "continuation")))
      .toEqual(["editorial", "kinetic", "editorial", "comparison", "data"]);
  });
});

describe("splitCause", () => {
  it("splits cause and effect at the connector", () => {
    expect(splitCause("Otak menolak perubahan karena energi terbatas.")).toEqual({ before: "Otak menolak perubahan", link: "karena", after: "energi terbatas." });
    expect(splitCause("We stop early, because progress feels invisible.")).toEqual({ before: "We stop early", link: "because", after: "progress feels invisible." });
  });

  it("refuses splits that would leave a fragment", () => {
    expect(splitCause("Karena itu penting.")).toBeNull();
    expect(splitCause("Kita gagal karena lelah.")).toBeNull();
    expect(splitCause("Tanpa penghubung sama sekali.")).toBeNull();
  });
});

describe("manual icon override", () => {
  it("pins a hand-picked icon so quiet layouts keep it, but not an automatic one", async () => {
    const { resolveVisual } = await import("./visuals");
    expect(resolveVisual("Pilih disiplin, bukan sekadar motivasi.", { template: "statement", icon: "money" })).toMatchObject({ icon: "money", iconPinned: true });
    expect(resolveVisual("Uang bukan segalanya.").iconPinned).toBeUndefined();
    expect(resolveVisual("Uang itu penting.", { icon: "none" }).iconPinned).toBeUndefined();
  });
});
