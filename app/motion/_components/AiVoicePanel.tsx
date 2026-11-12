import { MODEL_BYTES, VOICE_PROFILES, VOICES } from "@/lib/tts/browser";
import { SPEEDS } from "@/lib/tts/narration";
import { type DirectionOverrides } from "@/lib/voice-director";
import VoiceDirectorPanel from "../../VoiceDirectorPanel";
import { TTS_LANGS, type TtsLang } from "@/lib/tts/supertonic";
import type { AiNarration, VoiceMode, VoiceProgress } from "./types";
import type { Dispatch, SetStateAction } from "react";
import type { VoiceDirection } from "@/lib/voice-director";
import type { TimelineResult } from "@/lib/script";

type Props = {
  aiFresh: AiNarration | null;
  aiNarration: AiNarration | null;
  autoDirections: VoiceDirection[];
  busy: boolean;
  cancelVoice: () => void;
  generateVoice: () => Promise<void>;
  setTtsLang: Dispatch<SetStateAction<TtsLang>>;
  setTtsSpeed: Dispatch<SetStateAction<number>>;
  setTtsVoice: Dispatch<SetStateAction<number>>;
  setVoiceDirectionOverrides: Dispatch<SetStateAction<DirectionOverrides>>;
  timeline: TimelineResult;
  ttsLang: TtsLang;
  ttsSpeed: number;
  ttsVoice: number;
  voiceBusy: boolean;
  voiceDirectionOverrides: DirectionOverrides;
  voiceDirections: VoiceDirection[];
  voiceError: string;
  voiceMode: VoiceMode;
  voiceProgress: VoiceProgress | null;
  voiceSegmentKeys: string[];
};

export default function AiVoicePanel({ aiFresh, aiNarration, autoDirections, busy, cancelVoice, generateVoice, setTtsLang, setTtsSpeed, setTtsVoice, setVoiceDirectionOverrides, timeline, ttsLang, ttsSpeed, ttsVoice, voiceBusy, voiceDirectionOverrides, voiceDirections, voiceError, voiceMode, voiceProgress, voiceSegmentKeys }: Props) {
  return (
    <>
{voiceMode === "ai" && <div className="audio-box" data-testid="ai-voice">
        <div className="field-row tight">
          <div><label className="field-label" htmlFor="tts-lang">Bahasa</label>
            <select id="tts-lang" data-testid="tts-lang" value={ttsLang} disabled={voiceBusy} onChange={e => setTtsLang(e.target.value as TtsLang)}>{TTS_LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>
          <div><label className="field-label" htmlFor="tts-voice">Suara</label>
            <select id="tts-voice" data-testid="tts-voice" value={ttsVoice} disabled={voiceBusy} onChange={e => setTtsVoice(Number(e.target.value))}>{VOICE_PROFILES.map(p => <optgroup key={p.id} label={p.label}>{p.ids.map(id => <option key={id} value={id}>{VOICES[id].label}{id === p.suggested ? " ★" : ""}</option>)}</optgroup>)}</select></div>
        </div>
        <small className="field-hint" data-testid="voice-hint">★ = titik awal yang disarankan dari ukuran nada (paling dinamis di profilnya). Kualitas suara belum dinilai dengan mendengar: pilih dengan telinga Anda.</small>
        <label className="field-label" htmlFor="tts-speed">Kecepatan bicara</label>
        <select id="tts-speed" data-testid="tts-speed" value={ttsSpeed} disabled={voiceBusy} onChange={e => setTtsSpeed(Number(e.target.value))}>{SPEEDS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <VoiceDirectorPanel directions={voiceDirections} auto={autoDirections} keys={voiceSegmentKeys} overrides={voiceDirectionOverrides} onChange={setVoiceDirectionOverrides} baseSpeed={ttsSpeed} disabled={voiceBusy} />
        {voiceProgress ? <div className="render-progress" data-testid="voice-progress">
          <div><span>{voiceProgress.label}</span><b>{voiceProgress.phase === "download" ? `${(voiceProgress.loaded / 1e6).toFixed(0)} / ${(voiceProgress.total / 1e6).toFixed(0)} MB` : `${Math.round((voiceProgress.loaded / voiceProgress.total) * 100)}%`}</b></div>
          <i><em style={{ width: Math.min(100, (voiceProgress.loaded / Math.max(1, voiceProgress.total)) * 100) + "%" }} /></i>
          <button className="motion-secondary" onClick={cancelVoice} disabled={voiceProgress.phase === "download"}>Batal</button>
        </div> : <button className="motion-primary" onClick={() => void generateVoice()} disabled={busy || !timeline.ok && !aiNarration} data-testid="voice-generate">{aiFresh ? "↻ Buat ulang suara" : "🤖 Buat suara otomatis"}</button>}
        {!aiFresh && aiNarration && voiceMode === "ai" && <div className="audio-previous" data-testid="ai-previous">
          <small>Versi sebelumnya (belum sesuai pengaturan sekarang; dipakai lagi bila perubahan dibatalkan, diganti setelah suara baru jadi)</small>
          <audio src={aiNarration.narration.url} controls preload="none" data-testid="ai-audio-previous" />
        </div>}
        {aiFresh && <>
          <audio src={aiFresh.narration.url} controls preload="metadata" data-testid="ai-audio" />
          <div className="audio-meta"><b>Suara otomatis · {TTS_LANGS.find(l => l.id === ttsLang)?.label} · {VOICES[ttsVoice]?.label}</b><small>{aiFresh.narration.seconds.toFixed(1)} dtk · durasi tiap scene mengikuti ucapannya</small></div>
          <a className="text-link" href={aiFresh.narration.url} download={aiFresh.narration.file.name}>Unduh suara (WAV)</a>
        </>}
        <small>Dibuat di perangkat dengan model Supertonic 3 (gratis, tanpa server). Unduhan pertama ±{Math.round(MODEL_BYTES / 1e6)} MB, lalu tersimpan di browser. Ini suara buatan AI: jangan dipakai untuk meniru orang lain, dan sebutkan bahwa suaranya buatan AI.</small>
        {voiceError && <p className="field-error" role="alert" data-testid="voice-error">{voiceError}</p>}
      </div>}
</>
  );
}
