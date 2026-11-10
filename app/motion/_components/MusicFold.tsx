import { MOODS, type Mood } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import type { Generated, MusicMode, Track } from "./types";
import type { Dispatch, SetStateAction, RefObject, ChangeEvent } from "react";
import type { TimelineResult } from "@/lib/script";

type Props = {
  duck: boolean;
  generatedFresh: Generated | null;
  mood: Mood;
  musicBusy: boolean;
  musicError: string;
  musicInput: RefObject<HTMLInputElement | null>;
  musicMode: MusicMode;
  musicVolume: number;
  narration: Narration | null;
  onMusic: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  rendering: boolean;
  setDuck: Dispatch<SetStateAction<boolean>>;
  setMood: Dispatch<SetStateAction<Mood>>;
  setMoodTouched: Dispatch<SetStateAction<boolean>>;
  setMusicMode: Dispatch<SetStateAction<MusicMode>>;
  setMusicVolume: Dispatch<SetStateAction<number>>;
  setSeed: Dispatch<SetStateAction<number>>;
  timeline: TimelineResult;
  uploadedMusic: Track | null;
  videoSeconds: number;
};

export default function MusicFold({ duck, generatedFresh, mood, musicBusy, musicError, musicInput, musicMode, musicVolume, narration, onMusic, rendering, setDuck, setMood, setMoodTouched, setMusicMode, setMusicVolume, setSeed, timeline, uploadedMusic, videoSeconds }: Props) {
  return (
    <details className="fold" data-testid="fold-music"><summary><b>Backsound</b> <small>{musicMode === "none" ? "Tanpa" : musicMode === "auto" ? `Otomatis · ${MOODS.find(m => m.id === mood)?.label}` : "Unggahan Anda"}</small></summary>
      <div className="audio-box">
        <input ref={musicInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" onChange={e => void onMusic(e)} className="file-hidden" data-testid="music-input" />
        <div className="seg" role="radiogroup" aria-label="Backsound">
          {([["none", "Tanpa"], ["auto", "Otomatis"], ["upload", "Unggah"]] as [MusicMode, string][]).map(([id, label]) =>
            <button key={id} role="radio" aria-checked={musicMode === id} className={musicMode === id ? "active" : ""} disabled={rendering} data-testid={"music-" + id}
              onClick={() => { if (id === "upload" && !uploadedMusic) musicInput.current?.click(); else setMusicMode(id); }}>{label}</button>)}
        </div>
        {musicMode === "auto" && <>
          <div className="field-row tight">
            <div><label className="field-label" htmlFor="motion-mood">Mood</label>
              <select id="motion-mood" data-testid="mood" value={mood} onChange={e => { setMood(e.target.value as Mood); setMoodTouched(true); }}>{MOODS.map(m => <option key={m.id} value={m.id}>{m.label} · {m.hint}</option>)}</select></div>
            <div><label className="field-label">&nbsp;</label><button className="motion-secondary full" onClick={() => setSeed(s => s + 1)} disabled={musicBusy || rendering}>↻ Variasi lain</button></div>
          </div>
          <small data-testid="music-status">{musicBusy ? "Membuat backsound di perangkat…" : generatedFresh ? `Backsound ${generatedFresh.seconds.toFixed(1)} dtk siap · dibuat di perangkat, bebas royalti.` : timeline.ok ? "Menunggu…" : "Lengkapi naskah dulu."}</small>
          {generatedFresh && <a className="text-link" href={generatedFresh.url} download={generatedFresh.file.name}>Unduh backsound (WAV)</a>}
        </>}
        {musicMode === "upload" && uploadedMusic && <>
          <div className="audio-meta"><b>{uploadedMusic.file.name}</b><small>{uploadedMusic.seconds.toFixed(1)} dtk · {uploadedMusic.seconds < videoSeconds ? "diulang (loop) sampai video selesai" : "dipotong sesuai durasi video"}, fade in/out otomatis</small></div>
          <button className="motion-secondary" onClick={() => musicInput.current?.click()} disabled={rendering}>Ganti musik</button>
          <small>Pastikan Anda punya izin memakai musik ini (mis. Pixabay Music, YouTube Audio Library).</small>
        </>}
        {musicMode !== "none" && <>
          <label className="field-label" htmlFor="motion-music-volume">Volume backsound <span className="field-hint">{musicVolume}%</span></label>
          <input id="motion-music-volume" type="range" min={0} max={100} step={5} value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} data-testid="music-volume" />
          <label className="check-row"><input type="checkbox" checked={duck} onChange={e => setDuck(e.target.checked)} /><span>Kecilkan otomatis saat narasi berbicara (ducking){narration ? "" : " · aktif jika ada narasi"}</span></label>
        </>}
        {musicError && <p className="field-error" role="alert" data-testid="music-error">{musicError}</p>}
      </div>
      </details>
  );
}
