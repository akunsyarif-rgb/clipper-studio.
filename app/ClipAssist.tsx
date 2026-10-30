"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/clip";
import { suggestMoments, WEAK_SCORE, writeCopy, type Copy, type Moment } from "@/lib/clip-assist";
import { GeminiError } from "@/lib/gemini";
import type { Transcript } from "@/lib/transcript";
import { useGeminiAccess } from "./useGeminiAccess";

/**
 * AI suggestions for the clipper: the best moments to cut out of the transcript, and a title, description and hashtags
 * for a clip. Suggestions only: nothing changes until the creator taps to use one. Only the transcript's text is sent.
 */
export default function ClipAssist({ transcript, rangeStart, language, disabled, onPickRange }: {
  transcript: Transcript;
  /** Where the transcript starts in the video (seconds), so a moment can be given in video time. */
  rangeStart: number;
  language: "id" | "en";
  disabled: boolean;
  /** Clipper page only: sets the clip's start and end (video seconds). */
  onPickRange?: (start: number, end: number) => void;
}) {
  const access = useGeminiAccess();
  const [busy, setBusy] = useState<"moments" | "copy" | null>(null);
  const [error, setError] = useState("");
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [copy, setCopy] = useState<{ for: string; value: Copy } | null>(null);
  const [copied, setCopied] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { setMoments(null); setCopy(null); setError(""); }, [transcript.segments.length, transcript.duration]);

  if (!access) return null;
  const lines = transcript.segments.map(s => ({ start: s.start, end: s.end, text: s.text }));

  async function call<T>(kind: "moments" | "copy", fn: (o: Parameters<typeof suggestMoments>[1]) => Promise<T>): Promise<T | null> {
    if (!access) return null;
    setBusy(kind); setError("");
    const ctl = new AbortController(); abort.current = ctl;
    try { return await fn({ apiKey: access.apiKey, model: access.model, language, signal: ctl.signal, transport: access.transport, format: access.format }); }
    catch (e) { setError(e instanceof GeminiError ? e.message : "Gagal menghubungi layanan AI."); return null; }
    finally { setBusy(null); }
  }

  async function findMoments() {
    const found = await call("moments", o => suggestMoments(lines, o));
    if (found) { setMoments(found); if (found.length === 0) setError("AI tidak menemukan momen yang layak dipotong dari transkrip ini."); }
  }
  async function writeFor(label: string, text: string, context = "") {
    const value = await call("copy", o => writeCopy(text, o, context));
    if (value) setCopy({ for: label, value });
  }
  async function copyText(what: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(c => (c === what ? "" : c)), 1500); }
    catch { setError("Browser menolak menyalin. Salin teks secara manual."); }
  }
  const textOf = (m: Moment) => transcript.segments.slice(m.startIndex, m.endIndex + 1).map(s => s.text).join(" ");
  /** The lines just before a moment: what a new viewer would be missing, for the title and description. */
  const contextOf = (m: Moment) => transcript.segments.slice(Math.max(0, m.startIndex - 6), m.startIndex).map(s => s.text).join(" ");
  const allText = transcript.segments.map(s => s.text).join(" ");

  return <details className="gemini-box" data-testid="assist-box">
    <summary>Saran AI: momen terbaik, judul, dan tagar (opsional)</summary>
    <p><small>Hanya teks transkrip yang dikirim ke layanan AI Anda. Ini saran saja: tidak ada yang dipotong atau diubah sampai Anda memilihnya.</small></p>
    <div className="range-tools">
      <button onClick={() => void findMoments()} disabled={busy !== null || disabled || lines.length === 0} data-testid="assist-moments">{busy === "moments" ? "Mencari momen…" : "Cari momen terbaik"}</button>
      <button onClick={() => void writeFor("seluruh transkrip", allText)} disabled={busy !== null || disabled || lines.length === 0} data-testid="assist-copy-all">{busy === "copy" ? "Menulis…" : "Judul, deskripsi, dan tagar (seluruh transkrip)"}</button>
      {busy && <button onClick={() => abort.current?.abort()}>Batal</button>}
    </div>
    {error && <div className="notice notice-error" role="alert" data-testid="assist-error">{error}</div>}
    {moments && moments.length > 0 && <div className="assist-moments">
      {moments.map((m, i) => <div className="assist-moment" key={`${m.start}:${m.end}`} data-testid="assist-moment">
        <b>{m.title}</b>
        <small>{formatTime(rangeStart + m.start)} – {formatTime(rangeStart + m.end)} · {Math.round(m.end - m.start)} detik{m.reason ? ` · ${m.reason}` : ""}</small>
        {m.judged && <small data-testid="assist-understood">{m.judged.score >= WEAK_SCORE ? "Mudah dipahami" : "Konteks kurang"} {m.judged.score}/10{m.judged.understood ? ` · Penonton baru menangkap: ${m.judged.understood}` : ""}{m.judged.missing ? ` · Kurang: ${m.judged.missing}` : ""}</small>}
        <div className="range-tools">
          {onPickRange && <button onClick={() => onPickRange(rangeStart + m.start, rangeStart + m.end)} data-testid="assist-use-range">Pakai rentang ini</button>}
          <button onClick={() => void writeFor(`momen ${i + 1}: ${m.title}`, textOf(m), contextOf(m))} disabled={busy !== null} data-testid="assist-copy-moment">Judul &amp; tagar untuk momen ini</button>
        </div>
      </div>)}
    </div>}
    {copy && <div className="assist-copy" data-testid="assist-copy">
      <small>Untuk {copy.for}</small>
      {([["Judul", copy.value.title, "title"], ["Deskripsi", copy.value.description, "description"], ["Tagar", copy.value.hashtags.join(" "), "hashtags"]] as const).map(([label, text, id]) => <label key={id}>{label}
        <textarea readOnly rows={id === "description" ? 3 : 2} value={text} data-testid={`assist-${id}`} />
        <button onClick={() => void copyText(id, text)}>{copied === id ? "Tersalin ✓" : `Salin ${label.toLowerCase()}`}</button>
      </label>)}
      <button onClick={() => void copyText("all", `${copy.value.title}\n\n${copy.value.description}\n\n${copy.value.hashtags.join(" ")}`)} data-testid="assist-copy-everything">{copied === "all" ? "Tersalin ✓" : "Salin semuanya"}</button>
    </div>}
  </details>;
}
