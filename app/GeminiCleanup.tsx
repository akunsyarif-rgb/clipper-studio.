"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyCleanup, changedLines, cleanKey, cleanupLines, clearGeminiSettings, DEFAULT_GEMINI_MODEL, GeminiError, maskKey, saveGeminiSettings, wavPart,
  type LineChange,
} from "@/lib/gemini";
import { chooseModel, forgetOnServer, getAccess, listAvailableModels, OPENROUTER_URL, ROUTER_PRESETS, saveToServer, type Access, type Provider } from "@/lib/gemini-access";
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
  const [models, setModels] = useState<string[] | null>(null);
  const [provider, setProvider] = useState<Provider>("google");
  const [baseUrl, setBaseUrl] = useState<string>(OPENROUTER_URL);
  const [preset, setPreset] = useState<string>("openrouter");
  const [typedModel, setTypedModel] = useState("");
  const [note, setNote] = useState("");
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
      const name = model.trim() || (signedIn && provider === "openai" ? "" : DEFAULT_GEMINI_MODEL);
      if (signedIn) {
        if (provider === "openai" && !name) return setError("Isi nama model dulu (atau ketuk \"Cari model yang tersedia\").");
        await saveToServer(apiKey, name, provider, baseUrl); clearGeminiSettings();
      }
      else if (!saveGeminiSettings({ apiKey, model: name, consent: true })) return setError("Browser menolak menyimpan kunci di perangkat ini.");
      setKeyInput("");
      setSaved(await getAccess());
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Kunci gagal disimpan."); }
    finally { setBusy(false); }
  }
  /** Asks Google which models this key can use; if the chosen one is not among them, the best available one is taken. */
  async function findModels(auto = false) {
    setBusy(true);
    if (!auto) { setError(""); setNote(""); }
    try {
      const list = await listAvailableModels(saved, saved ? undefined : { key: keyInput, provider, baseUrl });
      if (list.length === 0) { setError("Tidak ada model Gemini yang bisa dipakai untuk kunci ini."); return; }
      setModels(list);
      if (saved) {
        if (!saved.model) setNote(`${list.length} model tersedia. Pilih salah satu di bawah.`);
        else if (!list.includes(saved.model)) { await chooseModel(saved, list[0]); setSaved(await getAccess()); setNote(`Model diganti ke ${list[0]} karena ${saved.model} tidak tersedia untuk kunci ini. Coba lagi.`); }
        else if (!auto) setNote(`Model ${saved.model} tersedia. ${list.length} model bisa dipilih.`);
      } else if (!list.includes(model)) { setModel(list[0]); setNote(`Model diisi ${list[0]}.`); }
    } catch (e) { if (!auto) setError(e instanceof GeminiError ? e.message : "Daftar model gagal diambil."); }
    finally { setBusy(false); }
  }
  async function pickModel(name: string) {
    if (!saved || name === saved.model) return;
    setBusy(true); setError(""); setNote("");
    try { await chooseModel(saved, name); setSaved(await getAccess()); setNote(`Model dipakai: ${name}.`); }
    catch (e) { setError(e instanceof GeminiError ? e.message : "Model gagal disimpan."); }
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
      const after = await cleanupLines(before, { apiKey: saved.apiKey, model: saved.model, language, signal: ctl.signal, audio, starts, transport: saved.transport, format: saved.format });
      const list = changedLines(before, after);
      setChanges(list);
      setAccepted(new Set(list.filter(c => !c.large).map(c => c.index)));
    } catch (e) {
      setError(e instanceof GeminiError ? e.message : "Gagal menghubungi Gemini.");
      // A model that no longer exists is the common cause: look up the ones that do, so the creator can pick or accept one.
      if (e instanceof GeminiError && e.kind === "model") await findModels(true);
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
      {signedIn && <label>Layanan
        <select value={provider} onChange={e => { const p = e.target.value as Provider; setProvider(p); setModels(null); setModel(p === "openai" ? "" : DEFAULT_GEMINI_MODEL); }} data-testid="gemini-provider">
          <option value="google">Google Gemini (kunci dari Google AI Studio)</option>
          <option value="openai">Router berformat OpenAI (OpenRouter, Flatkey, dll.)</option>
        </select></label>}
      {signedIn && provider === "openai" && <>
        <label>Router
          <select value={preset} onChange={e => { setPreset(e.target.value); const p = ROUTER_PRESETS.find(x => x.id === e.target.value); if (p?.url) setBaseUrl(p.url); setModels(null); }} data-testid="gemini-preset">
            {ROUTER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select></label>
        <label>Alamat dasar API<input value={baseUrl} onChange={e => { setBaseUrl(e.target.value); setPreset(ROUTER_PRESETS.find(x => x.url === e.target.value.trim())?.id ?? "other"); }} placeholder={OPENROUTER_URL} autoCapitalize="none" autoCorrect="off" data-testid="gemini-baseurl" /><small>Lihat di dokumentasi layanan Anda. Harus alamat https publik.</small></label>
      </>}
      <label>Kunci API<input type="password" autoComplete="off" value={keyInput} onChange={e => setKeyInput(e.target.value)} data-testid="gemini-key" /></label>
      <label>Model<input value={model} onChange={e => setModel(e.target.value)} data-testid="gemini-model" list="gemini-models" /></label>
      {models && <datalist id="gemini-models">{models.map(m => <option key={m} value={m} />)}</datalist>}
      <button type="button" onClick={() => void findModels()} disabled={busy || !cleanKey(keyInput)} data-testid="gemini-find">Cari model yang tersedia untuk kunci ini</button>
      <label className="gemini-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="gemini-consent" /> Saya setuju teks transkrip dikirim ke layanan AI ini ({provider === "openai" ? "lewat router pilihan Anda, lalu ke model di baliknya" : "Google Gemini"}).</label>
      <button onClick={() => void save()} disabled={busy} data-testid="gemini-save">{signedIn ? "Simpan di akun (server)" : "Simpan di perangkat ini"}</button>
    </div> : <div className="gemini-ready">
      <p data-testid="gemini-where"><small>{saved.where === "server" ? "Kunci tersimpan di akun (server), tidak ada di browser" : `Kunci ${maskKey(saved.apiKey)} di perangkat ini`} · {saved.provider === "openai" ? `layanan ${saved.baseUrl ?? ""}` : "Google Gemini"} · model {saved.model || "(belum dipilih)"}</small></p>
      {saved.provider === "openai" && <div className="range-tools"><input value={typedModel} onChange={e => setTypedModel(e.target.value)} placeholder={`nama model, mis. ${ROUTER_PRESETS.find(p => p.url === saved.baseUrl)?.modelHint ?? "nama dari layanan Anda"}`} autoCapitalize="none" autoCorrect="off" data-testid="gemini-model-manual" /><button onClick={() => void pickModel(typedModel.trim())} disabled={busy || !typedModel.trim()} data-testid="gemini-model-use">Pakai model ini</button></div>}
      {saved.where === "device" && signedIn && <div className="range-tools"><button onClick={() => void moveToServer()} disabled={busy} data-testid="gemini-move">Pindahkan kunci ke akun (server)</button></div>}
      {getAudio && <label className="gemini-consent"><input type="checkbox" checked={audioOk} onChange={e => setAudioOk(e.target.checked)} data-testid="gemini-audio-consent" /> Izinkan AI mendengarkan audio bagian ini (audio dikirim ke layanan AI; maksimal 6 menit; tidak semua router mendukung audio). Lebih akurat untuk nama, istilah, dan angka.</label>}
      <div className="range-tools">
        <button onClick={() => void run(false)} disabled={busy || disabled} data-testid="gemini-run">{busy ? (stage || "Merapikan…") : "Rapikan dengan Gemini"}</button>
        {getAudio && <button onClick={() => void run(true)} disabled={busy || disabled || !audioOk} data-testid="gemini-run-audio">Rapikan sambil mendengarkan audio</button>}
        {busy && <button onClick={() => abort.current?.abort()}>Batal</button>}
        <button onClick={() => void findModels()} disabled={busy} data-testid="gemini-find">Cari model yang tersedia</button>
        <button onClick={() => void forget()} disabled={busy} data-testid="gemini-forget">Hapus kunci</button>
      </div>
    </div>}
    {saved && models && <label>Model yang tersedia<select value={models.includes(saved.model) ? saved.model : ""} onChange={e => void pickModel(e.target.value)} disabled={busy} data-testid="gemini-model-select">
      {!models.includes(saved.model) && <option value="">Pilih model…</option>}
      {models.map(m => <option key={m} value={m}>{m}</option>)}
    </select></label>}
    {note && <div className="notice" role="status" data-testid="gemini-note">{note}</div>}
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
