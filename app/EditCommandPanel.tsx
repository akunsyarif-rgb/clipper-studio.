"use client";

import { useEffect, useRef, useState } from "react";
import { isFreeModel } from "@/lib/ai-budget";
import { describePlan, MAX_AGENT_SECONDS, MAX_EDIT_COMMAND_CHARS, planEdit, planIsEmpty, type EditPlan } from "@/lib/edit-command";
import { GeminiError, aiUsage } from "@/lib/gemini";
import { getAccess } from "@/lib/gemini-access";
import { useGeminiAccess } from "./useGeminiAccess";
import AiModelSelect from "./AiModelSelect";

/**
 * Edit assistant for the video already chosen: one sentence becomes a few of the studio's own settings. The creator sees the plan
 * first and nothing changes until "Terapkan"; "Urungkan" puts the settings back. A wish that depends on what is said waits for a
 * transcript, which is made only after the creator agrees (it takes time and battery). Free model unless the creator allows otherwise.
 */
export default function EditCommandPanel({ seconds, hasTranscript, lines, disabled, onApply, onUndo, canUndo, onStartTranscript }: {
  seconds: number;
  hasTranscript: boolean;
  lines: string[];
  disabled: boolean;
  onApply: (plan: EditPlan) => void;
  onUndo: () => void;
  canUndo: boolean;
  onStartTranscript: () => void;
}) {
  const access = useGeminiAccess();
  const [command, setCommand] = useState("");
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [paidOk, setPaidOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [asked, setAsked] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const tooLong = seconds > MAX_AGENT_SECONDS;
  async function run() {
    setError(""); setNote(""); setPlan(null); setAsked(false);
    const settings = await getAccess();
    if (!settings) return setError("Atur kunci AI dulu di pengaturan AI. Tanpa AI, atur profil dan animasi secara manual di bawah.");
    if (!isFreeModel(settings.model) && !paidOk) return setError(`Model ${settings.model} bukan model gratis. Centang izin di bawah kolom perintah bila Anda memang ingin memakainya untuk perintah ini.`);
    setBusy(true);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const out = await planEdit(command, { hasTranscript, lines, seconds }, { apiKey: settings.apiKey, model: settings.model, language: "id", signal: ctl.signal, transport: settings.transport, format: settings.format });
      setPlan(out);
      setNote(`Rencana siap (${settings.model}). Belum ada yang diubah. Permintaan sesi ini: ${aiUsage.requests}, token ${aiUsage.tokens}.`);
    } catch (e) {
      setError((e instanceof GeminiError ? e.message : "Gagal menghubungi AI.") + " Tidak ada yang diubah.");
    } finally { setBusy(false); }
  }

  const changes = plan ? describePlan(plan) : [];
  const waitsForTranscript = !!plan && plan.needsTranscript && !hasTranscript;
  return <div className="command-box edit-command" data-testid="edit-command">
    <label>Asisten edit (ceritakan hasil yang diinginkan)
      <textarea rows={2} value={command} maxLength={MAX_EDIT_COMMAND_CHARS} onChange={e => setCommand(e.target.value)} disabled={disabled || tooLong} placeholder="Contoh: buat lucu, subtitle gaya pop di bawah, animasi seperlunya" data-testid="edit-command-input" />
    </label>
    {tooLong && <small className="field-hint" data-testid="edit-command-long">Asisten edit untuk video sampai 3 menit. Potong videonya dulu di Potong video.</small>}
    {access && <AiModelSelect disabled={busy} onPick={m => setPaidOk(!isFreeModel(m))} />}
    {access && !isFreeModel(access.model) && <label className="check-row"><input type="checkbox" checked={paidOk} onChange={e => setPaidOk(e.target.checked)} data-testid="edit-command-paid-ok" /> Izinkan model berbayar ({access.model}) untuk perintah ini</label>}
    <div className="button-row">
      <button type="button" onClick={() => void run()} disabled={disabled || busy || tooLong || command.trim().length < 8} data-testid="edit-command-run">{busy ? "Menyusun rencana…" : "Buat rencana edit"}</button>
      {canUndo && <button type="button" className="text-button" onClick={() => { onUndo(); setNote("Pengaturan dikembalikan seperti sebelum perintah."); setPlan(null); }} data-testid="edit-command-undo">Urungkan perintah terakhir</button>}
    </div>
    <small className="field-hint">{access ? "Satu panggilan AI; hanya memilih pengaturan yang sudah ada, tidak memotong atau menghapus apa pun." : "Perlu kunci AI."}</small>
    {error && <div className="notice notice-error" role="alert" data-testid="edit-command-error">{error}</div>}
    {note && <div className="notice" role="status" data-testid="edit-command-note">{note}</div>}
    {plan && <div data-testid="edit-command-plan">
      {changes.length > 0 ? <ul>{changes.map((c, i) => <li key={i}><small>{c}</small></li>)}</ul> : <p><small>Tidak ada pengaturan yang bisa diubah dari perintah ini.</small></p>}
      {plan.unsupported.length > 0 && <div className="notice" data-testid="edit-command-unsupported"><small>Belum bisa dilakukan aplikasi: {plan.unsupported.join("; ")}.</small></div>}
      {waitsForTranscript && !planIsEmpty(plan) && <div className="notice" data-testid="edit-command-transcript">
        <small>Perintah ini bergantung pada isi ucapan, jadi perlu transkrip (dibuat di perangkat; memakan waktu dan baterai). Setelah transkrip jadi, tekan “Pakai transkrip” agar pengaturan ini berlaku.</small>
        <div className="button-row"><button type="button" onClick={() => { setAsked(true); onStartTranscript(); }} disabled={asked || disabled} data-testid="edit-command-transcript-go">{asked ? "Transkrip dimulai di panel Transkrip" : "Buat transkrip sekarang"}</button></div>
      </div>}
      {!planIsEmpty(plan) && <div className="button-row">
        <button type="button" onClick={() => { onApply(plan); setNote(waitsForTranscript ? "Pengaturan diterapkan. Sebagian baru terlihat setelah transkrip dipakai." : "Pengaturan diterapkan. Lihat pratinjau; bisa diurungkan."); setPlan(null); }} disabled={disabled} data-testid="edit-command-apply">Terapkan</button>
        <button type="button" className="text-button" onClick={() => { setPlan(null); setNote(""); }} data-testid="edit-command-cancel">Batal</button>
      </div>}
    </div>}
  </div>;
}
