"use client";

import { Player, type PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { checkBrowserRender, renderMp4 } from "@/lib/render";
import {
  buildTimeline, explainRenderError, FPS, HEIGHT, MAX_SECONDS, PALETTES, slug, STYLES, validateAudioFile, validateTitle, WIDTH,
  type DurationMode, type PaletteId, type StyleId, type VideoProps,
} from "@/lib/script";
import { ScriptVideo } from "@/remotion/ScriptVideo";
import "./motion.css";

const SAMPLE = "Jangan tunggu semangat datang.\nMulailah, meski langkahmu kecil.\nDisiplin membuatmu tetap bergerak.\nSatu langkah hari ini lebih baik dari rencana sempurna.\nMulai sekarang.";

type AudioInfo = { file: File; url: string; seconds: number };

export default function MotionStudio() {
  const player = useRef<PlayerRef>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [script, setScript] = useState(SAMPLE);
  const [title, setTitle] = useState("Sebuah pengingat");
  const [style, setStyle] = useState<StyleId>("hybrid");
  const [palette, setPalette] = useState<PaletteId>("violet");
  const [target, setTarget] = useState("auto");
  const [captions, setCaptions] = useState(true);
  const [audio, setAudio] = useState<AudioInfo | null>(null);
  const [audioError, setAudioError] = useState("");
  const [status, setStatus] = useState("");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [renderError, setRenderError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  useEffect(() => { if (!audio) return; const url = audio.url; return () => URL.revokeObjectURL(url); }, [audio]);
  useEffect(() => { if (!result) return; const url = result.url; return () => URL.revokeObjectURL(url); }, [result]);
  useEffect(() => () => abort.current?.abort(), []);

  const mode: DurationMode = audio ? { kind: "audio", seconds: audio.seconds } : target === "auto" ? { kind: "auto" } : { kind: "target", seconds: Number(target) };
  const timeline = useMemo(() => buildTimeline(script, mode, FPS), [script, mode.kind, audio?.seconds, target]); // eslint-disable-line react-hooks/exhaustive-deps
  const titleError = validateTitle(title);
  const props: VideoProps | null = timeline.ok ? { title: title.trim(), scenes: timeline.scenes, style, palette, audioSrc: audio?.url ?? null, captions } : null;
  const blocker = !timeline.ok ? timeline.error : titleError;

  // Inputs changed after a render: the downloaded file no longer matches the preview.
  useEffect(() => { setResult(null); }, [script, title, style, palette, target, captions, audio]);

  function onAudio(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setAudioError("");
    const err = validateAudioFile(f);
    if (err) return setAudioError(err);
    const url = URL.createObjectURL(f);
    const el = new Audio();
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      if (!Number.isFinite(el.duration) || el.duration <= 0) { URL.revokeObjectURL(url); setAudioError("Durasi audio tidak dapat dibaca. Coba MP3, M4A, atau WAV."); return; }
      setAudio({ file: f, url, seconds: el.duration });
    };
    el.onerror = () => { URL.revokeObjectURL(url); setAudioError("Browser tidak dapat membaca audio ini. Coba konversi ke MP3, M4A, atau WAV."); };
    el.src = url;
  }

  async function render() {
    if (!props || blocker) return;
    setRenderError(""); setErrorDetail(""); setResult(null); setProgress(0);
    const support = await checkBrowserRender(!props.audioSrc).catch(e => String(e));
    if (support) { setRenderError(support); return; }
    player.current?.pause();
    const controller = new AbortController();
    abort.current = controller;
    setRendering(true);
    setStatus("Merender MP4 di browser… Biarkan tab ini tetap terbuka.");
    try {
      const blob = await renderMp4(props, { signal: controller.signal, onProgress: p => setProgress(Math.round(p * 100)) });
      if (blob.size < 1024) throw new Error("Output MP4 kosong.");
      setResult({ url: URL.createObjectURL(blob), name: `${slug(title || script.slice(0, 30))}-1080x1920.mp4`, size: blob.size });
      setStatus("MP4 selesai dirender. Simpan hasilnya sebelum menutup tab.");
    } catch (err) {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      if (controller.signal.aborted) { setStatus("Render dibatalkan."); }
      else { setErrorDetail(detail); setRenderError(explainRenderError(detail)); setStatus(""); }
    } finally {
      abort.current = null;
      setRendering(false);
    }
  }

  function exportProject() {
    if (!props) return;
    const project = { ...props, audioSrc: audio ? audio.file.name : null, fps: FPS, width: WIDTH, height: HEIGHT, durationInFrames: timeline.ok ? timeline.totalFrames : 0 };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug(title || "video")}-props.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(audio ? `Proyek diunduh. Untuk render CLI, salin "${audio.file.name}" ke folder public/ lalu jalankan perintah di MOTION_STUDIO.md.` : "Proyek diunduh. Lihat MOTION_STUDIO.md untuk render lewat CLI.");
  }

  async function copyBrief() {
    const brief = [
      "MOTION GRAPHICS BRIEF", `Judul: ${title}`, `Gaya: ${STYLES.find(s => s.id === style)?.label}`, `Palet: ${PALETTES[palette].label}`,
      `Format: 9:16, ${WIDTH}x${HEIGHT}, ${FPS} fps`, `Audio: ${audio ? audio.file.name : "tanpa audio"}`,
      ...(timeline.ok ? timeline.scenes.map((s, i) => `Scene ${i + 1} (${(s.durationInFrames / FPS).toFixed(1)} dtk): ${s.text}`) : []),
    ].join("\n");
    try { await navigator.clipboard.writeText(brief); setStatus("Brief disalin ke clipboard."); }
    catch { setStatus("Browser tidak memberi izin clipboard. Gunakan Ekspor proyek JSON."); }
  }

  const colors = PALETTES[palette];
  return (
    <main className="motion-shell">
      <header className="motion-header">
        <Link className="motion-brand" href="/"><span className="motion-logo">✳</span> clipper<span>studio</span></Link>
        <Link className="back-link" href="/">← Clipper Studio</Link>
      </header>

      <section className="motion-intro">
        <div className="motion-eyebrow"><span className="live-dot" /> MOTION GRAPHICS LAB · REMOTION</div>
        <h1>Words that <em>move.</em><br />Ideas that stay.</h1>
        <p>Tulis naskah, tambahkan narasi, lihat pratinjau, lalu render MP4 vertikal 1080×1920 langsung di browser.</p>
      </section>

      <div className="studio-grid">
        <section className="studio-panel">
          <div className="panel-heading"><div><small>01 / NASKAH & AUDIO</small><h2>Atur video</h2></div><span className="local-tag">Lokal · tanpa server</span></div>
          <label className="field-label" htmlFor="motion-script">Naskah <span className="field-hint">satu baris atau kalimat = satu scene</span></label>
          <textarea id="motion-script" data-testid="script" value={script} onChange={e => setScript(e.target.value)} rows={7} placeholder="Tulis naskah video…" />
          <div className="char-count">{script.length} / 3000</div>
          <label className="field-label" htmlFor="motion-title">Judul / teks pembuka</label>
          <input id="motion-title" data-testid="title" value={title} onChange={e => setTitle(e.target.value)} maxLength={60} />
          {titleError && <p className="field-error">{titleError}</p>}
          <div className="field-row">
            <div><label className="field-label" htmlFor="motion-style">Gaya animasi</label><select id="motion-style" data-testid="style" value={style} onChange={e => setStyle(e.target.value as StyleId)}>{STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
            <div><label className="field-label" htmlFor="motion-palette">Palet warna</label><select id="motion-palette" data-testid="palette" value={palette} onChange={e => setPalette(e.target.value as PaletteId)}>{(Object.keys(PALETTES) as PaletteId[]).map(p => <option key={p} value={p}>{PALETTES[p].label}</option>)}</select></div>
          </div>

          <label className="field-label">Audio narasi</label>
          <div className="audio-box">
            <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" onChange={onAudio} className="file-hidden" data-testid="audio-input" />
            {audio ? <>
              <audio src={audio.url} controls preload="metadata" />
              <div className="audio-meta"><b>{audio.file.name}</b><small>{audio.seconds.toFixed(1)} dtk · durasi video mengikuti audio</small></div>
              <button className="motion-secondary" onClick={() => setAudio(null)} disabled={rendering} data-testid="audio-remove">Hapus audio</button>
            </> : <>
              <button className="motion-secondary" onClick={() => audioInput.current?.click()} disabled={rendering}>＋ Unggah audio (MP3, M4A, WAV)</button>
              <small>Opsional. Rekam narasi sendiri atau pakai audio yang Anda punya izinnya. Tanpa audio, video dirender tanpa suara.</small>
            </>}
            {audioError && <p className="field-error" role="alert">{audioError}</p>}
          </div>
          <div className="ai-voice"><b>Generator suara AI</b><small>Belum terhubung: butuh layanan TTS dan API key di server, yang belum dikonfigurasi. Sementara itu, unggah rekaman narasi.</small></div>

          <div className="field-row">
            <div><label className="field-label" htmlFor="motion-duration">Durasi</label>
              <select id="motion-duration" data-testid="duration" value={audio ? "audio" : target} disabled={!!audio} onChange={e => setTarget(e.target.value)}>
                {audio ? <option value="audio">Ikuti audio ({audio.seconds.toFixed(1)} dtk)</option> : <>
                  <option value="auto">Otomatis (kecepatan baca)</option><option value="15">15 detik</option><option value="30">30 detik</option><option value="45">45 detik</option><option value="60">60 detik</option>
                </>}
              </select></div>
            <div><label className="field-label" htmlFor="motion-captions">Subtitle</label>
              <select id="motion-captions" value={captions ? "on" : "off"} onChange={e => setCaptions(e.target.value === "on")}><option value="on">Tampilkan, sorot kata</option><option value="off">Tanpa subtitle</option></select></div>
          </div>

          {blocker && <p className="field-error" role="alert" data-testid="blocker">{blocker}</p>}
          {timeline.ok && timeline.warnings.map(w => <p className="field-warning" key={w}>{w}</p>)}

          <div className="panel-actions">
            {rendering
              ? <button className="motion-cancel" onClick={() => abort.current?.abort()} data-testid="cancel">Batalkan render</button>
              : <button className="motion-primary" onClick={render} disabled={!!blocker} data-testid="render">Render MP4 <span>↓</span></button>}
            <button className="motion-secondary" onClick={exportProject} disabled={!props}>Proyek JSON</button>
          </div>
          <button className="text-link" onClick={copyBrief} disabled={!timeline.ok}>Salin brief teks</button>
          {rendering && <div className="render-progress" data-testid="progress"><div><span>Merender di browser…</span><b>{progress}%</b></div><i><em style={{ width: progress + "%" }} /></i></div>}
          {renderError && <p className="field-error" role="alert" data-testid="render-error">{renderError}</p>}
          {errorDetail && <details className="error-details"><summary>Detail teknis</summary><code>{errorDetail}</code></details>}
          {result && <div className="render-result" data-testid="result"><b>✓ MP4 siap</b><small>{WIDTH}×{HEIGHT} · {timeline.ok ? timeline.seconds.toFixed(1) : "?"} dtk · {(result.size / 1024 ** 2).toFixed(1)} MB</small><a className="motion-primary" href={result.url} download={result.name} data-testid="download">Simpan MP4 ↓</a></div>}
          {status && <p className="motion-status" role="status" data-testid="status">{status}</p>}
        </section>

        <section className="preview-column">
          <div className="panel-heading"><div><small>02 / PRATINJAU</small><h2>Preview video</h2></div><span className="preview-badge"><i /> {timeline.ok ? `${timeline.seconds.toFixed(1)}s · 9:16` : "—"}</span></div>
          <div className="player-wrap" style={{ background: `linear-gradient(145deg, ${colors.bg1}, ${colors.bg2})` }}>
            {props ? <Player ref={player} component={ScriptVideo} inputProps={props} durationInFrames={timeline.ok ? timeline.totalFrames : 1} fps={FPS} compositionWidth={WIDTH} compositionHeight={HEIGHT} controls style={{ width: "100%", aspectRatio: "9 / 16" }} acknowledgeRemotionLicense />
              : <div className="player-empty">{blocker}</div>}
          </div>
          <p className="preview-disclaimer">Pratinjau memakai komposisi yang sama dengan hasil render, jadi teks, durasi scene, dan audio identik dengan MP4.</p>
          <div className="timeline-heading"><h3>Timeline scene</h3><span>{timeline.ok ? `${timeline.scenes.length} scene · maks. ${MAX_SECONDS} dtk` : ""}</span></div>
          <div className="scene-list" data-testid="scenes">{timeline.ok && (() => { let t = 0; return timeline.scenes.map((s, i) => { const from = t; t += s.durationInFrames; return (
            <button className="scene-row" key={i} onClick={() => player.current?.seekTo(from)}>
              <span className="scene-index">{String(i + 1).padStart(2, "0")}</span>
              <div className="scene-info"><b>{s.text}</b></div>
              <div className="scene-meta"><b>{(from / FPS).toFixed(1)}–{(t / FPS).toFixed(1)}s</b><small>{(s.durationInFrames / FPS).toFixed(1)} dtk</small></div>
            </button>); }); })()}</div>
        </section>
      </div>

      <section className="remotion-note"><span className="remotion-icon">R</span><div><b>Render di browser, tanpa biaya server</b><p>MP4 dibuat di perangkat Anda dengan Remotion Web Renderer (WebCodecs). Naskah dan audio tidak diunggah. Untuk render berat atau browser lama, unduh Proyek JSON dan render dengan Remotion CLI.</p></div><span className="status-chip">NO PAID RENDER</span></section>
      <footer className="motion-footer"><span>CLIPPER STUDIO / MOTION LAB</span><span>Built with Remotion</span></footer>
    </main>
  );
}
