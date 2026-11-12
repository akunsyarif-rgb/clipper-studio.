import { useRef, useState } from "react";
import { NarrationRecorder, type Narration } from "@/lib/recorder";
import { type DirectionOverrides } from "@/lib/voice-director";
import { ClipCache } from "@/lib/tts/clip-cache";
import { type TtsLang } from "@/lib/tts/supertonic";
import type { AiNarration, VoiceMode, VoiceProgress } from "../_components/types";

export default function useVoiceState() {
const audioInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<NarrationRecorder | null>(null);
  const clipCache = useRef(new ClipCache());
  /** Each voice run takes a number; a run is current only while no newer run or cancel has moved the counter (no shared flag to reset). */
  const voiceRun = useRef(0);
  const voiceActive = useRef(false);
  const [manualNarration, setNarration] = useState<Narration | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ai");
  const [ttsLang, setTtsLang] = useState<TtsLang>("id");
  const [ttsVoice, setTtsVoice] = useState(0);
  const [ttsSpeed, setTtsSpeed] = useState(1.05);
  const [voiceDirectionOverrides, setVoiceDirectionOverrides] = useState<DirectionOverrides>({});
  const [aiNarration, setAiNarration] = useState<AiNarration | null>(null);
  const [voiceProgress, setVoiceProgress] = useState<VoiceProgress | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  return { aiNarration, audioError, audioInput, clipCache, manualNarration, narrationBusy, recorder, recordingSeconds, setAiNarration, setAudioError, setNarration, setNarrationBusy, setRecordingSeconds, setTtsLang, setTtsSpeed, setTtsVoice, setVoiceDirectionOverrides, setVoiceError, setVoiceMode, setVoiceProgress, ttsLang, ttsSpeed, ttsVoice, voiceActive, voiceDirectionOverrides, voiceError, voiceMode, voiceProgress, voiceRun };
}
