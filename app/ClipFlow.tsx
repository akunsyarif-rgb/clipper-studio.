"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { formatTime } from "@/lib/clip";
import { limitsForVideo, suggestMoments } from "@/lib/clip-assist";
import { planChunks, transcribeLong } from "@/lib/ai-transcribe";
import { releaseAsr } from "@/lib/asr/client";
import { extractMp3Chunks } from "@/lib/engine";
import { GeminiError } from "@/lib/gemini";
import { loadCachedTranscript, saveCachedTranscript } from "@/lib/session-store";
import { sliceTranscript, type LanguageId, type Transcript } from "@/lib/transcript";
import { useGeminiAccess } from "./useGeminiAccess";
import SuggestionList, { type Item } from "./SuggestionList";

export type NewClip = { start: number; end: number; title: string; transcript: Transcript };

/**
 * The main way to make clips: the AI listens to the whole video, suggests the best clips (up to three minutes each), and
 * the creator previews, adjusts and approves them. Nothing is cut until they say so.
 */
export default function ClipFlow({ file, duration, video, busy, room, onAdd, onMotion }: {
  file: File;
  duration: number;
  video: RefObject<HTMLVideoElement | null>;
  /** True while something else uses the video engine (an export or the on-device transcript). */
  busy: boolean;
  /** How many more clips fit in the clip list. */
  room: number;
  onAdd: (clips: NewClip[]) => void;
  onMotion: (clip: NewClip) => void;
}) {
  const access = useGeminiAccess();
  const [language, setLanguage] = useState<LanguageId>("indonesian");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"idle" | "listening" | "choosing">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const full = useRef<Transcript | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  // A different video starts over.
  useEffect(() => { setItems(null); setError(""); setNote(""); full.current = null; }, [file]);

  const working = phase !== "idle";
  const parts = planChunks(duration).length;

  async function analyze() {
    if (!access || !duration) return;
    const ctl = new AbortController(); abort.current = ctl;
    setError(""); setNote(""); setItems(null); setProgress({ done: 0, total: parts });
    const o = { apiKey: access.apiKey, model: access.model, language: language === "english" ? "en" : "id", signal: ctl.signal, transport: access.transport, format: access.format };
    try {
      releaseAsr();
      const range = { start: 0, duration };
      const cacheModel = `ai:${access.model}`;
      let t = await loadCachedTranscript(file, range, cacheModel, language);
      if (t) setNote("Memakai transkrip video ini yang sudah tersimpan (tanpa mendengarkan ulang).");
      else {
        setPhase("listening");
        t = await transcribeLong(duration, (chunks, onChunk) => extractMp3Chunks(file, chunks, onChunk), o, { signal: ctl.signal, onProgress: (done, total) => setProgress({ done, total }) });
        void saveCachedTranscript(file, range, cacheModel, language, t);
      }
      full.current = t;
      setPhase("choosing");
      const moments = await suggestMoments(t.segments.map(s => ({ start: s.start, end: s.end, text: s.text })), o, limitsForVideo(duration));
      if (moments.length === 0) setError("AI tidak menemukan bagian yang layak dijadikan klip. Coba video lain, atau potong manual di bawah.");
      setItems(moments.map((m, i) => ({ start: m.start, end: m.end, title: m.title, reason: m.reason, checked: i < Math.max(room, 0) && i < 5,
        ...(m.reachedBack ? { note: `Awal dimundurkan ${m.reachedBack} kalimat karena kalimat pilihan AI hanya melanjutkan kalimat sebelumnya. Bila kurang pas, geser lagi di "Sesuaikan waktu".` } : {}) })));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/no audio/i.test(msg) ? "Video ini tidak punya suara, jadi tidak ada yang bisa dianalisis." : e instanceof GeminiError ? e.message : `Analisis gagal: ${msg}`);
    } finally { setPhase("idle"); }
  }

  function preview(m: Item) {
    const v = video.current;
    if (!v) return;
    v.currentTime = m.start;
    void v.play().catch(() => undefined);
    v.scrollIntoView({ behavior: "smooth", block: "center" });
    const stop = () => { if (v.currentTime >= m.end) { v.pause(); v.removeEventListener("timeupdate", stop); } };
    v.addEventListener("timeupdate", stop);
  }
  const toClip = (m: Item): NewClip => ({ start: m.start, end: m.end, title: m.title, transcript: sliceTranscript(full.current!, m.start, m.end) });

  if (access === undefined) return null;
  const chosen = items?.filter(m => m.checked) ?? [];

  return <section className="flow-box" data-testid="clip-flow">
    <div className="settings-label">Klip otomatis dengan AI <span>AI mendengarkan seluruh video, Anda yang memutuskan</span></div>
    {!access
      ? <div className="notice" data-testid="flow-needs-ai">Fitur ini memakai AI yang mendengarkan audio. <b>Masuk ke akun</b> (bagian atas halaman) lalu simpan kunci AI Anda di kotak &quot;Rapikan transkrip dengan Gemini&quot; di bawah. Sementara itu Anda tetap bisa memotong secara manual.</div>
      : <>
        <div className="time-grid">
          <label>Bahasa ucapan<select value={language} disabled={working} onChange={e => setLanguage(e.target.value as LanguageId)} data-testid="flow-language"><option value="indonesian">Indonesia</option><option value="english">Inggris</option></select></label>
          <div className="flow-info"><small>Video {formatTime(duration)} dibagi ±{parts} bagian audio. Biaya biasanya beberapa sen. Klip hasil maksimal 3 menit.</small></div>
        </div>
        <label className="gemini-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="flow-consent" /> Saya setuju audio video ini dikirim ke layanan AI saya (hanya audio, bukan gambar).</label>
        <div className="range-tools">
          <button className="primary-button" onClick={() => void analyze()} disabled={working || busy || !consent || !duration} data-testid="flow-analyze">
            <span>{phase === "listening" ? `Mendengarkan bagian ${Math.min(progress.done + 1, progress.total)} dari ${progress.total}…` : phase === "choosing" ? "Memilih klip terbaik…" : items ? "Analisis ulang" : "Analisis video & sarankan klip"}</span>
          </button>
          {working && <button onClick={() => abort.current?.abort()} data-testid="flow-cancel">Batal</button>}
        </div>
        {phase === "listening" && <div className="progress-track" aria-label="Kemajuan"><span style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div>}
      </>}
    {note && <div className="notice" role="status" data-testid="flow-note">{note}</div>}
    {error && <div className="notice notice-error" role="alert" data-testid="flow-error">{error}</div>}
    {items && items.length > 0 && <SuggestionList items={items} onItems={setItems} duration={duration} lines={full.current?.segments.map(sg => ({ start: sg.start, end: sg.end, text: sg.text }))}
      intro={`${items.length} klip disarankan. Putar untuk memeriksa, sesuaikan bila perlu, lalu centang yang Anda mau.`}
      actions={m => <>
        <button onClick={() => preview(m)} data-testid="flow-play">▶ Putar</button>
        <button onClick={() => onMotion(toClip(m))} disabled={busy} data-testid="flow-motion">Kirim ke Motion</button>
      </>}>
      <button className="secondary-button" disabled={chosen.length === 0 || chosen.length > room || busy} onClick={() => { onAdd(chosen.map(toClip)); }} data-testid="flow-add">
        <span>＋</span> Tambahkan {chosen.length} klip terpilih ke daftar <small>{room} slot tersisa</small>
      </button>
    </SuggestionList>}
  </section>;
}
