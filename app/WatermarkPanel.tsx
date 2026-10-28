"use client";

import { cleanWatermarkText, isWatermarkActive, WATERMARK_MAX_CHARS, WATERMARK_OPACITY, WATERMARK_POSITIONS, WATERMARK_SIZE, type Watermark } from "@/lib/watermark";

/**
 * Watermark settings shared by the clipper and the motion studio. Purely controlled: the parent keeps the value (and
 * remembers it for the editing session); the preview and the exported MP4 are drawn from the same value.
 */
export default function WatermarkPanel({ value, onChange, disabled = false, note }: { value: Watermark; onChange: (w: Watermark) => void; disabled?: boolean; note?: string }) {
  const set = (patch: Partial<Watermark>) => onChange({ ...value, ...patch });
  const empty = value.enabled && cleanWatermarkText(value.text).length === 0;
  return (
    <div className="watermark-panel" data-testid="watermark-panel">
      <label className="check-row"><input type="checkbox" checked={value.enabled} disabled={disabled} onChange={e => set({ enabled: e.target.checked })} data-testid="wm-enabled" /> Tampilkan watermark di video</label>
      <label className="field-label">Teks watermark
        <input value={value.text} maxLength={WATERMARK_MAX_CHARS} placeholder="Contoh: @ArkaSenja atau nama brand" disabled={disabled} onChange={e => set({ text: e.target.value })} data-testid="wm-text" autoCapitalize="none" autoCorrect="off" />
      </label>
      {empty ? <small className="field-hint" role="status" data-testid="wm-empty">Teks masih kosong, jadi tidak ada watermark yang ditampilkan.</small> : null}
      <div className="settings-label">Posisi</div>
      <div className="option-grid wm-positions">
        {WATERMARK_POSITIONS.map(p => <button key={p.id} type="button" className={"option " + (value.position === p.id ? "active" : "")} aria-pressed={value.position === p.id} disabled={disabled} onClick={() => set({ position: p.id })} data-testid={"wm-pos-" + p.id}><strong>{p.label}</strong></button>)}
      </div>
      <div className="field-row">
        <div><label className="field-label" htmlFor="wm-size">Ukuran <small>{value.size}%</small></label>
          <input id="wm-size" type="range" min={WATERMARK_SIZE.min} max={WATERMARK_SIZE.max} step={WATERMARK_SIZE.step} value={value.size} disabled={disabled} onChange={e => set({ size: Number(e.target.value) })} data-testid="wm-size" /></div>
        <div><label className="field-label" htmlFor="wm-opacity">Transparansi <small>{Math.round(value.opacity * 100)}%</small></label>
          <input id="wm-opacity" type="range" min={WATERMARK_OPACITY.min} max={WATERMARK_OPACITY.max} step={WATERMARK_OPACITY.step} value={value.opacity} disabled={disabled} onChange={e => set({ opacity: Number(e.target.value) })} data-testid="wm-opacity" /></div>
      </div>
      <small className="field-hint" data-testid="wm-note">{isWatermarkActive(value) ? "Watermark ikut tertanam di MP4 hasil ekspor dan menjaga jarak dari area aman (judul, subtitle, wajah)." : "Nonaktif atau kosong: video diekspor tanpa watermark."} Pengaturan diingat selama sesi ini. {note ?? ""}</small>
    </div>
  );
}
