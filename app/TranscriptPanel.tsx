"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { formatBytes, formatTime } from "@/lib/clip";
import { extractAudio, loadEngine } from "@/lib/engine";
import { MODELS, releaseAsr, transcribe, TranscribeCancelled, type AsrHandle, type ModelId } from "@/lib/asr/client";
import {
  activeAt, asrEta, asrSlowHint, asrTimingSummary, editSegment, explainTranscribeError, HANDOFF_KEY, LANGUAGES, serializeHandoff, toSrt, transcriptText, validateTranscribeRange,
  type LanguageId, type Transcript,
} from "@/lib/transcript";

type Range = { start: number; duration: number };
type Phase = "idle" | "audio" | "download" | "running";

/** Automatic transcript of the selected range: local Whisper, editable text, live caption preview, hand-off to /motion. */
export default function TranscriptPanel({ file, video, range, locked, onWorking, onCopy, onUse }: {
  file: File;
  video: RefObject<HTMLVideoElement | null>;
  /** Selected clip range, or null while the range is invalid. */
  range: Range | null;
  /** True while an MP4 export runs (the FFmpeg engine is shared). */
  locked: boolean;
  onWorking: (working: boolean) => void;
  /** Copies the transcript text into the page's subtitle field. */
  onCopy: (text: string) => void;
  /** On the motion page: use the transcript directly instead of linking there. */
  onUse?: (t: Transcript) => void;
}) {
  const [model, setModel] = useState<ModelId>(MODELS[0].id);
  const [language, setLanguage] = useState<LanguageId>("indonesian");
  const [phase, setPhase] = useState<Phase>("idle");
  const [download, setDownload] = useState({ loaded: 0, total: 0 });
  // Windows of audio finished so far, for a real progress bar and a time estimate while the model runs.
  const [chunk, setChunk] = useState({ done: 0, total: 0, eta: "" });
  const runStart = useRef(0);
  const [transcript, setTranscript] = useState<{ value: Transcript; range: Range } | null>(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [info, setInfo] = useState("");
  const [caption, setCaption] = useState<{ segment: number; word: number } | null>(null);
  const handle = useRef<AsrHandle | null>(null);
  const cancelled = useRef(false);
  const working = phase !== "idle";

  // Leaving the page frees the model's memory; a cancelled run already did.
  useEffect(() => () => { handle.current?.cancel(); releaseAsr(); }, []);

  // Live caption: follow the original audio of the player using requestAnimationFrame while it plays.
  useEffect(() => {
    const el = video.current;
    if (!el || !transcript) { setCaption(null); return; }
    const { value, range: r } = transcript;
    let raf = 0;
    const tick = () => {
      const t = el.currentTime - r.start;
      const next = t >= 0 && t <= r.duration ? activeAt(value, t) : null;
      setCaption(old => (old?.segment === next?.segment && old?.word === next?.word ? old : next));
      if (!el.paused && !el.ended) raf = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(raf); tick(); };
    for (const ev of ["play", "seeked", "timeupdate", "pause"]) el.addEventListener(ev, start);
    start();
    return () => { cancelAnimationFrame(raf); for (const ev of ["play", "seeked", "timeupdate", "pause"]) el.removeEventListener(ev, start); };
  }, [transcript, video]);

  async function run() {
    const limit = range ? validateTranscribeRange(range.duration) : "Pilih bagian video yang valid terlebih dahulu.";
    if (!range || limit) { setError(limit ?? ""); return; }
    cancelled.current = false;
    setError(""); setDetail(""); setInfo(""); setTranscript(null); setPhase("audio"); onWorking(true);
    try {
      await loadEngine();
      const audio = await extractAudio(file, range);
      if (cancelled.current) throw new TranscribeCancelled();
      setPhase("download"); setDownload({ loaded: 0, total: 0 }); setChunk({ done: 0, total: 0, eta: "" });
      const h = transcribe(audio, model, language, Math.min(range.duration, audio.length / 16000), {
        onDownload: (loaded, total) => setDownload({ loaded, total }),
        onRunning: () => { runStart.current = Date.now(); setPhase("running"); },
        onChunk: (done, total) => setChunk({ done, total, eta: asrEta(done, total, (Date.now() - runStart.current) / 1000) }),
      });
      handle.current = h;
      const { transcript: value, timings } = await h.result;
      setTranscript({ value, range });
      setInfo([value.granularity === "word"
        ? `${value.segments.length} segmen siap. Waktu tiap kata dari audio asli.`
        : `${value.segments.length} segmen siap. Model ini hanya memberi waktu per segmen; waktu kata diperkirakan merata.`, `Waktu: ${asrTimingSummary(timings)}.`, asrSlowHint(model, timings)].filter(Boolean).join(" "));
    } catch (err) {
      if (cancelled.current || err instanceof TranscribeCancelled) setInfo("Transkripsi dibatalkan.");
      else {
        const d = err instanceof Error ? err.message : String(err);
        setDetail(d);
        setError(/no speech/i.test(d) ? "Tidak ada ucapan yang terdeteksi pada bagian ini. Pilih bagian yang ada suaranya." : explainTranscribeError(d));
      }
    } finally { handle.current = null; setPhase("idle"); onWorking(false); }
  }

  function cancel() { cancelled.current = true; handle.current?.cancel(); }

  function save(name: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toMotion() {
    if (!transcript) return;
    try { sessionStorage.setItem(HANDOFF_KEY, serializeHandoff(transcript.value, file.name)); }
    catch { setError("Browser menolak menyimpan transkrip untuk dikirim. Salin teksnya ke kolom subtitle lalu tempel di Motion Graphics."); return false; }
  }

  const stale = transcript && range && (Math.abs(transcript.range.start - range.start) > 0.05 || Math.abs(transcript.range.duration - range.duration) > 0.05);
  const live = transcript && caption ? transcript.value.segments[caption.segment] : null;
  const base = file.name.replace(/\.[^.]+$/, "") || "transkrip";

  return <div className="asr-panel" data-testid="asr-panel">
    <div className="settings-label">Transkrip otomatis <span>suara → teks berwaktu, diproses di perangkat</span></div>
    <div className="time-grid">
      <label>Model<select value={model} disabled={working || locked} onChange={e => setModel(e.target.value as ModelId)} data-testid="asr-model">{MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <label>Bahasa<select value={language} disabled={working || locked} onChange={e => setLanguage(e.target.value as LanguageId)} data-testid="asr-language">{LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
    </div>
    <button className="secondary-button" disabled={working || locked || !range} onClick={run} data-testid="asr-run"><span>✎</span> {working ? "Sedang membuat transkrip…" : transcript ? "Buat ulang transkrip bagian terpilih" : "Buat transkrip bagian terpilih"}<small>maks. 3 menit</small></button>
    {working && <div className="progress-wrap" data-testid="asr-progress">
      <div className="progress-label"><span>{phase === "audio" ? "Mengambil audio asli dari video…"
        : phase === "download" ? (download.total === 0 ? "Memuat model ucapan…" : download.loaded < download.total ? "Mengunduh model ucapan (sekali, lalu disimpan)…" : "Menyiapkan model (bisa beberapa menit di perangkat kecil)…")
        : chunk.total > 1 ? `Mengubah ucapan menjadi teks… bagian ${Math.min(chunk.done + 1, chunk.total)} dari ${chunk.total}` : "Mengubah ucapan menjadi teks…"}</span>
        <strong>{phase === "download" && download.total ? `${formatBytes(download.loaded)} / ${formatBytes(download.total)}` : phase === "running" && chunk.eta ? chunk.eta : "…"}</strong></div>
      <div className="progress-track"><span style={{ width: (phase === "download" && download.total ? Math.round((download.loaded / download.total) * 100) : phase === "running" ? Math.max(6, chunk.total ? Math.round((chunk.done / chunk.total) * 100) : 6) : 4) + "%" }} /></div>
      <small>Jangan tutup atau pindah tab. Pada iPad, bagian pendek dan model Cepat lebih aman untuk memori.</small>
      {phase !== "audio" && <button className="cancel-button" onClick={cancel} data-testid="asr-cancel">Batalkan transkripsi</button>}
    </div>}
    {error && <div className="notice notice-error" role="alert" data-testid="asr-error">{error}</div>}
    {detail && <details className="error-details" open><summary>Detail teknis</summary><code>{detail}</code></details>}
    {info && !error && <div className="notice" role="status" data-testid="asr-info">{info}</div>}
    {transcript && <>
      {stale && <div className="notice notice-error" role="status">Rentang waktu berubah setelah transkrip dibuat. Buat ulang agar sesuai dengan bagian yang dipilih.</div>}
      <div className="asr-caption" aria-live="off" data-testid="asr-caption">
        {live ? live.words.map((w, i) => <span key={i} className={i === caption!.word ? "on" : ""}>{w.text} </span>) : <small>Putar video pada bagian ini untuk melihat subtitle mengikuti suara.</small>}
      </div>
      <div className="asr-list" data-testid="asr-list">
        {transcript.value.segments.map((s, i) => <label key={`${i}:${s.text}`} className={"asr-seg" + (caption?.segment === i ? " active" : "")}>
          <span>{formatTime(transcript.range.start + s.start)} – {formatTime(transcript.range.start + s.end)}</span>
          <textarea defaultValue={s.text} rows={2} aria-label={`Teks segmen ${i + 1}`} data-testid="asr-seg"
            onBlur={e => { if (e.target.value.trim() !== s.text) setTranscript(old => old && { ...old, value: editSegment(old.value, i, e.target.value) }); }} />
        </label>)}
      </div>
      <small className="asr-hint">Koreksi teks lalu ketuk di luar kolom. Waktu kata dipertahankan; jika jumlah kata berubah, waktu dibagi rata dalam segmen. Kosongkan kolom untuk menghapus segmen.</small>
      <div className="range-tools">
        <button onClick={() => { onCopy(transcriptText(transcript.value)); setInfo("Transkrip disalin ke kolom Subtitle di bawah."); }}>Salin ke kolom subtitle</button>
        <button onClick={() => save(`${base}.srt`, toSrt(transcript.value), "application/x-subrip")} data-testid="asr-srt">Unduh .srt</button>
        <button onClick={() => save(`${base}.txt`, transcriptText(transcript.value), "text/plain")}>Unduh .txt</button>
      </div>
      {onUse
        ? <button className="primary-button" onClick={() => onUse(transcript.value)} data-testid="asr-use"><span>Pakai transkrip untuk naskah &amp; subtitle</span></button>
        : <Link className="motion-link" href="/motion" onClick={e => { if (toMotion() === false) e.preventDefault(); }} data-testid="asr-to-motion"><span className="bottom-icon">✳</span><span><strong>Kirim ke Motion Graphics</strong><small>Teks dan waktu kata dipakai untuk subtitle, ikon, dan angka pada video motion.</small></span><b>Buka →</b></Link>}
    </>}
  </div>;
}
