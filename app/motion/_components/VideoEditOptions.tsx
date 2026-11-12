import { type Transcript } from "@/lib/transcript";
import { DENSITIES, type Density } from "@/lib/importance";
import type { BrandMotion, OverlayPosition } from "@/lib/overlay";
import type { Dispatch, SetStateAction } from "react";

type Props = {
  brandMotion: BrandMotion;
  captionOffset: number;
  density: Density;
  imported: Transcript | null;
  overlayPos: OverlayPosition;
  setBrandMotion: Dispatch<SetStateAction<BrandMotion>>;
  setCaptionOffset: Dispatch<SetStateAction<number>>;
  setDensity: Dispatch<SetStateAction<Density>>;
  setOverlayPos: Dispatch<SetStateAction<OverlayPosition>>;
  videoEdit: boolean;
};

export default function VideoEditOptions({ brandMotion, captionOffset, density, imported, overlayPos, setBrandMotion, setCaptionOffset, setDensity, setOverlayPos, videoEdit }: Props) {
  return (
    <>
{imported && videoEdit && <label className="field-label">Geser waktu subtitle: {captionOffset > 0 ? "+" : ""}{captionOffset.toFixed(1)} dtk <span className="field-hint">kurangi jika teks muncul terlambat, tambah jika terlalu cepat</span>
        <input type="range" min={-1} max={1} step={0.1} value={captionOffset} onChange={e => setCaptionOffset(Number(e.target.value))} data-testid="caption-offset" />
      </label>}
      {videoEdit && <label className="field-label" htmlFor="overlay-position">Posisi animasi di atas video <span className="field-hint">atas = di ruang kosong di atas kepala; bawah = tepat di atas subtitle</span>
        <select id="overlay-position" value={overlayPos} onChange={e => setOverlayPos(e.target.value as OverlayPosition)} data-testid="overlay-position">
          <option value="top">Atas (di atas kepala)</option>
          <option value="lower">Bawah (di atas subtitle)</option>
        </select>
      </label>}
      {videoEdit && <label className="field-label" htmlFor="animation-density">Berapa banyak animasi <span className="field-hint">{DENSITIES.find(d => d.id === density)?.hint}</span>
        <select id="animation-density" value={density} onChange={e => setDensity(e.target.value as Density)} data-testid="animation-density">
          {DENSITIES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </label>}
      {videoEdit && <small className="field-hint" data-testid="unified-importance-note">Penilaian kepentingan scene kini dilakukan bersamaan dengan Sutradara AI, lalu digabung dengan aturan lokal. Tidak ada permintaan Gemini Judge terpisah.</small>}
      {videoEdit && <label className="field-label" htmlFor="brand-motion">Gaya animasi istilah populer <span className="field-hint">sederhana = ikon dan nama dengan satu denyut halus; lengkap = adegan kecil khas tiap layanan</span>
        <select id="brand-motion" value={brandMotion} onChange={e => setBrandMotion(e.target.value as BrandMotion)} data-testid="brand-motion">
          <option value="simple">Sederhana (elegan)</option>
          <option value="full">Lengkap (meriah)</option>
        </select>
      </label>}
</>
  );
}
