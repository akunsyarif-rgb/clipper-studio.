import { STICKER_CREDIT, type StickerMode } from "@/lib/stickers";
import { SFX_LABELS, SFX_MODES, type SfxMode } from "@/lib/sfx";
import type { Dispatch, SetStateAction } from "react";

type Props = {
  setSfxMode: Dispatch<SetStateAction<SfxMode>>;
  setStickerMode: Dispatch<SetStateAction<StickerMode>>;
  sfxMode: SfxMode;
  source: { file: File; url: string; seconds: number; } | null;
  stickerMode: StickerMode;
  videoEdit: boolean;
};

export default function FxFold({ setSfxMode, setStickerMode, sfxMode, source, stickerMode, videoEdit }: Props) {
  return (
    <details className="fold" data-testid="fold-fx"><summary><b>Efek suara &amp; stiker</b> <small>{SFX_LABELS[sfxMode]} · {stickerMode === "auto" ? "stiker otomatis" : "tanpa stiker"}</small></summary>
        <label className="field-label" htmlFor="sfx-mode">Efek suara <span className="field-hint">whoosh saat pindah scene, pop saat stiker muncul, dentang di ajakan; dibuat di perangkat, di bawah suara narasi</span>
          <select id="sfx-mode" value={sfxMode} onChange={e => setSfxMode(e.target.value as SfxMode)} data-testid="sfx-mode">
            {SFX_MODES.map(m => <option key={m} value={m}>{SFX_LABELS[m]}</option>)}
          </select>
        </label>
        {!(videoEdit && source) && <label className="field-label" htmlFor="sticker-mode">Stiker <span className="field-hint">emoji kecil yang muncul di atas teks sesuai makna kalimat (maksimal 60% scene); bisa diganti per scene di daftar scene</span>
          <select id="sticker-mode" value={stickerMode} onChange={e => setStickerMode(e.target.value as StickerMode)} data-testid="sticker-mode">
            <option value="off">Mati</option>
            <option value="auto">Otomatis (sesuai makna)</option>
          </select>
        </label>}
        {stickerMode === "auto" && !(videoEdit && source) && <small className="field-hint" data-testid="sticker-credit">{STICKER_CREDIT}. Sebutkan kredit ini di deskripsi video Anda.</small>}
      </details>
  );
}
