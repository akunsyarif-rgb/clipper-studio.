"use client";

import { useEffect, useRef, useState } from "react";
import { cloud } from "@/lib/cloud";
import { downloadPhoto, forgetPexelsKey, PexelsError, pexelsStatus, savePexelsKey, searchPhotos, type PexelsPhoto } from "@/lib/pexels";

type SceneInfo = { text: string; /** English search phrase from the AI director, if any. */ query?: string; hasImage: boolean };

/**
 * Automatic pictures from Pexels: the creator's Pexels key is saved on the server (never on this device or in the page),
 * then one tap fills every scene that has no picture with the best match for its search phrase. Each photo can be swapped
 * in the scene list afterwards.
 */
export default function PexelsPanel({ scenes, onApply, disabled }: {
  scenes: SceneInfo[];
  onApply: (text: string, file: File, photo: PexelsPhoto) => Promise<void>;
  disabled: boolean;
}) {
  const [signedIn, setSignedIn] = useState(() => !!cloud.user());
  const [hasKey, setHasKey] = useState<boolean | null | undefined>(undefined);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => { setSignedIn(!!cloud.user()); void pexelsStatus().then(s => { if (alive) setHasKey(s); }); };
    refresh();
    const off = cloud.subscribe(refresh);
    return () => { alive = false; off(); abort.current?.abort(); };
  }, []);

  async function save() {
    setBusy(true); setError("");
    try { await savePexelsKey(keyInput); setKeyInput(""); setHasKey(true); }
    catch (e) { setError(e instanceof PexelsError ? e.message : "Kunci gagal disimpan."); }
    finally { setBusy(false); }
  }
  async function forget() {
    setBusy(true); setError("");
    try { await forgetPexelsKey(); setHasKey(false); setSummary(""); }
    catch (e) { setError(e instanceof PexelsError ? e.message : "Kunci gagal dihapus."); }
    finally { setBusy(false); }
  }

  const todo = scenes.filter(s => !s.hasImage && s.query && s.query.trim().length >= 2);
  const noQuery = scenes.filter(s => !s.hasImage && !(s.query && s.query.trim().length >= 2)).length;

  async function fillAll() {
    const ctl = new AbortController(); abort.current = ctl;
    setBusy(true); setError(""); setSummary(""); setProgress({ done: 0, total: todo.length });
    let placed = 0, missed = 0;
    const used = new Set<number>();
    try {
      for (const [i, s] of todo.entries()) {
        if (ctl.signal.aborted) break;
        try {
          const { photos } = await searchPhotos(s.query!.trim(), { perPage: 4, signal: ctl.signal });
          // The best match that is not already used in another scene, so the video does not repeat one photo.
          const pick = photos.find(p => !used.has(p.id)) ?? photos[0];
          if (!pick) { missed++; }
          else {
            const file = await downloadPhoto(pick, { signal: ctl.signal });
            await onApply(s.text, file, pick);
            used.add(pick.id); placed++;
          }
        } catch (e) {
          if (ctl.signal.aborted) break;
          // A key, quota or sign-in problem will not fix itself on the next scene; anything else skips just this scene.
          if (e instanceof PexelsError && ["key", "limit", "signed-out", "no-key"].includes(e.kind)) { setError(e.message); break; }
          missed++;
        }
        setProgress({ done: i + 1, total: todo.length });
      }
      const parts = [`${placed} gambar dipasang.`];
      if (missed) parts.push(`${missed} scene tidak mendapat gambar (tidak ada hasil atau gagal diambil); cari manual di daftar scene.`);
      if (noQuery) parts.push(`${noQuery} scene tidak punya kata kunci; jalankan Sutradara AI atau cari manual.`);
      setSummary(parts.join(" "));
    } finally { setBusy(false); setProgress(null); abort.current = null; }
  }

  if (hasKey === undefined) return null;
  return <div className="ai-director pexels-panel" data-testid="pexels-panel">
    <b>Gambar otomatis (Pexels)</b>
    {!signedIn || hasKey === null
      ? <small data-testid="pexels-needs-login">Masuk ke akun untuk memakai pencarian foto Pexels. Kunci Pexels Anda disimpan di server akun, bukan di perangkat ini.</small>
      : hasKey === false
        ? <>
          <small>Tempel kunci API Pexels Anda sekali; kunci disimpan di server akun Anda (tidak di perangkat, tidak di halaman). Kunci gratis ada di <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer noopener">pexels.com/api</a>.</small>
          <form className="photo-search" onSubmit={e => { e.preventDefault(); void save(); }}>
            <input type="password" autoComplete="off" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Kunci API Pexels" aria-label="Kunci API Pexels" disabled={busy} data-testid="pexels-key" />
            <button type="submit" disabled={busy || keyInput.trim().length < 20} data-testid="pexels-save">{busy ? "Memeriksa…" : "Simpan"}</button>
          </form>
        </>
        : <>
          <small>Pexels tersambung. Tombol di bawah memasang foto terbaik untuk tiap scene yang belum bergambar, memakai kata kunci dari Sutradara AI. Foto bisa diganti per scene lewat <b>Cari di Pexels</b>. Foto milik fotografernya; kredit ditampilkan di bawah tiap scene.</small>
          <div className="range-tools">
            <button onClick={() => void fillAll()} disabled={busy || disabled || todo.length === 0} data-testid="pexels-fill">
              {busy ? "Mencari foto…" : todo.length === 0 ? "Tidak ada scene yang perlu gambar" : `Cari gambar untuk ${todo.length} scene`}
            </button>
            {busy && <button onClick={() => abort.current?.abort()} data-testid="pexels-cancel">Batal</button>}
            <button onClick={() => void forget()} disabled={busy} className="text-link" data-testid="pexels-forget">Hapus kunci Pexels</button>
          </div>
          {todo.length === 0 && noQuery > 0 && <small data-testid="pexels-no-query">Scene belum punya kata kunci. Jalankan <b>Sutradara AI</b> dulu, atau pakai <b>Cari di Pexels</b> di tiap scene.</small>}
        </>}
    {progress && <small role="status" data-testid="pexels-progress">Memasang gambar {progress.done}/{progress.total}…</small>}
    {summary && <small role="status" data-testid="pexels-summary">{summary}</small>}
    {error && <div className="notice notice-error" role="alert" data-testid="pexels-error">{error}</div>}
  </div>;
}
