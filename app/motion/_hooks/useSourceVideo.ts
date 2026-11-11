import { useEffect, useState } from "react";
import { moodForStyle, type Mood } from "@/lib/audio";
import { NarrationRecorder, type Narration } from "@/lib/recorder";
import { FPS, MAX_SECONDS, type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import { HANDOFF_KEY, parseHandoff, scriptFromTranscript, type Transcript } from "@/lib/transcript";
import { type Cut } from "@/lib/visuals";
import { isPristine, type SessionData } from "@/lib/session";
import { loadSession, loadSource, takeClipHandoff, type ClipHandoff } from "@/lib/session-store";
import { type Edit } from "@/lib/edit-profile";
import { handoffTrim, reslice, type Trim } from "@/lib/trim";
import { isAudioFile, probeVideo, validateFile } from "@/lib/clip";
import { AUDIO_ONLY, SAMPLE, VIDEO_ONLY } from "../_components/constants";
import type { AiNarration, Generated, SceneImageFile, Track, VoiceMode } from "../_components/types";
import type { Dispatch, SetStateAction, RefObject, ChangeEvent } from "react";

type Inputs = {
  abort: RefObject<AbortController | null>;
  aiNarration: AiNarration | null;
  generated: Generated | null;
  imagesRef: RefObject<Record<string, SceneImageFile>>;
  imported: Transcript | null;
  manualNarration: Narration | null;
  moodTouched: boolean;
  recorder: RefObject<NarrationRecorder | null>;
  result: { url: string; name: string; size: number; } | null;
  script: string;
  setCaptionOffset: Dispatch<SetStateAction<number>>;
  setCaptions: Dispatch<SetStateAction<boolean>>;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setCutOverrides: Dispatch<SetStateAction<Record<string, Cut>>>;
  setEdits: Dispatch<SetStateAction<Edit[]>>;
  setEmphasis: Dispatch<SetStateAction<{ from: number; to: number; }[]>>;
  setImported: Dispatch<SetStateAction<Transcript | null>>;
  setMood: Dispatch<SetStateAction<Mood>>;
  setNarration: Dispatch<SetStateAction<Narration | null>>;
  setOffer: Dispatch<SetStateAction<{ source: string; transcript: Transcript; } | null>>;
  setPalette: Dispatch<SetStateAction<PaletteId>>;
  setScript: Dispatch<SetStateAction<string>>;
  setSource: Dispatch<SetStateAction<{ file: File; url: string; seconds: number; } | null>>;
  setSourceError: Dispatch<SetStateAction<string>>;
  setTitle: Dispatch<SetStateAction<string>>;
  setTrim: Dispatch<SetStateAction<Trim | null>>;
  setTrimNote: Dispatch<SetStateAction<string>>;
  setVideoEdit: Dispatch<SetStateAction<boolean>>;
  setVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  source: { file: File; url: string; seconds: number; } | null;
  style: StyleId;
  trim: Trim | null;
  uploadedMusic: Track | null;
};

export default function useSourceVideo({ abort, aiNarration, generated, imagesRef, imported, manualNarration, moodTouched, recorder, result, script, setCaptionOffset, setCaptions, setContentPreset, setCutOverrides, setEdits, setEmphasis, setImported, setMood, setNarration, setOffer, setPalette, setScript, setSource, setSourceError, setTitle, setTrim, setTrimNote, setVideoEdit, setVoiceMode, source, style, trim, uploadedMusic }: Inputs) {
// What this device remembers (never leaves it): offered after a refresh, saved automatically while editing.
  const [saved, setSaved] = useState<SessionData | null>(null);
  const [savedSource, setSavedSource] = useState<{ name: string; seconds: number } | null>(null);
  const [autosave, setAutosave] = useState(false);
  const [cloudUser, setCloudUser] = useState<string | null>(null);
  const [savedCloud, setSavedCloud] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      // A clip sent from the clipper comes first: it is the work in hand, so no older session is offered over it.
      const handed = await takeClipHandoff();
      if (!alive) return;
      if (handed) { applyClipHandoff(handed); setAutosave(true); return; }
      const [s, src] = await Promise.all([loadSession(), loadSource()]);
      if (!alive) return;
      if (s && !isPristine(s, SAMPLE, !!src)) { setSaved(s); setSavedSource(src ? { name: src.name, seconds: src.seconds } : null); }
      else setAutosave(true);
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!source) return; const url = source.url; return () => URL.revokeObjectURL(url); }, [source]);
  /** The clip arrives as the base video with its subtitles, ready to edit (same state as "use the transcript" after uploading here). */
  const [handoffNote, setHandoffNote] = useState("");
  function applyClipHandoff(h: ClipHandoff) {
    const file = new File([h.blob], h.name, { type: h.type || "video/mp4" });
    // The clip comes with a few seconds of footage on each side: it starts on the clip itself, and the trim can reach into the rest.
    const around = handoffTrim(h.padStart ?? 0, h.padEnd ?? 0, h.seconds);
    setSource({ file, url: URL.createObjectURL(file), seconds: (h.padStart ?? 0) + h.seconds + (h.padEnd ?? 0) });
    setTrim(around); setTrimNote(""); setEdits([]); setEmphasis([]);
    // A clip the browser cannot read is reported at once, instead of showing a black player.
    void probeVideo(file).then(p => { if (!p.ok) { setSource(null); setVideoEdit(false); setHandoffNote(`Klip yang diterima tidak bisa diputar di browser ini. Kembali ke Clipper lalu ekspor ulang klipnya, atau pilih video langsung di sini. (Detail: ${p.detail})`); } });
    if (h.opening?.trim() || h.title) setTitle((h.opening?.trim() || h.title).slice(0, 60).trim());
    if (h.transcript && h.transcript.segments.length > 0) {
      setScript(scriptFromTranscript(h.transcript, FPS)); setImported(h.transcript);
      setVoiceMode("none"); setNarration(null); setVideoEdit(true); setCaptionOffset(0); setPalette("pearl"); setContentPreset("custom"); setOffer(null);
      setHandoffNote(h.transcript.granularity === "word"
        ? "Klip dari Clipper dimuat dengan subtitlenya."
        : "Klip dari Clipper dimuat. Subtitle berasal dari AI dengan waktu per kalimat. Untuk waktu yang paling presisi, ketuk \"Presisikan waktu subtitle\" di panel Transkrip (satu ketukan, dibuat di perangkat; teks tidak berubah).");
    } else { makeSourceBase(file); setHandoffNote("Klip dari Clipper dimuat dan jadi dasar video (tampil di preview). Belum ada subtitle: buat transkrip di panel Transkrip, atau tulis naskah."); }
  }
  /** Moves the start or end of the video. A transcript made for the old range is cut to the new one when it fits inside it. */
  function applyTrim(next: Trim | null) {
    if (!source) return;
    const old = trim ?? { start: 0, end: source.seconds }, to = next ?? { start: 0, end: source.seconds };
    setTrim(next); setTrimNote("");
    if (!imported) return;
    const r = reslice(imported, old, to, script, FPS);
    if (r.outcome === "same") return;
    setImported(r.transcript);
    if (r.outcome === "lost") { setTrimNote("Potongan melewati bagian yang sudah punya transkrip, jadi subtitle perlu dibuat lagi untuk potongan baru (ketuk Buat transkrip di bawah). Sementara itu waktu subtitle hanya perkiraan."); return; }
    if (r.script) setScript(r.script);
    else if (script !== scriptFromTranscript(imported, FPS)) setTrimNote("Naskah sudah Anda ubah, jadi tidak diganti. Kalimat yang berada di luar potongan baru bisa dihapus dari naskah.");
  }
  /**
   * A chosen video (or audio) becomes the base of the video at once, so the preview shows it and the render uses it, even
   * before there is a transcript. With the untouched sample script (or none) it plays as it is, without subtitles, until a
   * transcript is made; with a script the creator already wrote, the lines are spread over it (their timing is only an estimate).
   */
  function makeSourceBase(file: File) {
    setVideoEdit(true); setVoiceMode("none"); setNarration(null); setCaptionOffset(0); setPalette("pearl"); setContentPreset("custom");
    const plain = isAudioFile(file) ? AUDIO_ONLY : VIDEO_ONLY;
    if (!script.trim() || script === SAMPLE || script === VIDEO_ONLY || script === AUDIO_ONLY) {
      setScript(plain); setCaptions(false); setCutOverrides({ [plain]: "video" }); setImported(null);
    }
  }
  function onSourceVideo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const check = validateFile(f);
    if (!check.ok) return setSourceError(check.error);
    setSourceError("");
    const url = URL.createObjectURL(f);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (!Number.isFinite(probe.duration) || probe.duration <= 0) { URL.revokeObjectURL(url); return setSourceError("Durasi berkas tidak dapat dibaca. Coba MP4 (H.264) atau audio MP3/M4A."); }
      if (probe.duration > MAX_SECONDS) { URL.revokeObjectURL(url); return setSourceError(`Video ${Math.round(probe.duration)} detik melebihi batas ${MAX_SECONDS} detik (3 menit). Potong dulu di Clipper Studio.`); }
      setSource({ file: f, url, seconds: probe.duration }); setTrim(null); setTrimNote(""); setEdits([]); setEmphasis([]); makeSourceBase(f);
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setSourceError("Browser tidak dapat memutar berkas ini. Coba MP4 (H.264) atau audio MP3/M4A/WAV."); };
    probe.src = url;
  }
  useEffect(() => { try { setOffer(parseHandoff(sessionStorage.getItem(HANDOFF_KEY))); } catch { /* storage blocked: no offer */ } }, [setOffer]);

  useEffect(() => { if (!manualNarration) return; const url = manualNarration.url; return () => URL.revokeObjectURL(url); }, [manualNarration]);
  useEffect(() => { if (!aiNarration) return; const url = aiNarration.narration.url; return () => URL.revokeObjectURL(url); }, [aiNarration]);
  useEffect(() => { if (!generated) return; const url = generated.url; return () => URL.revokeObjectURL(url); }, [generated]);
  useEffect(() => { if (!uploadedMusic) return; const url = uploadedMusic.url; return () => URL.revokeObjectURL(url); }, [uploadedMusic]);
  useEffect(() => { if (!result) return; const url = result.url; return () => URL.revokeObjectURL(url); }, [result]);
  useEffect(() => () => { abort.current?.abort(); recorder.current?.cancel(); Object.values(imagesRef.current).forEach(im => URL.revokeObjectURL(im.url)); }, [abort, imagesRef, recorder]);
  // The mood follows the animation style until the user picks one.
  useEffect(() => { if (!moodTouched) setMood(moodForStyle(style)); }, [style, moodTouched, setMood]);
  return { applyTrim, autosave, cloudUser, handoffNote, onSourceVideo, saved, savedCloud, savedSource, setAutosave, setCloudUser, setHandoffNote, setSaved, setSavedCloud, setSavedSource };
}
