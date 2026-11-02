"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DAILY_TOKENS, getBudget, isFreeModel, resetToday, setDailyLimit, type Budget } from "@/lib/ai-budget";

/** Today's AI use on this device, the daily limit (tokens; 0 = none) and a plain warning when the chosen model may be billed. */
export default function AiUsage({ model }: { model: string }) {
  const [b, setB] = useState<Budget | null>(null);
  const [limit, setLimit] = useState(String(DEFAULT_DAILY_TOKENS));
  useEffect(() => {
    const refresh = () => { const x = getBudget(); setB(x); };
    refresh();
    setLimit(String(getBudget().limit));
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);
  if (!b) return null;
  const pct = b.limit > 0 ? Math.min(100, Math.round((b.tokens / b.limit) * 100)) : 0;
  return <div className="ai-usage" data-testid="ai-usage">
    <p><small><b>Pemakaian AI hari ini:</b> {b.tokens.toLocaleString("id")} token · {b.requests} permintaan{b.limit > 0 ? ` · batas ${b.limit.toLocaleString("id")} token (${pct}%)` : " · tanpa batas"}</small></p>
    {b.limit > 0 && <div className="progress-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>}
    {model && !isFreeModel(model) && <p className="notice" role="status" data-testid="ai-paid-note"><small>Model <b>{model}</b> bukan model gratis OpenRouter; penyedia bisa menagih per token. Aplikasi tidak pernah memilih model berbayar sendiri.</small></p>}
    <label>Batas harian (token, 0 = tanpa batas)<input inputMode="numeric" value={limit} onChange={e => setLimit(e.target.value.replace(/\D/g, "").slice(0, 9))} onBlur={() => { setDailyLimit(Number(limit || 0)); setB(getBudget()); }} data-testid="ai-limit" /></label>
    <button type="button" onClick={() => { resetToday(); setB(getBudget()); }} data-testid="ai-usage-reset">Atur ulang hitungan hari ini</button>
  </div>;
}
