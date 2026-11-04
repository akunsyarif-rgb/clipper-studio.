"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildCinematic, CINEMATIC_PLAYBOOK, fxChoices, GENRES, GENRE_IDS, isFx, polishCinematic, TONES, validateCinematic, type Brief, type CinePlan, type Genre, type FxId } from "@/lib/cinematic";
import { aiUsage } from "@/lib/gemini";
import { allowPaidModel, isPaidAllowed } from "@/lib/paid-consent";
import { MAX_COMMAND_CHARS, planFromCommand, type Visual } from "@/lib/command-agent";
import { getAccess } from "@/lib/gemini-access";
import { FPS } from "@/lib/script";
import { applyPresetToPlan, builtInPresets, loadPresets, presetFromPlan, savePresets, type LibraryPreset } from "@/lib/motion-library";
import { useGeminiAccess } from "./useGeminiAccess";
import AiBusy from "./AiBusy";
import { focusAiSetup } from "./AiSetupCard";
import AiNeeded from "./AiNeeded";
import AiErrorNotice, { toAiError, type AiError } from "./AiErrorNotice";

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
  /** `visuals`: what to look for behind the scenes (photo or short clip), present when the creator wants them filled in. */
  onApply: (plan: CinePlan, visuals?: Visual[]) => void;
  onClear: () => void;
  onFx: (text: string, fx: FxId) => void;
}) {
  const access = useGeminiAccess();
  const [brief, setBrief] = useState<Brief>(EMPTY);
  const [featuresText, setFeaturesText] = useState("");
  const [draft, setDraft] = useState<CinePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiErr, setAiErr] = useState<AiError | null>(null);
  const retry = useRef<() => void>(() => {});
  const [note, setNote] = useState("");
  const abort = useRef<AbortController | null>(null);
  const [command, setCommand] = useState("");
  const [terms, setTerms] = useState<Visual[]>([]);
  const [paidOk, setPaidOk] = useState(false);
  const [autoPhotos, setAutoPhotos] = useState(true);
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
    setDraft(applyPresetToPlan(shown, preset)); setError(""); setNote(`Preset “${preset.name}” dipasang pada urutan adegan. ${active ? "Tekan Perbarui untuk memakainya di Motion Studio." : "Tekan Pakai di Motion Studio."}`);
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
    retry.current = () => void fromCommand();
    setError(""); setNote(""); setAiErr(null);
    const settings = await getAccess();
    if (!settings) { focusAiSetup(); return setError("Belum ada AI. Siapkan AI di bagian atas halaman, atau isi brief di bawah dan susun urutan adegan tanpa AI."); }
    if (!isPaidAllowed(settings.model) && !paidOk) return setError(`Model ${settings.model} bukan model gratis. Centang izin di bawah kolom perintah bila Anda memang ingin memakainya untuk perintah ini.`);
    setBusy(true);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const out = await planFromCommand(command, { apiKey: settings.apiKey, model: settings.model, language: "id", signal: ctl.signal, transport: settings.transport, format: settings.format });
      setBrief(out.plan.brief); setFeaturesText(out.plan.brief.features.join("\n")); setDraft(out.plan); setTerms(out.visuals);
      setNote(`Rencana siap (${settings.model}). Periksa urutan adegan di bawah, ubah bila perlu, lalu tekan “Pakai di Motion Studio”. Belum ada yang diubah. Permintaan sesi ini: ${aiUsage.requests}, token ${aiUsage.tokens}.`);
    } catch (e) {
      if (ctl.signal.aborted) setNote("Dibatalkan. Tidak ada yang diubah."); else setAiErr(toAiError(e, "Gagal menghubungi AI."));
    } finally { setBusy(false); }
  }

  async function polish() {
    if (!shown) return;
    const settings = await getAccess();
    if (!settings) return;
    retry.current = () => void polish();
    setBusy(true); setError(""); setNote(""); setAiErr(null);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const out = await polishCinematic(shown, { apiKey: settings.apiKey, model: settings.model, language: brief.language ?? "id", signal: ctl.signal, transport: settings.transport, format: settings.format });
      setDraft(out); setNote(`Kalimat dipoles AI (${settings.model}). Struktur, gerak, dan ketukan tidak berubah. Permintaan sesi ini: ${aiUsage.requests}, token ${aiUsage.tokens}.`);
    } catch (e) {
      if (ctl.signal.aborted) setNote("Dibatalkan. Naskah lokal tetap dipakai."); else setAiErr(toAiError(e, "Gagal menghubungi AI."));
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
        {access && (!isPaidAllowed(access.model) || paidOk) && <label className="check-row"><input type="checkbox" checked={paidOk} onChange={e => { setPaidOk(e.target.checked); if (e.target.checked && access) allowPaidModel(access.model); }} data-testid="command-paid-ok" /> Izinkan model berbayar ({access.model}) untuk perintah ini</label>}
        <div className="button-row"><button type="button" onClick={() => void fromCommand()} disabled={busy || command.trim().length < 8} data-testid="command-run">{busy ? "Menyusun rencana…" : "Buat rencana dari perintah"}</button></div>
        <small className="field-hint">{access ? "Satu panggilan AI untuk mengisi brief; urutan adegan disusun di perangkat." : <AiNeeded what="Perintah memakai AI; tanpa itu, isi brief di bawah." />}</small>
        <label className="check-row"><input type="checkbox" checked={autoPhotos} onChange={e => setAutoPhotos(e.target.checked)} data-testid="command-auto-photos" /> Isi foto atau video latar otomatis (Pixabay) setelah rencana dipakai</label>
        {terms.length > 0 && <p data-testid="command-terms"><small>Gambar yang dicari: {terms.map(t => `${t.term} (${t.kind === "video" ? "video" : "foto"})`).join(", ")}. {autoPhotos ? "Setelah rencana dipakai, tiap adegan diberi foto atau video pendek yang cocok; Anda bisa menggantinya per adegan." : "Gambar tidak diisi otomatis; gunakan “Gambar & musik otomatis” bila perlu."}</small></p>}
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
        <button type="button" onClick={build} data-testid="cine-build">Susun urutan adegan</button>
        {shown && <button type="button" onClick={() => void polish()} disabled={busy || !access} title={access ? "" : "Atur kunci AI dulu (opsional)"} data-testid="cine-polish">{busy ? "Memoles…" : "Poles kalimat dengan AI (opsional)"}</button>}
      </div>
      <AiBusy busy={busy} label="AI bekerja" onCancel={() => abort.current?.abort()} />
      <AiErrorNotice error={aiErr} onRetry={() => retry.current()} onDismiss={() => setAiErr(null)} testId="cine-error" />
      {error && <div className="notice notice-error" role="alert" data-testid="cine-error">{error}</div>}
      {note && <div className="notice" role="status" data-testid="cine-note">{note}</div>}
      {shown && <>
        <p data-testid="cine-beat"><small>Tempo {shown.map.bpm} ketukan per menit (BPM) · satu ketukan {shown.map.beat.toFixed(2)} dtk · satu birama {shown.map.bar.toFixed(1)} dtk · {shown.concept.palette}, {shown.concept.typography}</small></p>
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
          {draft && <button type="button" onClick={() => { onApply(draft, autoPhotos && terms.length ? terms : undefined); if (terms.length) { setTerms([]); setNote(autoPhotos ? "Rencana dipakai. Foto atau video latar dicari otomatis untuk semua adegan; ganti atau hapus per adegan di daftar adegan." : "Rencana dipakai."); } }} disabled={issues.some(x => x.level === "error")} data-testid="cine-apply">{active ? "Perbarui di Motion Studio" : "Pakai di Motion Studio"}</button>}
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
          <button type="button" onClick={usePreset} disabled={!presetId} data-testid="preset-apply">Pasang pada urutan adegan</button>
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
