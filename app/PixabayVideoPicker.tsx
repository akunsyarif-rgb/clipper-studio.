"use client";

import { useEffect, useRef, useState } from "react";
import { PixabayError, searchPixabayVideos, type PixabayVideo } from "@/lib/pixabay";

export default function PixabayVideoPicker({ initialQuery, onChoose, onClose }: {
  initialQuery: string;
  onChoose: (video: PixabayVideo) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [videos, setVideos] = useState<PixabayVideo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function search(value = query) {
    if (value.trim().length < 2) { setError("Ketik minimal dua karakter. Kata kunci bahasa Inggris biasanya memberi hasil lebih baik."); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true); setError("");
    try {
      const result = await searchPixabayVideos(value.trim(), { perPage: 8, signal: controller.signal });
      setVideos(result.videos);
      if (!result.videos.length) setError("Tidak ada video yang cocok. Coba kata kunci lain.");
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof PixabayError ? e.message : "Pencarian video Pixabay gagal.");
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  }

  return <div className="photo-picker" data-testid="pixabay-video-picker">
    <form className="photo-search" onSubmit={e => { e.preventDefault(); void search(); }}>
      <input value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="mis. rainy city, ocean waves" aria-label="Kata kunci video Pixabay" data-testid="pixabay-video-query" />
      <button type="submit" disabled={busy} data-testid="pixabay-video-search">{busy ? "Mencari…" : "Cari video"}</button>
      <button type="button" onClick={onClose} className="text-link">Tutup</button>
    </form>
    {error && <div className="notice notice-error" role="alert" data-testid="pixabay-video-error">{error}</div>}
    {videos && videos.length > 0 && <div className="photo-grid" data-testid="pixabay-video-grid">
      {videos.map(video => <div key={video.id} className="photo-card">
        <button type="button" onClick={() => { onChoose(video); onClose(); }} disabled={busy} data-testid="pixabay-video-choice" aria-label={`Pakai video ${video.tags || video.id}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- temporary Pixabay video thumbnail */}
          <img src={video.thumbnail} alt={video.tags} loading="lazy" />
          <span className="photo-busy">{video.duration}s · {video.width}×{video.height}</span>
        </button>
        <small><a href={video.pageUrl} target="_blank" rel="noreferrer noopener">{video.photographer} · Pixabay</a></small>
      </div>)}
    </div>}
    <small className="photo-note">Video diputar tanpa suara sebagai latar scene. Sumber dan kontributor tetap dicantumkan. Hasil pencarian di-cache 24 jam sesuai ketentuan API.</small>
  </div>;
}
