import { describe, expect, it } from "vitest";
import { analyzeVoiceSegment, analyzeVoiceScript, paceToSpeed } from "./voice-director";

describe("voice direction rules", () => {
  it("recognises a curiosity question", () => {
    expect(analyzeVoiceSegment("Pernahkah kamu bertanya-tanya?").emotion).toBe("curious");
  });
  it("marks reveal language as suspense and recommends a longer pause", () => {
    const d = analyzeVoiceSegment("Ternyata jawabannya cukup mengejutkan.");
    expect(d.emotion).toBe("suspense");
    expect(d.pauseAfter).toBe(0.8);
  });
  it("recommends rising intonation for a question", () => {
    expect(analyzeVoiceSegment("Mengapa hal ini bisa terjadi?").intonation).toBe("rising");
  });
  it("recommends suspense intonation for a reveal", () => {
    expect(analyzeVoiceSegment("Ternyata jawabannya berbeda.").intonation).toBe("suspense");
  });
  it("slows reflective language", () => {
    expect(analyzeVoiceSegment("Renungkan makna hidup dan bersyukurlah.").pace).toBe("slow");
  });
  it("uses serious delivery for contrast and risk", () => {
    expect(analyzeVoiceSegment("Namun, ada risiko yang harus kita pahami.").emotion).toBe("serious");
  });
  it("does not overstate confidence for a generic sentence", () => {
    expect(analyzeVoiceSegment("Hari ini kita belajar sesuatu.").confidence).toBe("low");
  });
  it("provides emphasis candidates without modifying the source text", () => {
    const text = "Disiplin membuat langkah kecil menjadi berarti.";
    const d = analyzeVoiceSegment(text);
    expect(d.sourceText).toBe(text);
    expect(d.emphasis.length).toBeGreaterThan(0);
    expect(d.emphasis.length).toBeLessThanOrEqual(2);
  });
  it("analyses each segment independently", () => {
    expect(analyzeVoiceScript(["Apa kabar?", "Ternyata berhasil!"])).toHaveLength(2);
  });
  it("maps pace to bounded synthesis speeds", () => {
    expect(paceToSpeed("slow", 1.05)).toBe(0.95);
    expect(paceToSpeed("normal", 1.05)).toBe(1.05);
    expect(paceToSpeed("fast", 1.05)).toBe(1.16);
    expect(paceToSpeed("fast", 1.3)).toBeLessThanOrEqual(1.35);
  });
});
