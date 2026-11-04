"use client";

import { useEffect, useState } from "react";
import { heavyMessage, renderEstimate, transcriptEstimate } from "@/lib/work-estimate";

/** While a render or a transcript runs: the rough time it takes and the one thing not to do. */
export default function HeavyWorkNotice({ what, seconds, modelCached = null, testId = "heavy-notice" }: { what: "render" | "transcript"; seconds: number; modelCached?: boolean | null; testId?: string }) {
  const [touch, setTouch] = useState(false);
  useEffect(() => { try { setTouch(window.matchMedia("(pointer: coarse)").matches); } catch { /* assume a laptop */ } }, []);
  const estimate = what === "render" ? renderEstimate(seconds, touch) : transcriptEstimate(seconds, touch, modelCached);
  return <p className="notice heavy-notice" role="status" data-testid={testId}><small>{heavyMessage(what, estimate)}</small></p>;
}
