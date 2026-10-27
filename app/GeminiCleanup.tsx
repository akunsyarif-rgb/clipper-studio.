"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyCleanup, changedLines, cleanKey, cleanupLines, clearGeminiSettings, DEFAULT_GEMINI_MODEL, GeminiError, maskKey, saveGeminiSettings, wavPart,
  type LineChange,
} from "@/lib/gemini";
import { forgetOnServer, getAccess, saveToServer, type Access } from "@/lib/gemini-access";
import { cloud } from "@/lib/cloud";
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
  const [saved, setSaved] = useState<Access | null>(null);
  const [signedIn, setSignedIn] = useState(false);
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

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      setSignedIn(!!cloud.user());
      const a = await getAccess();
      if (!alive) return;
      setSaved(a);
      if (a) { setModel(a.model); setConsent(true); }
    };
    void refresh();
    const off = cloud.subscribe(() => void refresh());
    return () => { alive = false; off(); };
  }, []);
  useEffect(() => () => abort.current?.abort(), []);

  async function save() {
    const apiKey = cleanKey(keyInput);
    if (!apiKey) return setError("Kunci tidak valid. Tempel seluruh kunci API Gemini (tanpa spasi).");
    if (!consent) return setError("Centang persetujuan dulu.");
    setBusy(true); setError("");
    try {
      const name = model.trim() || DEFAULT_GEMINI_MODEL;
      if (signedIn) { await saveToServer(apiKey, name); clearGeminiSettings(); }
      else if (!saveGeminiSettings({ apiKey, model: name, consent: true })) return setError("Browser menolak menyimpan kunci di perangkat ini.");
      setKeyInput("");
      setSaved(await getAccess());
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Kunci gagal disimpan."); }
    finally { setBusy(false); }
  }
  /** Moves a key kept in this browser to the account's server, then removes it from the browser. */
  async function moveToServer() {
    if (!saved || saved.where !== "device") return;
    setBusy(true); setError("");
    try { await saveToServer(saved.apiKey, saved.model); clearGeminiSettings(); setSaved(await getAccess()); }
    catch (e) { setError(e instanceof GeminiError ? e.message : "Kunci gagal dipindahkan."); }
    finally { setBusy(false); }
  }
  async function forget() {
    setBusy(true); setError("");
    try {
      if (saved?.where === "server") await forgetOnServer();
      clearGeminiSettings();
      setSaved(await getAccess()); setChanges(null); setKeyInput("");
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Kunci gagal dihapus."); }
    finally { setBusy(false); }
  }

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
      const after = await cleanupLines(before, { apiKey: saved.apiKey, model: saved.model, language, signal: ctl.signal, audio, starts, transport: saved.transport });
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
      <p><small>Secara bawaan hanya teks transkrip yang dikirim ke Google; audio dikirim hanya jika Anda memilih opsi &quot;dengarkan audio&quot; di bawah, dan video tidak pernah. {signedIn ? "Kunci disimpan di server akun Anda, bukan di browser, jadi berlaku di semua perangkat." : "Kunci disimpan di browser perangkat ini saja; masuk ke akun untuk menyimpannya di server."} Gunakan kunci yang dibatasi/berkuota rendah, dan jangan menempelkannya di obrolan.</small></p>
      <label>Kunci API Gemini<input type="password" autoComplete="off" value={keyInput} onChange={e => setKeyInput(e.target.value)} data-testid="gemini-key" /></label>
      <label>Model<input value={model} onChange={e => setModel(e.target.value)} data-testid="gemini-model" /></label>
      <label className="gemini-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="gemini-consent" /> Saya setuju teks transkrip dikirim ke Google Gemini.</label>
      <button onClick={() => void save()} disabled={busy} data-testid="gemini-save">{signedIn ? "Simpan di akun (server)" : "Simpan di perangkat ini"}</button>
    </div> : <div className="gemini-ready">
      <p data-testid="gemini-where"><small>{saved.where === "server" ? "Kunci tersimpan di akun (server), tidak ada di browser" : `Kunci ${maskKey(saved.apiKey)} di perangkat ini`} · model {saved.model}</small></p>
      {saved.where === "device" && signedIn && <div className="range-tools"><button onClick={() => void moveToServer()} disabled={busy} data-testid="gemini-move">Pindahkan kunci ke akun (server)</button></div>}
      {getAudio && <label className="gemini-consent"><input type="checkbox" checked={audioOk} onChange={e => setAudioOk(e.target.checked)} data-testid="gemini-audio-consent" /> Izinkan Gemini mendengarkan audio bagian ini (audio dikirim ke Google; maksimal 6 menit). Lebih akurat untuk nama, istilah, dan angka.</label>}
      <div className="range-tools">
        <button onClick={() => void run(false)} disabled={busy || disabled} data-testid="gemini-run">{busy ? (stage || "Merapikan…") : "Rapikan dengan Gemini"}</button>
        {getAudio && <button onClick={() => void run(true)} disabled={busy || disabled || !audioOk} data-testid="gemini-run-audio">Rapikan sambil mendengarkan audio</button>}
        {busy && <button onClick={() => abort.current?.abort()}>Batal</button>}
        <button onClick={() => void forget()} disabled={busy} data-testid="gemini-forget">Hapus kunci</button>
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
