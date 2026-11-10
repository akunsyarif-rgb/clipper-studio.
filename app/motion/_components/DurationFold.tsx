import { type Narration } from "@/lib/recorder";
import { type CaptionStyleId, CAPTION_STYLES } from "@/lib/script";
import type { VoiceMode } from "./types";
import type { Dispatch, SetStateAction } from "react";

type Props = {
  captions: boolean;
  captionStyle: CaptionStyleId;
  narration: Narration | null;
  setCaptions: Dispatch<SetStateAction<boolean>>;
  setCaptionStyle: Dispatch<SetStateAction<CaptionStyleId>>;
  setTarget: Dispatch<SetStateAction<string>>;
  source: { file: File; url: string; seconds: number; } | null;
  target: string;
  videoEdit: boolean;
  voiceMode: VoiceMode;
};

export default function DurationFold({ captions, captionStyle, narration, setCaptions, setCaptionStyle, setTarget, source, target, videoEdit, voiceMode }: Props) {
  return (
    <details className="fold" data-testid="fold-duration"><summary><b>Durasi dan subtitle</b> <small>{narration ? "Ikuti narasi" : voiceMode === "ai" ? "Ikuti suara otomatis" : target === "auto" ? "Otomatis" : `${target} detik`} · {captions ? "Subtitle tampil" : "Tanpa subtitle"}</small></summary>
      {videoEdit && source && <label className="field-label" htmlFor="caption-style">Gaya subtitle <span className="field-hint">{CAPTION_STYLES.find(c => c.id === captionStyle)?.description}</span>
        <select id="caption-style" value={captionStyle} onChange={e => setCaptionStyle(e.target.value as CaptionStyleId)} data-testid="caption-style">
          {CAPTION_STYLES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>}
      <div className="field-row">
        <div><label className="field-label" htmlFor="motion-duration">Durasi</label>
          <select id="motion-duration" data-testid="duration" value={narration ? "audio" : voiceMode === "ai" ? "auto" : target} disabled={!!narration || voiceMode === "ai"} onChange={e => setTarget(e.target.value)}>
            {narration ? <option value="audio">Ikuti narasi ({narration.seconds.toFixed(1)} dtk)</option> : voiceMode === "ai" ? <option value="auto">Ikuti suara otomatis</option> : <>
              <option value="auto">Otomatis (kecepatan baca)</option><option value="15">15 detik</option><option value="30">30 detik</option><option value="45">45 detik</option><option value="60">60 detik</option>
            </>}
          </select></div>
        <div><label className="field-label" htmlFor="motion-captions">Subtitle</label>
          <select id="motion-captions" value={captions ? "on" : "off"} onChange={e => setCaptions(e.target.value === "on")}><option value="on">Tampilkan, sorot kata</option><option value="off">Tanpa subtitle</option></select></div>
      </div>
      </details>
  );
}
