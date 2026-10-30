"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { extractAudio } from "@/lib/engine";
import {
  analyzeMusic, bestMusicalMoment, DEFAULT_COMEDY, DEFAULT_MUSIC, EDIT_LABELS, EDIT_PROFILES, emphasisRanges, energyCurve, findPunchlines, planComedy, planMusic,
  sceneCuts, snapToBeat, suggestProfile, type ComedyOptions, type Edit, type EditProfile, type MusicAnalysis, type MusicOptions, type Punchline,
} from "@/lib/edit-profile";
import type { Trim } from "@/lib/trim";
import type { Word } from "@/lib/transcript";

const RATE = 16000;
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/** Small luma grids of the footage every `step` seconds, read from a hidden player (nothing is uploaded). */
async function sampleFrames(url: string, duration: number, step: number, signal: AbortSignal, onProgress: (p: number) => void): Promise<{ frames: Uint8ClampedArray[]; times: number[] }> {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("video")); });
  const canvas = document.createElement("canvas");
  canvas.width = 16; canvas.height = 9;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  const frames: Uint8ClampedArray[] = [], times: number[] = [];
  for (let t = 0; t < duration; t += step) {
    if (signal.aborted) throw new Error("aborted");
    // A seek to where the player already is may never report "seeked": never wait more than 2 s for one frame.
    await new Promise<void>(res => { const timer = setTimeout(res, 2000); v.onseeked = () => { clearTimeout(timer); res(); }; v.currentTime = Math.min(duration - 0.05, Math.max(0.01, t)); });
    ctx.drawImage(v, 0, 0, 16, 9);
    const rgba = ctx.getImageData(0, 0, 16, 9).data, luma = new Uint8ClampedArray(144);
    for (let i = 0; i < 144; i++) luma[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
    frames.push(luma); times.push(t);
    onProgress(Math.min(1, t / duration));
  }
  v.removeAttribute("src"); v.load();
  return { frames, times };
}

/**
 * "Profil editing" for a source video: Standar, Musik / ritme or Komedi. The profile is chosen by the creator; the analysis
 * (beats and loudness from the audio on this device, cuts from the picture, punchlines from the transcript's word timing)
 * proposes edits that are listed for review: each can be switched off or moved before export. Edits only change the picture
 * and the captions' emphasis, never the original audio or the length; a failed analysis applies nothing.
 */
export default function EditProfilePanel({ file, url, seconds, trim, words, video, profile, onProfile, edits, onEdits, onEmphasis, comedySfx, onComedySfx, onTrim, audioOnly, disabled }: {
  file: File;
  url: string;
  /** Length of the whole file. */
  seconds: number;
  trim: Trim | null;
  /** The transcript's words on the file's own timeline (comedy needs them). */
  words: Word[] | null;
  video: RefObject<HTMLVideoElement | null>;
  profile: EditProfile;
  onProfile: (p: EditProfile) => void;
  edits: Edit[];
  onEdits: (e: Edit[]) => void;
  /** Comedy: the punchlines' caption emphasis (file time). */
  onEmphasis: (r: { from: number; to: number }[]) => void;
  comedySfx: boolean;
  onComedySfx: (on: boolean) => void;
  onTrim: (t: Trim) => void;
  audioOnly: boolean;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState<"" | "audio" | "picture" | "comedy">("");
  const [progress, setProgress] = useState(0);
  const [music, setMusic] = useState<MusicAnalysis | null>(null);
  const [cuts, setCuts] = useState<number[] | null>(null);
  const [punches, setPunches] = useState<Punchline[] | null>(null);
  const [musicOpts, setMusicOpts] = useState<MusicOptions>(DEFAULT_MUSIC);
  const [comedyOpts, setComedyOpts] = useState<ComedyOptions>(DEFAULT_COMEDY);
  const [withPicture, setWithPicture] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [momentLength, setMomentLength] = useState(30);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  // Another file: the analysis belongs to the old one.
  useEffect(() => { setMusic(null); setCuts(null); setPunches(null); setError(""); setNote(""); }, [url]);

  const range = { from: trim?.start ?? 0, to: trim?.end ?? seconds };
  const wpm = words && words.length ? (words.length / Math.max(1, seconds)) * 60 : 0;
  const suggestion = suggestProfile({ beatConfidence: music?.confidence, wordsPerMinute: wpm, punchlines: punches?.length });

  async function analyseMusic() {
    const ctl = new AbortController(); abort.current = ctl;
    setError(""); setNote(""); setBusy("audio"); setProgress(0);
    try {
      const samples = await extractAudio(file, { start: 0, duration: seconds });
      const a = analyzeMusic(samples, RATE);
      setMusic(a);
      let found: number[] = [];
      if (withPicture && !audioOnly) {
        setBusy("picture");
        try { const s = await sampleFrames(url, seconds, 0.5, ctl.signal, setProgress); found = sceneCuts(s.frames, s.times); }
        catch { setNote("Pergantian adegan tidak bisa dibaca di browser ini; efek ketukan tetap direncanakan tanpa itu."); }
      }
      setCuts(found);
      const planned = a.ok ? planMusic(a, range.from, range.to, musicOpts, found) : [];
      onEdits(audioOnly ? planned.filter(e => e.kind !== "pulse" && e.kind !== "flash") : planned);
      onEmphasis([]);
      if (!a.ok) setError(a.reason ?? "Ketukan tidak terbaca. Tidak ada efek yang diterapkan.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/no audio/i.test(msg) ? "Video ini tidak punya suara, jadi ketukan tidak bisa dibaca. Tidak ada efek yang diterapkan." : `Analisis gagal (${msg}). Tidak ada efek yang diterapkan.`);
      onEdits([]);
    } finally { setBusy(""); }
  }

  async function analyseComedy() {
    if (!words || words.length < 3) { setError("Profil komedi butuh transkrip dengan waktu per kata. Buat transkrip di panel di bawah dulu."); return; }
    const ctl = new AbortController(); abort.current = ctl;
    setError(""); setNote(""); setBusy("comedy");
    try {
      // Loudness helps hear laughter in the pauses; without it the timing alone is used.
      let energy: { t: number; db: number }[] | undefined;
      try { energy = energyCurve(await extractAudio(file, { start: 0, duration: seconds }), RATE, 0.25); }
      catch { setNote("Suara tidak bisa dianalisis, jadi reaksi (tawa) tidak dideteksi; punchline dicari dari jeda dan kata saja."); }
      const p = findPunchlines(words, { energy });
      setPunches(p);
      onEdits(planComedy(p, range.from, range.to, comedyOpts, words));
      onEmphasis(emphasisRanges(p));
      if (!p.length) setError("Tidak ditemukan punchline yang jelas (butuh jeda ≥ 0,6 dtk setelah kalimat). Tidak ada efek yang diterapkan; jeda asli tetap utuh.");
    } finally { setBusy(""); }
  }

  // Changing an option re-plans from the analysis already made (no new analysis).
  function replanMusic(o: MusicOptions) { setMusicOpts(o); if (music?.ok) onEdits(planMusic(music, range.from, range.to, o, cuts ?? [])); }
  function replanComedy(o: ComedyOptions) { setComedyOpts(o); if (punches) onEdits(planComedy(punches, range.from, range.to, o, words ?? [])); }

  const setEdit = (id: string, patch: Partial<Edit>) => onEdits(edits.map(e => (e.id === id ? { ...e, ...patch } : e)));
  const seek = (t: number) => { if (video.current) { video.current.currentTime = Math.max(0, t - 0.5); void video.current.play().catch(() => undefined); } };

  return (
    <div className="edit-profile normal-only" data-testid="edit-profile">
      <div className="field-label">Profil editing <span className="field-hint">pilih sesuai karakter video; audio asli dan panjang video tidak diubah</span></div>
      <div className="seg three" role="radiogroup" aria-label="Profil editing">
        {EDIT_PROFILES.map(p => <button key={p.id} role="radio" aria-checked={profile === p.id} className={profile === p.id ? "active" : ""} title={p.hint} disabled={disabled || !!busy}
          onClick={() => { onProfile(p.id); onEdits([]); onEmphasis([]); setError(""); setNote(""); }} data-testid={"profile-" + p.id}>{p.label}</button>)}
      </div>
      <small className="field-hint">{EDIT_PROFILES.find(p => p.id === profile)?.hint}{suggestion && suggestion !== profile ? ` · Saran dari analisis: ${EDIT_PROFILES.find(p => p.id === suggestion)?.label}` : ""}</small>

      {profile === "music" && <div data-testid="music-tools">
        <label className="check-row"><input type="checkbox" checked={withPicture} onChange={e => setWithPicture(e.target.checked)} disabled={audioOnly || !!busy} /> Baca juga pergantian adegan di gambar</label>
        <div className="range-tools">
          <button type="button" onClick={() => void analyseMusic()} disabled={disabled || !!busy} data-testid="music-analyze">{busy === "audio" ? "Membaca ketukan…" : busy === "picture" ? `Membaca adegan… ${Math.round(progress * 100)}%` : music ? "Analisis ulang" : "Analisis ketukan & energi"}</button>
        </div>
        {music && <small className="field-hint" data-testid="music-summary">{music.ok ? `Tempo ±${Math.round(music.bpm)} BPM (keyakinan ${music.confidence}) · ${music.beats.length} ketukan · ${music.rises.length} kenaikan energi` : "Ketukan tidak terbaca"}{cuts ? ` · ${cuts.length} pergantian adegan` : ""}</small>}
        {music?.ok && <>
          <label className="field-label">Denyut di ketukan
            <select value={musicOpts.pulse} onChange={e => replanMusic({ ...musicOpts, pulse: e.target.value as MusicOptions["pulse"] })} disabled={disabled} data-testid="music-pulse">
              <option value="off">Mati</option><option value="subtle">Halus</option><option value="strong">Kuat</option>
            </select>
          </label>
          <label className="check-row"><input type="checkbox" checked={musicOpts.flash} onChange={e => replanMusic({ ...musicOpts, flash: e.target.checked })} disabled={disabled} data-testid="music-flash" /> Kilat saat energi lagu naik</label>
          <div className="range-tools">
            <button type="button" onClick={() => onTrim({ start: snapToBeat(range.from, music.downbeats.length ? music.downbeats : music.beats, 1), end: snapToBeat(range.to, music.beats, 0.5) })} disabled={disabled} data-testid="music-snap-trim">Tepatkan potongan ke ketukan</button>
            <select value={momentLength} onChange={e => setMomentLength(Number(e.target.value))} aria-label="Panjang momen" data-testid="music-moment-length">
              {[15, 30, 45, 60].map(n => <option key={n} value={n}>{n} dtk</option>)}
            </select>
            <button type="button" onClick={() => { const m = bestMusicalMoment(music, momentLength, 0, seconds); if (m) onTrim(m); else setNote(`Video lebih pendek dari ${momentLength} dtk.`); }} disabled={disabled} data-testid="music-moment">Pilih momen musikal</button>
          </div>
          <small className="field-hint">Speed ramp tidak dipakai: mengubah kecepatan akan menggeser audio asli.</small>
        </>}
      </div>}

      {profile === "comedy" && <div data-testid="comedy-tools">
        {!words || words.length < 3 ? <small className="field-hint" data-testid="comedy-needs-transcript">Butuh transkrip dengan waktu per kata (panel transkrip di bawah). Tanpa itu, tidak ada efek komedi yang diterapkan.</small> : null}
        <div className="range-tools">
          <button type="button" onClick={() => void analyseComedy()} disabled={disabled || !!busy || !words || words.length < 3} data-testid="comedy-analyze">{busy === "comedy" ? "Mencari punchline…" : punches ? "Cari ulang" : "Cari punchline & jeda"}</button>
        </div>
        {punches && <small className="field-hint" data-testid="comedy-summary">{punches.length} punchline · jeda asli tidak dipotong</small>}
        {punches && <>
          <label className="check-row"><input type="checkbox" checked={comedyOpts.punch} onChange={e => replanComedy({ ...comedyOpts, punch: e.target.checked })} disabled={disabled} data-testid="comedy-punch" /> Zoom di punchline</label>
          <label className="check-row"><input type="checkbox" checked={comedyOpts.freeze} onChange={e => replanComedy({ ...comedyOpts, freeze: e.target.checked })} disabled={disabled || audioOnly} data-testid="comedy-freeze" /> Bekukan gambar sebentar (suara tetap jalan)</label>
          <label className="check-row"><input type="checkbox" checked={comedyOpts.replay} onChange={e => replanComedy({ ...comedyOpts, replay: e.target.checked })} disabled={disabled || audioOnly} data-testid="comedy-replay" /> Ulang punchline di jendela kecil saat reaksi</label>
          <label className="check-row"><input type="checkbox" checked={comedySfx} onChange={e => onComedySfx(e.target.checked)} disabled={disabled} data-testid="comedy-sfx" /> Efek suara kecil di punchline</label>
        </>}
      </div>}

      {note && <small className="field-hint" data-testid="edit-note">{note}</small>}
      {error && <div className="notice" role="status" data-testid="edit-error">{error}</div>}

      {profile !== "standard" && edits.length > 0 && <details className="flow-adjust" open data-testid="edit-review">
        <summary>Tinjau efek ({edits.filter(e => e.on).length} dari {edits.length} aktif)</summary>
        <ul className="seo-list">
          {edits.map(e => {
            const outside = e.at < range.from || e.at >= range.to;
            return (
              <li key={e.id} data-testid="edit-item" className={e.on ? "" : "off"}>
                <label><input type="checkbox" checked={e.on} onChange={x => setEdit(e.id, { on: x.target.checked })} disabled={disabled} data-testid="edit-toggle" /> <b>{EDIT_LABELS[e.kind]}</b> {fmt(e.at - range.from)}</label>{" "}
                <small>{e.reason}{outside ? " · di luar potongan, tidak dipakai" : ""}</small>{" "}
                <button type="button" className="text-link" onClick={() => setEdit(e.id, { at: Math.max(0, Math.round((e.at - 0.1) * 1000) / 1000) })} disabled={disabled} aria-label="Lebih awal 0,1 detik" data-testid="edit-earlier">−0,1</button>{" "}
                <button type="button" className="text-link" onClick={() => setEdit(e.id, { at: Math.round((e.at + 0.1) * 1000) / 1000 })} disabled={disabled} aria-label="Lebih akhir 0,1 detik" data-testid="edit-later">+0,1</button>{" "}
                <button type="button" className="text-link" onClick={() => seek(e.at)} data-testid="edit-play">▶</button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="text-link" onClick={() => { onEdits([]); onEmphasis([]); }} disabled={disabled} data-testid="edit-clear">Hapus semua efek</button>
      </details>}
    </div>
  );
}
