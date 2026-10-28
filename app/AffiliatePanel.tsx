"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { checkClaims, DISCLOSURE_NOTE, EMPTY_BRIEF, parseBenefits, PLATFORMS, TONES, validateBrief, writeAffiliateScript, type AffiliateBrief, type AffiliateScript, type PlatformId, type Tone } from "@/lib/affiliate";
import { GeminiError } from "@/lib/gemini";
import { getAccess } from "@/lib/gemini-access";
import { useGeminiAccess } from "./useGeminiAccess";

const STORE_KEY = "clipper:affiliate:v1";

type Fields = { product: string; price: string; promo: string; platform: PlatformId; benefits: string; audience: string; tone: Tone };
const EMPTY: Fields = { product: "", price: "", promo: "", platform: EMPTY_BRIEF.platform, benefits: "", audience: "", tone: EMPTY_BRIEF.tone };

function load(): Fields {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<Fields> | null;
    if (!v || typeof v !== "object") return EMPTY;
    const s = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
    return {
      product: s(v.product, 80), price: s(v.price, 40), promo: s(v.promo, 80), audience: s(v.audience, 80), benefits: s(v.benefits, 800),
      platform: PLATFORMS.some(p => p.id === v.platform) ? v.platform as PlatformId : EMPTY.platform,
      tone: TONES.some(t => t.id === v.tone) ? v.tone as Tone : EMPTY.tone,
    };
  } catch { return EMPTY; }
}

/**
 * The affiliate mode's own place: the creator types the product's real facts; the AI writes the script only from them; a claim guard
 * checks every script (the AI's and the creator's own) against those facts and points at risky sentences. The guard
 * never blocks: it says which sentence and why, and the creator decides. The facts are kept on this device only.
 */
export default function AffiliatePanel({ script, onUseScript, onRemoveLine, onProductPhoto, onBrief, disabled }: {
  script: string;
  onUseScript: (script: string, title: string) => void;
  onRemoveLine: (index: number) => void;
  /** Puts the creator's own product photo behind the scenes that name the product; resolves with how many scenes got it. */
  onProductPhoto: (file: File, brief: AffiliateBrief) => Promise<number>;
  /** The usable brief (or null while it is incomplete), so other tools such as the AI director know this is a selling video. */
  onBrief: (brief: AffiliateBrief | null) => void;
  disabled: boolean;
}) {
  const access = useGeminiAccess();
  const [f, setF] = useState<Fields>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AffiliateScript | null>(null);
  const [feedback, setFeedback] = useState("");
  const [photoMsg, setPhotoMsg] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { setF(load()); setLoaded(true); return () => abort.current?.abort(); }, []);
  useEffect(() => { if (loaded) try { localStorage.setItem(STORE_KEY, JSON.stringify(f)); } catch { /* storage blocked: nothing is remembered */ } }, [f, loaded]);

  const brief = useMemo<AffiliateBrief>(() => ({ product: f.product.trim(), price: f.price.trim(), promo: f.promo.trim(), platform: f.platform, benefits: parseBenefits(f.benefits), audience: f.audience.trim(), tone: f.tone }), [f]);
  const problem = validateBrief(brief);
  const valid = problem === null;
  const briefKey = JSON.stringify(brief);
  useEffect(() => { onBrief(valid ? brief : null); }, [briefKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF(prev => ({ ...prev, [k]: v }));
  const lines = useMemo(() => script.replace(/\r/g, "").split("\n"), [script]);
  const findings = useMemo(() => (valid ? checkClaims(lines, brief) : []), [valid, lines, brief]);
  const draftFindings = useMemo(() => (draft && valid ? checkClaims(draft.lines, brief) : []), [draft, valid, brief]);

  async function write(withFeedback?: string) {
    const settings = await getAccess();
    if (!settings || !valid) return;
    abort.current?.abort();
    const ctl = new AbortController(); abort.current = ctl;
    setBusy(true); setError("");
    try {
      const r = await writeAffiliateScript(brief, { apiKey: settings.apiKey, model: settings.model, language: "id", signal: ctl.signal, transport: settings.transport, format: settings.format, timeoutMs: 90_000 }, withFeedback);
      setDraft(r); setFeedback("");
    } catch (e) { if (!ctl.signal.aborted) setError(e instanceof GeminiError ? e.message : "Gagal menghubungi layanan AI."); }
    finally { setBusy(false); }
  }

  async function photo(file: File | undefined) {
    if (!file) return;
    setPhotoMsg("");
    try {
      const n = await onProductPhoto(file, brief);
      setPhotoMsg(n > 0 ? `Foto produk dipasang di ${n} scene (yang menyebut produk dan scene terakhir). Hapus per scene di daftar scene bila perlu.` : "Belum ada scene untuk dipasangi foto.");
    } catch (e) { setPhotoMsg(e instanceof Error ? e.message : "Foto gagal dipasang."); }
  }

  const draftLineFlags = (i: number) => draftFindings.filter(x => x.line === i);

  return <div className="ai-director affiliate-panel affiliate-only" data-testid="affiliate-panel">
    <b>Data produk</b>
    <small>Isi hanya fakta yang benar. AI hanya boleh memakai data ini, dan pemeriksa klaim memeriksa naskah terhadapnya. Data disimpan di perangkat ini saja.</small>
    <label className="field-label" htmlFor="aff-product">Nama produk</label>
    <input id="aff-product" data-testid="aff-product" value={f.product} maxLength={80} onChange={e => set("product", e.target.value)} placeholder="mis. Botol Minum Termos Aqualux 750 ml" />
    <div className="field-row">
      <div><label className="field-label" htmlFor="aff-price">Harga (opsional)</label><input id="aff-price" data-testid="aff-price" value={f.price} maxLength={40} onChange={e => set("price", e.target.value)} placeholder="mis. Rp 89.000" /></div>
      <div><label className="field-label" htmlFor="aff-promo">Promo nyata (opsional)</label><input id="aff-promo" data-testid="aff-promo" value={f.promo} maxLength={80} onChange={e => set("promo", e.target.value)} placeholder="mis. Diskon 10% sampai akhir bulan" /></div>
    </div>
    <label className="field-label" htmlFor="aff-benefits">Manfaat dan fakta nyata <span className="field-hint">satu per baris, maks. 5</span></label>
    <textarea id="aff-benefits" data-testid="aff-benefits" rows={4} value={f.benefits} onChange={e => set("benefits", e.target.value)} placeholder={"Menjaga air tetap dingin 12 jam\nBahan stainless steel anti karat"} />
    <div className="field-row">
      <div><label className="field-label" htmlFor="aff-platform">Platform</label>
        <select id="aff-platform" data-testid="aff-platform" value={f.platform} onChange={e => set("platform", e.target.value as PlatformId)}>{PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
      <div><label className="field-label" htmlFor="aff-tone">Gaya bicara</label>
        <select id="aff-tone" data-testid="aff-tone" value={f.tone} onChange={e => set("tone", e.target.value as Tone)}>{TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
    </div>
    <label className="field-label" htmlFor="aff-audience">Target penonton (opsional)</label>
    <input id="aff-audience" data-testid="aff-audience" value={f.audience} maxLength={80} onChange={e => set("audience", e.target.value)} placeholder="mis. pekerja kantoran" />

    {access === null
      ? <small data-testid="aff-needs-key"><b>Belum ada kunci AI.</b> Masuk ke akun dan simpan kunci OpenRouter agar AI bisa menulis naskah. Pemeriksa klaim tetap jalan tanpa kunci.</small>
      : <div className="range-tools">
        <button onClick={() => void write()} disabled={busy || disabled || !valid || access === undefined} data-testid="aff-write">{busy && !draft ? "AI menulis…" : "Tulis naskah dengan AI"}</button>
        {!valid && f.product.trim() !== "" && <small data-testid="aff-problem">{problem}</small>}
      </div>}
    {error && <div className="notice notice-error" role="alert" data-testid="aff-error">{error}</div>}

    {draft && <div className="aff-draft" data-testid="aff-draft">
      <b>Usulan naskah{draft.title ? `: ${draft.title}` : ""}</b>
      <ol>
        {draft.lines.map((l, i) => <li key={i} data-testid="aff-draft-line" className={draftLineFlags(i).length ? "flagged" : undefined}>
          {l}
          {draftLineFlags(i).map((x, k) => <small key={k} className="aff-flag">⚠ “{x.match}”: {x.reason}</small>)}
        </li>)}
      </ol>
      <small>{draftFindings.length ? `${draftFindings.length} hal perlu diperiksa sebelum dipakai (tanda ⚠). Anda bisa memakainya lalu menghapus atau mengubah kalimatnya, atau minta AI menulis ulang.` : "Tidak ada klaim berisiko yang terdeteksi pada usulan ini."}</small>
      <div className="range-tools">
        <button onClick={() => { onUseScript(draft.lines.join("\n"), draft.title); setDraft(null); }} disabled={busy || disabled} data-testid="aff-use">Pakai naskah ini</button>
        <button onClick={() => setDraft(null)} className="text-link" data-testid="aff-discard">Buang</button>
      </div>
      <textarea rows={2} value={feedback} onChange={e => setFeedback(e.target.value)} maxLength={300} disabled={busy} data-testid="aff-feedback" placeholder="Masukan untuk ditulis ulang, mis. lebih singkat, hook lebih kuat" aria-label="Masukan untuk naskah affiliate" />
      <div className="range-tools"><button onClick={() => void write(feedback)} disabled={busy || disabled || feedback.trim() === ""} data-testid="aff-regenerate">{busy ? "AI menulis…" : "Tulis ulang dengan masukan"}</button></div>
    </div>}

    {valid && <div className="aff-guard" data-testid="aff-guard">
      <b>Pemeriksa klaim untuk naskah saat ini</b>
      {findings.length === 0
        ? <small data-testid="aff-guard-ok">Tidak ada klaim berisiko yang terdeteksi. Pemeriksa ini otomatis (daftar kata dan angka), bukan nasihat hukum dan tidak menggantikan penilaian Anda atau aturan platform.</small>
        : <ul>{findings.map((x, i) => <li key={i} data-testid="aff-finding">
          <span>Baris {x.line + 1}: “{x.text}”</span>
          <small className="aff-flag">⚠ “{x.match}”: {x.reason}</small>
          <button type="button" className="text-link" disabled={disabled} onClick={() => onRemoveLine(x.line)} data-testid="aff-remove">Hapus baris ini</button>
        </li>)}</ul>}
      <small>Kalau suatu klaim memang benar dan ada buktinya, tulis juga di data produk di atas (Promo/Manfaat) agar tidak ditandai; klaim kesehatan tetap ditandai.</small>
    </div>}

    {valid && <div className="aff-photo">
      <label className="text-link">Pasang foto produk saya
        <input type="file" accept="image/*" hidden disabled={disabled} data-testid="aff-photo-input" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void photo(file); }} />
      </label>
      <small>Foto produk Anda sendiri paling cocok untuk affiliate. Foto stok (Pexels) mengisi scene lain.</small>
      {photoMsg && <small role="status" data-testid="aff-photo-msg">{photoMsg}</small>}
    </div>}
    <small className="aff-note" data-testid="aff-disclosure">{DISCLOSURE_NOTE}</small>
  </div>;
}
