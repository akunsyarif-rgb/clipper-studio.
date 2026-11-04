"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildCinematic, CINEMATIC_PLAYBOOK, fxChoices, GENRES, GENRE_IDS, isFx, polishCinematic, TONES, validateCinematic, type Brief, type CinePlan, type Genre, type FxId } from "@/lib/cinematic";
import { GeminiError, aiUsage } from "@/lib/gemini";
import { isFreeModel } from "@/lib/ai-budget";
import { MAX_COMMAND_CHARS, planFromCommand } from "@/lib/command-agent";
import { getAccess } from "@/lib/gemini-access";
import { FPS } from "@/lib/script";
import { applyPresetToPlan, builtInPresets, loadPresets, presetFromPlan, savePresets, type LibraryPreset } from "@/lib/motion-library";
import { useGeminiAccess } from "./useGeminiAccess";

const EMPTY: Brief = { genre: "produk", product: "", tagline: "", problem: "", features: [], proof: "", cta: "", tone: "keynote", seconds: 30, language: "id" };

/**
 * Cinematic Studio: brief -> concept -> beat map -> storyboard, then handed to the studio as an ordinary script, style, palette,
 * typography, sound and one motion preset per scene. Everything is computed on the device; the AI is optional and only
 * rewrites the wording (free OpenRouter model first, never a paid model unless the creator chose it in the AI settings).
 */
export default function CinematicStudio({ active, hasMusic, frames, onApply, onClear, onFx }: {
  active: { plan: CinePlan; fx: Record<string, string> } | null;
  hasMusic: boolean;
  /** Frame lengths of the scenes now in the timeline, to check the cuts against the beat. */
  frames: number[];
  onApply: (plan: CinePlan) => void;
  onClear: () => void;
  onFx: (text: string, fx: FxId) => void;
}) {
  const access = useGeminiAccess();
  const [brief, setBrief] = useState<Brief>(EMPTY);
  const [featuresText, setFeaturesText] = useState("");
  const [draft, setDraft] = useState<CinePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const abort = useRef<AbortController | null>(null);
  const [command, setCommand] = useState("");
  const [terms, setTerms] = useState<string[]>([]);
  const [paidOk, setPaidOk] = useState(false);
  const [mine, setMine] = useState<LibraryPreset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  useEffect(() => { setMine(loadPresets()); }, []);
  useEffect(() => () => abort.current?.abort(), []);

  // Restore the editable brief alongside the applied plan so a reload does not leave the form blank.
  // Only when the applied script changes (apply, restore): changing a scene's motion preset must not overwrite what is being typed.
  const activePlan = active?.plan;
  const activeScript = activePlan?.script;
  useEffect(() => {
    if (!activePlan) return;
    setBrief(activePlan.brief);
    setFeaturesText(activePlan.brief.features.join("\n"));
  }, [activeScript]); // eslint-disable-line react-hooks/exhaustive-deps

  const input = useMemo(() => ({ ...brief, features: featuresText.split("\n") }), [brief, featuresText]);
  // A newly built or polished draft must take precedence over the applied plan; otherwise active mode hides every edit.
  const shown = draft ?? active?.plan ?? null;
  const issues = useMemo(() => shown ? validateCinematic(shown, { hasMusic, frames: active && !draft ? frames : undefined, fps: FPS }) : [], [shown, hasMusic, frames, active, draft]);
  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => { setBrief(b => ({ ...b, [k]: v })); setDraft(null); };

  const library = shown ? [...builtInPresets(shown.concept), ...mine] : mine;
  function usePreset() {
    const preset = library.find(p => p.id === presetId);
    if (!shown || !preset) return;
    setDraft(applyPresetToPlan(shown, preset)); setError(""); setNote(`Preset “${preset.name}” dipasang pada storyboard. ${active ? "Tekan Perbarui untuk memakainya di Motion Studio." : "Tekan Pakai di Motion Studio."}`);
  }
  function saveMine() {
    if (!shown || !presetName.trim()) return setError("Beri nama preset dulu.");
    const next = [...mine, presetFromPlan(presetName, shown)];
    if (!savePresets(next)) return setError("Browser menolak menyimpan preset di perangkat ini.");
    setMine(next); setPresetName(""); setError(""); setNote("Preset disimpan di perangkat ini (tampilan + gerak tiap bagian).");
  }
  function removeMine() {
    const next = mine.filter(p => p.id !== presetId);
    if (next.length === mine.length || !savePresets(next)) return;
    setMine(next); setPresetId("");
  }

  function build() {
    setError(""); setNote("");
    if (!brief.product.trim()) return setError(`Isi ${GENRES[brief.genre ?? "produk"].subject.toLowerCase()} dulu.`);
    setDraft(buildCinematic(input));
  }

  /** One sentence from the creator becomes a plan to look at first; nothing is applied until "Pakai di Motion Studio". */
  async function fromCommand() {
    setError(""); setNote("");
    const settings = await getAccess();
    if (!settings) return setError("Atur kunci AI dulu di pengaturan AI. Tanpa AI, isi brief di bawah dan susun storyboard secara lokal.");
    if (!isFreeModel(settings.model) && !paidOk) return setError(`Model ${settings.model} bukan model gratis. Centang izin di bawah kolom perintah bila Anda memang ingin memakainya untuk perintah ini.`);
    setBusy(true);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const out = await planFromCommand(command, { apiKey: settings.apiKey, model: settings.model, language: "id", signal: ctl.signal, transport: settings.transport, format: settings.format });
      setBrief(out.plan.brief); setFeaturesText(out.plan.brief.features.join("\n")); setDraft(out.plan); setTerms(out.searchTerms);
      setNote(`Rencana siap (${settings.model}). Periksa storyboard di bawah, ubah bila perlu, lalu tekan “Pakai di Motion Studio”. Belum ada yang diubah. Permintaan sesi ini: ${aiUsage.requests}, token ${aiUsage.tokens}.`);
    } catch (e) {
      setError((e instanceof GeminiError ? e.message : "Gagal menghubungi AI.") + " Tidak ada yang diubah.");
    } finally { setBusy(false); }
  }

  async function polish() {
    if (!shown) return;
    const settings = await getAccess();
    if (!settings) return;
    setBusy(true); setError(""); setNote("");
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const out = await polishCinematic(shown, { apiKey: settings.apiKey, model: settings.model, language: brief.language ?? "id", signal: ctl.signal, transport: settings.transport, format: settings.format });
      setDraft(out); setNote(`Kalimat dipoles AI (${settings.model}). Struktur, gerak, dan ketukan tidak berubah. Permintaan sesi ini: ${aiUsage.requests}, token ${aiUsage.tokens}.`);
    } catch (e) {
      setError((e instanceof GeminiError ? e.message : "Gagal menghubungi AI.") + " Naskah lokal tetap dipakai; Anda bisa memilih model lain di pengaturan AI.");
    } finally { setBusy(false); }
  }

  const bpm = shown?.map.bpm;
  const g = GENRES[brief.genre ?? "produk"];
  return <details className="fold cinematic-studio" data-testid="fold-cinematic">
    <summary><b>Cinematic Studio</b> <small>{active ? `Aktif · ${active.plan.scenes.length} adegan · ${active.plan.map.bpm} BPM` : "Film sinematik: produk, cerita, edukasi, brand"}</small></summary>
    <div className="fold-body">
      <p className="preview-disclaimer">Isi brief singkat; naskah, gaya, palet, huruf, gerak tiap adegan, dan panjang adegan (sesuai ketukan) disusun di perangkat ini tanpa AI. AI hanya opsional untuk memoles kalimat.</p>
      <div className="command-box" data-testid="command-box">
        <label>Perintah (ceritakan video yang ingin dibuat)<textarea rows={3} value={command} maxLength={MAX_COMMAND_CHARS} onChange={e => setCommand(e.target.value)} placeholder="Contoh: video produk kopi 30 detik, suasana hangat, ajak orang memesan" data-testid="command-input" /></label>
        {access && !isFreeModel(access.model) && <label className="check-row"><input type="checkbox" checked={paidOk} onChange={e => setPaidOk(e.target.checked)} data-testid="command-paid-ok" /> Izinkan model berbayar ({access.model}) untuk perintah ini</label>}
        <div className="button-row"><button type="button" onClick={() => void fromCommand()} disabled={busy || command.trim().length < 8} data-testid="command-run">{busy ? "Menyusun rencana…" : "Buat rencana dari perintah"}</button></div>
        <small className="field-hint">{access ? `Model: ${access.model} (${isFreeModel(access.model) ? "gratis" : "berbayar"}). Satu panggilan AI untuk mengisi brief; storyboard disusun di perangkat.` : "Perlu kunci AI. Tanpa itu, isi brief di bawah."}</small>
        {terms.length > 0 && <p data-testid="command-terms"><small>Kata kunci aset: {terms.join(", ")}. Setelah rencana dipakai, buka “Foto &amp; video otomatis” di Motion Studio untuk mengisi gambarnya.</small></p>}
      </div>
      <div className="field-grid">
        <label>Jenis film<select value={brief.genre ?? "produk"} onChange={e => set("genre", e.target.value as Genre)} data-testid="cine-genre">{GENRE_IDS.map(g => <option key={g} value={g}>{GENRES[g].label}</option>)}</select></label>
        <label>{g.subject}<input value={brief.product} onChange={e => set("product", e.target.value)} maxLength={60} data-testid="cine-product" /></label>
        <label>{g.tagline}<input value={brief.tagline} onChange={e => set("tagline", e.target.value)} maxLength={100} data-testid="cine-tagline" /></label>
        <label>{g.problem}<input value={brief.problem} onChange={e => set("problem", e.target.value)} maxLength={120} data-testid="cine-problem" /></label>
        <label>{g.points}<textarea rows={3} value={featuresText} onChange={e => { setFeaturesText(e.target.value); setDraft(null); }} data-testid="cine-features" /></label>
        <label>{g.proof}<input value={brief.proof} onChange={e => set("proof", e.target.value)} maxLength={120} data-testid="cine-proof" /></label>
        <label>{g.cta}<input value={brief.cta} onChange={e => set("cta", e.target.value)} maxLength={80} data-testid="cine-cta" /></label>
        <label>Suasana<select value={brief.tone} onChange={e => set("tone", e.target.value as Brief["tone"])} data-testid="cine-tone">{TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <label>Durasi<select value={brief.seconds} onChange={e => set("seconds", Number(e.target.value))} data-testid="cine-seconds">{[15, 30, 45, 60].map(s => <option key={s} value={s}>{s} detik</option>)}</select></label>
      </div>
      <div className="button-row">
        <button type="button" onClick={build} data-testid="cine-build">Susun storyboard</button>
        {shown && <button type="button" onClick={() => void polish()} disabled={busy || !access} title={access ? "" : "Atur kunci AI dulu (opsional)"} data-testid="cine-polish">{busy ? "Memoles…" : "Poles kalimat dengan AI (opsional)"}</button>}
      </div>
      {error && <div className="notice notice-error" role="alert" data-testid="cine-error">{error}</div>}
      {note && <div className="notice" role="status" data-testid="cine-note">{note}</div>}
      {shown && <>
        <p data-testid="cine-beat"><small>{shown.map.bpm} BPM · satu ketukan {shown.map.beat.toFixed(2)} dtk · satu bar {shown.map.bar.toFixed(1)} dtk · {shown.concept.palette}, {shown.concept.typography}</small></p>
        <ol className="cine-list" data-testid="cine-list">
          {shown.scenes.map((s, i) => <li key={i} data-act={s.act}>
            <small>{GENRES[shown.brief.genre ?? "produk"].act[s.act]} · {s.seconds.toFixed(1)} dtk ({Math.round(s.seconds / shown.map.beat)} ketukan)</small>
            <div>{s.text}</div>
            <select value={s.fx} aria-label={`Gerak adegan ${i + 1}`} data-testid="cine-fx" onChange={e => {
              const fx = e.target.value; if (!isFx(fx)) return;
              if (active && !draft) onFx(s.text, fx); else setDraft(d => d ? { ...d, scenes: d.scenes.map((x, k) => k === i ? { ...x, fx } : x), fxByText: { ...d.fxByText, [s.text]: fx } } : d);
            }}>{fxChoices(s.fx).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
          </li>)}
        </ol>
        {issues.length > 0 && <ul className="cine-issues" data-testid="cine-issues">{issues.map((m, i) => <li key={i} data-level={m.level}>{m.level === "error" ? "⛔" : "⚠️"} {m.message}</li>)}</ul>}
        <div className="button-row">
          {draft && <button type="button" onClick={() => onApply(draft)} disabled={issues.some(x => x.level === "error")} data-testid="cine-apply">{active ? "Perbarui di Motion Studio" : "Pakai di Motion Studio"}</button>}
          {active && <button type="button" onClick={() => { setDraft(active.plan); onClear(); }} data-testid="cine-clear">Lepas mode sinematik</button>}
        </div>
        {active && <p className="preview-disclaimer">Mode aktif: panjang adegan mengikuti ketukan {bpm} BPM dan backsound sinematik otomatis. Mengubah naskah di atas melepas panjang adegan sinematik (gerak tiap adegan tetap bila kalimatnya sama).</p>}
      </>}
      {shown && <div className="preset-library" data-testid="preset-library">
        <label>Pustaka preset (tampilan + gerak)<select value={presetId} onChange={e => setPresetId(e.target.value)} data-testid="preset-select">
          <option value="">Pilih preset…</option>
          <optgroup label="Bawaan">{library.filter(p => p.builtIn).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
          {mine.length > 0 && <optgroup label="Preset saya">{mine.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
        </select></label>
        <div className="button-row">
          <button type="button" onClick={usePreset} disabled={!presetId} data-testid="preset-apply">Pasang pada storyboard</button>
          {presetId.startsWith("mine:") && <button type="button" onClick={removeMine} data-testid="preset-delete">Hapus preset</button>}
        </div>
        <div className="field-grid">
          <label>Simpan tampilan ini sebagai preset<input value={presetName} onChange={e => setPresetName(e.target.value)} maxLength={40} placeholder="Nama preset" data-testid="preset-name" /></label>
        </div>
        <button type="button" onClick={saveMine} disabled={!presetName.trim()} data-testid="preset-save">Simpan preset (di perangkat ini)</button>
      </div>}
      <details><summary><small>Pedoman sinematik yang dipakai</small></summary><ul>{CINEMATIC_PLAYBOOK.map((r, i) => <li key={i}><small>{r}</small></li>)}</ul></details>
    </div>
  </details>;
}
