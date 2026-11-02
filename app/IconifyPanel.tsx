"use client";

import { useEffect, useRef, useState } from "react";
import { fetchIcon, getSvgDirectUrl, ICON_SETS, IconifyError, resolveSceneIcon, searchSvgIcons, type LoadedIcon } from "@/lib/iconify";
import { iconLookupFor } from "@/lib/icon-keywords";
import { ENTRANCES, isEntrance, type Entrance } from "@/lib/icon-motion";

const MAX_AUTO = 12;

/**
 * Icons for scenes from Iconify (free, no key). Search by hand for one scene, or fill the scenes that have no icon: only when the
 * creator presses a button, one request at a time, at most 12 scenes per press. The result is an ordinary scene icon (editable and
 * removable like the built-in ones), drawn as vector paths, so nothing is fetched while rendering.
 */
export default function IconifyPanel({ scenes, accent, disabled, entrance, onEntrance, onApply }: {
  entrance: Entrance;
  onEntrance: (e: Entrance) => void;
  scenes: { text: string; query?: string; hasIcon: boolean }[];
  accent: string;
  disabled: boolean;
  onApply: (text: string, icon: LoadedIcon) => void;
}) {
  const [target, setTarget] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const scene = scenes[Math.min(target, scenes.length - 1)];

  const fail = (e: unknown) => setError(e instanceof IconifyError ? e.message : "Ikon gagal dimuat.");

  async function search() {
    if (!keyword.trim()) return;
    setBusy(true); setError(""); setNote("");
    const ctl = new AbortController(); abort.current = ctl;
    try { const r = await searchSvgIcons(keyword, 12, { signal: ctl.signal }); setResults(r); if (r.length === 0) setNote("Tidak ada ikon untuk kata itu. Coba kata bahasa Inggris."); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function choose(name: string) {
    if (!scene) return;
    setBusy(true); setError("");
    const ctl = new AbortController(); abort.current = ctl;
    try { onApply(scene.text, await fetchIcon(name, { signal: ctl.signal })); setNote(`Ikon ${name} dipakai di adegan ${target + 1}.`); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function fillAll() {
    setBusy(true); setError(""); setNote("");
    const ctl = new AbortController(); abort.current = ctl;
    let done = 0, missed = 0;
    try {
      for (const s of scenes.filter(x => !x.hasIcon).slice(0, MAX_AUTO)) {
        if (ctl.signal.aborted) break;
        const lookup = iconLookupFor(s.text, s.query);
        if (!lookup.exact.length && !lookup.query) { missed++; continue; }
        try {
          const icon = await resolveSceneIcon(lookup, { signal: ctl.signal });
          if (!icon) { missed++; continue; }
          onApply(s.text, icon); done++;
        } catch (e) { if (e instanceof IconifyError && (e.kind === "network" || e.kind === "timeout")) throw e; missed++; }
      }
      setNote(`${done} adegan diberi ikon${missed ? `, ${missed} dilewati (tidak ada ikon yang cocok)` : ""}. Ganti atau hapus per adegan bila kurang pas.`);
    } catch (e) { fail(e); setNote(done ? `${done} adegan sempat diberi ikon sebelum gagal.` : ""); }
    finally { setBusy(false); }
  }

  if (scenes.length === 0) return null;
  const free = scenes.filter(s => !s.hasIcon).length;
  return <details className="fold iconify-panel" data-testid="fold-iconify">
    <summary><b>Ikon otomatis</b> <small>Iconify · gratis, tanpa kunci</small></summary>
    <div className="fold-body">
      <p className="preview-disclaimer">Mencari ikon garis dari {Object.values(ICON_SETS).map(s => `${s.name} (${s.license})`).join(", ")} — bebas dipakai tanpa kredit. Kata kunci pencarian dikirim ke api.iconify.design; naskah dan video tidak dikirim. Kata dalam naskah dipetakan ke nama ikon (mis. “untung” → trending-up, “waktu” → clock) sebelum mencari. Hanya berjalan saat Anda menekan tombol.</p>
      <div className="button-row">
        <button type="button" onClick={() => void fillAll()} disabled={disabled || busy || free === 0} data-testid="icon-auto">{busy ? "Mencari…" : `Isi otomatis (${Math.min(free, MAX_AUTO)} adegan tanpa ikon)`}</button>
        {busy && <button type="button" onClick={() => abort.current?.abort()} data-testid="icon-cancel">Batal</button>}
      </div>
      <label>Animasi masuk ikon<select value={entrance} onChange={e => { if (isEntrance(e.target.value)) onEntrance(e.target.value); }} data-testid="icon-entrance">{ENTRANCES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <div className="field-grid">
        <label>Adegan<select value={target} onChange={e => setTarget(Number(e.target.value))} data-testid="icon-target">{scenes.map((s, i) => <option key={i} value={i}>{i + 1}. {s.text.slice(0, 40)}</option>)}</select></label>
        <label>Kata kunci (Inggris)<input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void search(); }} maxLength={60} data-testid="icon-keyword" /></label>
      </div>
      <button type="button" onClick={() => void search()} disabled={disabled || busy || !keyword.trim()} data-testid="icon-search">Cari ikon</button>
      {error && <div className="notice notice-error" role="alert" data-testid="icon-error">{error}</div>}
      {note && <div className="notice" role="status" data-testid="icon-note">{note}</div>}
      {results && results.length > 0 && <div className="icon-grid" data-testid="icon-results">
        {results.map(name => <button key={name} type="button" className="icon-choice" disabled={disabled || busy} title={name} aria-label={name} onClick={() => void choose(name)} data-testid="icon-choice">
          {/* Preview thumbnail only; the icon used in the video is vector data, not this image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={getSvgDirectUrl(name, accent, 48)} crossOrigin="anonymous" alt="" width={32} height={32} loading="lazy" />
        </button>)}
      </div>}
    </div>
  </details>;
}
