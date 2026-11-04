import { describe, expect, it } from "vitest";
import { buildCinematic } from "./cinematic";
import { isAiSkipped, QUICK_EXAMPLES, setAiSkipped, summarizePlan } from "./quick-start";

describe("quick start", () => {
  it("offers one example for each kind of film, each long enough to be a real command", () => {
    expect(QUICK_EXAMPLES.map(e => e.id)).toEqual(["produk", "cerita", "edukasi", "profil"]);
    for (const e of QUICK_EXAMPLES) expect(e.prompt.length).toBeGreaterThanOrEqual(30);
  });
  it("describes a plan in plain words with every scene and no jargon", () => {
    const plan = buildCinematic({ genre: "produk", product: "Kopi Pagi", tagline: "Mulai harimu hangat", features: ["Biji pilihan"], cta: "Pesan sekarang", tone: "warm", seconds: 30 });
    const s = summarizePlan(plan, { autoPictures: true });
    expect(s.headline).toBe("Kopi Pagi");
    expect(s.scenes.length).toBe(plan.scenes.length);
    const text = s.facts.join(" ");
    expect(text).toMatch(/adegan/);
    expect(text).toMatch(/Foto atau video latar/);
    expect(text).not.toMatch(/BPM|beat|preset|storyboard/i);
    expect(summarizePlan(plan, { autoPictures: false }).facts.join(" ")).not.toMatch(/Foto atau video/);
  });
  it("remembers the choice to skip AI on this device", () => {
    setAiSkipped(true);
    expect(isAiSkipped()).toBe(true);
    setAiSkipped(false);
    expect(isAiSkipped()).toBe(false);
  });
});
