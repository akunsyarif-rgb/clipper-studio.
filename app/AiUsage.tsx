"use client";

import { useEffect, useState } from "react";
import { budgetStatus, DEFAULT_DAILY_TOKENS, DEFAULT_MONTHLY_TOKENS, getBudget, isFreeModel, setDailyLimit, setMonthlyLimit, type Budget } from "@/lib/ai-budget";

const pctOf = (used: number, limit: number) => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);

/** AI use that may be billed, today and this month, with a limit for each (tokens; 0 = none). Only warns; never blocks a request. */
export default function AiUsage({ model }: { model: string }) {
  const [b, setB] = useState<Budget | null>(null);
  const [limit, setLimit] = useState(String(DEFAULT_DAILY_TOKENS));
  const [monthLimit, setMonthLimit] = useState(String(DEFAULT_MONTHLY_TOKENS));
  useEffect(() => {
    const refresh = () => { const x = getBudget(); setB(x); setLimit(String(x.limit)); setMonthLimit(String(x.monthLimit)); };
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);
  if (!b) return null;
  const st = budgetStatus();
  const fmt = (n: number) => n.toLocaleString("id");
  return <div className="ai-usage" data-testid="ai-usage">
    <p><small><b>Pemakaian AI hari ini:</b> {fmt(b.tokens)} token · {b.requests} permintaan{b.limit > 0 ? ` · batas ${fmt(b.limit)} token (${pctOf(b.tokens, b.limit)}%)` : " · tanpa batas"}</small></p>
    {b.limit > 0 && <div className="progress-track" aria-hidden="true"><span style={{ width: `${pctOf(b.tokens, b.limit)}%` }} /></div>}
    <p><small data-testid="ai-month"><b>Bulan ini:</b> {fmt(b.monthTokens)} token{b.monthLimit > 0 ? ` · batas ${fmt(b.monthLimit)} token (${pctOf(b.monthTokens, b.monthLimit)}%)` : " · tanpa batas"}</small></p>
    {b.monthLimit > 0 && <div className="progress-track" aria-hidden="true"><span style={{ width: `${pctOf(b.monthTokens, b.monthLimit)}%` }} /></div>}
    <p><small>Hanya model yang bisa ditagih yang dihitung; model gratis tidak. Batas hanya memberi peringatan, tidak menghentikan permintaan.</small></p>
    {st.level !== "ok" && <p className={st.level === "over" ? "notice notice-error" : "notice"} role="status" data-testid="ai-limit-warning"><small>{st.level === "over" ? `Batas ${st.scope === "day" ? "harian" : "bulanan"} sudah tercapai.` : `Pemakaian ${st.scope === "day" ? "hari ini" : "bulan ini"} sudah ${st.pct}% dari batas.`}</small></p>}
    {model && !isFreeModel(model) && <p className="notice" role="status" data-testid="ai-paid-note"><small>Model <b>{model}</b> bukan model gratis OpenRouter; penyedia bisa menagih per token. Aplikasi tidak pernah memilih model berbayar sendiri.</small></p>}
    <label>Batas harian (token, 0 = tanpa batas)<input inputMode="numeric" value={limit} onChange={e => setLimit(e.target.value.replace(/\D/g, "").slice(0, 9))} onBlur={() => { setDailyLimit(Number(limit || 0)); setB(getBudget()); }} data-testid="ai-limit" /></label>
    <label>Batas bulanan (token, 0 = tanpa batas)<input inputMode="numeric" value={monthLimit} onChange={e => setMonthLimit(e.target.value.replace(/\D/g, "").slice(0, 10))} onBlur={() => { setMonthlyLimit(Number(monthLimit || 0)); setB(getBudget()); }} data-testid="ai-month-limit" /></label>
  </div>;
}
