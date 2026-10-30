"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeminiError } from "@/lib/gemini";
import { getAccess } from "@/lib/gemini-access";
import { makeSeoPack, SEO_PLATFORMS, seoProblem, seoToJson, seoToText, type SeoPlatform, type SeoResult } from "@/lib/seo";
import { buildCoverPrompt } from "@/lib/cover-prompt";
import { useGeminiAccess } from "./useGeminiAccess";

/** Copies text; falls back to a hidden textarea where the clipboard API is missing (older Safari, insecure pages). */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* try the fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/**
 * "Paket SEO & distribusi": the AI (the creator's own key) writes the platform's text for the finished video: hook, caption,
 * hashtags, title and so on, each in its own card with a copy button, plus a readiness score and one quick fix. Only text is sent
 * (the script, topic, audience and the trend note the creator typed); the AI has no live trend data and says nothing about
 * what is "viral now" unless the creator wrote it.
 */
export type SeoSeed = { platform: SeoPlatform; niche: string; audience: string; trends: string; nonce: number };

export default function SeoPanel({ transcript, topic, language, seed, stored, storedId, onResult }: { transcript: string; topic: string; language: "id" | "en"; /** Packs already made for this video (from the history), shown again when its id (`storedId`) comes back. */ stored?: Partial<Record<SeoPlatform, { at: number; result: SeoResult }>>; storedId?: string; /** Every new pack, so the history keeps it. */ onResult?: (platform: SeoPlatform, result: SeoResult) => void; /** Filled by "Mulai dari tren": applied once per nonce, the creator can still edit every field. */ seed?: SeoSeed | null }) {
  const access = useGeminiAccess();
  const [platform, setPlatform] = useState<SeoPlatform>("tiktok");
  const [niche, setNiche] = useState(topic);
  const [nicheTouched, setNicheTouched] = useState(false);
  const [audience, setAudience] = useState("");
  const [trends, setTrends] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Partial<Record<SeoPlatform, SeoResult>>>({});
  const [copied, setCopied] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const seeded = useRef(false);
  // Another video's script must never show the previous video's packs: they follow the video, and come back with it.
  useEffect(() => {
    if (storedId === undefined) return;
    const next: Partial<Record<SeoPlatform, SeoResult>> = {};
    for (const [k, v] of Object.entries(stored ?? {})) if (v) next[k as SeoPlatform] = v.result;
    setResults(next); setError("");
  }, [storedId, stored]);
  useEffect(() => {
    if (!seed) return;
    seeded.current = true; setPlatform(seed.platform); setNiche(seed.niche); setNicheTouched(true); setAudience(seed.audience); setTrends(seed.trends); setError("");
  }, [seed?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  // The topic follows the video's title until the creator types their own.
  useEffect(() => { if (!nicheTouched && !seeded.current) setNiche(topic); }, [topic, nicheTouched]);

  const result = results[platform];
  // The plain cover prompt is built in code from the content, so it is there before (and without) any AI call.
  const cover = useMemo(() => buildCoverPrompt({ topic: niche, title: topic, transcript, platform, audience }), [niche, topic, transcript, platform, audience]);
  const problem = seoProblem({ transcript, platform });

  async function run() {
    if (problem) { setError(problem); return; }
    const settings = await getAccess();
    if (!settings) return;
    setBusy(true); setError("");
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const pack = await makeSeoPack({ topic: niche, transcript, platform, audience, trends }, { apiKey: settings.apiKey, model: settings.model, language, signal: ctl.signal, transport: settings.transport, format: settings.format, timeoutMs: 90_000 });
      setResults(prev => ({ ...prev, [platform]: pack })); onResult?.(platform, pack);
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Gagal menghubungi layanan AI."); }
    finally { setBusy(false); }
  }

  async function copy(id: string, text: string) {
    const ok = await copyText(text);
    setCopied(ok ? id : `gagal:${id}`);
    setTimeout(() => setCopied(c => (c === id || c === `gagal:${id}` ? "" : c)), 1800);
  }

  if (access === undefined) return null;
  const tone = result ? (result.score >= 80 ? "baik" : result.score >= 60 ? "cukup" : "rendah") : "";
  return (
    <details className="fold seo-panel" data-testid="fold-seo">
      <summary><b>Paket SEO &amp; distribusi</b> <small>{result ? `${SEO_PLATFORMS.find(p => p.id === platform)?.label} · skor ${result.score}/100` : "caption, hashtag, judul, dan hook per platform"}</small></summary>
      <small className="field-hint">AI menulis teks tayang yang cocok dengan aturan tiap platform dari naskah video ini. Hanya teks yang dikirim ke layanan AI Anda (naskah, topik, audiens, dan catatan tren); video dan audio tidak dikirim. AI tidak punya data tren langsung: tulis tren atau musim yang Anda tahu di kolom tren.</small>
      <div className="option-grid seo-platforms" role="group" aria-label="Platform tujuan">
        {SEO_PLATFORMS.map(p => <button key={p.id} type="button" className={"option " + (platform === p.id ? "active" : "")} aria-pressed={platform === p.id} onClick={() => { setPlatform(p.id); setError(""); }} data-testid={"seo-platform-" + p.id}><strong>{p.label}</strong>{results[p.id] ? <small>skor {results[p.id]!.score}</small> : null}</button>)}
      </div>
      <label className="field-label">Niche / topik<input value={niche} maxLength={160} onChange={e => { setNiche(e.target.value); setNicheTouched(true); }} placeholder="Contoh: disiplin pagi, resep sehat, tips freelance" data-testid="seo-topic" /></label>
      <label className="field-label">Target audiens dan lokasi<input value={audience} maxLength={200} onChange={e => setAudience(e.target.value)} placeholder="Contoh: pekerja muda 22-30 tahun, Jakarta" data-testid="seo-audience" /></label>
      <label className="field-label">Konteks / tren / musim <span className="field-hint">opsional, tulis sendiri</span><input value={trends} maxLength={300} onChange={e => setTrends(e.target.value)} placeholder="Contoh: Ramadan, tahun ajaran baru, diskon 11.11" data-testid="seo-trends" /></label>
      <div className="seo-card" data-testid="cover-section">
        <div className="seo-card-head"><b>Prompt foto sampul</b>
          <small>{cover.aspect.ratio} · {cover.aspect.size} · {cover.aspect.use}</small>
        </div>
        <small className="field-hint">Selalu tersedia, disusun dari isi video ini. Buat gambarnya di alat lain; teks judul ditambahkan di editor video, bukan di gambar. {result?.cards.some(c => c.key === "coverPrompt") ? "Versi AI (yang lebih menyesuaikan isi) ada di kartu hasil di bawah." : "Jalankan paket SEO untuk mendapat versi AI yang lebih menyesuaikan isi."}</small>
        <p className="seo-text" style={{ whiteSpace: "pre-wrap" }} data-testid="cover-prompt">{cover.prompt}</p>
        <div className="range-tools">
          <button type="button" onClick={() => void copy("cover", cover.prompt)} data-testid="cover-copy">{copied === "cover" ? "Tersalin ✓" : copied === "gagal:cover" ? "Gagal menyalin" : "Salin prompt"}</button>
          <button type="button" onClick={() => void copy("cover-neg", cover.negative)} data-testid="cover-copy-negative">{copied === "cover-neg" ? "Tersalin ✓" : copied === "gagal:cover-neg" ? "Gagal menyalin" : "Salin negative prompt"}</button>
        </div>
        <small className="field-hint" data-testid="cover-negative">Negative prompt: {cover.negative}</small>
        <small className="field-hint">Aturannya mengurangi tampilan &quot;gambar AI&quot; (kulit plastik, cahaya neon, simbol mengambang), tapi tidak menjamin. Periksa tangan, wajah, dan teks pada hasilnya, dan pilih yang paling wajar.</small>
      </div>
      {access === null
        ? <small data-testid="seo-needs-key"><b>Belum ada kunci AI.</b> Masuk ke akun lalu simpan kunci di panel AI (atau masukkan di panel transkrip di perangkat ini).</small>
        : <div className="range-tools"><button onClick={() => void run()} disabled={busy || !!problem} data-testid="seo-run">{busy ? "AI menulis…" : result ? `Buat ulang untuk ${SEO_PLATFORMS.find(p => p.id === platform)?.label}` : `Buat paket untuk ${SEO_PLATFORMS.find(p => p.id === platform)?.label}`}</button></div>}
      {problem && !busy && access ? <small className="field-hint" data-testid="seo-problem">{problem}</small> : null}
      {error && <div className="notice notice-error" role="alert" data-testid="seo-error">{error}</div>}
      {result && <div data-testid="seo-result">
        <div className={"seo-score seo-" + tone} data-testid="seo-score" role="status">
          <b>{result.score}</b><span>/100 kesiapan SEO ({tone})</span>
          {result.score < result.modelScore ? <small data-testid="seo-adjusted">Dikoreksi dari {result.modelScore}: ada aturan platform yang belum terpenuhi.</small> : null}
        </div>
        <p className="seo-fix" data-testid="seo-fix"><b>Perbaikan cepat:</b> {result.quickFix}</p>
        {result.cards.map(c => {
          const text = Array.isArray(c.value) ? c.value.join(c.kind === "hashtags" ? " " : "\n") : c.value;
          return (
            <div className="seo-card" key={c.key} data-testid={"seo-card-" + c.key}>
              <div className="seo-card-head"><b>{c.label}</b>
                <button type="button" className="text-link" onClick={() => void copy(c.key, text)} disabled={!text} data-testid={"seo-copy-" + c.key}>{copied === c.key ? "Tersalin ✓" : copied === `gagal:${c.key}` ? "Gagal menyalin" : "Salin"}</button>
              </div>
              {Array.isArray(c.value)
                ? <ul className={c.kind === "hashtags" ? "seo-tags" : "seo-list"}>{c.value.map((v, i) => <li key={i}>{v}</li>)}</ul>
                : <p className="seo-text" style={{ whiteSpace: "pre-wrap" }} data-testid={"seo-text-" + c.key}>{c.value || "—"}</p>}
              {!Array.isArray(c.value) && c.value ? <small className="field-hint">{c.value.length} karakter · {c.value.trim().split(/\s+/).length} kata</small> : null}
            </div>
          );
        })}
        <div className="range-tools">
          <button type="button" onClick={() => void copy("all", seoToText(result))} data-testid="seo-copy-all">{copied === "all" ? "Tersalin ✓" : "Salin semua (teks)"}</button>
          <button type="button" onClick={() => void copy("json", seoToJson(result))} data-testid="seo-copy-json">{copied === "json" ? "Tersalin ✓" : "Salin JSON"}</button>
        </div>
        <details><summary>Pemeriksaan aturan platform ({result.checks.filter(c => !c.ok).length} belum terpenuhi)</summary>
          <ul className="seo-checks">{result.checks.map((c, i) => <li key={i} className={c.ok ? "ok" : "bad"} data-testid={c.ok ? undefined : "seo-check-failed"}>{c.ok ? "✓" : "✗"} {c.message}</li>)}</ul>
        </details>
      </div>}
    </details>
  );
}
