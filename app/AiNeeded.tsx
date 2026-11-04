"use client";

import { focusAiSetup } from "./AiSetupCard";

/** The one short line that replaces every "no AI key" explanation in the advanced panels: it takes the creator back to the AI card at the top. */
export default function AiNeeded({ testId, what }: { testId?: string; what?: string }) {
  return <small data-testid={testId}>{what ?? "Fitur ini memakai AI."} <button type="button" className="text-link" onClick={focusAiSetup} data-testid="ai-needed-go">Siapkan AI di atas</button></small>;
}
