import { describe, expect, it } from "vitest";
import { heavyMessage, KEEP_OPEN, renderEstimate, transcriptEstimate } from "./work-estimate";

describe("work estimates", () => {
  it("a render takes longer on a touch device, and always names minutes", () => {
    expect(renderEstimate(15, false)).toBe("sekitar 1–2 menit");
    expect(renderEstimate(15, true)).toMatch(/^sekitar \d+(–\d+)? menit$/);
    expect(parseInt(renderEstimate(60, true).replace(/\D+/, ""), 10)).toBeGreaterThan(parseInt(renderEstimate(60, false).replace(/\D+/, ""), 10) - 1);
  });
  it("a first transcript also mentions the model download", () => {
    expect(transcriptEstimate(120, true, false)).toMatch(/mengunduh model/);
    expect(transcriptEstimate(120, true, true)).not.toMatch(/mengunduh/);
  });
  it("the message always carries the instruction not to leave", () => {
    expect(heavyMessage("render", "sekitar 2 menit")).toBe(`Merender sekitar 2 menit. ${KEEP_OPEN}`);
    expect(heavyMessage("transcript", "sekitar 1 menit")).toMatch(/^Membuat transkrip/);
  });
});
