import { useCallback, useEffect } from "react";
import { type Mood } from "@/lib/audio";
import type { Generated, MusicMode } from "../_components/types";
import type { Dispatch, SetStateAction } from "react";
import type { TimelineResult } from "@/lib/script";

type Inputs = {
  generatedFresh: Generated | null;
  mood: Mood;
  musicBusy: boolean;
  musicMode: MusicMode;
  seed: number;
  setGenerated: Dispatch<SetStateAction<Generated | null>>;
  setMusicBusy: Dispatch<SetStateAction<boolean>>;
  setMusicError: Dispatch<SetStateAction<string>>;
  timeline: TimelineResult;
  videoSeconds: number;
};

export default function useBacksound({ generatedFresh, mood, musicBusy, musicMode, seed, setGenerated, setMusicBusy, setMusicError, timeline, videoSeconds }: Inputs) {
const generate = useCallback(async (seconds: number, m: Mood, s: number): Promise<Generated | null> => {
    setMusicBusy(true); setMusicError("");
    try {
      const { generateBacksound } = await import("@/lib/backsound");
      const file = await generateBacksound(m, seconds, s);
      const g = { file, url: URL.createObjectURL(file), seconds, mood: m, seed: s };
      setGenerated(g);
      return g;
    } catch (err) {
      setMusicError(`Backsound otomatis gagal dibuat: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally { setMusicBusy(false); }
  }, [setGenerated, setMusicBusy, setMusicError]);

  // Regenerate the automatic backsound (debounced) whenever the video length, mood or variation changes.
  useEffect(() => {
    if (musicMode !== "auto" || !timeline.ok || generatedFresh || musicBusy) return;
    const id = setTimeout(() => { void generate(videoSeconds, mood, seed); }, 600);
    return () => clearTimeout(id);
  }, [musicMode, timeline.ok, videoSeconds, mood, seed, generatedFresh, musicBusy, generate]);
  return { generate };
}
