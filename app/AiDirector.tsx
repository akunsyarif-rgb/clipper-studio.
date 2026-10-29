"use client";

import { useEffect, useRef, useState } from "react";
import { directVideo, type DirectorInput, type DirectorPlan } from "@/lib/director";
import { GeminiError } from "@/lib/gemini";
import { getAccess } from "@/lib/gemini-access";
import { describeScope, parseScope, restrictPlan } from "@/lib/revision";
import { useGeminiAccess } from "./useGeminiAccess";

/**
 * "Sutradara AI": arranges the whole video from the script with the creator's own AI key. Only the sentences' text and
 * the creator's feedback are sent. The result is applied as ordinary choices (style, palette, per-scene template, icon,
 * cut) that stay editable scene by scene, with the reason for each shown in the list; one tap undoes the whole pass.
 */
export default function AiDirector({ input, language, active, note, canRedo, versions, onPlan, onUndo, onRedo }: {
  input: Omit<DirectorInput, "feedback" | "language">;
  language: "id" | "en";
  /** A pass has been applied and can be undone. */
  active: boolean;
  /** The model's one-line summary of the last pass. */
  note: string;
  /** Receives the (scope-filtered) plan and a short label for the version history. */
  onPlan: (plan: DirectorPlan, label: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canRedo: boolean;
  /** Versions that can be undone. */
  versions: number;
}) {
  const access = useGeminiAccess();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scopeNote, setScopeNote] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function run() {
    const settings = await getAccess();
    if (!settings) return;
    const request = feedback.trim();
    const { scope, outOfRange } = parseScope(request, input.scenes.length);
    if (outOfRange.length) { setError(`Scene ${outOfRange.join(", ")} tidak ada; proyek ini punya ${input.scenes.length} scene.`); return; }
    setBusy(true); setError("");
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const plan = await directVideo({ ...input, language, feedback: request || undefined, ...(request && scope.kind === "scenes" ? { scope: scope.indices } : {}) }, { apiKey: settings.apiKey, model: settings.model, language, signal: ctl.signal, transport: settings.transport, format: settings.format, timeoutMs: 90_000 });
      const { plan: bounded, dropped } = request ? restrictPlan(plan, scope) : { plan, dropped: [] as number[] };
      if (!bounded.scenes.some(Boolean) && !bounded.style && !bounded.palette) { setError("AI tidak memberi perubahan pada scene yang dituju. Coba kalimat yang lebih spesifik."); return; }
      const where = request ? describeScope(scope, input.scenes.length) : "seluruh proyek";
      setScopeNote(`Dikerjakan pada ${where}. Naskah tidak diubah.${dropped.length ? ` Perubahan AI pada scene ${dropped.map(d => d + 1).join(", ")} diabaikan karena di luar target.` : ""}`);
      onPlan(bounded, request ? `${where}: ${request.slice(0, 40)}` : "Susunan otomatis");
      setFeedback("");
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Gagal menghubungi layanan AI."); }
    finally { setBusy(false); }
  }

  if (access === undefined) return null;
  return <div className="ai-director" data-testid="ai-director">
    <b>Sutradara AI</b>
    <small>AI menyusun gaya, palet, tampilan tiap scene, ikon{input.videoEdit ? ", dan potongan layar" : ""} dari naskah Anda memakai panduan motion graphics. Hanya teks kalimat yang dikirim; teks Anda tidak diubah. Periksa hasilnya di daftar scene, ubah yang tidak cocok, atau tulis masukan lalu susun ulang.</small>
    {access === null
      ? <small data-testid="director-needs-key"><b>Belum ada kunci AI.</b> Masuk ke akun lalu simpan kunci OpenRouter di panel AI (atau masukkan di panel transkrip di perangkat ini).</small>
      : <>
        <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2} maxLength={400} disabled={busy} data-testid="director-feedback"
          placeholder={active ? "Masukan Anda, mis. lebih tenang, kurangi animasi, scene 3 pakai angka" : "Opsional: arahan Anda, mis. gaya santai untuk TikTok affiliate. Sebut scene 2 untuk membatasi revisi"} aria-label="Masukan untuk Sutradara AI" />
        <div className="range-tools">
          <button onClick={() => void run()} disabled={busy || input.scenes.length === 0} data-testid="director-run">{busy ? "AI menyusun…" : active ? "Susun ulang dengan masukan" : "Susun otomatis dengan AI"}</button>
          {versions > 0 && <button onClick={onUndo} disabled={busy} data-testid="director-undo">Batalkan revisi terakhir ({versions})</button>}
          {canRedo && <button onClick={onRedo} disabled={busy} data-testid="director-redo">Ulangi revisi</button>}
        </div>
      </>}
    {scopeNote && <small role="status" data-testid="director-scope">{scopeNote}</small>}
    {active && note && <small role="status" data-testid="director-note"><b>Arah AI:</b> {note}</small>}
    {error && <div className="notice notice-error" role="alert" data-testid="director-error">{error}</div>}
  </div>;
}
