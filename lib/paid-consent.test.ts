import { describe, expect, it } from "vitest";
import { allowPaidModel, isPaidAllowed } from "./paid-consent";

describe("paid model consent", () => {
  it("free models are always allowed; a billable one only after the creator chose it", () => {
    expect(isPaidAllowed("openrouter/free")).toBe(true);
    expect(isPaidAllowed("x/y:free")).toBe(true);
    expect(isPaidAllowed("google/gemini-2.5-pro")).toBe(false);
    allowPaidModel("google/gemini-2.5-pro");
    expect(isPaidAllowed("google/gemini-2.5-pro")).toBe(true);
    expect(isPaidAllowed("google/gemini-2.5-flash")).toBe(false);
  });
});
