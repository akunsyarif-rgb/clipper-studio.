"use client";

import { useEffect, useRef, useState } from "react";
import { cleanCtaText, CTA_MAX_CHARS, CTA_MIN_CLIP_SECONDS, detectLanguage, resolveCta, writeCta, type CtaSettings } from "@/lib/cta";
import { GeminiError } from "@/lib/gemini";
import { useGeminiAccess } from "./useGeminiAccess";

/**
 * The closing call to action: on by default, written from what the video says (or by the creator), shown in the last seconds of
 * every export. The AI can write a line on request; only the video's text is sent, and the creator reviews it.
 */
export default function CtaPanel({ value, onChange, content, disabled }: {
  value: CtaSettings;
  onChange: (c: CtaSettings) => void;
  /** What the current clip says, used for the automatic line and for the AI. */
  content: { text: string; title: string; hook: string };
  disabled: boolean;
}) {
  const access = useGeminiAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const auto = resolveCta({ enabled: true, text: "" }, content) ?? "";
  const shown = cleanCtaText(value.text) || auto;
  const material = [content.title, content.hook, content.text].filter(Boolean).join(". ");

  async function writeWithAi() {
    if (!access) return;
    setBusy(true); setError("");
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const line = await writeCta(material, { apiKey: access.apiKey, model: access.model, language: detectLanguage(material), signal: ctl.signal, transport: access.transport, format: access.format });
      onChange({ ...value, text: line });
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Gagal menghubungi layanan AI."); }
    finally { setBusy(false); }
  }

  return <div className="cta-panel" data-testid="cta-panel">
    <label className="cta-toggle">
      <input type="checkbox" checked={value.enabled} disabled={disabled} onChange={e => onChange({ ...value, enabled: e.target.checked })} data-testid="cta-enabled" />
      <span><strong>Tambahkan CTA di akhir video</strong><small>Muncul di beberapa detik terakhir setiap ekspor, ditulis dari isi video</small></span>
    </label>
    {value.enabled && <>
      <label className="field-label">Teks CTA
        <input value={value.text} maxLength={CTA_MAX_CHARS} disabled={disabled} onChange={e => onChange({ ...value, text: e.target.value })} placeholder={auto} data-testid="cta-text" />
      </label>
      <small className="field-hint" data-testid="cta-shown">
        {value.text.trim() ? "Teks Anda dipakai untuk semua klip." : "Kosong = otomatis dari isi tiap klip."} Dipakai sekarang: <b>{shown}</b>
      </small>
      <div className="range-tools">
        {access && <button type="button" disabled={disabled || busy || !material.trim()} onClick={() => void writeWithAi()} data-testid="cta-ai">{busy ? "Menulis…" : "Tulis dengan AI"}</button>}
        {value.text.trim() && <button type="button" disabled={disabled} onClick={() => onChange({ ...value, text: "" })} data-testid="cta-auto">Kembali ke otomatis</button>}
      </div>
      <small className="field-hint">Klip kurang dari {CTA_MIN_CLIP_SECONDS} detik tidak diberi CTA. Klip yang dikirim ke Motion juga tidak, karena videonya diedit lagi di sana.</small>
      {error && <div className="notice notice-error" role="alert" data-testid="cta-error">{error}</div>}
    </>}
  </div>;
}
