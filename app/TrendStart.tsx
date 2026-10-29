"use client";

import { useEffect, useRef, useState } from "react";
import { GeminiError } from "@/lib/gemini";
import { getAccess } from "@/lib/gemini-access";
import { SEO_PLATFORMS } from "@/lib/seo";
import { addTrendChip, EMPTY_TREND, TREND_CHIPS, TREND_GOALS, trendProblem, writeTrendIdeas, type TrendBrief, type TrendIdea } from "@/lib/trend";
import { useGeminiAccess } from "./useGeminiAccess";

const STORE_KEY = "clipper:trend:v1";

function load(): TrendBrief {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<TrendBrief> | null;
    if (!v || typeof v !== "object") return EMPTY_TREND;
    const s = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
    return {
      niche: s(v.niche, 160), audience: s(v.audience, 200), trend: s(v.trend, 300),
      platform: SEO_PLATFORMS.some(p => p.id === v.platform) ? v.platform! : EMPTY_TREND.platform,
      goal: TREND_GOALS.some(g => g.id === v.goal) ? v.goal! : EMPTY_TREND.goal,
    };
  } catch { return EMPTY_TREND; }
}

/**
 * "Mulai dari tren": the first step of a video. The creator names the platform, niche and the trend or season they saw; the AI
 * (their own key) proposes three different angles with a hook and a script each. Choosing one fills the script and title and
 * hands the same platform, niche, audience and trend note to the SEO pack, so distribution is planned from the start.
 * The AI has no live trend data: the trend text is the creator's, and the panel says so.
 */
export default function TrendStart({ onUse, disabled }: {
  onUse: (script: string, title: string, brief: TrendBrief) => void;
  disabled: boolean;
}) {
  const access = useGeminiAccess();
  const [f, setF] = useState<TrendBrief>(EMPTY_TREND);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ideas, setIdeas] = useState<TrendIdea[]>([]);
  const [feedback, setFeedback] = useState("");
  const [used, setUsed] = useState(-1);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { setF(load()); setLoaded(true); return () => abort.current?.abort(); }, []);
  useEffect(() => { if (loaded) try { localStorage.setItem(STORE_KEY, JSON.stringify(f)); } catch { /* storage blocked: nothing is remembered */ } }, [f, loaded]);

  const problem = trendProblem(f);
  const set = <K extends keyof TrendBrief>(k: K, v: TrendBrief[K]) => setF(prev => ({ ...prev, [k]: v }));

  async function write(withFeedback: boolean) {
    if (problem) { setError(problem); return; }
    const settings = await getAccess();
    if (!settings) return;
    setBusy(true); setError(""); setUsed(-1);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const out = await writeTrendIdeas(f, { apiKey: settings.apiKey, model: settings.model, language: "id", signal: ctl.signal, transport: settings.transport, format: settings.format, timeoutMs: 90_000 }, withFeedback ? feedback : undefined);
      setIdeas(out);
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Gagal menghubungi layanan AI."); }
    finally { setBusy(false); }
  }

  if (access === undefined) return null;
  const platformLabel = SEO_PLATFORMS.find(p => p.id === f.platform)?.label;
  return (
    <details className="fold trend-start normal-only" data-testid="fold-trend">
      <summary><b>0 · Mulai dari tren</b> <small>{ideas.length ? `${ideas.length} ide · ${platformLabel}` : "ide dan naskah dari tren yang sedang Anda lihat"}</small></summary>
      <small className="field-hint">Pilih platform, tulis tren atau musim yang Anda lihat, dan AI mengusulkan tiga sudut berbeda lengkap dengan hook dan naskah. AI tidak punya data tren langsung: hanya tren yang Anda tulis yang dipakai. Hanya teks di kolom ini yang dikirim ke layanan AI Anda. Periksa fakta sebelum tayang.</small>
      <div className="option-grid seo-platforms" role="group" aria-label="Platform tujuan">
        {SEO_PLATFORMS.map(p => <button key={p.id} type="button" className={"option " + (f.platform === p.id ? "active" : "")} aria-pressed={f.platform === p.id} onClick={() => set("platform", p.id)} data-testid={"trend-platform-" + p.id}><strong>{p.label}</strong></button>)}
      </div>
      <label className="field-label">Niche / topik<input value={f.niche} maxLength={160} onChange={e => set("niche", e.target.value)} placeholder="Contoh: tips freelance, resep hemat, olahraga rumahan" data-testid="trend-niche" /></label>
      <label className="field-label">Tren / musim yang Anda lihat<input value={f.trend} maxLength={300} onChange={e => set("trend", e.target.value)} placeholder="Contoh: banyak yang bahas gajian cepat habis, challenge 30 hari" data-testid="trend-text" /></label>
      <div className="chip-row" role="group" aria-label="Musim dan momen">
        {TREND_CHIPS.map(c => <button key={c} type="button" className="chip" onClick={() => set("trend", addTrendChip(f.trend, c))} data-testid={"trend-chip-" + c.replace(/\s+/g, "-").toLowerCase()}>+ {c}</button>)}
      </div>
      <label className="field-label">Target audiens <span className="field-hint">opsional</span><input value={f.audience} maxLength={200} onChange={e => set("audience", e.target.value)} placeholder="Contoh: pekerja muda 22-30 tahun, Jakarta" data-testid="trend-audience" /></label>
      <div className="seg three" role="radiogroup" aria-label="Tujuan konten">
        {TREND_GOALS.map(g => <button key={g.id} role="radio" aria-checked={f.goal === g.id} className={f.goal === g.id ? "active" : ""} onClick={() => set("goal", g.id)} title={g.hint} data-testid={"trend-goal-" + g.id}>{g.label}</button>)}
      </div>
      {access === null
        ? <small data-testid="trend-needs-key"><b>Belum ada kunci AI.</b> Masuk ke akun lalu simpan kunci di panel AI (atau masukkan di panel transkrip di perangkat ini).</small>
        : <div className="range-tools"><button onClick={() => void write(false)} disabled={busy || disabled || !!problem} data-testid="trend-write">{busy ? "AI menulis…" : ideas.length ? "Buat ide baru" : "Buat 3 ide"}</button></div>}
      {problem && !busy && access ? <small className="field-hint" data-testid="trend-problem">{problem}</small> : null}
      {error && <div className="notice notice-error" role="alert" data-testid="trend-error">{error}</div>}
      {ideas.length > 0 && <div data-testid="trend-ideas">
        {ideas.map((idea, i) => (
          <div className="seo-card" key={i} data-testid="trend-idea">
            <div className="seo-card-head"><b>{idea.angle}</b>
              <button type="button" className="text-link" disabled={disabled} onClick={() => { onUse(idea.lines.join("\n"), idea.title, f); setUsed(i); }} data-testid="trend-use">{used === i ? "Dipakai ✓" : "Pakai ide ini"}</button>
            </div>
            <p className="seo-text"><b>{idea.title}</b></p>
            <p className="seo-text" data-testid="trend-hook">Hook: {idea.hook}</p>
            {idea.whyFits ? <small className="field-hint">{idea.whyFits}</small> : null}
            <details><summary>Naskah ({idea.lines.length} scene)</summary><ol className="seo-list">{idea.lines.map((l, j) => <li key={j}>{l}</li>)}</ol></details>
          </div>
        ))}
        {access && <div className="range-tools">
          <input value={feedback} maxLength={300} onChange={e => setFeedback(e.target.value)} placeholder="Masukan, mis. lebih santai atau lebih singkat" aria-label="Masukan untuk ide baru" data-testid="trend-feedback" />
          <button type="button" onClick={() => void write(true)} disabled={busy || disabled || !feedback.trim()} data-testid="trend-rewrite">Tulis ulang dengan masukan</button>
        </div>}
        {used >= 0 && <small className="field-hint" data-testid="trend-used-note">Naskah dan judul sudah masuk ke langkah 1. Paket SEO &amp; distribusi memakai platform, niche, audiens, dan tren yang sama; buka setelah video siap.</small>}
      </div>}
    </details>
  );
}
