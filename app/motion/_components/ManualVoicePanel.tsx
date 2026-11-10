import { MAX_RECORDING_SECONDS } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import type { VoiceMode } from "./types";
import type { Dispatch, SetStateAction, RefObject, ChangeEvent } from "react";

type Props = {
  audioError: string;
  audioInput: RefObject<HTMLInputElement | null>;
  busy: boolean;
  cancelRecording: () => void;
  narration: Narration | null;
  narrationBusy: boolean;
  onAudio: (e: ChangeEvent<HTMLInputElement>) => void;
  recording: boolean;
  recordingSeconds: number | null;
  setNarration: Dispatch<SetStateAction<Narration | null>>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  voiceMode: VoiceMode;
};

export default function ManualVoicePanel({ audioError, audioInput, busy, cancelRecording, narration, narrationBusy, onAudio, recording, recordingSeconds, setNarration, startRecording, stopRecording, voiceMode }: Props) {
  return (
    <>
{voiceMode === "manual" && <div className="audio-box">
        <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" onChange={onAudio} className="file-hidden" data-testid="audio-input" />
        {recording ? <div className="rec-live" data-testid="recording">
          <span className="rec-dot" /><b>Merekam {recordingSeconds!.toFixed(1)} dtk</b><small>maks. {MAX_RECORDING_SECONDS} dtk</small>
          <div className="rec-actions"><button className="motion-primary" onClick={() => void stopRecording()} data-testid="record-stop">■ Selesai</button><button className="motion-secondary" onClick={cancelRecording}>Batal</button></div>
        </div> : narration ? <>
          <audio src={narration.url} controls preload="metadata" />
          <div className="audio-meta"><b>{narration.recorded ? "Rekaman mikrofon" : narration.file.name}</b><small>{narration.seconds.toFixed(1)} dtk · durasi video mengikuti narasi{narration.speech ? "" : " · ducking memakai level tetap (audio tidak dapat dianalisis)"}</small></div>
          <div className="rec-actions">
            <button className="motion-secondary" onClick={() => setNarration(null)} disabled={busy} data-testid="audio-remove">Hapus</button>
            <button className="motion-secondary" onClick={() => void startRecording()} disabled={busy}>🎙 Rekam ulang</button>
            {narration.recorded && <a className="motion-secondary as-button" href={narration.url} download={narration.file.name}>Unduh WAV</a>}
          </div>
        </> : <>
          <div className="rec-actions">
            <button className="motion-primary" onClick={() => void startRecording()} disabled={busy} data-testid="record-start">🎙 Rekam narasi</button>
            <button className="motion-secondary" onClick={() => audioInput.current?.click()} disabled={busy}>＋ Unggah audio</button>
          </div>
          <small>Rekam langsung dari mikrofon iPad sambil membaca naskah, atau unggah MP3/M4A/WAV. Audio diproses di perangkat dan tidak diunggah.</small>
        </>}
        {narrationBusy && <small data-testid="narration-busy">Memproses audio…</small>}
        {audioError && <p className="field-error" role="alert" data-testid="audio-error">{audioError}</p>}
      </div>}
</>
  );
}
