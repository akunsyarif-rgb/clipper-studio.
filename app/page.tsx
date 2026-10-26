"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

type Clip = { id: number; start: number; end: number };
const MAX_BYTES = 1024 ** 3;
const MAX_DURATION = 60 * 60;
const timeLabel = (n: number) => {
  const s = Math.max(0, Math.floor(n || 0));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(v => String(v).padStart(2, "0")).join(":");
};
const timeValue = (v: string) => {
  const p = v.trim().split(":").map(Number);
  return p.length === 3 && p.every(n => Number.isFinite(n) && n >= 0) ? p[0] * 3600 + p[1] * 60 + p[2] : NaN;
};
const fileSize = (n: number) => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + " GB" : (n / 1024 ** 2).toFixed(1) + " MB";

export default function Home() {
  const picker = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState("");
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState("00:00:00");
  const [end, setEnd] = useState("00:00:30");
  const [background, setBackground] = useState<"black" | "blur">("black");
  const [hook, setHook] = useState("");
  const [transcript, setTranscript] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  useEffect(() => { if (!src) return; return () => URL.revokeObjectURL(src); }, [src]);
  useEffect(() => { if (!resultUrl) return; return () => URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setMessage(""); setResultUrl(""); setClips([]); setDuration(0);
    if (!f.type.startsWith("video/")) { setMessage("Pilih berkas video yang didukung browser."); e.target.value = ""; return; }
    if (f.size > MAX_BYTES) { setMessage("Ukuran video melebihi batas MVP 1 GB."); e.target.value = ""; return; }
    if (src) URL.revokeObjectURL(src);
    setFile(f); setSrc(URL.createObjectURL(f)); setStart("00:00:00"); setEnd("00:00:30");
    setMessage("Video dipilih. Membaca durasi…");
  }

  function onMetadata() {
    const d = player.current?.duration || 0;
    if (!Number.isFinite(d) || d <= 0) { setMessage("Durasi tidak dapat dibaca. Coba format video lain yang didukung Safari."); return; }
    setDuration(d);
    if (d > MAX_DURATION) { setMessage("Durasi video melebihi batas MVP 60 menit."); return; }
    setEnd(timeLabel(Math.min(30, d)));
    setMessage("Video siap. Sumber diproses lokal di browser.");
  }

  function seek(t: number) { if (player.current && Number.isFinite(t)) player.current.currentTime = Math.max(0, Math.min(t, duration || t)); }

  function addClip() {
    const a = timeValue(start), b = timeValue(end);
    if (!file || !duration) return setMessage("Pilih video dan tunggu durasinya terbaca.");
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || a >= b || b > duration) return setMessage("Rentang waktu tidak valid. Periksa waktu mulai dan selesai.");
    if (clips.length >= 5) return setMessage("Maksimal 5 klip dalam daftar kerja MVP.");
    setClips(old => [...old, { id: Date.now(), start: a, end: b }]);
    setMessage("Rentang ditambahkan. Pilih Ekspor untuk membuat MP4.");
  }

  async function getEngine() {
    if (engineRef.current) return engineRef.current;
    setMessage("Menyiapkan FFmpeg lokal. Unduhan awal membutuhkan internet dan mungkin beberapa saat.");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const engine = new FFmpeg();
    engine.on("progress", ({ progress: p }: { progress: number }) => setProgress(Math.max(0, Math.min(100, Math.round(p * 100)))));
    const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await engine.load({
      coreURL: await toBlobURL(base + "/ffmpeg-core.js", "text/javascript"),
      wasmURL: await toBlobURL(base + "/ffmpeg-core.wasm", "application/wasm"),
    });
    engineRef.current = engine; setEngineReady(true); return engine;
  }

  async function exportVideo(clip?: Clip) {
    if (!file || !duration) return setMessage("Pilih video yang valid terlebih dahulu.");
    const a = clip?.start ?? timeValue(start), b = clip?.end ?? timeValue(end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || a >= b || b > duration) return setMessage("Rentang waktu klip tidak valid.");
    setBusy(true); setProgress(0); setErrorDetail(""); setResultUrl("");
    try {
      const ff = await getEngine();
      const { fetchFile } = await import("@ffmpeg/util");
      await ff.writeFile("source-video", await fetchFile(file));
      const vf = background === "blur"
        ? "split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2[blurred];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[front];[blurred][front]overlay=(W-w)/2:(H-h)/2,setsar=1"
        : "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1";
      await ff.exec(["-ss", a.toFixed(3), "-i", "source-video", "-t", (b - a).toFixed(3), "-vf", vf, "-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "clipper-export.mp4"]);
      const data = await ff.readFile("clipper-export.mp4");
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      setResultUrl(URL.createObjectURL(blob));
      setMessage("MP4 berhasil dibuat di browser. Simpan hasil ke perangkat.");
      await ff.deleteFile("source-video").catch(() => undefined);
      await ff.deleteFile("clipper-export.mp4").catch(() => undefined);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setErrorDetail(detail);
      setMessage("Ekspor gagal. Perangkat mungkin kekurangan memori atau codec tidak didukung. Coba klip lebih pendek.");
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/"><span className="logo">c</span><span>clipper<span className="light">studio</span></span></a><span className="pill"><i /> LOCAL-FIRST MVP</span></header>
    <section className="hero"><div className="eyebrow"><span className="eyebrow-line" /> VIDEO WORKSPACE</div><h1>Video panjang.<br/><em>Potongan yang tepat.</em></h1><p>Siapkan klip vertikal untuk Shorts, Reels, dan TikTok. Pilih video, atur rentang waktu, lalu ekspor dari perangkat.</p><div className="hero-tags"><span><b>01</b> Lokal dahulu</span><span><b>02</b> Tanpa login</span><span><b>03</b> Maks. 1 GB</span></div></section>
    <section className="workspace">
      <div className="section-heading"><div><small>LANGKAH 01</small><h2>Pilih video sumber</h2></div><span className="step-count">01 / 03</span></div>
      <div className={"dropzone " + (file ? "has-file" : "")} onClick={() => !file && picker.current?.click()} role={!file ? "button" : undefined} tabIndex={!file ? 0 : undefined} onKeyDown={e => { if (!file && (e.key === "Enter" || e.key === " ")) picker.current?.click(); }}>
        <input ref={picker} type="file" accept="video/*" onChange={onPick}/>
        {file && src ? <><video ref={player} src={src} controls playsInline preload="metadata" onLoadedMetadata={onMetadata}/><div className="file-details"><span className="file-mark">▶</span><div className="file-name"><strong>{file.name}</strong><span>{fileSize(file.size)} · {duration ? timeLabel(duration) : "Membaca durasi…"}</span></div><button className="text-button" onClick={e => {e.stopPropagation();setFile(null);setSrc("");setDuration(0);setClips([]);setResultUrl("");setMessage("Pilih video baru untuk memulai.");if(picker.current)picker.current.value="";}}>Ganti</button></div></> : <div className="empty-drop"><div className="upload-icon"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg></div><strong>Ketuk untuk memilih video</strong><span>Ambil dari Files atau Photos di iPhone/iPad</span><div className="format-chips"><span>MP4</span><span>MOV</span><span>≤ 1 GB</span></div><small>Format/codec harus didukung browser.</small></div>}
      </div>
      <div className="privacy-note"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span><strong>Video tetap di perangkat.</strong> Pemotongan dilakukan di browser. FFmpeg diunduh saat ekspor pertama kali.</span></div>
      <div className="section-heading second"><div><small>LANGKAH 02</small><h2>Pilih bagian video</h2></div><span className="step-count">02 / 03</span></div>
      <div className="time-grid"><label>Waktu mulai<input value={start} onChange={e=>setStart(e.target.value)} onBlur={()=>seek(timeValue(start))} placeholder="00:00:00" inputMode="numeric"/></label><label>Waktu selesai<input value={end} onChange={e=>setEnd(e.target.value)} placeholder="00:00:30" inputMode="numeric"/></label></div>
      <div className="range-tools"><button disabled={!file} onClick={()=>{setStart(timeLabel(player.current?.currentTime||0));setMessage("Waktu mulai diambil dari posisi video.");}}>Ambil posisi saat ini sebagai mulai</button><button disabled={!file} onClick={()=>{setEnd(timeLabel(player.current?.currentTime||0));setMessage("Waktu selesai diambil dari posisi video.");}}>Ambil posisi saat ini sebagai selesai</button></div>
      <div className="settings-label">Latar video vertikal</div><div className="background-options">
        <button className={"background-option "+(background==="black"?"active":"")} onClick={()=>setBackground("black")}><span className="bg-preview bg-black"><i/></span><span><strong>Hitam</strong><small>Sederhana dan ringan</small></span><span className="radio-dot"/></button>
        <button className={"background-option "+(background==="blur"?"active":"")} onClick={()=>setBackground("blur")}><span className="bg-preview bg-blur"><i/></span><span><strong>Blur</strong><small>Latar buram dari video</small></span><span className="radio-dot"/></button>
      </div>
      <div className="settings-label">Teks opsional <span>belum dibakar ke video</span></div><label className="field-label">Hook / teks pembuka<input value={hook} maxLength={90} onChange={e=>setHook(e.target.value)} placeholder="Contoh: 3 hal yang baru saya sadari…"/></label><label className="field-label">Subtitle / transkrip<textarea value={transcript} maxLength={4000} onChange={e=>setTranscript(e.target.value)} rows={3} placeholder="Tempel teks transkrip sebagai referensi klip."/></label>
      <div className="preview-card"><div className={"portrait-preview "+(background==="blur"?"preview-blur":"preview-black")}>{src&&<video src={src} muted playsInline/>}<div className="portrait-overlay">{hook&&<strong>{hook}</strong>}{transcript&&<span>{transcript.slice(0,120)}</span>}</div><span className="preview-label">PRATINJAU</span></div><div className="preview-copy"><strong>Format output 9:16</strong><span>1080 × 1920 · MP4</span><small>Pratinjau komposisi. Hook dan subtitle belum ikut dirender pada build ini.</small></div></div>
      <button className="secondary-button" disabled={!file||!duration||clips.length>=5} onClick={addClip}><span>＋</span> Tambahkan rentang ke daftar klip <small>{clips.length}/5</small></button>
      {clips.length>0&&<div className="clip-list"><div className="clip-list-heading"><strong>Daftar klip</strong><button className="text-button" onClick={()=>setClips([])}>Hapus semua</button></div>{clips.map((clip,i)=><div className="clip-row" key={clip.id}><span className="clip-number">{String(i+1).padStart(2,"0")}</span><div className="clip-meta"><strong>Klip {i+1}</strong><span>{timeLabel(clip.start)} – {timeLabel(clip.end)} · {Math.round(clip.end-clip.start)} dtk</span></div><button className="text-button" onClick={()=>{setStart(timeLabel(clip.start));setEnd(timeLabel(clip.end));seek(clip.start);}}>Edit</button><button className="icon-button" aria-label="Hapus klip" onClick={()=>setClips(old=>old.filter(c=>c.id!==clip.id))}>×</button><button className="row-export" disabled={busy} onClick={()=>exportVideo(clip)}>Ekspor</button></div>)}</div>}
      <div className="section-heading second"><div><small>LANGKAH 03</small><h2>Render dan simpan</h2></div><span className="step-count">03 / 03</span></div>
      <div className="engine-status"><span className={"status-dot "+(engineReady?"ready":"")}/><div><strong>{engineReady?"Mesin lokal siap":"Mesin video belum dimuat"}</strong><small>{engineReady?"FFmpeg berjalan di browser":"Diunduh saat ekspor pertama kali"}</small></div><span className="engine-badge">WASM</span></div>
      {busy&&<div className="progress-wrap"><div className="progress-label"><span>Memproses video lokal…</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{width:progress+"%"}}/></div><small>Jangan tutup tab hingga ekspor selesai. Video panjang dapat membutuhkan waktu.</small></div>}
      <button className="primary-button" disabled={!file||!duration||busy} onClick={()=>exportVideo()}><span>{busy?"Sedang memproses…":"Ekspor klip MP4"}</span><svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
      {resultUrl&&<div className="download-card"><span className="download-check">✓</span><div><strong>Video selesai dibuat</strong><span>MP4 · tersimpan sementara di browser</span></div><a className="download-button" href={resultUrl} download="clipper-studio.mp4">Simpan MP4 ↓</a></div>}
      {message&&<div className="notice" role="status">{message}</div>}{errorDetail&&<details className="error-details"><summary>Detail teknis</summary><code>{errorDetail}</code></details>}
      <p className="fine-print">Batas MVP: 60 menit / 1 GB. Kinerja bergantung pada perangkat, codec, memori, dan browser. AI pemilih klip serta transkripsi otomatis belum terhubung pada build ini.</p>
    </section>
    <section className="bottom-note"><div className="bottom-icon">✦</div><div><strong>Lebih sederhana untuk workflow kreator.</strong><p>Tanpa akun. Tanpa unggah video ke server untuk pemotongan. Pilih momen, koreksi, dan simpan hasilnya.</p></div></section>
    <footer><a className="footer-brand" href="/">CLIPPER STUDIO</a><span>Local-first · Mobile-first</span></footer>
  </main>;
}
