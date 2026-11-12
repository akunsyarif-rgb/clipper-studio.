import { Player, type PlayerRef } from "@remotion/player";
import { FPS, HEIGHT, totalFrames, WIDTH, type VideoProps } from "@/lib/script";
import { ScriptVideo } from "@/remotion/ScriptVideo";
import SafeGuide from "./SafeGuide";
import type { Dispatch, SetStateAction, RefObject } from "react";

type Props = {
  blocker: string;
  colors: { label: string; bg1: string; bg2: string; accent: string; text: string; };
  guide: boolean;
  player: RefObject<PlayerRef | null>;
  props: VideoProps | null;
  setGuide: Dispatch<SetStateAction<boolean>>;
};

export default function PreviewColumn({ blocker, colors, guide, player, props, setGuide }: Props) {
  return (
    <section className="preview-column">
      <div className="panel-heading"><div><small>02 / PRATINJAU</small><h2>Preview video</h2></div><span className="preview-badge"><i /> {props ? `${(totalFrames(props.scenes) / FPS).toFixed(1)}s · 9:16` : "—"}</span></div>
      <div className="player-wrap" style={{ position: "relative", background: `linear-gradient(145deg, ${colors.bg1}, ${colors.bg2})` }}>
        {props ? <Player ref={player} component={ScriptVideo} inputProps={props} durationInFrames={props ? totalFrames(props.scenes) : 1} fps={FPS} compositionWidth={WIDTH} compositionHeight={HEIGHT} controls style={{ width: "100%", aspectRatio: "9 / 16" }} acknowledgeRemotionLicense />
          : <div className="player-empty">{blocker}</div>}
        {guide && props ? <SafeGuide /> : null}
      </div>
      <label className="check-row" data-testid="safe-guide-toggle"><input type="checkbox" checked={guide} onChange={e => setGuide(e.target.checked)} /> Tampilkan panduan area aman (hanya di pratinjau, tidak ikut ke MP4)</label>
      {guide ? <p className="preview-disclaimer" data-testid="safe-guide-legend">Merah: tertutup tampilan aplikasi (tab, deskripsi, tombol kanan). Putus-putus putih: area konten utama 1200 px. Biru: kotak 1080×1080 yang tersisa bila dipotong 1:1. Kuning: baris dasar subtitle.</p> : null}
      <p className="preview-disclaimer">Pratinjau memakai komposisi yang sama dengan hasil render, jadi teks, durasi scene, narasi, dan backsound identik dengan MP4.</p>
    </section>
  );
}
