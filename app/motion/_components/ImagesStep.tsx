import { useState } from "react";
import { type PlayerRef } from "@remotion/player";
import { moodForStyle, type Mood } from "@/lib/audio";
import { MAX_SECONDS, PALETTES, type PaletteId, type StyleId } from "@/lib/script";
import { type Cut, type VisualOverride } from "@/lib/visuals";
import IconifyPanel from "../../IconifyPanel";
import PixabayAutoPanel from "../../PixabayAutoPanel";
import { FlowStepNav } from "../../FlowStepper";
import type { Entrance } from "@/lib/icon-motion";
import type { LoadedIcon } from "@/lib/iconify";
import { type StickerMode } from "@/lib/stickers";
import PexelsPanel from "../../PexelsPanel";
import type { PixabayPhoto, PixabayVideo } from "@/lib/pixabay";
import { type PexelsPhoto } from "@/lib/pexels";
import type { Visual } from "@/lib/command-agent";
import type { MusicMode, SceneImageFile } from "./types";
import SceneItem from "./SceneItem";
import type { Dispatch, SetStateAction, RefObject, ChangeEvent } from "react";
import type { AnimationPlan } from "@/lib/importance";
import type { NarrativePlan } from "@/lib/narrative";
import type { SceneVisual } from "@/lib/visuals";
import type { TimelineResult } from "@/lib/script";

type Props = {
  animationPlan: AnimationPlan;
  applyIcon: (text: string, icon: LoadedIcon) => void;
  autoPhotos: number;
  chooseEntrance: (e: Entrance) => void;
  clipStarts: Record<string, number>;
  cutOverrides: Record<string, Cut>;
  directorInfo: Record<string, { reason: string; imageIdea?: string; imageQuery?: string; }>;
  goFlow: (n: number) => void;
  iconEntrance: Entrance;
  imageError: string;
  images: Record<string, SceneImageFile>;
  manualChoice: (text: string) => void;
  musicMode: MusicMode;
  narrativePlan: NarrativePlan[];
  onSceneImage: (text: string, e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  overrides: Record<string, VisualOverride>;
  palette: PaletteId;
  pickerFor: string | null;
  pickerSource: "pexels" | "pixabay" | "pixabay-video";
  planned: Cut[];
  player: RefObject<PlayerRef | null>;
  putPixabayPhoto: (text: string, file: File, photo: PixabayPhoto) => Promise<void>;
  putPixabayVideo: (text: string, video: PixabayVideo) => void;
  putStockPhoto: (text: string, file: File, photo: PexelsPhoto) => Promise<void>;
  queryHints: Record<string, Visual>;
  removeSceneImage: (text: string) => void;
  rendering: boolean;
  sceneContext: Set<string>[];
  sceneList: ({ fx?: string; sticker?: string; videoSrc: string; clipFrom?: number; cut?: Cut; wordStarts?: number[]; wordEnds?: number[]; pauseFrames?: number; visual: SceneVisual; narrative: NarrativePlan; text: string; durationInFrames: number; image?: string; } | { fx?: string; sticker?: string; image: string; clipFrom?: number; cut?: Cut; wordStarts?: number[]; wordEnds?: number[]; pauseFrames?: number; visual: SceneVisual; narrative: NarrativePlan; text: string; durationInFrames: number; videoSrc?: string; } | { fx?: string; sticker?: string; clipFrom?: number; cut?: Cut; wordStarts?: number[]; wordEnds?: number[]; pauseFrames?: number; visual: SceneVisual; narrative: NarrativePlan; text: string; durationInFrames: number; image?: string; videoSrc?: string; })[];
  sceneVisuals: SceneVisual[];
  setClipStarts: Dispatch<SetStateAction<Record<string, number>>>;
  setCutOverrides: Dispatch<SetStateAction<Record<string, Cut>>>;
  setMood: Dispatch<SetStateAction<Mood>>;
  setMusicMode: Dispatch<SetStateAction<MusicMode>>;
  setOverrides: Dispatch<SetStateAction<Record<string, VisualOverride>>>;
  setPickerFor: Dispatch<SetStateAction<string | null>>;
  setPickerSource: Dispatch<SetStateAction<"pexels" | "pixabay" | "pixabay-video">>;
  setStickerOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  source: { file: File; url: string; seconds: number; } | null;
  sourceVideo: RefObject<HTMLVideoElement | null>;
  stickerMode: StickerMode;
  stickerOverrides: Record<string, string>;
  style: StyleId;
  timeline: TimelineResult;
  videoEdit: boolean;
};

export default function ImagesStep({ animationPlan, applyIcon, autoPhotos, chooseEntrance, clipStarts, cutOverrides, directorInfo, goFlow, iconEntrance, imageError, images, manualChoice, musicMode, narrativePlan, onSceneImage, overrides, palette, pickerFor, pickerSource, planned, player, putPixabayPhoto, putPixabayVideo, putStockPhoto, queryHints, removeSceneImage, rendering, sceneContext, sceneList, sceneVisuals, setClipStarts, setCutOverrides, setMood, setMusicMode, setOverrides, setPickerFor, setPickerSource, setStickerOverrides, source, sourceVideo, stickerMode, stickerOverrides, style, timeline, videoEdit }: Props) {
  const [listHidden, setListHidden] = useState(false);
  const [detail, setDetail] = useState(false);
  return (
    <section className="flow-step" data-step="4" data-testid="flow-step-4">
      <div className="step-title" data-testid="step-4"><b>4</b>Gambar</div>
      {timeline.ok && <PixabayAutoPanel autoRun={autoPhotos} disabled={rendering} onApply={putPixabayPhoto} onApplyVideo={putPixabayVideo} musicOn={musicMode === "auto"} onMusic={() => { setMusicMode("auto"); setMood(moodForStyle(style)); }}
        scenes={timeline.scenes.map((sc, i) => ({ text: sc.text, query: directorInfo[sc.text]?.imageQuery ?? queryHints[sc.text]?.term, kind: queryHints[sc.text]?.kind, hasImage: !!images[sc.text] || (!!(videoEdit && source) && sceneList[i]?.cut !== "graphic") }))} />}
      {timeline.ok && <IconifyPanel entrance={iconEntrance} onEntrance={chooseEntrance} disabled={rendering} accent={PALETTES[palette].accent} onApply={applyIcon}
        scenes={timeline.scenes.map((sc, i) => ({ text: sc.text, query: directorInfo[sc.text]?.imageQuery, hasIcon: !!sceneVisuals[i]?.icon || overrides[sc.text]?.icon === "none" }))} />}
      {timeline.ok && <PexelsPanel disabled={rendering} onApply={putStockPhoto}
        // Over a source video a picture only appears in a full-screen cutaway, so automatic filling covers just those scenes.
        scenes={timeline.scenes.map((sc, i) => ({ text: sc.text, query: directorInfo[sc.text]?.imageQuery, hasImage: !!images[sc.text] || (!!(videoEdit && source) && sceneList[i]?.cut !== "graphic") }))} />}
      <div className="timeline-heading"><h3>Timeline scene</h3><span>{timeline.ok ? `${timeline.scenes.length} scene · maks. ${MAX_SECONDS} dtk` : ""}</span></div>
      {timeline.ok && <div className="results-bar" data-testid="scenes-bar">
        <small>Detail per scene</small>
        <span>
          {!listHidden && <button type="button" className="text-link" aria-pressed={detail} onClick={() => setDetail(d => !d)} data-testid="scenes-detail-toggle">{detail ? "Ringkas" : "Tampilkan detail analisis"}</button>}
          <button type="button" className="text-link" aria-expanded={!listHidden} onClick={() => setListHidden(h => !h)} data-testid="scenes-toggle">{listHidden ? "Tampilkan daftar" : "Sembunyikan daftar"}</button>
        </span>
      </div>}
      {!listHidden && <div className="scene-list" data-testid="scenes" data-compact={detail ? undefined : "1"}>{timeline.ok && (() => { let t = 0; return timeline.scenes.map((s, i) => { const from = t; t += s.durationInFrames; return (
        <div className="scene-item" key={i} data-testid="scene-item">
          <SceneItem
            animationPlan={animationPlan} clipStarts={clipStarts} cutOverrides={cutOverrides} directorInfo={directorInfo} from={from} i={i} images={images}
            manualChoice={manualChoice} narrativePlan={narrativePlan} onSceneImage={onSceneImage} overrides={overrides} pickerFor={pickerFor}
            pickerSource={pickerSource} planned={planned} player={player} putPixabayPhoto={putPixabayPhoto} putPixabayVideo={putPixabayVideo}
            putStockPhoto={putStockPhoto} queryHints={queryHints} removeSceneImage={removeSceneImage} rendering={rendering} s={s} sceneContext={sceneContext}
            sceneVisuals={sceneVisuals} setClipStarts={setClipStarts} setCutOverrides={setCutOverrides} setOverrides={setOverrides} setPickerFor={setPickerFor}
            setPickerSource={setPickerSource} setStickerOverrides={setStickerOverrides} source={source} sourceVideo={sourceVideo} stickerMode={stickerMode}
            stickerOverrides={stickerOverrides} t={t} videoEdit={videoEdit} />
        </div>); }); })()}</div>}
      {timeline.ok && <p className="preview-disclaimer" data-testid="image-note">{imageError ? <span className="scene-image-error" data-testid="image-error">{imageError} </span> : null}{videoEdit && source ? "Di video sumber, gambar tampil sebagai layar penuh (maks. 4 detik) pada scene itu, dan pembicara kembali setelahnya. " : null}Gambar latar hanya dipakai di perangkat ini dan tidak ikut tersimpan atau tersinkron; pilih lagi setelah memuat ulang halaman. Pakai gambar milik Anda, foto Pexels/Pixabay, atau yang boleh dipakai ulang: gambar dari internet (mis. Pinterest) belum tentu bebas hak cipta.</p>}
      <FlowStepNav step={4} onGo={goFlow} />
    </section>
  );
}
