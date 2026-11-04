"use client";

import { useEffect, useState } from "react";

/** Shown while an AI request runs: how long it has been (so waiting never feels frozen), a hint once it is slow, and a way to stop. */
export default function AiBusy({ busy, label = "AI sedang bekerja", onCancel }: { busy: boolean; label?: string; onCancel: () => void }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!busy) { setSec(0); return; }
    const start = Date.now();
    const t = setInterval(() => setSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);
  if (!busy) return null;
  return <div className="notice ai-busy" role="status" data-testid="ai-busy">
    <small>{label}… {sec} dtk{sec >= 20 ? ". Lebih lama dari biasanya: model gratis kadang antre. Anda bisa menunggu, atau batalkan lalu ganti model." : "."}</small>
    <button type="button" className="text-button" onClick={onCancel} data-testid="ai-cancel">Batal</button>
  </div>;
}
