"use client";

import { useEffect, useRef, useState } from "react";
import { fetchFreeModels, type FreeModel } from "@/lib/openrouter-free";
import { OPENROUTER_FREE_MODEL } from "@/lib/gemini-access";

/** Pick a free OpenRouter model from a list instead of typing its name. The list comes from OpenRouter's public model list. */
export default function FreeModelPicker({ current, disabled, onPick }: { current: string; disabled: boolean; onPick: (id: string) => void }) {
  const [models, setModels] = useState<FreeModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function load() {
    const ctl = new AbortController(); abort.current = ctl;
    setBusy(true); setError("");
    try { setModels(await fetchFreeModels({ signal: ctl.signal })); }
    catch { setError("Daftar model gratis tidak bisa diambil sekarang. Gunakan “Gunakan model gratis” (otomatis) atau ketik nama model."); }
    finally { setBusy(false); }
  }

  if (!models) return <div className="free-model-picker">
    <button type="button" onClick={() => void load()} disabled={disabled || busy} data-testid="free-models-load">{busy ? "Memuat daftar…" : "Pilih dari daftar model gratis"}</button>
    {error && <small className="notice notice-error" role="alert" data-testid="free-models-error">{error}</small>}
  </div>;
  return <label className="free-model-picker">Model gratis tersedia
    <select value={models.some(m => m.id === current) || current === OPENROUTER_FREE_MODEL ? current : ""} onChange={e => { if (e.target.value) onPick(e.target.value); }} disabled={disabled} data-testid="free-models-select">
      <option value="">Pilih model…</option>
      <option value={OPENROUTER_FREE_MODEL}>Otomatis (OpenRouter memilih yang tersedia) — disarankan</option>
      {models.map(m => <option key={m.id} value={m.id}>{m.name}{m.context ? ` · ${Math.round(m.context / 1000)}k` : ""}</option>)}
    </select>
    <small>{models.length} model gratis. Mutu dan ketersediaannya berubah-ubah; model gratis bisa menolak audio.</small>
  </label>;
}
