"use client";

import { Player, type PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DEFAULT_MUSIC_VOLUME, MAX_RECORDING_SECONDS, MOODS, moodForStyle, type Mood, type Music } from "@/lib/audio";
import { analyseNarration, decodeToMono, explainMicError, NarrationRecorder, recordingSupported, type Narration } from "@/lib/recorder";
import { checkBrowserRender, environmentReport, RenderFailure, renderMp4 } from "@/lib/render";
import {
  buildTimeline, explainRenderError, FPS, HEIGHT, MAX_SECONDS, PALETTES, slug, STYLES, validateAudioFile, validateTitle, WIDTH,
  type DurationMode, type PaletteId, type StyleId, type VideoProps,
} from "@/lib/script";
import { ScriptVideo } from "@/remotion/ScriptVideo";
import "./motion.css";

const SAMPLE = "Jangan tunggu semangat datang.\nMulailah, meski langkahmu kecil.\nDisiplin membuatmu tetap bergerak.\nSatu langkah hari ini lebih baik dari rencana sempurna.\nMulai sekarang.";

type Track = { file: File; url: string; seconds: number };
type Generated = Track & { mood: Mood; seed: number };
type MusicMode = "none" | "auto" | "upload";

/** Reads an audio file's duration, decoding it when the media element cannot (e.g. some WAV/OGG on Safari). */
async function audioDuration(file: File, url: string): Promise<number> {
  const fromElement = await new Promise<number>(resolve => {
    const el = new Audio();
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => resolve(NaN);
    el.src = url;
  });
  if (Number.isFinite(fromElement) && fromElement > 0) return fromElement;
  return (await decodeToMono(file)).seconds;
}

export default function MotionStudio() {
  const player = useRef<PlayerRef>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const recorder = useRef<NarrationRecorder | null>(null);
  const [script, setScript] = useState(SAMPLE);
  const [title, setTitle] = useState("Sebuah pengingat");
  const [style, setStyle] = useState<StyleId>("hybrid");
  const [palette, setPalette] = useState<PaletteId>("violet");
  const [target, setTarget] = useState("auto");
  const [captions, setCaptions] = useState(true);
  const [narration, setNarration] = useState<Narration | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [musicMode, setMusicMode] = useState<MusicMode>("none");
  const [mood, setMood] = useState<Mood>("tenang");
  const [moodTouched, setMoodTouched] = useState(false);
  const [seed, setSeed] = useState(1);
  const [musicVolume, setMusicVolume] = useState(Math.round(DEFAULT_MUSIC_VOLUME * 100));
  const [duck, setDuck] = useState(true);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [uploadedMusic, setUploadedMusic] = useState<Track | null>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState("");
  const [status, setStatus] = useState("");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [renderError, setRenderError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  useEffect(() => { if (!narration) return; const url = narration.url; return () => URL.revokeObjectURL(url); }, [narration]);
  useEffect(() => { if (!generated) return; const url = generated.url; return () => URL.revokeObjectURL(url); }, [generated]);
  useEffect(() => { if (!uploadedMusic) return; const url = uploadedMusic.url; return () => URL.revokeObjectURL(url); }, [uploadedMusic]);
  useEffect(() => { if (!result) return; const url = result.url; return () => URL.revokeObjectURL(url); }, [result]);
  useEffect(() => () => { abort.current?.abort(); recorder.current?.cancel(); }, []);
  // The mood follows the animation style until the user picks one.
  useEffect(() => { if (!moodTouched) setMood(moodForStyle(style)); }, [style, moodTouched]);

  const mode: DurationMode = narration ? { kind: "audio", seconds: narration.seconds } : target === "auto" ? { kind: "auto" } : { kind: "target", seconds: Number(target) };
  const timeline = useMemo(() => buildTimeline(script, mode, FPS), [script, mode.kind, narration?.seconds, target]); // eslint-disable-line react-hooks/exhaustive-deps
  const videoSeconds = timeline.ok ? timeline.seconds : 0;
  const titleError = validateTitle(title);
  const recording = recordingSeconds !== null;

  const generatedFresh = generated && generated.mood === mood && generated.seed === seed && Math.abs(generated.seconds - videoSeconds) < 0.05 ? generated : null;
  const musicTrack: Track | null = musicMode === "auto" ? generatedFresh : musicMode === "upload" ? uploadedMusic : null;
  const music: Music | null = musicTrack ? { src: musicTrack.url, volume: musicVolume / 100, duck, loop: musicMode === "upload" } : null;

  const props: VideoProps | null = timeline.ok ? {
    title: title.trim(), scenes: timeline.scenes, style, palette, audioSrc: narration?.url ?? null, captions,
    music, speech: narration?.speech ?? null,
  } : null;
  const blocker = !timeline.ok ? timeline.error : titleError ?? (recording ? "Selesaikan perekaman narasi terlebih dahulu." : null);

  // Inputs changed after a render: the downloaded file no longer matches the preview.
  useEffect(() => { setResult(null); }, [script, title, style, palette, target, captions, narration, musicMode, musicTrack, musicVolume, duck]);

  const generate = useCallback(async (seconds: number, m: Mood, s: number): Promise<Generated | null> => {
    setMusicBusy(true); setMusicError("");
    try {
      const { generateBacksound } = await import("@/lib/backsound");
      const file = await generateBacksound(m, seconds, s);
      const g = { file, url: URL.createObjectURL(file), seconds, mood: m, seed: s };
      setGenerated(g);
      return g;
    } catch (err) {
      setMusicError(`Backsound otomatis gagal dibuat: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally { setMusicBusy(false); }
  }, []);

  // Regenerate the automatic backsound (debounced) whenever the video length, mood or variation changes.
  useEffect(() => {
    if (musicMode !== "auto" || !timeline.ok || generatedFresh || musicBusy) return;
    const id = setTimeout(() => { void generate(videoSeconds, mood, seed); }, 600);
    return () => clearTimeout(id);
  }, [musicMode, timeline.ok, videoSeconds, mood, seed, generatedFresh, musicBusy, generate]);

  async function loadNarrationFile(f: File) {
    setAudioError(""); setNarrationBusy(true);
    const url = URL.createObjectURL(f);
    try {
      const analysed = await analyseNarration(f);
      const seconds = analysed.seconds ?? await audioDuration(f, url);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("no duration");
      setNarration({ file: f, url, seconds, speech: analysed.speech, recorded: false });
    } catch {
      URL.revokeObjectURL(url);
      setAudioError("Browser tidak dapat membaca audio ini. Coba MP3, M4A, atau WAV.");
    } finally { setNarrationBusy(false); }
  }

  function onAudio(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const err = validateAudioFile(f);
    if (err) return setAudioError(err);
    void loadNarrationFile(f);
  }

  async function startRecording() {
    setAudioError("");
    if (!recordingSupported()) return setAudioError("Browser ini tidak mendukung perekaman audio. Gunakan Safari/Chrome terbaru, atau unggah rekaman.");
    player.current?.pause();
    const rec = new NarrationRecorder();
    recorder.current = rec;
    try {
      await rec.start(s => setRecordingSeconds(s), () => { void stopRecording(); });
      setRecordingSeconds(0);
      setStatus("Merekam… Bacakan naskah, lalu ketuk Selesai.");
    } catch (err) {
      rec.cancel(); recorder.current = null;
      setAudioError(explainMicError(err));
    }
  }

  async function stopRecording() {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setRecordingSeconds(null); setNarrationBusy(true);
    try {
      const n = await rec.stop();
      setNarration(n);
      setStatus(`Rekaman ${n.seconds.toFixed(1)} dtk siap. Durasi scene mengikuti rekaman.`);
    } catch (err) {
      setAudioError(`Rekaman gagal diproses: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("");
    } finally { setNarrationBusy(false); }
  }

  function cancelRecording() {
    recorder.current?.cancel(); recorder.current = null;
    setRecordingSeconds(null); setStatus("Perekaman dibatalkan.");
  }

  async function onMusic(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMusicError("");
    const err = validateAudioFile(f);
    if (err) return setMusicError(err);
    const url = URL.createObjectURL(f);
    try {
      const seconds = await audioDuration(f, url);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("no duration");
      setUploadedMusic({ file: f, url, seconds });
      setMusicMode("upload");
      if (musicVolume === Math.round(DEFAULT_MUSIC_VOLUME * 100)) setMusicVolume(30);
    } catch {
      URL.revokeObjectURL(url);
      setMusicError("Browser tidak dapat membaca musik ini. Coba MP3, M4A, atau WAV.");
    }
  }

  async function render() {
    if (!props || blocker) return;
    setRenderError(""); setErrorDetail(""); setResult(null); setProgress(0);
    let renderProps = props;
    if (musicMode === "auto" && !generatedFresh) {
      setStatus("Menyiapkan backsound…");
      const g = await generate(videoSeconds, mood, seed);
      if (!g) return;
      renderProps = { ...props, music: { src: g.url, volume: musicVolume / 100, duck, loop: false } };
    }
    const support = await checkBrowserRender(!renderProps.audioSrc && !renderProps.music).catch(e => String(e));
    if (support) { setRenderError(support); return; }
    player.current?.pause();
    const controller = new AbortController();
    abort.current = controller;
    setRendering(true);
    setStatus("Merender MP4 di browser… Biarkan tab ini tetap terbuka.");
    try {
      const blob = await renderMp4(renderProps, {
        signal: controller.signal,
        onProgress: p => setProgress(Math.round(p * 100)),
        onRetry: () => setStatus("Percobaan pertama gagal. Mencoba lagi dengan pengaturan encoder lain…"),
      });
      if (blob.size < 1024) throw new Error("Output MP4 kosong.");
      setResult({ url: URL.createObjectURL(blob), name: `${slug(title || script.slice(0, 30))}-1080x1920.mp4`, size: blob.size });
      setStatus("MP4 selesai dirender. Simpan hasilnya sebelum menutup tab.");
    } catch (err) {
      if (controller.signal.aborted) { setStatus("Render dibatalkan."); }
      else {
        const detail = err instanceof RenderFailure ? err.detail : err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        const env = await environmentReport().catch(() => "");
        setErrorDetail(`${detail}\n\n${env}\nGaya: ${style}, palet: ${palette}, narasi: ${renderProps.audioSrc ? "ya" : "tidak"}, backsound: ${musicMode}, durasi: ${videoSeconds.toFixed(1)} dtk`);
        setRenderError(explainRenderError(detail)); setStatus("");
      }
    } finally {
      abort.current = null;
      setRendering(false);
    }
  }

  function exportProject() {
    if (!props) return;
    const project = {
      ...props,
      audioSrc: narration ? narration.file.name : null,
      music: music && musicTrack ? { ...music, src: musicTrack.file.name } : null,
      fps: FPS, width: WIDTH, height: HEIGHT, durationInFrames: timeline.ok ? timeline.totalFrames : 0,
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug(title || "video")}-props.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const files = [narration?.file.name, musicTrack?.file.name].filter(Boolean);
    setStatus(files.length ? `Proyek diunduh. Untuk render CLI, salin ${files.map(f => `"${f}"`).join(" dan ")} ke folder public/ (unduh lewat tombol di bagian audio), lalu ikuti MOTION_STUDIO.md.` : "Proyek diunduh. Lihat MOTION_STUDIO.md untuk render lewat CLI.");
  }

  async function copyBrief() {
    const brief = [
      "MOTION GRAPHICS BRIEF", `Judul: ${title}`, `Gaya: ${STYLES.find(s => s.id === style)?.label}`, `Palet: ${PALETTES[palette].label}`,
      `Format: 9:16, ${WIDTH}x${HEIGHT}, ${FPS} fps`, `Narasi: ${narration ? narration.file.name : "tanpa narasi"}`,
      `Backsound: ${musicMode === "auto" ? `otomatis (${mood})` : musicMode === "upload" ? uploadedMusic?.file.name : "tanpa backsound"}`,
      ...(timeline.ok ? timeline.scenes.map((s, i) => `Scene ${i + 1} (${(s.durationInFrames / FPS).toFixed(1)} dtk): ${s.text}`) : []),
    ].join("\n");
    try { await navigator.clipboard.writeText(brief); setStatus("Brief disalin ke clipboard."); }
    catch { setStatus("Browser tidak memberi izin clipboard. Gunakan Ekspor proyek JSON."); }
  }

  const busy = rendering || recording || narrationBusy;
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
        <p>Tulis naskah, rekam narasi, tambahkan backsound, lihat pratinjau, lalu render MP4 vertikal 1080×1920 langsung di browser.</p>
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

          <label className="field-label">Voice over / narasi</label>
          <div className="audio-box">
            <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" onChange={onAudio} className="file-hidden" data-testid="audio-input" />
            {recording ? <div className="rec-live" data-testid="recording">
              <span className="rec-dot" /><b>Merekam {recordingSeconds!.toFixed(1)} dtk</b><small>maks. {MAX_RECORDING_SECONDS} dtk</small>
              <div className="rec-actions"><button className="motion-primary" onClick={() => void stopRecording()} data-testid="record-stop">■ Selesai</button><button className="motion-secondary" onClick={cancelRecording}>Batal</button></div>
            </div> : narration ? <>
              <audio src={narration.url} controls preload="metadata" />
              <div className="audio-meta"><b>{narration.recorded ? "Rekaman mikrofon" : narration.file.name}</b><small>{narration.seconds.toFixed(1)} dtk · durasi video mengikuti narasi{narration.speech ? "" : " · ducking memakai level tetap (audio tidak dapat dianalisis)"}</small></div>
              <div className="rec-actions">
                <button className="motion-secondary" onClick={() => setNarration(null)} disabled={busy} data-testid="audio-remove">Hapus</button>
                <button className="motion-secondary" onClick={() => void startRecording()} disabled={busy}>🎙 Rekam ulang</button>
                {narration.recorded && <a className="motion-secondary as-button" href={narration.url} download={narration.file.name}>Unduh WAV</a>}
              </div>
            </> : <>
              <div className="rec-actions">
                <button className="motion-primary" onClick={() => void startRecording()} disabled={busy} data-testid="record-start">🎙 Rekam narasi</button>
                <button className="motion-secondary" onClick={() => audioInput.current?.click()} disabled={busy}>＋ Unggah audio</button>
              </div>
              <small>Rekam langsung dari mikrofon iPad sambil membaca naskah, atau unggah MP3/M4A/WAV. Audio diproses di perangkat dan tidak diunggah.</small>
            </>}
            {narrationBusy && <small data-testid="narration-busy">Memproses audio…</small>}
            {audioError && <p className="field-error" role="alert" data-testid="audio-error">{audioError}</p>}
          </div>

          <label className="field-label">Backsound</label>
          <div className="audio-box">
            <input ref={musicInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" onChange={e => void onMusic(e)} className="file-hidden" data-testid="music-input" />
            <div className="seg" role="radiogroup" aria-label="Backsound">
              {([["none", "Tanpa"], ["auto", "Otomatis"], ["upload", "Unggah"]] as [MusicMode, string][]).map(([id, label]) =>
                <button key={id} role="radio" aria-checked={musicMode === id} className={musicMode === id ? "active" : ""} disabled={rendering} data-testid={"music-" + id}
                  onClick={() => { if (id === "upload" && !uploadedMusic) musicInput.current?.click(); else setMusicMode(id); }}>{label}</button>)}
            </div>
            {musicMode === "auto" && <>
              <div className="field-row tight">
                <div><label className="field-label" htmlFor="motion-mood">Mood</label>
                  <select id="motion-mood" data-testid="mood" value={mood} onChange={e => { setMood(e.target.value as Mood); setMoodTouched(true); }}>{MOODS.map(m => <option key={m.id} value={m.id}>{m.label} · {m.hint}</option>)}</select></div>
                <div><label className="field-label">&nbsp;</label><button className="motion-secondary full" onClick={() => setSeed(s => s + 1)} disabled={musicBusy || rendering}>↻ Variasi lain</button></div>
              </div>
              <small data-testid="music-status">{musicBusy ? "Membuat backsound di perangkat…" : generatedFresh ? `Backsound ${generatedFresh.seconds.toFixed(1)} dtk siap · dibuat di perangkat, bebas royalti.` : timeline.ok ? "Menunggu…" : "Lengkapi naskah dulu."}</small>
              {generatedFresh && <a className="text-link" href={generatedFresh.url} download={generatedFresh.file.name}>Unduh backsound (WAV)</a>}
            </>}
            {musicMode === "upload" && uploadedMusic && <>
              <div className="audio-meta"><b>{uploadedMusic.file.name}</b><small>{uploadedMusic.seconds.toFixed(1)} dtk · {uploadedMusic.seconds < videoSeconds ? "diulang (loop) sampai video selesai" : "dipotong sesuai durasi video"}, fade in/out otomatis</small></div>
              <button className="motion-secondary" onClick={() => musicInput.current?.click()} disabled={rendering}>Ganti musik</button>
              <small>Pastikan Anda punya izin memakai musik ini (mis. Pixabay Music, YouTube Audio Library).</small>
            </>}
            {musicMode !== "none" && <>
              <label className="field-label" htmlFor="motion-music-volume">Volume backsound <span className="field-hint">{musicVolume}%</span></label>
              <input id="motion-music-volume" type="range" min={0} max={100} step={5} value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} data-testid="music-volume" />
              <label className="check-row"><input type="checkbox" checked={duck} onChange={e => setDuck(e.target.checked)} /><span>Kecilkan otomatis saat narasi berbicara (ducking){narration ? "" : " · aktif jika ada narasi"}</span></label>
            </>}
            {musicError && <p className="field-error" role="alert" data-testid="music-error">{musicError}</p>}
          </div>
          <div className="ai-voice"><b>Generator suara AI</b><small>Belum terhubung. Opsi gratis dengan Bahasa Indonesia yang berjalan di browser (Supertonic 3) masih perlu diuji di iPad. Sementara itu, rekam narasi langsung di atas.</small></div>

          <div className="field-row">
            <div><label className="field-label" htmlFor="motion-duration">Durasi</label>
              <select id="motion-duration" data-testid="duration" value={narration ? "audio" : target} disabled={!!narration} onChange={e => setTarget(e.target.value)}>
                {narration ? <option value="audio">Ikuti narasi ({narration.seconds.toFixed(1)} dtk)</option> : <>
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
              : <button className="motion-primary" onClick={() => void render()} disabled={!!blocker || narrationBusy || musicBusy} data-testid="render">Render MP4 <span>↓</span></button>}
            <button className="motion-secondary" onClick={exportProject} disabled={!props}>Proyek JSON</button>
          </div>
          <button className="text-link" onClick={copyBrief} disabled={!timeline.ok}>Salin brief teks</button>
          {rendering && <div className="render-progress" data-testid="progress"><div><span>Merender di browser…</span><b>{progress}%</b></div><i><em style={{ width: progress + "%" }} /></i></div>}
          {renderError && <p className="field-error" role="alert" data-testid="render-error">{renderError}</p>}
          {errorDetail && <details className="error-details" open><summary>Detail teknis (kirimkan saat melapor)</summary><code data-testid="error-detail">{errorDetail}</code><button className="text-link" onClick={() => navigator.clipboard?.writeText(errorDetail).then(() => setStatus("Detail teknis disalin."), () => setStatus("Salin manual teks di atas."))}>Salin detail teknis</button></details>}
          {result && <div className="render-result" data-testid="result"><b>✓ MP4 siap</b><small>{WIDTH}×{HEIGHT} · {videoSeconds.toFixed(1)} dtk · {(result.size / 1024 ** 2).toFixed(1)} MB</small><a className="motion-primary" href={result.url} download={result.name} data-testid="download">Simpan MP4 ↓</a></div>}
          {status && <p className="motion-status" role="status" data-testid="status">{status}</p>}
        </section>

        <section className="preview-column">
          <div className="panel-heading"><div><small>02 / PRATINJAU</small><h2>Preview video</h2></div><span className="preview-badge"><i /> {timeline.ok ? `${timeline.seconds.toFixed(1)}s · 9:16` : "—"}</span></div>
          <div className="player-wrap" style={{ background: `linear-gradient(145deg, ${colors.bg1}, ${colors.bg2})` }}>
            {props ? <Player ref={player} component={ScriptVideo} inputProps={props} durationInFrames={timeline.ok ? timeline.totalFrames : 1} fps={FPS} compositionWidth={WIDTH} compositionHeight={HEIGHT} controls style={{ width: "100%", aspectRatio: "9 / 16" }} acknowledgeRemotionLicense />
              : <div className="player-empty">{blocker}</div>}
          </div>
          <p className="preview-disclaimer">Pratinjau memakai komposisi yang sama dengan hasil render, jadi teks, durasi scene, narasi, dan backsound identik dengan MP4.</p>
          <div className="timeline-heading"><h3>Timeline scene</h3><span>{timeline.ok ? `${timeline.scenes.length} scene · maks. ${MAX_SECONDS} dtk` : ""}</span></div>
          <div className="scene-list" data-testid="scenes">{timeline.ok && (() => { let t = 0; return timeline.scenes.map((s, i) => { const from = t; t += s.durationInFrames; return (
            <button className="scene-row" key={i} onClick={() => player.current?.seekTo(from)}>
              <span className="scene-index">{String(i + 1).padStart(2, "0")}</span>
              <div className="scene-info"><b>{s.text}</b></div>
              <div className="scene-meta"><b>{(from / FPS).toFixed(1)}–{(t / FPS).toFixed(1)}s</b><small>{(s.durationInFrames / FPS).toFixed(1)} dtk</small></div>
            </button>); }); })()}</div>
        </section>
      </div>

      <section className="remotion-note"><span className="remotion-icon">R</span><div><b>Render di browser, tanpa biaya server</b><p>MP4 dibuat di perangkat Anda dengan Remotion Web Renderer (WebCodecs). Naskah, rekaman, dan musik tidak diunggah. Backsound otomatis disintesis di perangkat dengan Tone.js.</p></div><span className="status-chip">NO PAID RENDER</span></section>
      <footer className="motion-footer"><span>CLIPPER STUDIO / MOTION LAB</span><span>Built with Remotion</span></footer>
    </main>
  );
}
