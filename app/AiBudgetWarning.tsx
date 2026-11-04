"use client";

import { useEffect, useState } from "react";
import { budgetStatus, type BudgetStatus } from "@/lib/ai-budget";

/** A small notice on every page once AI use nears or passes a daily/monthly limit. It never blocks anything; it can be closed until the level changes. */
export default function AiBudgetWarning() {
  const [st, setSt] = useState<BudgetStatus>({ level: "ok", scope: null, pct: 0 });
  const [closed, setClosed] = useState("");
  useEffect(() => {
    const refresh = () => setSt(budgetStatus());
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);
  const id = `${st.level}:${st.scope}`;
  if (st.level === "ok" || closed === id) return null;
  const where = st.scope === "day" ? "harian" : "bulanan";
  return <div className={`ai-budget-warning${st.level === "over" ? " over" : ""}`} role="status" data-testid="ai-budget-warning">
    <span>{st.level === "over" ? `Batas pemakaian AI ${where} sudah tercapai. Permintaan tetap berjalan; periksa tagihan penyedia.` : `Pemakaian AI ${where} sudah ${st.pct}% dari batas.`}</span>
    <button type="button" onClick={() => setClosed(id)} aria-label="Tutup peringatan">Tutup</button>
  </div>;
}
