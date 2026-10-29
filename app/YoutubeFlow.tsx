"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime, parseYouTube } from "@/lib/clip";
import { limitsForVideo, suggestMoments } from "@/lib/clip-assist";
import { GeminiError } from "@/lib/gemini";
import { sliceTranscript, type Transcript } from "@/lib/transcript";
import { captionsToTranscript, fetchYoutubeCaptions, parsePastedTranscript, YoutubeError, type YoutubeCaptions } from "@/lib/youtube";
import type { NewClip } from "./ClipFlow";
import SuggestionList, { type Item } from "./SuggestionList";
import { useGeminiAccess } from "./useGeminiAccess";

type Source = { videoId: string; title: string; seconds: number; language: string; auto: boolean; transcript: Transcript; origin: "youtube" | "paste" };

/**
 * Clips from a YouTube link, without downloading anything: the video's captions (fetched by the owner's server, or pasted by
 * the creator) go to the AI, which suggests the best moments with their times. The creator approves, then chooses the
 * video file, and the app cuts exactly there.
 */
export default function YoutubeFlow({ room, onApprove, onPreview }: {
  room: number;
  /** Called when the creator approves clips; the page then asks for the video file (or cuts from the one already chosen). */
  onApprove: (clips: NewClip[], videoSeconds: number, title: string) => void;
  /** Shows the YouTube preview player at this link (the page owns it). */
  onPreview: (url: string) => void;
}) {
  const access = useGeminiAccess();
  const [url, setUrl] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState<"captions" | "suggest" | null>(null);
  const [error, setError] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const ref = parseYouTube(url);

  function adopt(c: YoutubeCaptions | { videoId: string; title: string; seconds: number; language: string; auto: boolean; lines: YoutubeCaptions["lines"] }, origin: Source["origin"]) {
    const language = /^en/i.test(c.language) ? "english" : "indonesian";
    setSource({ videoId: c.videoId, title: c.title, seconds: c.seconds, language, auto: c.auto, origin, transcript: captionsToTranscript(c.lines, c.seconds, language) });
    setItems(null);
  }

  async function fetchCaptions() {
    if (!ref) return setError("Link YouTube tidak dikenali. Contoh: https://youtu.be/xxxxxxxxxxx");
    const ctl = new AbortController(); abort.current = ctl;
    setBusy("captions"); setError(""); setSource(null); setItems(null);
    onPreview(url);
    try { adopt(await fetchYoutubeCaptions(url, "id", ctl.signal), "youtube"); }
    catch (e) { setError(e instanceof YoutubeError ? e.message : "Gagal mengambil teks dari YouTube."); }
    finally { setBusy(null); }
  }

  function usePasted() {
    if (!ref) return setError("Isi link YouTube dulu (untuk mengenali videonya), lalu tempel transkripnya.");
    const lines = parsePastedTranscript(pasted);
    if (lines.length < 3) return setError("Transkrip tidak terbaca. Salin dari YouTube (⋯ → Tampilkan transkrip) sehingga ada waktu seperti 0:00 di sebelah teksnya.");
    setError(""); onPreview(url);
    adopt({ videoId: ref.id, title: "", seconds: lines[lines.length - 1].end, language: "id", auto: false, lines }, "paste");
  }

  async function suggest() {
    if (!source || !access) return;
    const ctl = new AbortController(); abort.current = ctl;
    setBusy("suggest"); setError("");
    try {
      const o = { apiKey: access.apiKey, model: access.model, language: source.language === "english" ? "en" : "id", signal: ctl.signal, transport: access.transport, format: access.format };
      const moments = await suggestMoments(source.transcript.segments.map(s => ({ start: s.start, end: s.end, text: s.text })), o, limitsForVideo(source.seconds));
      if (moments.length === 0) setError("AI tidak menemukan bagian yang layak dijadikan klip dari teks ini.");
      setItems(moments.map((m, i) => ({ start: m.start, end: m.end, title: m.title, reason: m.reason, checked: i < Math.min(Math.max(room, 0), 5),
        ...(m.reachedBack ? { note: `Awal dimundurkan ${m.reachedBack} kalimat karena kalimat pilihan AI hanya melanjutkan kalimat sebelumnya. Bila kurang pas, geser lagi di "Sesuaikan waktu".` } : {}) })));
    } catch (e) { setError(e instanceof GeminiError ? e.message : "Gagal menghubungi layanan AI."); }
    finally { setBusy(null); }
  }

  const chosen = items?.filter(m => m.checked) ?? [];
  const toClip = (m: Item): NewClip => ({ start: m.start, end: m.end, title: m.title, transcript: sliceTranscript(source!.transcript, m.start, m.end) });
  const at = (s: number) => `https://youtu.be/${source!.videoId}?t=${Math.floor(s)}`;

  return <div className="yt-flow" data-testid="yt-flow">
    <p><small>Tanpa mengunduh apa pun: teks video diambil (atau Anda tempel), AI menyarankan klipnya, lalu Anda memilih <b>file video yang sama</b> dan app memotong tepat di waktu itu. Pakai video milik Anda atau yang Anda punya izinnya.</small></p>
    <div className="yt-row">
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" inputMode="url" autoCapitalize="none" autoCorrect="off" aria-label="URL YouTube" data-testid="yt-url" />
      <button onClick={() => void fetchCaptions()} disabled={busy !== null || !url.trim()} data-testid="yt-fetch">{busy === "captions" ? "Mengambil…" : "Ambil teks otomatis"}</button>
    </div>
    <details className="flow-adjust" data-testid="yt-paste-box"><summary>Atau tempel transkrip dari YouTube</summary>
      <p><small>Di YouTube: ketuk ⋯ → <b>Tampilkan transkrip</b>, salin semuanya, lalu tempel di sini. Cara ini selalu bisa dipakai.</small></p>
      <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={5} placeholder={"0:00\nHalo semuanya\n0:03\nselamat datang…"} data-testid="yt-paste" />
      <div className="range-tools"><button onClick={usePasted} disabled={busy !== null || !pasted.trim()} data-testid="yt-use-paste">Pakai transkrip ini</button></div>
    </details>
    {error && <div className="notice notice-error" role="alert" data-testid="yt-error">{error}</div>}
    {source && <div className="notice" role="status" data-testid="yt-source">
      {source.title ? <><b>{source.title}</b> · </> : null}{source.transcript.segments.length} bagian teks · {formatTime(source.seconds)}{source.origin === "youtube" ? (source.auto ? " · teks otomatis YouTube (bisa ada salah dengar)" : " · teks buatan manusia") : " · transkrip tempelan"}
    </div>}
    {source && <div className="range-tools"><button className="primary-button" onClick={() => void suggest()} disabled={busy !== null || !access} data-testid="yt-suggest"><span>{busy === "suggest" ? "Memilih klip terbaik…" : items ? "Sarankan ulang" : "Sarankan klip dengan AI"}</span></button></div>}
    {source && !access && <div className="notice" data-testid="yt-needs-ai">Butuh kunci AI: masuk ke akun lalu simpan kunci di kotak &quot;Rapikan transkrip dengan Gemini&quot; (muncul setelah ada transkrip), atau pakai alur &quot;Klip otomatis dengan AI&quot; setelah memilih video.</div>}
    {source && items && items.length > 0 && <SuggestionList items={items} onItems={setItems} duration={source.seconds} lines={source.transcript.segments.map(sg => ({ start: sg.start, end: sg.end, text: sg.text }))}
      intro={`${items.length} klip disarankan dari teks YouTube. Buka di YouTube untuk memeriksa, sesuaikan bila perlu, lalu centang yang Anda mau.`}
      actions={m => <a className="text-button" href={at(m.start)} target="_blank" rel="noopener noreferrer" data-testid="yt-open">▶ Buka di YouTube ({formatTime(m.start)})</a>}>
      <button className="secondary-button" disabled={chosen.length === 0 || chosen.length > room} onClick={() => onApprove(chosen.map(toClip), source.seconds, source.title)} data-testid="yt-continue">
        <span>→</span> Lanjut: pilih file video untuk {chosen.length} klip <small>{room} slot tersisa</small>
      </button>
    </SuggestionList>}
  </div>;
}
