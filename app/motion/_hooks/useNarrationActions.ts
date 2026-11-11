import { type PlayerRef } from "@remotion/player";
import { DEFAULT_MUSIC_VOLUME, encodeWav, normalize, speechEnvelope } from "@/lib/audio";
import { analyseNarration, explainMicError, NarrationRecorder, recordingSupported, type Narration } from "@/lib/recorder";
import { buildTimeline, FPS, validateAudioFile } from "@/lib/script";
import { explainVoiceError, loadVoiceEngine, MODEL_BYTES } from "@/lib/tts/browser";
import { assembleNarration } from "@/lib/tts/narration";
import { spokenText } from "@/lib/tts/numbers";
import { scenePause, spokenForDirection } from "@/lib/voice-director";
import { ClipCache } from "@/lib/tts/clip-cache";
import { SynthesisCancelled, synthesizeDirected } from "@/lib/tts/direct-synthesis";
import { type TtsLang } from "@/lib/tts/supertonic";
import { stripMarks } from "@/lib/visuals";
import { audioDuration } from "../_components/media-probe";
import type { AiNarration, MusicMode, Track, VoiceProgress } from "../_components/types";
import type { Dispatch, SetStateAction, RefObject, ChangeEvent } from "react";
import type { VoiceDirection } from "@/lib/voice-director";

type Inputs = {
  clipCache: RefObject<ClipCache>;
  musicVolume: number;
  player: RefObject<PlayerRef | null>;
  recorder: RefObject<NarrationRecorder | null>;
  script: string;
  setAiNarration: Dispatch<SetStateAction<AiNarration | null>>;
  setAudioError: Dispatch<SetStateAction<string>>;
  setMusicError: Dispatch<SetStateAction<string>>;
  setMusicMode: Dispatch<SetStateAction<MusicMode>>;
  setMusicVolume: Dispatch<SetStateAction<number>>;
  setNarration: Dispatch<SetStateAction<Narration | null>>;
  setNarrationBusy: Dispatch<SetStateAction<boolean>>;
  setRecordingSeconds: Dispatch<SetStateAction<number | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setUploadedMusic: Dispatch<SetStateAction<Track | null>>;
  setVoiceError: Dispatch<SetStateAction<string>>;
  setVoiceProgress: Dispatch<SetStateAction<VoiceProgress | null>>;
  ttsLang: TtsLang;
  ttsSpeed: number;
  ttsVoice: number;
  voiceActive: RefObject<boolean>;
  voiceBusy: boolean;
  voiceDirections: VoiceDirection[];
  voiceKey: string;
  voiceRun: RefObject<number>;
  voiceScript: { texts: string[]; pauses: number[]; };
};

export default function useNarrationActions({ clipCache, musicVolume, player, recorder, script, setAiNarration, setAudioError, setMusicError, setMusicMode, setMusicVolume, setNarration, setNarrationBusy, setRecordingSeconds, setStatus, setUploadedMusic, setVoiceError, setVoiceProgress, ttsLang, ttsSpeed, ttsVoice, voiceActive, voiceBusy, voiceDirections, voiceKey, voiceRun, voiceScript }: Inputs) {
async function loadNarrationFile(f: File) {
    setAudioError(""); setNarrationBusy(true);
    const url = URL.createObjectURL(f);
    try {
      const analysed = await analyseNarration(f);
      const seconds = analysed.seconds ?? await audioDuration(f, url);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("no duration");
      setNarration({ file: f, url, seconds, speech: analysed.speech, recorded: false });
    } catch {
      URL.revokeObjectURL(url);
      setAudioError("Browser tidak dapat membaca audio ini. Coba MP3, M4A, atau WAV.");
    } finally { setNarrationBusy(false); }
  }

  function onAudio(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const err = validateAudioFile(f);
    if (err) return setAudioError(err);
    void loadNarrationFile(f);
  }

  function cancelVoice() {
    voiceRun.current++; // the running synthesis sees it is no longer current and stops at its next step
    voiceActive.current = false;
    setVoiceProgress(null);
    setStatus("Pembuatan suara dibatalkan. Suara yang sudah jadi tetap tersimpan untuk percobaan berikutnya.");
  }

  async function generateVoice() {
    if (voiceBusy || voiceActive.current) return;
    const { texts, pauses } = voiceScript;
    const check = buildTimeline(script, { kind: "auto" }, FPS);
    if (!check.ok) return setVoiceError(check.error);
    const directions = voiceDirections, key = voiceKey, lang = ttsLang, voice = ttsVoice, baseSpeed = ttsSpeed; // one consistent snapshot for the whole run
    const run = ++voiceRun.current;
    voiceActive.current = true;
    const current = () => voiceRun.current === run;
    setVoiceError("");
    player.current?.pause();
    try {
      setVoiceProgress({ phase: "download", loaded: 0, total: MODEL_BYTES, label: "Menyiapkan model suara…" });
      const engine = await loadVoiceEngine((loaded, total) => { if (current()) setVoiceProgress({ phase: "download", loaded, total, label: "Mengunduh model suara (sekali saja)…" }); });
      // Digits are spoken as words ("1.300" → "seribu tiga ratus"); the screen keeps the digits.
      const spoken = texts.map((t, i) => spokenForDirection(spokenText(stripMarks(t), lang), directions[i]));
      const { clips } = await synthesizeDirected({
        spoken, directions, baseSpeed, lang, voice, cache: clipCache.current, isCancelled: () => !current(),
        synth: (text, speed, onStep) => engine.synthesize(text, lang, voice, { speed, onStep }),
        onProgress: async ({ index, count, step, steps }) => {
          if (current()) setVoiceProgress({ phase: "synth", loaded: index * steps + step, total: count * steps, label: `Membuat suara scene ${index + 1}/${count}…` });
          await new Promise(r => setTimeout(r, 0)); // let the browser paint progress between model steps
        },
      });
      if (!current()) return;
      const directedPauses = pauses.map((pause, i) => scenePause(pause, directions[i]));
      const { samples, sceneSeconds } = assembleNarration(clips, engine.sampleRate, FPS, directedPauses);
      normalize(samples, 0.9, 3);
      const file = new File([encodeWav([samples], engine.sampleRate)], `suara-otomatis-${lang}.wav`, { type: "audio/wav" });
      // The previous narration is replaced only now, when the new one is complete.
      setAiNarration({
        key, sceneSeconds,
        narration: { file, url: URL.createObjectURL(file), seconds: samples.length / engine.sampleRate, speech: speechEnvelope(samples, engine.sampleRate, FPS), recorded: false },
      });
      setStatus(`Suara otomatis ${(samples.length / engine.sampleRate).toFixed(1)} dtk siap. Durasi tiap scene mengikuti ucapannya.`);
    } catch (err) {
      if (!current() || err instanceof SynthesisCancelled) return; // cancelled or replaced: the cancel handler already said so
      setVoiceError(explainVoiceError(err));
    } finally {
      if (current()) { voiceActive.current = false; setVoiceProgress(null); }
    }
  }

  async function startRecording() {
    setAudioError("");
    if (!recordingSupported()) return setAudioError("Browser ini tidak mendukung perekaman audio. Gunakan Safari/Chrome terbaru, atau unggah rekaman.");
    player.current?.pause();
    const rec = new NarrationRecorder();
    recorder.current = rec;
    try {
      await rec.start(s => setRecordingSeconds(s), () => { void stopRecording(); });
      setRecordingSeconds(0);
      setStatus("Merekam… Bacakan naskah, lalu ketuk Selesai.");
    } catch (err) {
      rec.cancel(); recorder.current = null;
      setAudioError(explainMicError(err));
    }
  }

  async function stopRecording() {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setRecordingSeconds(null); setNarrationBusy(true);
    try {
      const n = await rec.stop();
      setNarration(n);
      setStatus(`Rekaman ${n.seconds.toFixed(1)} dtk siap. Durasi scene mengikuti rekaman.`);
    } catch (err) {
      setAudioError(`Rekaman gagal diproses: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("");
    } finally { setNarrationBusy(false); }
  }

  function cancelRecording() {
    recorder.current?.cancel(); recorder.current = null;
    setRecordingSeconds(null); setStatus("Perekaman dibatalkan.");
  }

  async function onMusic(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMusicError("");
    const err = validateAudioFile(f);
    if (err) return setMusicError(err);
    const url = URL.createObjectURL(f);
    try {
      const seconds = await audioDuration(f, url);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("no duration");
      setUploadedMusic({ file: f, url, seconds });
      setMusicMode("upload");
      if (musicVolume === Math.round(DEFAULT_MUSIC_VOLUME * 100)) setMusicVolume(30);
    } catch {
      URL.revokeObjectURL(url);
      setMusicError("Browser tidak dapat membaca musik ini. Coba MP3, M4A, atau WAV.");
    }
  }
  return { cancelRecording, cancelVoice, generateVoice, onAudio, onMusic, startRecording, stopRecording };
}
