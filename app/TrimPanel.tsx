"use client";

import type { RefObject } from "react";
import { clampTrim, isWhole, snapToWords, trimSeconds, type Trim } from "@/lib/trim";
import type { Word } from "@/lib/transcript";

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/**
 * "Potong awal & akhir" for the video chosen in the motion studio: where the video starts and ends. The file is never changed, so
 * the range can be moved again at any time. A clip from the clipper comes with a few seconds of footage around it and starts on
 * the clip itself; moving the start or end outward uses that footage.
 */
export default function TrimPanel({ duration, trim, onChange, video, words, original, disabled }: {
  duration: number;
  trim: Trim | null;
  onChange: (next: Trim | null) => void;
  video: RefObject<HTMLVideoElement | null>;
  /** The words of the transcript on the file's own timeline, when there is one (enables "Tepatkan ke kata"). */
  words: Word[] | null;
  /** The range a clip from the clipper came with, to go back to. */
  original: Trim | null;
  disabled: boolean;
}) {
  const t = trim ?? { start: 0, end: duration };
  const here = () => video.current?.currentTime ?? 0;
  const set = (next: Trim, edge: "start" | "end") => { const c = clampTrim(next, duration, edge); onChange(isWhole(c, duration) ? null : c); };
  const changed = !isWhole(trim, duration);
  const snapped = words && words.length ? snapToWords(t, words) : null;
  return (
    <div className="trim-panel normal-only" data-testid="trim-panel">
      <div className="field-label">Potong awal &amp; akhir <span className="field-hint">berkas aslinya tidak berubah; bisa digeser lagi kapan saja</span></div>
      <label className="field-label">Mulai: {fmt(t.start)}
        <input type="range" min={0} max={Math.max(0, duration - 1)} step={0.1} value={t.start} disabled={disabled} onChange={e => { const v = Number(e.target.value); if (video.current) video.current.currentTime = v; set({ start: v, end: t.end }, "start"); }} aria-label="Mulai" data-testid="trim-start" />
      </label>
      <label className="field-label">Selesai: {fmt(t.end)}
        <input type="range" min={1} max={duration} step={0.1} value={t.end} disabled={disabled} onChange={e => { const v = Number(e.target.value); if (video.current) video.current.currentTime = Math.max(0, v - 0.5); set({ start: t.start, end: v }, "end"); }} aria-label="Selesai" data-testid="trim-end" />
      </label>
      <div className="range-tools">
        <button type="button" onClick={() => set({ start: here(), end: t.end }, "start")} disabled={disabled} data-testid="trim-start-here">Mulai di posisi sekarang</button>
        <button type="button" onClick={() => set({ start: t.start, end: here() }, "end")} disabled={disabled} data-testid="trim-end-here">Selesai di posisi sekarang</button>
        {snapped && <button type="button" onClick={() => set(snapped, "end")} disabled={disabled || (Math.abs(snapped.start - t.start) < 0.02 && Math.abs(snapped.end - t.end) < 0.02)} data-testid="trim-snap">Tepatkan ke kata</button>}
        {original && changed && (Math.abs(original.start - t.start) > 0.02 || Math.abs(original.end - t.end) > 0.02) && <button type="button" className="text-link" onClick={() => onChange(original)} disabled={disabled} data-testid="trim-original">Kembali ke potongan dari Clipper</button>}
        {changed && <button type="button" className="text-link" onClick={() => onChange(null)} disabled={disabled} data-testid="trim-whole">Pakai seluruh video</button>}
      </div>
      <small className="field-hint" data-testid="trim-summary">{fmt(trimSeconds(trim, duration))} dtk dipakai dari {fmt(duration)} dtk{words && words.length ? "" : ". Buat transkrip untuk bisa menepatkan potongan ke kata."}</small>
    </div>
  );
}
