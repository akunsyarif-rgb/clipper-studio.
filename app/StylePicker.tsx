"use client";

import { PALETTES, STYLES, type PaletteId, type StyleId } from "@/lib/script";

/** A small drawing of each animation style, in the colours of the chosen palette, so the names mean something to a newcomer. */
function StyleSketch({ id, p }: { id: StyleId; p: (typeof PALETTES)[PaletteId] }) {
  const bg = <><defs><linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={p.bg1} /><stop offset="1" stopColor={p.bg2} /></linearGradient></defs><rect width="64" height="96" rx="8" fill={`url(#g-${id})`} /></>;
  return <svg viewBox="0 0 64 96" width="48" height="72" aria-hidden="true" focusable="false">
    {bg}
    {id === "hybrid" && <><text x="8" y="40" fontSize="15" fontWeight="800" fill={p.text}>Aa</text><rect x="8" y="48" width="34" height="4" rx="2" fill={p.accent} /><rect x="8" y="58" width="22" height="3" rx="1.5" fill={p.text} opacity=".5" /></>}
    {id === "kinetic" && <><text x="6" y="30" fontSize="14" fontWeight="900" fill={p.text}>BIG</text><text x="6" y="48" fontSize="14" fontWeight="900" fill={p.accent}>WORD</text><text x="6" y="66" fontSize="14" fontWeight="900" fill={p.text}>MOVE</text></>}
    {id === "popup" && <><rect x="10" y="28" width="44" height="30" rx="10" fill={p.accent} /><text x="16" y="48" fontSize="13" fontWeight="800" fill={p.bg1}>Pop!</text></>}
    {id === "cinematic" && <><rect x="0" y="0" width="64" height="14" fill="#000" /><rect x="0" y="82" width="64" height="14" fill="#000" /><text x="10" y="52" fontSize="11" fill={p.text} fontStyle="italic">Cinema</text><rect x="10" y="58" width="26" height="2" fill={p.accent} /></>}
    {id === "editorial" && <><text x="8" y="42" fontSize="12" fontFamily="serif" fill={p.text}>Quiet</text><rect x="8" y="48" width="40" height="1" fill={p.accent} /><text x="8" y="62" fontSize="7" fontFamily="serif" fill={p.text} opacity=".7">editorial</text></>}
  </svg>;
}

/**
 * Pick the look by seeing it: one card per animation style and one chip per colour palette, each drawn small. "Coba gaya lain"
 * moves to the next combination and "Urungkan gaya" goes back once. The dropdowns further down do the same and stay for fine control.
 */
export default function StylePicker({ style, palette, onStyle, onPalette, onTryOther, onUndo, canUndo, disabled }: {
  style: StyleId; palette: PaletteId; onStyle: (s: StyleId) => void; onPalette: (p: PaletteId) => void; onTryOther: () => void; onUndo: () => void; canUndo: boolean; disabled?: boolean;
}) {
  const cur = PALETTES[palette];
  return <div className="style-picker" data-testid="style-picker">
    <div className="field-label">Gaya animasi <span className="field-hint">ketuk untuk mencoba; pratinjau di samping langsung berubah</span></div>
    <div className="style-cards" role="radiogroup" aria-label="Gaya animasi">
      {STYLES.map(s => <button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={style === s.id ? "active" : ""} disabled={disabled} onClick={() => onStyle(s.id)} data-testid={`style-card-${s.id}`}><StyleSketch id={s.id} p={cur} /><span>{s.label}</span></button>)}
    </div>
    <div className="field-label">Warna <span className="field-hint">{cur.label}</span></div>
    <div className="palette-chips" role="radiogroup" aria-label="Palet warna">
      {(Object.keys(PALETTES) as PaletteId[]).map(id => { const p = PALETTES[id]; return <button key={id} type="button" role="radio" aria-checked={palette === id} className={palette === id ? "active" : ""} disabled={disabled} onClick={() => onPalette(id)} title={p.label} aria-label={p.label} data-testid={`palette-chip-${id}`} style={{ background: `linear-gradient(135deg, ${p.bg1}, ${p.bg2})` }}><i style={{ background: p.accent }} /></button>; })}
    </div>
    <div className="button-row">
      <button type="button" onClick={onTryOther} disabled={disabled} data-testid="style-try-other">Coba gaya lain</button>
      {canUndo && <button type="button" className="text-button" onClick={onUndo} disabled={disabled} data-testid="style-undo">Urungkan gaya</button>}
    </div>
  </div>;
}
