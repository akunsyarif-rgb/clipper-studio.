import { CONTENT_PRESETS, PALETTES, STYLES, type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import { resolveTypePack, TYPE_PACK_IDS, TYPE_PACKS, type TypePackId } from "@/lib/fonts";
import type { Dispatch, SetStateAction } from "react";

type Props = {
  backdrop: "plain" | "mesh";
  contentPreset: ContentPresetId | "custom";
  grain: boolean;
  palette: PaletteId;
  replayPreview: () => void;
  setBackdrop: Dispatch<SetStateAction<"plain" | "mesh">>;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setGrain: Dispatch<SetStateAction<boolean>>;
  setPalette: Dispatch<SetStateAction<PaletteId>>;
  setStoryVisuals: Dispatch<SetStateAction<boolean>>;
  setStyle: Dispatch<SetStateAction<StyleId>>;
  setTypography: Dispatch<SetStateAction<TypePackId>>;
  source: { file: File; url: string; seconds: number; } | null;
  storyVisuals: boolean;
  style: StyleId;
  typography: TypePackId;
  videoEdit: boolean;
};

export default function LookFold({ backdrop, contentPreset, grain, palette, replayPreview, setBackdrop, setContentPreset, setGrain, setPalette, setStoryVisuals, setStyle, setTypography, source, storyVisuals, style, typography, videoEdit }: Props) {
  return (
    <details className="fold" data-testid="fold-look"><summary><b>Tampilan dan tema</b> <small>pilihan lengkap</small> <small>{STYLES.find(x => x.id === style)?.label} · {PALETTES[palette].label}{contentPreset !== "custom" ? ` · ${CONTENT_PRESETS.find(p => p.id === contentPreset)?.label}` : ""}</small></summary>
      <label className="field-label" htmlFor="motion-preset">Template konten</label>
      <select id="motion-preset" data-testid="content-preset" value={contentPreset} onChange={e => {
        const id = e.target.value as ContentPresetId | "custom";
        setContentPreset(id);
        const preset = CONTENT_PRESETS.find(p => p.id === id);
        if (preset) { setStyle(preset.style); setPalette(preset.palette); }
      }}>
        <option value="custom">Kustom · atur sendiri</option>
        {CONTENT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <p className="field-hint preset-hint">{CONTENT_PRESETS.find(p => p.id === contentPreset)?.description ?? "Pilih gaya animasi dan palet warna secara manual."}</p>
      <div className="field-row">
        <div><label className="field-label" htmlFor="motion-style">Gaya animasi</label><select id="motion-style" data-testid="style" value={style} onChange={e => { setStyle(e.target.value as StyleId); setContentPreset("custom"); replayPreview(); }}>{STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className="field-label" htmlFor="motion-palette">Palet warna</label><select id="motion-palette" data-testid="palette" value={palette} onChange={e => { setPalette(e.target.value as PaletteId); setContentPreset("custom"); replayPreview(); }}>{(Object.keys(PALETTES) as PaletteId[]).map(p => <option key={p} value={p}>{PALETTES[p].label}</option>)}</select></div>
      </div>
      
        <label className="field-label" htmlFor="typography">Tipografi <span className="field-hint">{resolveTypePack(typography).description}</span>
          <select id="typography" value={typography} onChange={e => setTypography(e.target.value as TypePackId)} data-testid="typography">
            {TYPE_PACK_IDS.map(id => <option key={id} value={id}>{TYPE_PACKS[id].label}</option>)}
          </select>
        </label>
        {!(videoEdit && source) && <>
          <label className="field-label" htmlFor="backdrop">Latar <span className="field-hint">mesh: bidang warna palet yang bergeser pelan</span>
            <select id="backdrop" value={backdrop} onChange={e => setBackdrop(e.target.value as "plain" | "mesh")} data-testid="backdrop">
              <option value="plain">Polos (gradasi palet)</option>
              <option value="mesh">Mesh bergerak</option>
            </select>
          </label>
          <label className="check-row" data-testid="grain-toggle"><input type="checkbox" checked={grain} onChange={e => setGrain(e.target.checked)} data-testid="grain" /> Tekstur film (grain halus)</label>
        </>}
        {!(videoEdit && source) && <label className="check-row" data-testid="story-visuals-toggle"><input type="checkbox" checked={storyVisuals} onChange={e => setStoryVisuals(e.target.checked)} data-testid="story-visuals" /> Objek visual 3D di atas teks <span className="field-hint">titik fokus untuk pembuka, langkah bertumbuh, orbit untuk renungan, satu titik untuk penutup; tanpa teks tambahan</span></label>}
      </details>
  );
}
