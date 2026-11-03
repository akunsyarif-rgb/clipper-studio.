"use client";

import { useEffect, useRef, useState } from "react";
import { downloadPixabayPhoto, PixabayError, searchPixabayPhotos, searchPixabayVideos, type PixabayPhoto, type PixabayVideo } from "@/lib/pixabay";
import { iconLookupFor } from "@/lib/icon-keywords";

const MAX_AUTO = 12;
type SceneInfo = { text: string; /** English search phrase from the AI director, if any. */ query?: string; hasImage: boolean };

/** What to search for a scene: the director's English phrase, else the dictionary's English word for what the scene says. */
export const photoQueryFor = (s: SceneInfo) => iconLookupFor(s.text, s.query).query.trim();

/**
 * Pictures found for you: one tap fills every scene that has no picture with the best Pixabay match for what it says. No setup and
 * no AI needed (the Pixabay key is on the server). Only when you press the button, one search at a time, at most 12 scenes; each
 * photo can be swapped or removed in the scene list afterwards.
 */
export default function PixabayAutoPanel({ scenes, onApply, onApplyVideo, musicOn, onMusic, disabled }: {
  scenes: SceneInfo[];
  onApply: (text: string, file: File, photo: PixabayPhoto) => Promise<void>;
  /** A stock clip is set as the scene's muted background (no file is downloaded). */
  onApplyVideo: (text: string, video: PixabayVideo) => void;
  musicOn: boolean;
  /** Turns the automatic backsound on (made on the device from the video's style). */
  onMusic: () => void;
  disabled: boolean;
}) {
  const [kind, setKind] = useState<"photo" | "video">("photo");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const todo = scenes.filter(s => !s.hasImage && photoQueryFor(s).length >= 2).slice(0, MAX_AUTO);
  const skipped = scenes.filter(s => !s.hasImage).length - todo.length;

  async function fillAll() {
    const ctl = new AbortController(); abort.current = ctl;
    setBusy(true); setError(""); setSummary(""); setProgress({ done: 0, total: todo.length });
    let placed = 0, missed = 0;
    const used = new Set<number>();
    try {
      for (const [i, s] of todo.entries()) {
        if (ctl.signal.aborted) break;
        try {
          if (kind === "video") {
            const found = await searchPixabayVideos(photoQueryFor(s), { perPage: 6, signal: ctl.signal });
            // Short, light clips: they play muted behind the scene, so the smallest portrait-friendly one is enough.
            const pick = found.videos.filter(v => !used.has(v.id) && v.duration <= 30).sort((a, b) => a.size - b.size)[0];
            if (!pick) { missed++; continue; }
            used.add(pick.id); onApplyVideo(s.text, pick); placed++;
          } else {
            const found = await searchPixabayPhotos(photoQueryFor(s), { perPage: 6, imageType: "photo", signal: ctl.signal });
            const pick = found.photos.find(p => !used.has(p.id));
            if (!pick) { missed++; continue; }
            used.add(pick.id);
            await onApply(s.text, await downloadPixabayPhoto(pick, ctl.signal), pick);
            placed++;
          }
        } catch (e) {
          if (ctl.signal.aborted) break;
          if (e instanceof PixabayError && e.kind !== "server") throw e; // no key, rate limit, no network: stop and say so
          missed++;
        }
        setProgress({ done: i + 1, total: todo.length });
      }
      setSummary(`${placed} adegan diberi ${kind === "video" ? "video" : "foto"}${missed ? `, ${missed} tanpa hasil yang cocok` : ""}${skipped > 0 ? `, ${skipped} dilewati (belum ada kata kunci Inggris: jalankan Sutradara AI atau pilih foto manual)` : ""}. Ganti atau hapus per adegan bila kurang pas.`);
    } catch (e) {
      setError(e instanceof PixabayError ? e.message : "Pencarian gagal. Coba lagi.");
      if (placed) setSummary(`${placed} adegan sempat diisi sebelum berhenti.`);
    } finally { setBusy(false); setProgress(null); }
  }

  if (scenes.length === 0) return null;
  return <section className="auto-assets" data-testid="pixabay-auto">
    <h3>Gambar & musik otomatis</h3>
    <div className="seg-row" role="radiogroup" aria-label="Jenis gambar">
      <button type="button" role="radio" aria-checked={kind === "photo"} className={kind === "photo" ? "active" : ""} disabled={busy} onClick={() => setKind("photo")} data-testid="auto-kind-photo">Foto</button>
      <button type="button" role="radio" aria-checked={kind === "video"} className={kind === "video" ? "active" : ""} disabled={busy} onClick={() => setKind("video")} data-testid="auto-kind-video">Video latar</button>
    </div>
    <p className="preview-disclaimer">Cari {kind === "video" ? "video pendek (maks. 30 dtk, diputar tanpa suara di belakang teks)" : "foto"} yang cocok untuk tiap adegan yang belum punya gambar. Kata kunci pencarian dikirim ke Pixabay; naskah dan video tidak dikirim. Hanya berjalan saat Anda menekan tombol.</p>
    <div className="button-row">
      <button type="button" onClick={() => void fillAll()} disabled={disabled || busy || todo.length === 0} data-testid="pixabay-auto-run">{busy ? `Mencari… ${progress?.done ?? 0}/${progress?.total ?? 0}` : `Cari ${kind === "video" ? "video" : "foto"} otomatis (${todo.length} adegan)`}</button>
      {busy && <button type="button" onClick={() => abort.current?.abort()} data-testid="pixabay-auto-cancel">Batal</button>}
    </div>
    {error && <div className="notice notice-error" role="alert" data-testid="pixabay-auto-error">{error}</div>}
    {summary && <div className="notice" role="status" data-testid="pixabay-auto-summary">{summary}</div>}
    <div className="music-auto" data-testid="music-auto">
      <p className="preview-disclaimer">Musik dan efek suara dibuat otomatis di perangkat Anda (gratis, tanpa API, mengikuti gaya video). Musik dan SFX Pixabay tidak punya API resmi, jadi tidak bisa dicari otomatis.</p>
      <button type="button" onClick={onMusic} disabled={disabled || musicOn} data-testid="music-auto-on">{musicOn ? "Musik otomatis sudah aktif" : "Nyalakan musik otomatis"}</button>
    </div>
  </section>;
}
