import { FPS, MIN_SCENE_SECONDS } from "@/lib/script";
import { scriptFromTranscript, type Transcript } from "@/lib/transcript";
import type { VoiceMode } from "./types";
import type { Dispatch, SetStateAction } from "react";
import type { SceneTimings } from "@/lib/transcript";

type Props = {
  imported: Transcript | null;
  setScript: Dispatch<SetStateAction<string>>;
  timed: SceneTimings | null;
  voiceMode: VoiceMode;
};

export default function TimingNotices({ imported, setScript, timed, voiceMode }: Props) {
  return (
    <>
{imported && !timed && voiceMode !== "ai" && <div className="notice notice-error normal-only" data-testid="timing-lost">
        Naskah sudah berbeda terlalu jauh dari transkrip, sehingga waktu subtitle memakai <b>perkiraan</b> (bukan waktu ucapan sebenarnya) dan video bisa lebih panjang dari sumbernya.{" "}
        <button className="text-button" data-testid="timing-restore" onClick={() => setScript(scriptFromTranscript(imported, FPS))}>Kembalikan naskah dari transkrip</button>
      </div>}
      {timed && timed.aligned && <div className="notice normal-only" data-testid="aligned-notice">Naskah sudah diedit setelah transkripsi; kata-katanya diselaraskan dengan ucapan asli, jadi waktu caption mungkin bergeser sedikit di bagian yang diubah.</div>}
      {timed && timed.tooShort > 0 && <div className="notice normal-only" data-testid="short-warning">{timed.tooShort} scene lebih pendek dari {MIN_SCENE_SECONDS} dtk. Waktu subtitle tetap tepat dengan ucapan, tetapi teks scene itu tampil sebentar saja. Gabungkan barisnya di kolom Naskah (kata-katanya tidak diubah) bila ingin lebih nyaman dibaca.</div>}
</>
  );
}
