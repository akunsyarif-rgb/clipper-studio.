"use client";

import { useEffect, useRef, useState } from "react";
import { directVideo, type DirectorInput, type DirectorPlan } from "@/lib/director";
import { GeminiError } from "@/lib/gemini";
import { getAccess } from "@/lib/gemini-access";
import { useGeminiAccess } from "./useGeminiAccess";

/**
 * "Sutradara AI": arranges the whole video from the script with the creator's own AI key. Only the sentences' text and
 * the creator's feedback are sent. The result is applied as ordinary choices (style, palette, per-scene template, icon,
 * cut) that stay editable scene by scene, with the reason for each shown in the list; one tap undoes the whole pass.
 */
export default function AiDirector({ input, language, active, note, onPlan, onUndo }: {
  input: Omit<DirectorInput, "feedback" | "language">;
  language: "id" | "en";
  /** A pass has been applied and can be undone. */
  active: boolean;
  /** The model's one-line summary of the last pass. */
  note: string;
  onPlan: (plan: DirectorPlan) => void;
  onUndo: () => void;
}) {
  const access = useGeminiAccess();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function run() {
    const settings = await getAccess();
    if (!settings) return;
    setBusy(true); setError("");
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const plan = await directVideo({ ...input, language, feedback: feedback.trim() || undefined }, { apiKey: settings.apiKey, model: settings.model, language, signal: ctl.signal, transport: settings.transport, format: settings.format, timeoutMs: 90_000 });
      onPlan(plan);
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
          placeholder={active ? "Masukan Anda, mis. lebih tenang, kurangi animasi, scene 3 pakai angka" : "Opsional: arahan Anda, mis. gaya santai untuk TikTok affiliate"} aria-label="Masukan untuk Sutradara AI" />
        <div className="range-tools">
          <button onClick={() => void run()} disabled={busy || input.scenes.length === 0} data-testid="director-run">{busy ? "AI menyusun…" : active ? "Susun ulang dengan masukan" : "Susun otomatis dengan AI"}</button>
          {active && <button onClick={onUndo} disabled={busy} data-testid="director-undo">Batalkan susunan AI</button>}
        </div>
      </>}
    {active && note && <small role="status" data-testid="director-note"><b>Arah AI:</b> {note}</small>}
    {error && <div className="notice notice-error" role="alert" data-testid="director-error">{error}</div>}
  </div>;
}
