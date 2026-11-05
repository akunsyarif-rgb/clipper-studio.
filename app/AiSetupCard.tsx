"use client";

import { useEffect, useState } from "react";
import { cloud } from "@/lib/cloud";
import { isFreeModel } from "@/lib/ai-budget";
import { cleanKey, clearGeminiSettings, DEFAULT_GEMINI_MODEL, GeminiError, saveGeminiSettings } from "@/lib/gemini";
import { forgetOnServer, notifyAccessChanged, OPENROUTER_FREE_MODEL, OPENROUTER_URL, saveToServer, type Provider } from "@/lib/gemini-access";
import { allowPaidModel } from "@/lib/paid-consent";
import { isAiSkipped, setAiSkipped } from "@/lib/quick-start";
import AiModelSelect from "./AiModelSelect";
import { useGeminiAccess } from "./useGeminiAccess";

/** Brings the creator back to the AI card at the top (used by every "needs AI" hint further down). */
export function focusAiSetup() {
  const card = document.getElementById("ai-setup");
  card?.scrollIntoView({ block: "start", behavior: "smooth" });
  card?.querySelector<HTMLElement>("button, select, input")?.focus({ preventScroll: true });
}
export const SKIP_EVENT = "clipper:ai-skip";

type Choice = "free" | "own" | null;

/**
 * One place to get AI ready, with three plain choices: free AI (OpenRouter's free models, picked automatically), the creator's own
 * key, or no AI at all. When AI is ready it shows which model is in use and the model list (the same setting every AI feature uses).
 */
export default function AiSetupCard({ onSkipChange }: { onSkipChange?: (skipped: boolean) => void }) {
  const access = useGeminiAccess();
  const [choice, setChoice] = useState<Choice>(null);
  const [skipped, setSkipped] = useState(false);
  const [key, setKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [provider, setProvider] = useState<"google" | "openrouter" | "other">("google");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setSkipped(isAiSkipped()); }, []);
  useEffect(() => { setSignedIn(!!cloud.user()); return cloud.subscribe(() => setSignedIn(!!cloud.user())); }, []);

  const setSkip = (on: boolean) => { setAiSkipped(on); setSkipped(on); onSkipChange?.(on); window.dispatchEvent(new Event(SKIP_EVENT)); };

  async function save() {
    setError("");
    const apiKey = cleanKey(key);
    if (!apiKey) return setError("Kunci belum benar. Tempel seluruh kunci API, tanpa spasi.");
    if (!consent) return setError("Centang persetujuan dulu: teks naskah dikirim ke penyedia AI yang Anda pilih.");
    const useOpenAi = choice === "free" || provider !== "google";
    if (useOpenAi && !signedIn) return setError("Kunci OpenRouter dan layanan sejenis disimpan aman di akun. Masuk dulu lewat tautan “Masuk” di atas, lalu coba lagi.");
    const url = choice === "free" || provider === "openrouter" ? OPENROUTER_URL : baseUrl.trim();
    if (useOpenAi && !url) return setError("Isi alamat layanan, misalnya https://router.flatkey.ai/v1.");
    const name = choice === "free" ? OPENROUTER_FREE_MODEL : model.trim() || (provider === "google" ? DEFAULT_GEMINI_MODEL : provider === "openrouter" ? OPENROUTER_FREE_MODEL : "");
    if (useOpenAi && !name) return setError("Isi nama model dari layanan Anda.");
    setBusy(true);
    try {
      const prov: Provider = useOpenAi ? "openai" : "google";
      if (signedIn) { await saveToServer(apiKey, name, prov, url); clearGeminiSettings(); }
      else if (!saveGeminiSettings({ apiKey, model: name, consent: true })) return setError("Browser menolak menyimpan kunci di perangkat ini.");
      allowPaidModel(name);
      setKey(""); setChoice(null); setChanging(false); setSkip(false);
      notifyAccessChanged();
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Kunci gagal disimpan."); }
    finally { setBusy(false); }
  }
  async function forget() {
    setBusy(true); setError("");
    try { if (access?.where === "server") await forgetOnServer(); clearGeminiSettings(); notifyAccessChanged(); setChanging(false); }
    catch (e) { setError(e instanceof GeminiError ? e.message : "Kunci gagal dihapus."); }
    finally { setBusy(false); }
  }

  if (access === undefined) return null;
  const ready = !!access && !skipped;
  return <section id="ai-setup" className="ai-setup" data-testid="ai-setup" tabIndex={-1}>
    <div className="panel-heading"><div><small>SIAPKAN AI</small><h2>{ready ? "AI siap dipakai" : skipped ? (access ? "AI sedang dilewati" : "Tanpa AI") : "Pilih cara memakai AI"}</h2></div></div>
    {ready && !changing && <>
      <p data-testid="ai-setup-ready"><small>Memakai <b>{access!.model}</b> ({isFreeModel(access!.model) ? "gratis" : "bisa ditagih"}). Ganti model kapan saja di bawah.</small></p>
      <AiModelSelect />
      <div className="button-row"><button type="button" className="text-button" onClick={() => setChanging(true)} data-testid="ai-setup-change">Ganti kunci atau cara</button><button type="button" className="text-button" onClick={() => setSkip(true)} data-testid="ai-setup-skip-on">Lewati AI</button></div>
    </>}
    {(!ready || changing) && <>
      {skipped && access && <div className="notice" data-testid="ai-setup-saved"><small>AI Anda masih tersimpan (<b>{access.model}</b>), hanya sedang dilewati.</small> <button type="button" className="motion-primary" onClick={() => setSkip(false)} data-testid="ai-resume">Pakai AI lagi</button></div>}
      {skipped && !access && <p><small>AI dilewati: semua bisa diisi manual. Pilih salah satu di bawah bila ingin memakai AI.</small></p>}
      <div className="ai-choices" role="radiogroup" aria-label="Cara memakai AI">
        <button type="button" role="radio" aria-checked={choice === "free"} className={choice === "free" ? "active" : ""} onClick={() => { setChoice("free"); setError(""); }} data-testid="ai-choice-free"><b>Pakai AI gratis</b><small>otomatis, model gratis OpenRouter</small></button>
        <button type="button" role="radio" aria-checked={choice === "own"} className={choice === "own" ? "active" : ""} onClick={() => { setChoice("own"); setError(""); }} data-testid="ai-choice-own"><b>Pakai kunci saya</b><small>Gemini, OpenRouter, dll.</small></button>
        <button type="button" role="radio" aria-checked={skipped} className={skipped ? "active" : ""} onClick={() => { setChoice(null); setSkip(true); setChanging(false); }} data-testid="ai-choice-skip"><b>Lewati AI</b><small>isi sendiri, tanpa kunci</small></button>
      </div>
      {choice === "free" && <p><small>Butuh akun OpenRouter gratis dan masuk ke Clipper Studio. Buat kunci di openrouter.ai, tempel di bawah. Aplikasi memilih model gratis yang tersedia.</small></p>}
      {choice === "own" && <div className="field-grid">
        <label>Layanan<select value={provider} onChange={e => setProvider(e.target.value as typeof provider)} disabled={busy} data-testid="ai-provider"><option value="google">Google Gemini</option><option value="openrouter">OpenRouter</option><option value="other">Lainnya (alamat sendiri)</option></select></label>
        {provider === "other" && <label>Alamat layanan<input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://router.flatkey.ai/v1" disabled={busy} data-testid="ai-baseurl" /></label>}
        {provider !== "google" && <label>Nama model <small>(boleh kosong untuk OpenRouter)</small><input value={model} onChange={e => setModel(e.target.value)} disabled={busy} data-testid="ai-model-name" /></label>}
      </div>}
      {choice && <>
        <label>Kunci API<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} disabled={busy} data-testid="ai-key" /></label>
        <label className="check-row"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="ai-consent" /> Saya setuju teks naskah dikirim ke penyedia AI ini. Video tidak pernah dikirim.</label>
        <div className="button-row"><button type="button" onClick={() => void save()} disabled={busy} data-testid="ai-save">{busy ? "Menyimpan…" : "Simpan dan pakai"}</button>{changing && access && <button type="button" className="text-button" onClick={() => void forget()} disabled={busy} data-testid="ai-forget">Hapus kunci</button>}</div>
      </>}
    </>}
    {error && <div className="notice notice-error" role="alert" data-testid="ai-setup-error">{error}</div>}
  </section>;
}
