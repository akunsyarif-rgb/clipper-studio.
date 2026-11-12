import { useRef, useState } from "react";
import { DEFAULT_MUSIC_VOLUME, type Mood } from "@/lib/audio";
import type { Generated, MusicMode, Track } from "../_components/types";

export default function useMusicState() {
const musicInput = useRef<HTMLInputElement>(null);
  const [musicMode, setMusicMode] = useState<MusicMode>("none");
  const [mood, setMood] = useState<Mood>("tenang");
  const [moodTouched, setMoodTouched] = useState(false);
  const [seed, setSeed] = useState(1);
  const [musicVolume, setMusicVolume] = useState(Math.round(DEFAULT_MUSIC_VOLUME * 100));
  const [duck, setDuck] = useState(true);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [uploadedMusic, setUploadedMusic] = useState<Track | null>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState("");
  return { duck, generated, mood, moodTouched, musicBusy, musicError, musicInput, musicMode, musicVolume, seed, setDuck, setGenerated, setMood, setMoodTouched, setMusicBusy, setMusicError, setMusicMode, setMusicVolume, setSeed, setUploadedMusic, uploadedMusic };
}
