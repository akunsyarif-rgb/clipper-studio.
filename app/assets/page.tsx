"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { downloadPixabayPhoto, PixabayError, searchPixabayPhotos, pixabayCredit, type PixabayPhoto } from "@/lib/pixabay";

type LocalAudio = { file: File; url: string };

const tabs = [
  { id: "photo", label: "Foto" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio & SFX" },
  { id: "motion", label: "Animasi" },
] as const;
type Tab = (typeof tabs)[number]["id"];

export default function AssetManagerPage() {
  const [tab, setTab] = useState<Tab>("photo");
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<PixabayPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [audio, setAudio] = useState<LocalAudio[]>([]);
  const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    abort.current?.abort();
    audio.forEach(item => URL.revokeObjectURL(item.url));
  }, [audio]);

  async function search() {
    if (query.trim().length < 2) { setError("Masukkan minimal dua karakter."); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true); setError(""); setPhotos([]);
    try {
      const result = await searchPixabayPhotos(query.trim(), { perPage: 12, signal: controller.signal });
      setPhotos(result.photos);
      if (!result.photos.length) setError("Tidak ada hasil. Coba kata kunci bahasa Inggris.");
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof PixabayError ? e.message : "Pencarian gagal.");
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  }

  async function choose(photo: PixabayPhoto) {
    setNotice("");
    try {
      const file = await downloadPixabayPhoto(photo);
      const url = URL.createObjectURL(file);
      setSelected(old => [...old.filter(id => id !== String(photo.id)), String(photo.id)]);
      setNotice(`Foto “${photo.alt || photo.id}” siap digunakan. File berada di sesi browser ini.`);
      // Keep the selected file available for this session without uploading it.
      window.dispatchEvent(new CustomEvent("clipper:asset-selected", { detail: { kind: "image", file, credit: pixabayCredit(photo) } }));
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil foto.");
    }
  }

  function addAudio(files: FileList | null) {
    if (!files) return;
    const accepted = Array.from(files).filter(file => /^(audio\/(mpeg|mp4|wav|ogg|webm|aac|x-wav)|application\/ogg)$/i.test(file.type) || /\.(mp3|m4a|wav|ogg|aac|webm)$/i.test(file.name));
    if (!accepted.length) { setError("Pilih file audio MP3, M4A, WAV, OGG, AAC, atau WebM."); return; }
    setAudio(old => [...old, ...accepted.slice(0, 10 - old.length).map(file => ({ file, url: URL.createObjectURL(file) }))]);
    setError("");
    setNotice(`${accepted.length} file audio ditambahkan secara lokal. Tidak ada file yang diunggah ke server.`);
  }

  return <main style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px 64px", color: "var(--foreground, #17211c)" }}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 24 }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, opacity: .65, letterSpacing: ".08em", textTransform: "uppercase" }}>Clipper Studio</p>
        <h1 style={{ margin: "6px 0", fontSize: 28 }}>Asset Manager</h1>
        <p style={{ margin: 0, opacity: .7 }}>Kelola sumber visual, audio, dan animasi dalam satu tempat.</p>
      </div>
      <Link href="/motion" style={{ padding: "10px 14px", border: "1px solid currentColor", borderRadius: 12, textDecoration: "none", whiteSpace: "nowrap" }}>Ke Motion Studio</Link>
    </header>

    <nav aria-label="Jenis aset" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12 }}>
      {tabs.map(item => <button key={item.id} onClick={() => { setTab(item.id); setError(""); }} aria-pressed={tab === item.id} style={{ border: "1px solid #9aa69d", borderRadius: 999, padding: "10px 16px", background: tab === item.id ? "#1d4935" : "transparent", color: tab === item.id ? "#fff" : "inherit", whiteSpace: "nowrap" }}>{item.label}</button>)}
    </nav>

    {error && <p role="alert" style={{ padding: 12, borderRadius: 10, background: "#fff0ed", color: "#922d20" }}>{error}</p>}
    {notice && <p role="status" style={{ padding: 12, borderRadius: 10, background: "#eaf5ed", color: "#205b35" }}>{notice}</p>}

    {tab === "photo" && <section>
      <h2>Foto Pixabay</h2>
      <p style={{ opacity: .7 }}>Pencarian memakai API Pixabay yang sudah dikonfigurasi di Vercel. Hasil pencarian di-cache 24 jam.</p>
      <form onSubmit={e => { e.preventDefault(); void search(); }} style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Contoh: city at night, old library" aria-label="Cari foto" style={{ flex: 1, minWidth: 0, padding: 12, border: "1px solid #9aa69d", borderRadius: 10 }} />
        <button disabled={busy} style={{ padding: "10px 18px", borderRadius: 10 }}>{busy ? "Mencari…" : "Cari"}</button>
      </form>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
        {photos.map(photo => <article key={photo.id} style={{ border: "1px solid #d8dfda", borderRadius: 12, overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.thumb} alt={photo.alt} loading="lazy" style={{ width: "100%", aspectRatio: "4/5", objectFit: "cover", display: "block" }} />
          <div style={{ padding: 10 }}>
            <small><a href={pixabayCredit(photo).href} target="_blank" rel="noreferrer">{photo.photographer} · Pixabay</a></small>
            <button onClick={() => void choose(photo)} style={{ width: "100%", marginTop: 8, padding: 8, borderRadius: 8 }}>{selected.includes(String(photo.id)) ? "Pilih lagi" : "Gunakan foto"}</button>
          </div>
        </article>)}
      </div>
    </section>}

    {tab === "video" && <section>
      <h2>Video Pixabay</h2>
      <p>API key Pixabay yang terpasang mendukung pencarian video melalui endpoint resminya. Untuk tahap ini, buka katalog Pixabay, pilih video, lalu unduh secara manual. Pengambilan otomatis dari halaman katalog tidak digunakan.</p>
      <a href={`https://pixabay.com/videos/search/${encodeURIComponent(query.trim() || "cinematic")}/`} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "12px 16px", borderRadius: 10, background: "#1d4935", color: "#fff", textDecoration: "none" }}>Cari video di Pixabay ↗</a>
    </section>}

    {tab === "audio" && <section>
      <h2>Musik & Sound Effects</h2>
      <p>Pixabay menyediakan katalog musik dan SFX, tetapi API publiknya belum mendokumentasikan endpoint pencarian audio. Karena itu, pencarian dan unduhan dilakukan langsung di situs Pixabay. Setelah diunduh, impor file ke sini untuk preview lokal.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
        <a href={`https://pixabay.com/sound-effects/search/${encodeURIComponent(query.trim() || "whoosh")}/`} target="_blank" rel="noreferrer" style={{ padding: "11px 14px", borderRadius: 10, background: "#1d4935", color: "#fff", textDecoration: "none" }}>Cari Sound Effects ↗</a>
        <a href={`https://pixabay.com/music/search/${encodeURIComponent(query.trim() || "cinematic")}/`} target="_blank" rel="noreferrer" style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid #9aa69d", textDecoration: "none" }}>Cari Musik ↗</a>
      </div>
      <label style={{ display: "block", margin: "16px 0 8px" }}>Kata kunci pencarian (opsional)</label>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Contoh: dramatic impact, door creak" style={{ width: "100%", maxWidth: 520, padding: 12, border: "1px solid #9aa69d", borderRadius: 10 }} />
      <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" multiple hidden onChange={e => addAudio(e.target.files)} />
      <button onClick={() => audioInput.current?.click()} style={{ display: "block", marginTop: 14, padding: 12, borderRadius: 10 }}>Impor audio dari perangkat</button>
      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {audio.map((item, index) => <article key={item.url} style={{ padding: 12, border: "1px solid #d8dfda", borderRadius: 12 }}>
          <strong>{item.file.name}</strong>
          <audio controls preload="metadata" src={item.url} style={{ width: "100%", display: "block", marginTop: 8 }} />
          <small>{(item.file.size / 1024 / 1024).toFixed(2)} MB · tersimpan sementara di browser</small>
          <button onClick={() => { URL.revokeObjectURL(item.url); setAudio(old => old.filter((_, i) => i !== index)); }} style={{ display: "block", marginTop: 8 }}>Hapus</button>
        </article>)}
      </div>
    </section>}

    {tab === "motion" && <section>
      <h2>Animasi & Motion Graphics</h2>
      <p>Gunakan animasi native Remotion yang sudah tersedia di Motion Studio. Pendekatan ini menghindari ketergantungan pada katalog eksternal dan menjaga hasil tetap konsisten.</p>
      <ul style={{ lineHeight: 1.9 }}>
        <li>Tipografi kinetik dan penekanan kata.</li>
        <li>Overlay dan transisi berbasis frame.</li>
        <li>Visual cerita, diagram, dan metafora.</li>
        <li>Stiker SVG dengan atribusi lisensi.</li>
      </ul>
      <Link href="/motion" style={{ display: "inline-block", padding: "12px 16px", borderRadius: 10, background: "#1d4935", color: "#fff", textDecoration: "none" }}>Buka Motion Studio</Link>
    </section>}

    <footer style={{ marginTop: 36, paddingTop: 16, borderTop: "1px solid #d8dfda", fontSize: 12, opacity: .7 }}>
      Catatan: aset lokal hanya berada di sesi halaman ini. Pemilihan foto mengunduh file melalui server; audio yang diimpor tidak diunggah. Simpan aset ke proyek/timeline melalui alur editor sebelum menutup halaman.
    </footer>
  </main>;
}
