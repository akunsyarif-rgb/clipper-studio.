import { useEffect, useState } from "react";
import { moodForStyle, type Mood } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import { FPS, PALETTES, splitScript, STYLES, type ContentPresetId, type DurationMode, type PaletteId, type StyleId } from "@/lib/script";
import { type Transcript } from "@/lib/transcript";
import { type SessionData } from "@/lib/session";
import { useWakeLock } from "../../useWakeLock";
import { prerenderChecks, type FixId } from "@/lib/prerender";
import { suggestCta } from "@/lib/cta";
import { type CinePlan } from "@/lib/cinematic";
import type { Mode, MusicMode, VoiceMode } from "../_components/types";
import type { Dispatch, SetStateAction } from "react";
import type { TimelineResult } from "@/lib/script";

type Inputs = {
  generateVoice: () => Promise<void>;
  cine: { plan: CinePlan; fx: Record<string, string>; } | null;
  cineActive: boolean;
  contentMode: Mode;
  contentPreset: ContentPresetId | "custom";
  handoffNote: string;
  mode: DurationMode;
  musicMode: MusicMode;
  narration: Narration | null;
  narrationBusy: boolean;
  offer: { source: string; transcript: Transcript; } | null;
  palette: PaletteId;
  recording: boolean;
  rendering: boolean;
  replayPreview: () => void;
  result: { url: string; name: string; size: number; } | null;
  saved: SessionData | null;
  script: string;
  setContentPreset: Dispatch<SetStateAction<ContentPresetId | "custom">>;
  setMood: Dispatch<SetStateAction<Mood>>;
  setMusicMode: Dispatch<SetStateAction<MusicMode>>;
  setPalette: Dispatch<SetStateAction<PaletteId>>;
  setScript: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setStyle: Dispatch<SetStateAction<StyleId>>;
  setTarget: Dispatch<SetStateAction<string>>;
  source: { file: File; url: string; seconds: number; } | null;
  style: StyleId;
  timeline: TimelineResult;
  title: string;
  videoEdit: boolean;
  voiceBusy: boolean;
  voiceMode: VoiceMode;
};

export default function useStudioFlow({ cine, cineActive, contentMode, contentPreset, generateVoice, handoffNote, mode, musicMode, narration, narrationBusy, offer, palette, recording, rendering, replayPreview, result, saved, script, setContentPreset, setMood, setMusicMode, setPalette, setScript, setStatus, setStyle, setTarget, source, style, timeline, title, videoEdit, voiceBusy, voiceMode }: Inputs) {
const [advancedOpen, setAdvancedOpen] = useState(false);
  // Anything that needs the full controls (a clip handed over, a saved session, a chosen video) opens them by itself.
  useEffect(() => { if (handoffNote || saved || source || offer) setAdvancedOpen(true); }, [handoffNote, saved, source, offer]);
  const busy = rendering || recording || narrationBusy || voiceBusy;
  // Editing over a source video is ordinary content only; the chosen mode comes back when the video is removed.
  const videoMode = videoEdit && !!source;
  const activeMode: Mode = videoMode ? "normal" : contentMode;
  const colors = PALETTES[palette];
  useWakeLock(rendering);
  const preChecks = timeline.ok ? prerenderChecks({
    hasMusic: musicMode !== "none", hasVoice: !!narration, hasSourceAudio: !!(videoEdit && source),
    scenes: timeline.scenes.map(sc => ({ text: sc.text, seconds: sc.durationInFrames / FPS })), totalSeconds: timeline.seconds,
    durationAdjustable: mode.kind === "target" && !(videoEdit && source) && voiceMode !== "ai",
    closesWithCta: cineActive && cine!.plan.scenes.at(-1)?.act === "cta",
    voicePending: voiceMode === "ai" && !narration,
  }) : [];
  function applyFix(id: FixId) {
    if (id === "music") { setMusicMode("auto"); setMood(moodForStyle(style)); }
    else if (id === "duration") setTarget("auto");
    else if (id === "voice") void generateVoice();
    else if (id === "cta") {
      const line = suggestCta({ text: script, title }).text.slice(0, 100);
      if (line && !splitScript(script).includes(line)) setScript(prev => `${prev.replace(/\s+$/, "")}\n${line}`.slice(0, 3000));
    }
  }
  /** The five steps of the advanced settings; on a phone one at a time. */
  const [flowStep, setFlowStep] = useState(1);
  const goFlow = (n: number) => { setFlowStep(Math.min(5, Math.max(1, n))); setTimeout(() => document.querySelector("[data-testid=advanced-settings]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); };
  const [styleUndo, setStyleUndo] = useState<{ style: StyleId; palette: PaletteId; contentPreset: ContentPresetId | "custom" } | null>(null);
  const rememberStyle = () => setStyleUndo({ style, palette, contentPreset });
  /** The next combination of animation style and colours (the style moves every time, the colours every other time), so one tap always shows something new. */
  function tryOtherStyle() {
    rememberStyle();
    const styles = STYLES.map(x => x.id), palettes = Object.keys(PALETTES) as PaletteId[];
    const si = (styles.indexOf(style) + 1) % styles.length, pi = (palettes.indexOf(palette) + (si === 0 ? 1 : 2)) % palettes.length;
    setStyle(styles[si]); setPalette(palettes[pi]); setContentPreset("custom"); replayPreview();
  }
  function undoStyle() { if (!styleUndo) return; setStyle(styleUndo.style); setPalette(styleUndo.palette); setContentPreset(styleUndo.contentPreset); setStyleUndo(null); replayPreview(); }
  const [saveOpen, setSaveOpen] = useState(false);
  useEffect(() => { setSaveOpen(false); }, [result]);
  const openAdvanced = (then: () => void) => { setAdvancedOpen(true); setTimeout(then, 60); };
  function goSave() { setSaveOpen(true); openAdvanced(() => { setFlowStep(5); setTimeout(() => document.querySelector("[data-testid=hub-open]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); }); }
  function makeAnother() {
    tryOtherStyle(); setStatus("Gaya diganti. Atur seperlunya lalu tekan Render untuk membuat versi baru.");
    openAdvanced(() => { setFlowStep(2); document.querySelector("[data-testid=step-2]")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }
  function goSeo() {
    openAdvanced(() => { setFlowStep(5); const f = document.querySelector<HTMLDetailsElement>("[data-testid=fold-seo]"); if (f) { f.open = true; f.scrollIntoView({ behavior: "smooth", block: "start" }); } });
  }
  return { activeMode, advancedOpen, applyFix, busy, colors, flowStep, goFlow, goSave, goSeo, makeAnother, preChecks, rememberStyle, saveOpen, setAdvancedOpen, styleUndo, tryOtherStyle, undoStyle, videoMode };
}
