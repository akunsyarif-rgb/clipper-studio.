"use client";

import { useEffect, useRef, useState } from "react";
import { creditText, downloadPhoto, PexelsError, searchPhotos, type PexelsPhoto } from "@/lib/pexels";

/**
 * Photos from Pexels for one scene: the search phrase (the AI's suggestion, editable), a few vertical results with the
 * photographer's credit, and one tap to use a photo. The photo is fetched through the server and handed on as a file.
 */
export default function ScenePhotoPicker({ initialQuery, onChoose, onClose }: {
  initialQuery: string;
  onChoose: (file: File, photo: PexelsPhoto) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [photos, setPhotos] = useState<PexelsPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function search(q = query) {
    if (q.trim().length < 2) { setError("Ketik kata kunci pencarian (bahasa Inggris hasilnya lebih tepat)."); return; }
    abort.current?.abort();
    const ctl = new AbortController(); abort.current = ctl;
    setBusy(true); setError("");
    try {
      const r = await searchPhotos(q.trim(), { perPage: 6, signal: ctl.signal });
      setPhotos(r.photos); setRemaining(r.remaining);
      if (r.photos.length === 0) setError("Tidak ada foto yang cocok. Coba kata kunci lain.");
    } catch (e) { if (!ctl.signal.aborted) setError(e instanceof PexelsError ? e.message : "Pencarian gagal."); }
    finally { if (abort.current === ctl) setBusy(false); }
  }
  useEffect(() => { if (initialQuery.trim().length >= 2) void search(initialQuery); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function choose(photo: PexelsPhoto) {
    setChoosing(photo.id); setError("");
    try { const file = await downloadPhoto(photo); await onChoose(file, photo); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Gambar gagal diambil."); }
    finally { setChoosing(null); }
  }

  return <div className="photo-picker" data-testid="photo-picker">
    <form className="photo-search" onSubmit={e => { e.preventDefault(); void search(); }}>
      <input value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="mis. busy office, coffee shop" aria-label="Kata kunci foto" data-testid="photo-query" />
      <button type="submit" disabled={busy || choosing !== null} data-testid="photo-search">{busy ? "Mencari…" : "Cari"}</button>
      <button type="button" onClick={onClose} className="text-link" data-testid="photo-close">Tutup</button>
    </form>
    {error && <div className="notice notice-error" role="alert" data-testid="photo-error">{error}</div>}
    {photos && photos.length > 0 && <div className="photo-grid" data-testid="photo-grid">
      {photos.map(p => (
        <div key={p.id} className="photo-card">
          <button type="button" onClick={() => void choose(p)} disabled={choosing !== null} data-testid="photo-choice" aria-label={`Pakai foto ${p.alt || p.id}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnails from Pexels; shown as they are */}
            <img src={p.thumb} alt={p.alt} loading="lazy" />
            {choosing === p.id && <span className="photo-busy">Mengambil…</span>}
          </button>
          <small>{p.photographerUrl ? <a href={p.photographerUrl} target="_blank" rel="noreferrer noopener">{creditText(p)}</a> : creditText(p)}</small>
        </div>
      ))}
    </div>}
    <small className="photo-note">Foto dari <a href="https://www.pexels.com" target="_blank" rel="noreferrer noopener">Pexels</a>, gratis dipakai (lisensi Pexels){remaining !== null ? `; sisa kuota pencarian jam ini: ${remaining}` : ""}.</small>
  </div>;
}
