"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyCleanup, changedLines, cleanKey, cleanupLines, clearGeminiSettings, DEFAULT_GEMINI_MODEL, GeminiError, loadGeminiSettings, maskKey, saveGeminiSettings, wavPart,
  type GeminiSettings, type LineChange,
} from "@/lib/gemini";
import type { Transcript } from "@/lib/transcript";

/**
 * Optional clean-up of the transcript text by Gemini (bring your own key). Only the text goes out, never audio or video;
 * the key stays in this browser. Every change is shown before and after and applied per segment, with the timing kept.
 */
export default function GeminiCleanup({ transcript, language, disabled, onApply, getAudio }: {
  transcript: Transcript;
  language: "id" | "en";
  disabled: boolean;
  onApply: (next: Transcript, count: number) => void;
  /** Gives the speech of this transcript (16 kHz mono). Only used when the creator chooses to let Gemini listen. */
  getAudio?: () => Promise<Float32Array>;
}) {
  const [saved, setSaved] = useState<GeminiSettings | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audioOk, setAudioOk] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [changes, setChanges] = useState<LineChange[] | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { const s = loadGeminiSettings(); if (s) { setSaved(s); setModel(s.model); setConsent(true); } }, []);
  useEffect(() => () => abort.current?.abort(), []);

  function save() {
    const apiKey = cleanKey(keyInput);
    if (!apiKey) return setError("Kunci tidak valid. Tempel seluruh kunci API Gemini (tanpa spasi).");
    if (!consent) return setError("Centang persetujuan dulu.");
    const next = { apiKey, model: model.trim() || DEFAULT_GEMINI_MODEL, consent: true };
    if (!saveGeminiSettings(next)) return setError("Browser menolak menyimpan kunci di perangkat ini.");
    setSaved(next); setKeyInput(""); setError("");
  }
  function forget() { clearGeminiSettings(); setSaved(null); setChanges(null); setConsent(false); setKeyInput(""); setError(""); }

  async function run(withAudio: boolean) {
    if (!saved) return;
    setBusy(true); setError(""); setChanges(null);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const before = transcript.segments.map(s => s.text);
      let audio, starts;
      if (withAudio && getAudio) {
        setStage("Menyiapkan audio…");
        audio = wavPart(await getAudio());
        starts = transcript.segments.map(s => s.start);
      }
      setStage(withAudio ? "Gemini mendengarkan…" : "");
      const after = await cleanupLines(before, { apiKey: saved.apiKey, model: saved.model, language, signal: ctl.signal, audio, starts });
      const list = changedLines(before, after);
      setChanges(list);
      setAccepted(new Set(list.filter(c => !c.large).map(c => c.index)));
    } catch (e) {
      setError(e instanceof GeminiError ? e.message : "Gagal menghubungi Gemini.");
    } finally { setBusy(false); setStage(""); }
  }

  function apply() {
    if (!changes) return;
    onApply(applyCleanup(transcript, changes, accepted), accepted.size);
    setChanges(null);
  }
  const toggle = (i: number) => setAccepted(old => { const n = new Set(old); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return <details className="gemini-box">
    <summary>Rapikan transkrip dengan Gemini (opsional)</summary>
    {!saved ? <div className="gemini-setup">
      <p><small>Secara bawaan hanya teks transkrip yang dikirim ke Google; audio dikirim hanya jika Anda memilih opsi &quot;dengarkan audio&quot; di bawah, dan video tidak pernah. Kunci disimpan di browser perangkat ini saja. Gunakan kunci yang dibatasi/berkuota rendah, dan jangan menempelkannya di obrolan.</small></p>
      <label>Kunci API Gemini<input type="password" autoComplete="off" value={keyInput} onChange={e => setKeyInput(e.target.value)} data-testid="gemini-key" /></label>
      <label>Model<input value={model} onChange={e => setModel(e.target.value)} data-testid="gemini-model" /></label>
      <label className="gemini-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="gemini-consent" /> Saya setuju teks transkrip dikirim ke Google Gemini.</label>
      <button onClick={save} data-testid="gemini-save">Simpan di perangkat ini</button>
    </div> : <div className="gemini-ready">
      <p><small>Kunci {maskKey(saved.apiKey)} · model {saved.model}</small></p>
      {getAudio && <label className="gemini-consent"><input type="checkbox" checked={audioOk} onChange={e => setAudioOk(e.target.checked)} data-testid="gemini-audio-consent" /> Izinkan Gemini mendengarkan audio bagian ini (audio dikirim ke Google; maksimal 6 menit). Lebih akurat untuk nama, istilah, dan angka.</label>}
      <div className="range-tools">
        <button onClick={() => void run(false)} disabled={busy || disabled} data-testid="gemini-run">{busy ? (stage || "Merapikan…") : "Rapikan dengan Gemini"}</button>
        {getAudio && <button onClick={() => void run(true)} disabled={busy || disabled || !audioOk} data-testid="gemini-run-audio">Rapikan sambil mendengarkan audio</button>}
        {busy && <button onClick={() => abort.current?.abort()}>Batal</button>}
        <button onClick={forget} disabled={busy} data-testid="gemini-forget">Hapus kunci</button>
      </div>
    </div>}
    {error && <div className="notice notice-error" role="alert" data-testid="gemini-error">{error}</div>}
    {changes && (changes.length === 0
      ? <div className="notice" role="status" data-testid="gemini-nochange">Gemini tidak menemukan yang perlu diubah.</div>
      : <div className="gemini-changes">
        {changes.map(c => <label key={c.index} className="gemini-change" data-testid="gemini-change">
          <input type="checkbox" checked={accepted.has(c.index)} onChange={() => toggle(c.index)} />
          <span><s>{c.before}</s><br /><b>{c.after}</b>{c.large && <small> · perubahan besar, periksa dulu</small>}</span>
        </label>)}
        <div className="range-tools">
          <button onClick={apply} disabled={accepted.size === 0} data-testid="gemini-apply">Terapkan {accepted.size} perubahan</button>
          <button onClick={() => setChanges(null)}>Buang</button>
        </div>
      </div>)}
  </details>;
}
