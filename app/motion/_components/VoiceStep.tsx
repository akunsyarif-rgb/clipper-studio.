import { type Mood } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import { type CaptionStyleId } from "@/lib/script";
import { type DirectionOverrides } from "@/lib/voice-director";
import { type TtsLang } from "@/lib/tts/supertonic";
import { FlowStepNav } from "../../FlowStepper";
import { type StickerMode } from "@/lib/stickers";
import { type SfxMode } from "@/lib/sfx";
import type { AiNarration, Generated, MusicMode, Track, VoiceMode, VoiceProgress } from "./types";
import FxFold from "./FxFold";
import DurationFold from "./DurationFold";
import MusicFold from "./MusicFold";
import ManualVoicePanel from "./ManualVoicePanel";
import AiVoicePanel from "./AiVoicePanel";
import type { Dispatch, SetStateAction, RefObject, ChangeEvent } from "react";
import type { VoiceDirection } from "@/lib/voice-director";
import type { TimelineResult } from "@/lib/script";

type Props = {
  aiFresh: AiNarration | null;
  aiNarration: AiNarration | null;
  audioError: string;
  audioInput: RefObject<HTMLInputElement | null>;
  autoDirections: VoiceDirection[];
  busy: boolean;
  cancelRecording: () => void;
  cancelVoice: () => void;
  captions: boolean;
  captionStyle: CaptionStyleId;
  duck: boolean;
  generatedFresh: Generated | null;
  generateVoice: () => Promise<void>;
  goFlow: (n: number) => void;
  mood: Mood;
  musicBusy: boolean;
  musicError: string;
  musicInput: RefObject<HTMLInputElement | null>;
  musicMode: MusicMode;
  musicVolume: number;
  narration: Narration | null;
  narrationBusy: boolean;
  onAudio: (e: ChangeEvent<HTMLInputElement>) => void;
  onMusic: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  recording: boolean;
  recordingSeconds: number | null;
  rendering: boolean;
  setCaptions: Dispatch<SetStateAction<boolean>>;
  setCaptionStyle: Dispatch<SetStateAction<CaptionStyleId>>;
  setDuck: Dispatch<SetStateAction<boolean>>;
  setMood: Dispatch<SetStateAction<Mood>>;
  setMoodTouched: Dispatch<SetStateAction<boolean>>;
  setMusicMode: Dispatch<SetStateAction<MusicMode>>;
  setMusicVolume: Dispatch<SetStateAction<number>>;
  setNarration: Dispatch<SetStateAction<Narration | null>>;
  setSeed: Dispatch<SetStateAction<number>>;
  setSfxMode: Dispatch<SetStateAction<SfxMode>>;
  setStickerMode: Dispatch<SetStateAction<StickerMode>>;
  setTarget: Dispatch<SetStateAction<string>>;
  setTtsLang: Dispatch<SetStateAction<TtsLang>>;
  setTtsSpeed: Dispatch<SetStateAction<number>>;
  setTtsVoice: Dispatch<SetStateAction<number>>;
  setVoiceDirectionOverrides: Dispatch<SetStateAction<DirectionOverrides>>;
  setVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  sfxMode: SfxMode;
  source: { file: File; url: string; seconds: number; } | null;
  startRecording: () => Promise<void>;
  stickerMode: StickerMode;
  stopRecording: () => Promise<void>;
  target: string;
  timeline: TimelineResult;
  ttsLang: TtsLang;
  ttsSpeed: number;
  ttsVoice: number;
  uploadedMusic: Track | null;
  videoEdit: boolean;
  videoSeconds: number;
  voiceBusy: boolean;
  voiceDirectionOverrides: DirectionOverrides;
  voiceDirections: VoiceDirection[];
  voiceError: string;
  voiceMode: VoiceMode;
  voiceProgress: VoiceProgress | null;
  voiceSegmentKeys: string[];
};

export default function VoiceStep({ aiFresh, aiNarration, audioError, audioInput, autoDirections, busy, cancelRecording, cancelVoice, captions, captionStyle, duck, generatedFresh, generateVoice, goFlow, mood, musicBusy, musicError, musicInput, musicMode, musicVolume, narration, narrationBusy, onAudio, onMusic, recording, recordingSeconds, rendering, setCaptions, setCaptionStyle, setDuck, setMood, setMoodTouched, setMusicMode, setMusicVolume, setNarration, setSeed, setSfxMode, setStickerMode, setTarget, setTtsLang, setTtsSpeed, setTtsVoice, setVoiceDirectionOverrides, setVoiceMode, sfxMode, source, startRecording, stickerMode, stopRecording, target, timeline, ttsLang, ttsSpeed, ttsVoice, uploadedMusic, videoEdit, videoSeconds, voiceBusy, voiceDirectionOverrides, voiceDirections, voiceError, voiceMode, voiceProgress, voiceSegmentKeys }: Props) {
  return (
    <section className="flow-step" data-step="3" data-testid="flow-step-3">
      <div className="step-title" data-testid="step-3"><b>3</b>Suara dan musik</div>
      <label className="field-label">Voice over / narasi</label>
      <div className="seg" role="radiogroup" aria-label="Voice over">
        {([["ai", "🤖 Otomatis"], ["manual", "🎙 Rekam / unggah"], ["none", "Tanpa"]] as [VoiceMode, string][]).map(([id, label]) =>
          <button key={id} role="radio" aria-checked={voiceMode === id} className={voiceMode === id ? "active" : ""} disabled={busy} data-testid={"voice-" + id} onClick={() => setVoiceMode(id)}>{label}</button>)}
      </div>
      <AiVoicePanel
        aiFresh={aiFresh} aiNarration={aiNarration} autoDirections={autoDirections} busy={busy} cancelVoice={cancelVoice} generateVoice={generateVoice}
        setTtsLang={setTtsLang} setTtsSpeed={setTtsSpeed} setTtsVoice={setTtsVoice} setVoiceDirectionOverrides={setVoiceDirectionOverrides}
        timeline={timeline} ttsLang={ttsLang} ttsSpeed={ttsSpeed} ttsVoice={ttsVoice} voiceBusy={voiceBusy} voiceDirectionOverrides={voiceDirectionOverrides}
        voiceDirections={voiceDirections} voiceError={voiceError} voiceMode={voiceMode} voiceProgress={voiceProgress} voiceSegmentKeys={voiceSegmentKeys} />
      <ManualVoicePanel
        audioError={audioError} audioInput={audioInput} busy={busy} cancelRecording={cancelRecording} narration={narration} narrationBusy={narrationBusy}
        onAudio={onAudio} recording={recording} recordingSeconds={recordingSeconds} setNarration={setNarration} startRecording={startRecording}
        stopRecording={stopRecording} voiceMode={voiceMode} />
      <MusicFold
        duck={duck} generatedFresh={generatedFresh} mood={mood} musicBusy={musicBusy} musicError={musicError} musicInput={musicInput} musicMode={musicMode}
        musicVolume={musicVolume} narration={narration} onMusic={onMusic} rendering={rendering} setDuck={setDuck} setMood={setMood}
        setMoodTouched={setMoodTouched} setMusicMode={setMusicMode} setMusicVolume={setMusicVolume} setSeed={setSeed} timeline={timeline}
        uploadedMusic={uploadedMusic} videoSeconds={videoSeconds} />
      <DurationFold
        captions={captions} captionStyle={captionStyle} narration={narration} setCaptions={setCaptions} setCaptionStyle={setCaptionStyle}
        setTarget={setTarget} source={source} target={target} videoEdit={videoEdit} voiceMode={voiceMode} />
      <FxFold setSfxMode={setSfxMode} setStickerMode={setStickerMode} sfxMode={sfxMode} source={source} stickerMode={stickerMode} videoEdit={videoEdit} />
      <FlowStepNav step={3} onGo={goFlow} />
    </section>
  );
}
