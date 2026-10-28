"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ASPECTS, FITS, QUALITIES, MAX_CLIP_SECONDS, exportFileName, explainError, formatBytes, formatTime, outputSize,
  checkedVideo, parseTime, parseYouTube, validateFile, validateRange, type Aspect, type Fit, type Quality, type YouTubeRef,
} from "@/lib/clip";
import TranscriptPanel from "./TranscriptPanel";
import CloudAccount from "./CloudAccount";
import ClipFlow, { type NewClip } from "./ClipFlow";
import YoutubeFlow from "./YoutubeFlow";
import { lengthsMatch } from "@/lib/youtube";
import { useGeminiAccess } from "./useGeminiAccess";
import { saveClipHandoff } from "@/lib/session-store";
import { clearClipperWork, loadClipperWork, saveClipperWork } from "@/lib/clipper-memory";
import type { Transcript } from "@/lib/transcript";
import { releaseAsr } from "@/lib/asr/client";
import { ExportCancelled, exportClip, isEngineLoaded, terminateEngine } from "@/lib/engine";

type Clip = { id: number; start: number; end: number; title?: string; transcript?: Transcript };
/** `after` takes the finished clip instead of offering it for download (used to hand it to the motion studio). */
type Job = { start: number; duration: number; aspect?: Aspect; after?: (blob: Blob) => Promise<void> };
const MAX_CLIPS = 10;

export default function Home() {
  const router = useRouter();
  const ai = useGeminiAccess();
  const picker = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const cancelled = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState("");
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState("00:00:00");
  const [end, setEnd] = useState("00:00:30");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [quality, setQuality] = useState<Quality>("720");
  const [fit, setFit] = useState<Fit>("pad");
  const [hook, setHook] = useState("");
  const [transcript, setTranscript] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "loading" | "encoding">("idle");
  const [engineReady, setEngineReady] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string; size: number; label: string } | null>(null);
  const [lastJob, setLastJob] = useState<Job | null>(null);
  const [errorDetail, setErrorDetail] = useState("");
  const [yt, setYt] = useState<YouTubeRef | null>(null);
  const [asrBusy, setAsrBusy] = useState(false);
  const busy = phase !== "idle";
  // Coming back from another page (e.g. the motion studio): the video, cut list and settings are put back as they were.
  const [restored, setRestored] = useState(false);
  const keepRange = useRef(false);
  useEffect(() => {
    const w = loadClipperWork();
    if (w) {
      keepRange.current = true;
      setFile(w.file); setSrc(URL.createObjectURL(w.file)); setDuration(w.duration);
      setStart(w.start); setEnd(w.end); setAspect(w.aspect); setQuality(w.quality); setFit(w.fit); setHook(w.hook); setTranscript(w.transcript); setClips(w.clips);
      setMessage("Video dan daftar klip Anda dipulihkan.");
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    if (!file) { clearClipperWork(); return; }
    saveClipperWork({ file, duration, start, end, aspect, quality, fit, hook, transcript, clips });
  }, [restored, file, duration, start, end, aspect, quality, fit, hook, transcript, clips]);

  useEffect(() => { if (!src) return; return () => URL.revokeObjectURL(src); }, [src]);
  useEffect(() => { if (!result) return; const url = result.url; return () => URL.revokeObjectURL(url); }, [result]);
  useEffect(() => () => terminateEngine(), []);

  function say(text: string, error = false) { setMessage(text); setIsError(error); }

  function resetFile() {
    setFile(null); setSrc(""); setDuration(0); setClips([]); setResult(null); setLastJob(null); setErrorDetail("");
    if (picker.current) picker.current.value = "";
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const check = validateFile(f);
    if (!check.ok) { e.target.value = ""; return say(check.error, true); }
    resetFile();
    setFile(f); setSrc(URL.createObjectURL(f)); setStart("00:00:00"); setEnd("00:00:30");
    say("Video dipilih. Membaca durasi…");
  }

  function onMetadata() {
    const d = player.current?.duration || 0;
    if (!Number.isFinite(d) || d <= 0) return say("Durasi tidak dapat dibaca. Browser ini mungkin tidak mendukung codec video tersebut. Coba MP4 (H.264).", true);
    setDuration(d);
    if (d > 60 * 60) return say("Durasi video melebihi batas MVP 60 menit.", true);
    if (keepRange.current) { keepRange.current = false; return; }
    setEnd(formatTime(Math.min(30, d)));
    say("Video siap. Sumber diproses lokal di browser, tidak diunggah ke server.");
  }

  function onVideoError() {
    say("Browser tidak dapat memutar video ini (format/codec tidak didukung). Coba MP4 H.264 atau MOV dari kamera iPhone.", true);
  }

  function seek(t: number) {
    if (player.current && Number.isFinite(t)) player.current.currentTime = Math.max(0, Math.min(t, duration || t));
  }

  function currentRange() { return validateRange(start, end, duration); }

  // Clips approved from a YouTube link wait here until the matching video file is chosen.
  const [pending, setPending] = useState<{ clips: NewClip[]; seconds: number } | null>(null);
  function approveYoutube(items: NewClip[], seconds: number) {
    setPending({ clips: items, seconds });
    if (!file) { say("Pilih file video yang sama dengan video YouTube itu. Klipnya akan ditambahkan otomatis."); picker.current?.click(); }
  }
  useEffect(() => {
    if (!pending || !file || !duration) return;
    if (!lengthsMatch(duration, pending.seconds)) { say(`File ini berdurasi ${formatTime(duration)}, sedangkan video YouTube ${formatTime(pending.seconds)}. Pilih file yang sama dengan video itu.`, true); return; }
    addClips(pending.clips);
    setPending(null);
  }, [pending, file, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Adds the clips the creator approved from the AI's suggestions (as many as fit). */
  function addClips(items: NewClip[]) {
    const room = MAX_CLIPS - clips.length;
    if (room <= 0) return say(`Maksimal ${MAX_CLIPS} klip dalam daftar kerja.`, true);
    const take = items.slice(0, room);
    setClips(old => [...old, ...take.map((c, i) => ({ id: Date.now() + i, start: c.start, end: c.end, title: c.title, transcript: c.transcript }))]);
    say(`${take.length} klip ditambahkan ke daftar. Ketuk Ekspor pada klip, atau Ke Motion untuk mengeditnya lebih lanjut.`);
  }

  /** Cuts one clip (always 9:16, what the motion studio edits) and hands it over, with its own subtitles, to the motion studio. */
  function sendToMotion(c: { start: number; end: number; title?: string; transcript?: Transcript | null }) {
    if (!file) return;
    const name = exportFileName(file.name, "9:16", quality, c.start);
    void runExport({
      start: c.start, duration: c.end - c.start, aspect: "9:16",
      after: async blob => {
        const checked = await checkedVideo(blob);
        if (!checked.probe.ok) {
          const { width, height } = outputSize("9:16", quality);
          setResult({ url: URL.createObjectURL(blob), name, size: blob.size, label: `${width}×${height} · ${formatTime(c.end - c.start)}` });
          setErrorDetail(checked.probe.detail);
          say("Hasil potongan tidak bisa diputar di browser ini, jadi tidak dikirim ke Motion. Coba unduh hasilnya, atau ekspor ulang (kualitas lebih rendah bisa membantu).", true);
          return;
        }
        const ok = await saveClipHandoff({ blob: checked.blob, name, type: "video/mp4", seconds: c.end - c.start, title: c.title ?? "", transcript: c.transcript ?? null, at: Date.now() });
        if (!ok) { say("Browser menolak menyimpan klip untuk dikirim. Ekspor dulu lalu pilih videonya di Motion Graphics.", true); return; }
        router.push("/motion");
      },
    });
  }

  function addClip() {
    if (!file || !duration) return say("Pilih video dan tunggu durasinya terbaca.", true);
    const r = currentRange();
    if (!r.ok) return say(r.error, true);
    if (clips.length >= MAX_CLIPS) return say(`Maksimal ${MAX_CLIPS} klip dalam daftar kerja.`, true);
    setClips(old => [...old, { id: Date.now(), start: r.start, end: r.end }]);
    say("Rentang ditambahkan. Ketuk Ekspor pada klip atau tombol utama di bawah.");
  }

  async function runExport(job: Job) {
    if (!file) return;
    cancelled.current = false;
    // The speech model is not needed while exporting; free its memory for the encoder.
    releaseAsr();
    setLastJob(job); setErrorDetail(""); setResult(null); setProgress(0);
    setPhase(isEngineLoaded() ? "encoding" : "loading");
    say(isEngineLoaded() ? "Memproses video…" : "Menyiapkan mesin video lokal (±32 MB, sekali per sesi)…");
    try {
      const blob = await exportClip({
        file, start: job.start, duration: job.duration, aspect: job.aspect ?? aspect, quality, fit,
        onProgress: p => { setPhase("encoding"); setProgress(Math.round(p * 100)); },
      });
      if (cancelled.current) throw new ExportCancelled();
      setEngineReady(true);
      if (job.after) { await job.after(blob); return; }
      const { width, height } = outputSize(aspect, quality);
      setResult({ url: URL.createObjectURL(blob), name: exportFileName(file.name, aspect, quality, job.start), size: blob.size, label: `${width}×${height} · ${formatTime(job.duration)}` });
      say("MP4 berhasil dibuat di perangkat ini. Simpan hasilnya sebelum menutup tab.");
    } catch (err) {
      if (cancelled.current || err instanceof ExportCancelled) {
        setEngineReady(false);
        say("Ekspor dibatalkan. Anda bisa mengulanginya kapan saja.");
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        setErrorDetail(detail);
        // A crashed worker cannot be reused safely; reload it on the next attempt.
        terminateEngine(); setEngineReady(false);
        say(explainError(detail), true);
      }
    } finally { setPhase("idle"); }
  }

  function exportCurrent() {
    if (!file || !duration) return say("Pilih video yang valid terlebih dahulu.", true);
    const r = currentRange();
    if (!r.ok) return say(r.error, true);
    void runExport({ start: r.start, duration: r.duration });
  }

  function cancel() {
    cancelled.current = true;
    terminateEngine();
  }

  async function share() {
    if (!result) return;
    try {
      const blob = await fetch(result.url).then(r => r.blob());
      const f = new File([blob], result.name, { type: "video/mp4" });
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: result.name });
      else say("Berbagi berkas tidak didukung browser ini. Gunakan tombol Simpan MP4.");
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) say("Gagal membuka menu berbagi. Gunakan tombol Simpan MP4.", true);
    }
  }

  const { width: outW, height: outH } = outputSize(aspect, quality);
  const range = file && duration ? currentRange() : null;
  const startSeconds = parseTime(start);

  return <main className="shell">
    <header className="topbar"><Link className="brand" href="/"><span className="logo">c</span><span>clipper<span className="light">studio</span></span></Link><span className="pill"><i /> LOCAL-FIRST MVP</span></header>
    <CloudAccount />
    <section className="hero"><div className="eyebrow"><span className="eyebrow-line" /> VIDEO WORKSPACE</div><h1>Video panjang.<br/><em>Potongan yang tepat.</em></h1><p>Potong video menjadi klip 9:16, 16:9, atau 1:1. Pilih video, atur rentang waktu, lalu ekspor MP4 langsung dari perangkat.</p><div className="hero-tags"><span><b>01</b> Lokal dahulu</span><span><b>02</b> Tanpa login</span><span><b>03</b> Maks. 1 GB</span></div></section>
    <section className="workspace">
      <div className="section-heading"><div><small>LANGKAH 01</small><h2>Pilih video sumber</h2></div><span className="step-count">01 / 03</span></div>
      <div className={"dropzone " + (file ? "has-file" : "")} onClick={() => !file && picker.current?.click()} role={!file ? "button" : undefined} tabIndex={!file ? 0 : undefined} onKeyDown={e => { if (!file && (e.key === "Enter" || e.key === " ")) picker.current?.click(); }}>
        <input ref={picker} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" onChange={onPick} data-testid="file-input"/>
        {file && src ? <><video ref={player} src={src} controls playsInline preload="metadata" onLoadedMetadata={onMetadata} onError={onVideoError}/><div className="file-details"><span className="file-mark">▶</span><div className="file-name"><strong>{file.name}</strong><span>{formatBytes(file.size)} · {duration ? formatTime(duration) : "Membaca durasi…"}</span></div><button className="text-button" disabled={busy||asrBusy} onClick={e => { e.stopPropagation(); resetFile(); say("Pilih video baru untuk memulai."); }}>Ganti</button></div></> : <div className="empty-drop"><div className="upload-icon"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg></div><strong>Ketuk untuk memilih video</strong><span>Ambil dari Files atau Photos di iPhone/iPad</span><div className="format-chips"><span>MP4</span><span>MOV</span><span>≤ 1 GB</span></div><small>Format/codec harus didukung browser.</small></div>}
      </div>
      <div className="privacy-note"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span><strong>Video tetap di perangkat.</strong> Pemotongan dilakukan di browser dengan FFmpeg WebAssembly. Tidak ada unggahan ke server.</span></div>
      <details className="yt-panel" open={!file} data-testid="yt-panel">
        <summary>Mulai dari link YouTube: AI mencari klip terbaik</summary>
        <YoutubeFlow room={MAX_CLIPS - clips.length} onPreview={u => setYt(parseYouTube(u))} onApprove={approveYoutube} />
        {pending && !file && <div className="notice" role="status" data-testid="yt-pending">{pending.clips.length} klip menunggu file videonya. Pilih video yang sama dengan video YouTube tadi. <button className="text-button" onClick={() => setPending(null)}>Batal</button></div>}
        {yt && <div className="embed"><iframe src={`https://www.youtube-nocookie.com/embed/${yt.id}?start=${yt.start}&playsinline=1`} title="Pratinjau YouTube" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>}
      </details>
      {file && src && duration > 0 && <ClipFlow file={file} duration={duration} video={player} busy={busy || asrBusy} room={MAX_CLIPS - clips.length} onAdd={addClips} onMotion={c => sendToMotion(c)} />}
      {file && src && <details key={ai ? "ai" : "plain"} open={!ai} className="manual-box"><summary>Cara manual: transkrip di perangkat (Whisper) dan saran untuk bagian terpilih</summary><TranscriptPanel key={src} file={file} video={player} range={duration ? (() => { const r = currentRange(); return r.ok ? { start: r.start, duration: r.duration } : null; })() : null} locked={phase !== "idle"} onWorking={setAsrBusy} onCopy={setTranscript} onPickRange={(s, e) => { setStart(formatTime(s)); setEnd(formatTime(e)); seek(s); }} /></details>}

      <div className="section-heading second"><div><small>LANGKAH 02</small><h2>Pilih bagian & format</h2></div><span className="step-count">02 / 03</span></div>
      <div className="time-grid"><label>Waktu mulai<input value={start} onChange={e=>setStart(e.target.value)} onBlur={()=>seek(parseTime(start))} placeholder="00:00:00" inputMode="decimal" data-testid="start"/></label><label>Waktu selesai<input value={end} onChange={e=>setEnd(e.target.value)} onBlur={()=>seek(parseTime(end))} placeholder="00:00:30" inputMode="decimal" data-testid="end"/></label></div>
      <div className="range-tools"><button disabled={!file} onClick={()=>{setStart(formatTime(player.current?.currentTime||0));say("Waktu mulai diambil dari posisi video.");}}>Ambil posisi saat ini sebagai mulai</button><button disabled={!file} onClick={()=>{setEnd(formatTime(player.current?.currentTime||0));say("Waktu selesai diambil dari posisi video.");}}>Ambil posisi saat ini sebagai selesai</button><button disabled={!file || !Number.isFinite(startSeconds)} onClick={()=>seek(startSeconds)}>Putar dari waktu mulai</button></div>
      {range && <div className={"range-summary " + (range.ok ? "" : "bad")} data-testid="range-summary">{range.ok ? `Durasi klip ${formatTime(range.duration)} (maks. ${MAX_CLIP_SECONDS / 60} menit)` : range.error}</div>}

      <div className="settings-label">Rasio output</div>
      <div className="option-grid">{ASPECTS.map(a => <button key={a.id} className={"option " + (aspect === a.id ? "active" : "")} onClick={() => setAspect(a.id)} aria-pressed={aspect === a.id} data-testid={"aspect-" + a.id}><span className={"ratio-shape r" + a.id.replace(":", "x")}/><strong>{a.label}</strong><small>{a.hint}</small></button>)}</div>
      <div className="settings-label">Resolusi</div>
      <div className="option-grid">{QUALITIES.map(q => { const s = outputSize(aspect, q.id); return <button key={q.id} className={"option " + (quality === q.id ? "active" : "")} onClick={() => setQuality(q.id)} aria-pressed={quality === q.id} data-testid={"quality-" + q.id}><strong>{q.label}</strong><small>{s.width}×{s.height}</small><small>{q.hint}</small></button>; })}</div>
      <div className="settings-label">Jika rasio sumber berbeda</div>
      <div className="option-grid">{FITS.map(f => <button key={f.id} className={"option " + (fit === f.id ? "active" : "")} onClick={() => setFit(f.id)} aria-pressed={fit === f.id} data-testid={"fit-" + f.id}><span className={"bg-preview " + (f.id === "blur" ? "bg-blur" : f.id === "pad" ? "bg-black" : "bg-crop")}><i/></span><strong>{f.label}</strong><small>{f.hint}</small></button>)}</div>

      <div className="settings-label">Teks opsional <span>catatan, belum dibakar ke video</span></div><label className="field-label">Hook / teks pembuka<input value={hook} maxLength={90} onChange={e=>setHook(e.target.value)} placeholder="Contoh: 3 hal yang baru saya sadari…"/></label><label className="field-label">Subtitle / transkrip<textarea value={transcript} maxLength={4000} onChange={e=>setTranscript(e.target.value)} rows={3} placeholder="Tempel teks transkrip sebagai referensi klip."/></label>
      <div className="preview-card"><div className={"frame-preview fit-" + fit} style={{ aspectRatio: `${outW} / ${outH}` }}>{src && fit === "blur" && <video className="frame-bg" src={src} muted playsInline preload="metadata"/>}{src && <video className="frame-fg" src={src} muted playsInline preload="metadata"/>}<div className="portrait-overlay">{hook&&<strong>{hook}</strong>}{transcript&&<span>{transcript.slice(0,120)}</span>}</div><span className="preview-label">PRATINJAU</span></div><div className="preview-copy"><strong>Format output {aspect}</strong><span>{outW} × {outH} · MP4 H.264/AAC · 30 fps</span><small>Pratinjau komposisi. Hook dan subtitle tidak ikut dirender pada build ini.</small></div></div>
      <button className="secondary-button" disabled={!file||!duration||clips.length>=MAX_CLIPS||busy||asrBusy} onClick={addClip}><span>＋</span> Tambahkan rentang ke daftar klip <small>{clips.length}/{MAX_CLIPS}</small></button>
      {clips.length>0&&<div className="clip-list"><div className="clip-list-heading"><strong>Daftar klip</strong><button className="text-button" disabled={busy||asrBusy} onClick={()=>setClips([])}>Hapus semua</button></div>{clips.map((clip,i)=><div className="clip-row" key={clip.id}><span className="clip-number">{String(i+1).padStart(2,"0")}</span><div className="clip-meta"><strong>{clip.title || `Klip ${i+1}`}</strong><span>{formatTime(clip.start)} – {formatTime(clip.end)} · {formatTime(clip.end-clip.start)}</span></div><button className="text-button" onClick={()=>{setStart(formatTime(clip.start));setEnd(formatTime(clip.end));seek(clip.start);}}>Edit</button><button className="icon-button" aria-label="Hapus klip" disabled={busy||asrBusy} onClick={()=>setClips(old=>old.filter(c=>c.id!==clip.id))}>×</button><button className="text-button" disabled={busy||asrBusy} onClick={()=>sendToMotion(clip)} data-testid="clip-motion">Ke Motion</button><button className="row-export" disabled={busy||asrBusy} onClick={()=>runExport({ start: clip.start, duration: clip.end - clip.start })}>Ekspor</button></div>)}</div>}

      <div className="section-heading second"><div><small>LANGKAH 03</small><h2>Render dan simpan</h2></div><span className="step-count">03 / 03</span></div>
      <div className="engine-status"><span className={"status-dot "+(engineReady?"ready":"")}/><div><strong>{engineReady?"Mesin lokal siap":"Mesin video belum dimuat"}</strong><small>{engineReady?"FFmpeg berjalan di browser":"Dimuat (±32 MB) saat ekspor pertama"}</small></div><span className="engine-badge">WASM</span></div>
      {busy&&<div className="progress-wrap" data-testid="progress"><div className="progress-label"><span>{phase === "loading" ? "Memuat mesin video…" : "Memproses video lokal…"}</span><strong>{phase === "loading" ? "…" : progress + "%"}</strong></div><div className="progress-track"><span style={{width:(phase === "loading" ? 4 : progress)+"%"}}/></div><small>Jangan tutup atau pindah tab hingga selesai. Safari dapat menghentikan proses di tab latar belakang.</small><button className="cancel-button" onClick={cancel} data-testid="cancel">Batalkan ekspor</button></div>}
      <button className="primary-button" disabled={!file||!duration||busy||asrBusy} onClick={exportCurrent} data-testid="export"><span>{busy?"Sedang memproses…":`Ekspor klip MP4 (${aspect}, ${quality}p)`}</span><svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
      {!busy && !asrBusy && lastJob && !result && <button className="secondary-button" onClick={() => runExport(lastJob)} data-testid="retry">↻ Ulangi ekspor terakhir</button>}
      {result&&<div className="download-card" data-testid="result"><span className="download-check">✓</span><div><strong>Video selesai dibuat</strong><span>{result.label} · {formatBytes(result.size)}</span></div><a className="download-button" href={result.url} download={result.name} data-testid="download">Simpan MP4 ↓</a></div>}
      {result&&<div className="result-tools"><video src={result.url} controls playsInline preload="metadata" className="result-video"/><button className="text-button" onClick={share}>Bagikan / simpan ke Photos</button></div>}
      {message&&<div className={"notice " + (isError ? "notice-error" : "")} role={isError ? "alert" : "status"} data-testid="message">{message}</div>}{errorDetail&&<details className="error-details"><summary>Detail teknis</summary><code>{errorDetail}</code></details>}
      <p className="fine-print">Batas: sumber 60 menit / 1 GB, satu klip maks. 5 menit. Kinerja bergantung pada perangkat, codec, dan memori browser. Di iPhone/iPad, 720p jauh lebih cepat daripada 1080p.</p>
    </section>
    <Link className="motion-link" href="/motion" data-testid="motion-link"><span className="bottom-icon">✳</span><span><strong>Motion Graphics Lab</strong><small>Buat video 9:16 dari naskah dan narasi, render MP4 di browser.</small></span><b>Buka →</b></Link>
    <section className="bottom-note"><div className="bottom-icon">✦</div><div><strong>Lebih sederhana untuk workflow kreator.</strong><p>Tanpa akun. Tanpa unggah video ke server untuk pemotongan. Pilih momen, koreksi, dan simpan hasilnya.</p></div></section>
    <footer><Link className="footer-brand" href="/">CLIPPER STUDIO</Link><span>Local-first · Mobile-first</span></footer>
  </main>;
}
