import { FPS } from "@/lib/script";
import { allWords, scriptFromTranscript, type Transcript } from "@/lib/transcript";
import type { VoiceMode } from "./types";
import type { Dispatch, SetStateAction } from "react";
import type { SceneTimings } from "@/lib/transcript";

type Props = {
  imported: Transcript | null;
  offer: { source: string; transcript: Transcript; } | null;
  setImported: Dispatch<SetStateAction<Transcript | null>>;
  setOffer: Dispatch<SetStateAction<{ source: string; transcript: Transcript; } | null>>;
  setScript: Dispatch<SetStateAction<string>>;
  setVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  timed: SceneTimings | null;
  timings: SceneTimings | null;
  videoEdit: boolean;
};

export default function TranscriptNotices({ imported, offer, setImported, setOffer, setScript, setVoiceMode, timed, timings, videoEdit }: Props) {
  return (
    <>
{offer && !imported && <div className="notice normal-only" data-testid="transcript-offer">
        Transkrip dari Clipper tersedia: <strong>{offer.source}</strong> ({allWords(offer.transcript).length} kata, {Math.round(offer.transcript.duration)} dtk).{" "}
        <button className="text-button" data-testid="transcript-import" onClick={() => { setScript(scriptFromTranscript(offer.transcript, FPS)); setImported(offer.transcript); setVoiceMode("manual"); setOffer(null); }}>Impor ke naskah</button>
      </div>}
      {imported && <div className="notice normal-only" data-testid="transcript-status">
        {timed ? (videoEdit ? "Mode edit video: video asli (dengan suaranya) jadi dasar; subtitle mengikuti waktu kata, dan scene dengan kata kunci/angka berganti ke grafis. Atur per scene lewat \"Layar\"." : "Subtitle mengikuti waktu kata dari transkrip. Unggah audio asli video pada Voice over → Rekam / unggah agar suara dan subtitle sama.")
          : timings ? "Audio yang dipilih tidak sama panjang dengan transkrip, jadi waktu dibagi otomatis. Unggah audio asli klip yang sama."
          : "Naskah sudah diubah dari transkrip, jadi waktu kata tidak dipakai lagi. Subtitle dibagi otomatis."}
      </div>}
</>
  );
}
