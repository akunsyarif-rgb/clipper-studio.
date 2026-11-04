"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buildCinematic, GENRES, GENRE_IDS, normalizeBrief, type CinePlan, type Genre } from "@/lib/cinematic";
import { MAX_COMMAND_CHARS, planFromCommand, type Visual } from "@/lib/command-agent";
import { aiUsage } from "@/lib/gemini";
import { getAccess } from "@/lib/gemini-access";
import { isPaidAllowed } from "@/lib/paid-consent";
import { isAiSkipped, QUICK_EXAMPLES, summarizePlan } from "@/lib/quick-start";
import AiBusy from "./AiBusy";
import AiErrorNotice, { toAiError, type AiError } from "./AiErrorNotice";
import { focusAiSetup, SKIP_EVENT } from "./AiSetupCard";
import { useGeminiAccess } from "./useGeminiAccess";

type Stage = "write" | "plan" | "preview";

/**
 * "Mulai Cepat": three steps for someone new. 1) say what video you want (or tap an example), 2) read the plan in plain words and
 * press Setuju, 3) look at the preview and press Render. Everything else stays in "Pengaturan lanjutan". Nothing changes in the
 * studio until Setuju; the plan comes from the same command agent and storyboard builder as the Cinematic Studio.
 */
export default function QuickStart({ onApply, preview, onRender, onCancelRender, rendering, progress, result, renderError, blocker, onOpenAdvanced }: {
  onApply: (plan: CinePlan, visuals?: Visual[]) => void;
  /** The studio's own preview player (null while there is nothing to show). */
  preview: ReactNode;
  onRender: () => void;
  onCancelRender: () => void;
  rendering: boolean;
  progress: number;
  result: { url: string; name: string; size: number } | null;
  renderError: string;
  blocker: string;
  onOpenAdvanced: () => void;
}) {
  const access = useGeminiAccess();
  const [skipped, setSkipped] = useState(false);
  const [stage, setStage] = useState<Stage>("write");
  const [command, setCommand] = useState("");
  const [form, setForm] = useState({ genre: "produk" as Genre, product: "", tagline: "", cta: "", seconds: 30 });
  const [plan, setPlan] = useState<CinePlan | null>(null);
  const [visuals, setVisuals] = useState<Visual[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiErr, setAiErr] = useState<AiError | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { const sync = () => setSkipped(isAiSkipped()); sync(); window.addEventListener(SKIP_EVENT, sync); return () => { window.removeEventListener(SKIP_EVENT, sync); abort.current?.abort(); }; }, []);

  const useAi = !!access && !skipped;
  async function makePlan() {
    setError(""); setAiErr(null);
    if (!useAi) {
      if (!form.product.trim()) return setError("Tulis dulu tentang apa videonya.");
      setPlan(buildCinematic(normalizeBrief({ genre: form.genre, product: form.product, tagline: form.tagline, cta: form.cta, features: [], seconds: form.seconds })));
      setVisuals([]); setStage("plan");
      return;
    }
    const settings = await getAccess();
    if (!settings) { focusAiSetup(); return setError("Belum ada AI. Pilih cara memakai AI di kartu di atas."); }
    if (!isPaidAllowed(settings.model)) { focusAiSetup(); return setError(`Model ${settings.model} bisa ditagih. Pilih model itu di daftar model pada kartu “Siapkan AI” di atas bila Anda memang ingin memakainya.`); }
    setBusy(true);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const out = await planFromCommand(command, { apiKey: settings.apiKey, model: settings.model, language: "id", signal: ctl.signal, transport: settings.transport, format: settings.format });
      setPlan(out.plan); setVisuals(out.visuals); setStage("plan");
    } catch (e) {
      if (ctl.signal.aborted) setError("Dibatalkan. Tidak ada yang berubah."); else setAiErr(toAiError(e, "Gagal menghubungi AI."));
    } finally { setBusy(false); }
  }
  const summary = plan ? summarizePlan(plan, { autoPictures: visuals.length > 0 }) : null;
  const step = stage === "write" ? 1 : stage === "plan" ? 2 : 3;
  return <section className="quick-start" data-testid="quick-start">
    <ol className="quick-steps" aria-label="Langkah">
      {["Tulis keinginan", "Periksa rencana", "Pratinjau dan render"].map((t, i) => <li key={t} className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""} aria-current={step === i + 1 ? "step" : undefined}><b>{i + 1}</b> {t}</li>)}
    </ol>

    {stage === "write" && <div data-testid="quick-step-1">
      <h2>Video apa yang ingin Anda buat?</h2>
      {useAi ? <>
        <label className="field-label" htmlFor="quick-command">Ceritakan dengan kalimat biasa <span className="field-hint">atau ketuk salah satu contoh</span></label>
        <textarea id="quick-command" rows={3} value={command} maxLength={MAX_COMMAND_CHARS} onChange={e => setCommand(e.target.value)} placeholder="Contoh: video produk kopi susu 30 detik, suasana hangat, ajak orang memesan" data-testid="quick-command" />
      </> : null}
      <div className="quick-examples" role="group" aria-label="Contoh">
        {QUICK_EXAMPLES.map(x => <button key={x.id} type="button" className="quick-example" onClick={() => { if (useAi) setCommand(x.prompt); else setForm(f => ({ ...f, genre: x.id, ...x.form })); }} data-testid={"quick-example-" + x.id}><b>{x.label}</b><small>{x.hint}</small></button>)}
      </div>
      {!useAi && <div className="field-grid" data-testid="quick-manual">
        <p><small>Tanpa AI: isi tiga kolom ini, aplikasi menyusun rencananya sendiri.</small></p>
        <label>Jenis<select value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value as Genre }))} data-testid="quick-genre">{GENRE_IDS.map(g => <option key={g} value={g}>{GENRES[g].label}</option>)}</select></label>
        <label>{GENRES[form.genre].subject}<input value={form.product} maxLength={60} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} data-testid="quick-product" /></label>
        <label>{GENRES[form.genre].tagline}<input value={form.tagline} maxLength={100} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} data-testid="quick-tagline" /></label>
        <label>{GENRES[form.genre].cta}<input value={form.cta} maxLength={80} onChange={e => setForm(f => ({ ...f, cta: e.target.value }))} data-testid="quick-cta" /></label>
        <label>Durasi<select value={form.seconds} onChange={e => setForm(f => ({ ...f, seconds: Number(e.target.value) }))} data-testid="quick-seconds">{[15, 30, 45, 60].map(n => <option key={n} value={n}>{n} detik</option>)}</select></label>
      </div>}
      <div className="button-row"><button type="button" className="motion-primary" onClick={() => void makePlan()} disabled={busy || (useAi && command.trim().length < 8)} data-testid="quick-plan">{busy ? "Menyusun rencana…" : "Buat rencana"}</button></div>
      <AiBusy busy={busy} label="AI menyusun rencana" onCancel={() => abort.current?.abort()} />
      <AiErrorNotice error={aiErr} onRetry={() => void makePlan()} onDismiss={() => setAiErr(null)} testId="quick-ai-error" />
      {error && <div className="notice notice-error" role="alert" data-testid="quick-error">{error}</div>}
    </div>}

    {stage === "plan" && plan && summary && <div data-testid="quick-step-2">
      <h2>Rencana video: {summary.headline}</h2>
      <ul className="quick-facts">{summary.facts.map(f => <li key={f}>{f}</li>)}</ul>
      <ol className="quick-scenes" data-testid="quick-scenes">{summary.scenes.map((s, i) => <li key={i}><span>{s.text}</span> <small>{s.seconds} dtk</small></li>)}</ol>
      <p><small>Belum ada yang diubah. Tekan Setuju untuk memakai rencana ini; Anda tetap bisa mengubah apa pun di Pengaturan lanjutan. Permintaan AI sesi ini: {aiUsage.requests}.</small></p>
      <div className="button-row">
        <button type="button" className="motion-primary" onClick={() => { onApply(plan, visuals.length ? visuals : undefined); setStage("preview"); }} data-testid="quick-approve">Setuju</button>
        <button type="button" className="text-button" onClick={() => setStage("write")} data-testid="quick-back">Ubah perintah</button>
      </div>
    </div>}

    {stage === "preview" && <div data-testid="quick-step-3">
      <h2>Lihat hasilnya, lalu render</h2>
      <div className="quick-preview" data-testid="quick-preview">{preview ?? <p className="player-empty">{blocker || "Menyiapkan pratinjau…"}</p>}</div>
      {blocker && <p className="field-error" role="alert" data-testid="quick-blocker">{blocker}</p>}
      <div className="button-row">
        {rendering
          ? <button type="button" className="motion-cancel" onClick={onCancelRender} data-testid="quick-cancel">Batalkan render</button>
          : <button type="button" className="motion-primary" onClick={onRender} disabled={!!blocker} data-testid="quick-render">Render</button>}
        <button type="button" className="text-button" onClick={() => setStage("write")} disabled={rendering} data-testid="quick-redo">Buat rencana lain</button>
        <button type="button" className="text-button" onClick={onOpenAdvanced} data-testid="quick-open-advanced">Ubah detail</button>
      </div>
      {rendering && <div className="render-progress" data-testid="quick-progress"><div><span>Merender di perangkat Anda. Jangan tutup layar…</span><b>{progress}%</b></div><i><em style={{ width: progress + "%" }} /></i></div>}
      {renderError && <p className="field-error" role="alert" data-testid="quick-render-error">{renderError}</p>}
      {result && <div className="render-result" data-testid="quick-result"><b>✓ Video siap</b><small>{(result.size / 1024 ** 2).toFixed(1)} MB</small><a className="motion-primary" href={result.url} download={result.name} data-testid="quick-download">Unduh MP4</a><small>Simpan ke Library dan buat judul serta tagar ada di Pengaturan lanjutan.</small></div>}
    </div>}
  </section>;
}
