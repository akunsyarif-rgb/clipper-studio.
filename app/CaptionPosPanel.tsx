"use client";

import { DEFAULT_CAPTION_POS, isDefaultCaptionPos, SCALE_RANGE, X_RANGE, Y_RANGE, type CaptionPos } from "@/lib/caption-box";

/**
 * Where the subtitles sit and how big they are: three sliders in percent of the frame (so the preview and the full-size MP4 agree).
 * The preview moves while the slider moves. Without a source video there are no subtitles, so the sliders wait with a short reason.
 */
export default function CaptionPosPanel({ value, onChange, active, captionsOn, disabled, onTouch }: {
  value: CaptionPos | undefined; onChange: (v: CaptionPos | undefined) => void; active: boolean; captionsOn: boolean; disabled?: boolean;
  /** Called when a slider is grabbed: the preview jumps to a moment with a subtitle, so the change can be seen. */
  onTouch?: () => void;
}) {
  const cur = value ?? DEFAULT_CAPTION_POS;
  const off = disabled || !active || !captionsOn;
  const set = (patch: Partial<CaptionPos>) => { const next = { ...cur, ...patch }; onChange(isDefaultCaptionPos(next) ? undefined : next); };
  const slider = (id: "x" | "y" | "scale", label: string, range: { min: number; max: number }, step: number, unit: string, hint: string) => <label className="field-label cap-slider" key={id}>
    <span>{label}: <b data-testid={`cap-${id}-value`}>{cur[id]}{unit}</b> <span className="field-hint">{hint}</span></span>
    <input type="range" min={range.min} max={range.max} step={step} value={cur[id]} disabled={off} onPointerDown={onTouch} onFocus={onTouch} onChange={e => set({ [id]: Number(e.target.value) })} data-testid={`cap-${id}`} />
  </label>;
  return <div className="caption-pos" data-testid="caption-pos">
    <div className="field-label">Posisi dan ukuran subtitle <span className="field-hint">persen dari layar, jadi pratinjau dan hasil render sama</span></div>
    {!active && <small className="field-hint" data-testid="caption-pos-note">Subtitle tampil di atas video sumber. Pilih video sumber dulu untuk mengaturnya di sini.</small>}
    {active && !captionsOn && <small className="field-hint" data-testid="caption-pos-note">Subtitle sedang mati. Nyalakan di “Durasi dan subtitle” untuk mengatur posisinya.</small>}
    {slider("x", "Posisi X (kiri–kanan)", X_RANGE, 1, "%", "50 = tengah")}
    {slider("y", "Posisi Y (atas–bawah)", Y_RANGE, 1, "%", "makin besar makin ke bawah")}
    {slider("scale", "Ukuran teks", SCALE_RANGE, 5, "%", "100 = normal")}
    <div className="button-row"><button type="button" className="text-button" onClick={() => onChange(undefined)} disabled={off || !value} data-testid="cap-reset">Kembalikan posisi bawaan</button></div>
  </div>;
}
