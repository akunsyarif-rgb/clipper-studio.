"use client";

import { useEffect, useRef, useState } from "react";
import { downloadPixabayPhoto, PixabayError, searchPixabayPhotos, pixabayCredit, type PixabayPhoto, type PixabayImageType } from "@/lib/pixabay";

export default function PixabayPhotoPicker({ initialQuery, onChoose, onClose }: {
  initialQuery: string;
  onChoose: (file: File, photo: PixabayPhoto) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [imageType, setImageType] = useState<PixabayImageType>("all");
  const [photos, setPhotos] = useState<PixabayPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function search(q = query) {
    if (q.trim().length < 2) { setError("Ketik minimal dua karakter. Kata kunci bahasa Inggris biasanya memberi hasil lebih baik."); return; }
    abort.current?.abort();
    const ctl = new AbortController(); abort.current = ctl;
    setBusy(true); setError("");
    try {
      const result = await searchPixabayPhotos(q.trim(), { perPage: 8, imageType, signal: ctl.signal });
      setPhotos(result.photos);
      if (!result.photos.length) setError("Tidak ada gambar yang cocok. Coba kata kunci lain.");
    } catch (e) {
      if (!ctl.signal.aborted) setError(e instanceof PixabayError ? e.message : "Pencarian Pixabay gagal.");
    } finally {
      if (abort.current === ctl) setBusy(false);
    }
  }
  useEffect(() => { if (initialQuery.trim().length >= 2) void search(initialQuery); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function choose(photo: PixabayPhoto) {
    setChoosing(photo.id); setError("");
    try {
      const file = await downloadPixabayPhoto(photo);
      await onChoose(file, photo);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Gambar gagal diambil."); }
    finally { setChoosing(null); }
  }

  return <div className="photo-picker" data-testid="pixabay-photo-picker">
    <form className="photo-search" onSubmit={e => { e.preventDefault(); void search(); }}>
      <input value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="mis. city at night, old library" aria-label="Kata kunci Pixabay" data-testid="pixabay-query" />
      <select value={imageType} onChange={e => setImageType(e.target.value as PixabayImageType)} aria-label="Jenis aset Pixabay" data-testid="pixabay-image-type"><option value="all">Semua gambar</option><option value="photo">Foto</option><option value="illustration">Ilustrasi</option><option value="vector">Vektor</option></select>
      <button type="submit" disabled={busy || choosing !== null} data-testid="pixabay-search">{busy ? "Mencari…" : "Cari"}</button>
      <button type="button" onClick={onClose} className="text-link">Tutup</button>
    </form>
    {error && <div className="notice notice-error" role="alert" data-testid="pixabay-error">{error}</div>}
    {photos && photos.length > 0 && <div className="photo-grid" data-testid="pixabay-photo-grid">
      {photos.map(photo => (
        <div key={photo.id} className="photo-card">
          <button type="button" onClick={() => void choose(photo)} disabled={choosing !== null} data-testid="pixabay-photo-choice" aria-label={`Pakai gambar ${photo.alt || photo.id}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- temporary Pixabay search thumbnail */}
            <img src={photo.thumb} alt={photo.alt} loading="lazy" />
            {choosing === photo.id && <span className="photo-busy">Mengambil…</span>}
          </button>
          <small><a href={pixabayCredit(photo).href} target="_blank" rel="noreferrer noopener">{photo.photographer} · Pixabay</a></small>
        </div>
      ))}
    </div>}
    <small className="photo-note">Foto, ilustrasi, dan vektor dari <a href="https://pixabay.com" target="_blank" rel="noreferrer noopener">Pixabay</a>. Aset terpilih diunduh sebelum dipakai; hasil pencarian di-cache 24 jam sesuai ketentuan API.</small>
  </div>;
}
