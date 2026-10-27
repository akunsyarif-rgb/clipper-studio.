"use client";

import { useEffect, useRef, useState } from "react";
import { GeminiError, judgeScenesWithGemini, type SceneScore } from "@/lib/gemini";
import { getAccess } from "@/lib/gemini-access";
import { cloud } from "@/lib/cloud";

/**
 * Optional second opinion from Gemini on which sentences deserve an animation. Only the sentences' text is sent; the
 * answer is mixed with the rule-based scores (never replaces them), and the reasons show in the scene list.
 */
export default function GeminiJudge({ scenes, language, active, onScores, onClear }: {
  scenes: { text: string; seconds: number }[];
  language: "id" | "en";
  /** Number of sentences that currently carry a Gemini score. */
  active: number;
  onScores: (scores: Record<string, SceneScore>) => void;
  onClear: () => void;
}) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void getAccess().then(a => { if (alive) setReady(!!a); }); };
    refresh();
    const off = cloud.subscribe(refresh);
    return () => { alive = false; off(); abort.current?.abort(); };
  }, []);

  async function run() {
    const settings = await getAccess();
    if (!settings) { setReady(false); return; }
    setBusy(true); setError("");
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const scores = await judgeScenesWithGemini(scenes, { apiKey: settings.apiKey, model: settings.model, language, signal: ctl.signal, transport: settings.transport });
      const byText: Record<string, SceneScore> = {};
      scores.forEach((s, i) => { if (s) byText[scenes[i].text] = s; });
      onScores(byText);
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Gagal menghubungi Gemini."); }
    finally { setBusy(false); }
  }

  if (ready === null) return null;
  return <div className="gemini-judge" data-testid="gemini-judge">
    <small>Gemini bisa memberi pendapat kedua tentang kalimat mana yang layak dianimasikan. Hanya teks kalimat yang dikirim; nilainya dirata-rata dengan aturan, bukan menggantikannya.</small>
    {ready === false
      ? <small data-testid="gemini-judge-needs-key"><b>Belum ada kunci Gemini.</b> Masukkan di panel transkrip (bagian &quot;Rapikan transkrip dengan Gemini&quot;) di perangkat ini.</small>
      : <div className="range-tools">
        <button onClick={() => void run()} disabled={busy || scenes.length === 0} data-testid="gemini-judge-run">{busy ? "Menilai…" : active ? "Nilai ulang dengan Gemini" : "Nilai dengan Gemini"}</button>
        {active > 0 && <button onClick={onClear} data-testid="gemini-judge-clear">Pakai aturan saja</button>}
      </div>}
    {active > 0 && <small role="status" data-testid="gemini-judge-active">{active} kalimat dinilai Gemini.</small>}
    {error && <div className="notice notice-error" role="alert" data-testid="gemini-judge-error">{error}</div>}
  </div>;
}
