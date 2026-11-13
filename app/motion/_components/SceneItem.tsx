import { type PlayerRef } from "@remotion/player";
import { FPS } from "@/lib/script";
import { type Cut, stripMarks, type VisualOverride } from "@/lib/visuals";
import { chooseFamily, FAMILY_LABELS } from "@/lib/composition";
import { explainScene } from "@/lib/importance";
import { STICKERS, matchSticker, type StickerMode } from "@/lib/stickers";
import ScenePhotoPicker from "../../ScenePhotoPicker";
import PixabayPhotoPicker from "../../PixabayPhotoPicker";
import PixabayVideoPicker from "../../PixabayVideoPicker";
import type { PixabayPhoto, PixabayVideo } from "@/lib/pixabay";
import { type PexelsPhoto } from "@/lib/pexels";
import type { Visual } from "@/lib/command-agent";
import { CONFIDENCE_LABELS, MOTION_INTENSITY_LABELS, NARRATIVE_INTENT_LABELS, NARRATIVE_ROLE_LABELS, VISUAL_STRATEGY_LABELS } from "./constants";
import SceneVisualControls from "./SceneVisualControls";
import type { SceneImageFile } from "./types";
import type { Dispatch, SetStateAction, RefObject, ChangeEvent } from "react";
import type { NarrativePlan } from "@/lib/narrative";
import type { Scene } from "@/lib/script";
import type { SceneVisual } from "@/lib/visuals";
import type { AnimationPlan } from "@/lib/importance";

type Props = {
  animationPlan: AnimationPlan;
  clipStarts: Record<string, number>;
  cutOverrides: Record<string, Cut>;
  directorInfo: Record<string, { reason: string; imageIdea?: string; imageQuery?: string; }>;
  from: number;
  i: number;
  images: Record<string, SceneImageFile>;
  manualChoice: (text: string) => void;
  narrativePlan: NarrativePlan[];
  onSceneImage: (text: string, e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  overrides: Record<string, VisualOverride>;
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
  s: Scene;
  sceneContext: Set<string>[];
  sceneVisuals: SceneVisual[];
  setClipStarts: Dispatch<SetStateAction<Record<string, number>>>;
  setCutOverrides: Dispatch<SetStateAction<Record<string, Cut>>>;
  setOverrides: Dispatch<SetStateAction<Record<string, VisualOverride>>>;
  setPickerFor: Dispatch<SetStateAction<string | null>>;
  setPickerSource: Dispatch<SetStateAction<"pexels" | "pixabay" | "pixabay-video">>;
  setStickerOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  source: { file: File; url: string; seconds: number; } | null;
  sourceVideo: RefObject<HTMLVideoElement | null>;
  stickerMode: StickerMode;
  stickerOverrides: Record<string, string>;
  t: number;
  videoEdit: boolean;
};

export default function SceneItem({ animationPlan, clipStarts, cutOverrides, directorInfo, from, i, images, manualChoice, narrativePlan, onSceneImage, overrides, pickerFor, pickerSource, planned, player, putPixabayPhoto, putPixabayVideo, putStockPhoto, queryHints, removeSceneImage, rendering, s, sceneContext, sceneVisuals, setClipStarts, setCutOverrides, setOverrides, setPickerFor, setPickerSource, setStickerOverrides, source, sourceVideo, stickerMode, stickerOverrides, t, videoEdit }: Props) {
  return (
    <>
<button className="scene-row" onClick={() => player.current?.seekTo(from + Math.min(10, s.durationInFrames - 1))}>
            <span className="scene-index">{String(i + 1).padStart(2, "0")}</span>
            <div className="scene-info"><b>{stripMarks(s.text)}</b><small className="narrative-hint">{NARRATIVE_ROLE_LABELS[narrativePlan[i]?.role ?? ""] ?? "Lanjutan"} · {NARRATIVE_INTENT_LABELS[narrativePlan[i]?.intent ?? "statement"] ?? "Pernyataan"} · {VISUAL_STRATEGY_LABELS[narrativePlan[i]?.strategy ?? ""] ?? "Minimal"} · {MOTION_INTENSITY_LABELS[narrativePlan[i]?.intensity ?? ""] ?? "Tenang"}{!(videoEdit && source) && sceneVisuals[i] ? <> · <span className="scene-family" data-testid="scene-family">{FAMILY_LABELS[chooseFamily(sceneVisuals[i], narrativePlan[i])]}</span></> : null}</small><small className="narrative-reason">{narrativePlan[i]?.reason}</small><small className="narrative-reason" data-testid="scene-visual-cue"><b>Brief visual:</b> {narrativePlan[i]?.visualCue} · {CONFIDENCE_LABELS[narrativePlan[i]?.confidence ?? "low"]}</small>{videoEdit && source && animationPlan.judgements[i] ? <small className="narrative-reason" data-testid="scene-importance">{cutOverrides[s.text] ? "Diatur manual" : explainScene(animationPlan.judgements[i], planned[i] === "overlay")}</small> : null}<small className="narrative-continuity"><b>Penghubung:</b> {narrativePlan[i]?.continuityCue}</small>{narrativePlan[i]?.reviewFlags?.length ? <small className="narrative-reason" data-testid="scene-review-flags"><b>Perlu diperiksa:</b> {narrativePlan[i]?.reviewFlags?.join(" ")}</small> : null}{directorInfo[s.text]?.reason ? <small className="narrative-reason director-reason" data-testid="scene-director"><b>Pilihan AI:</b> {directorInfo[s.text].reason}</small> : null}{!(videoEdit && source) && directorInfo[s.text]?.imageIdea ? <small className="narrative-reason director-reason" data-testid="scene-image-idea"><b>Ide gambar:</b> {directorInfo[s.text].imageIdea}</small> : null}</div>
            <div className="scene-meta"><b>{(from / FPS).toFixed(1)}–{(t / FPS).toFixed(1)}s</b><small>{(s.durationInFrames / FPS).toFixed(1)} dtk</small></div>
          </button>
          <SceneVisualControls text={s.text} topics={sceneContext[i]} override={overrides[s.text]} disabled={rendering} cut={videoEdit ? { value: cutOverrides[s.text], auto: planned[i], clipFrom: clipStarts[s.text] } : undefined}
            onCut={c => {
              manualChoice(s.text);
              setCutOverrides(prev => { const next = { ...prev }; if (c) next[s.text] = c; else delete next[s.text]; return next; });
              // Choosing "other footage" starts at wherever the source player is now.
              if (c === "clip" && clipStarts[s.text] === undefined) setClipStarts(prev => ({ ...prev, [s.text]: Math.min(sourceVideo.current?.currentTime ?? 0, source?.seconds ?? 0) }));
            }}
            onClipHere={() => setClipStarts(prev => ({ ...prev, [s.text]: Math.min(sourceVideo.current?.currentTime ?? 0, source?.seconds ?? 0) }))}
            onClipSeek={t => { if (sourceVideo.current) { sourceVideo.current.currentTime = t; } }}
            onChange={o => { manualChoice(s.text); setOverrides(prev => { const next = { ...prev }; if (o.template || o.icon) next[s.text] = o; else delete next[s.text]; return next; }); }} />
          {stickerMode === "auto" && !(videoEdit && source) && <label className="scene-sticker" data-testid="scene-sticker-row"><span>Stiker</span>
            <select value={stickerOverrides[s.text] ?? "auto"} onChange={e => setStickerOverrides(prev => { const next = { ...prev }; if (e.target.value === "auto") delete next[s.text]; else next[s.text] = e.target.value; return next; })} data-testid="scene-sticker">
              <option value="auto">{matchSticker(s.text) ? `Otomatis · ${matchSticker(s.text)!.emoji} ${matchSticker(s.text)!.label}` : "Otomatis · tanpa"}</option>
              <option value="none">Tanpa stiker</option>
              {STICKERS.map(st => <option key={st.id} value={st.id}>{st.emoji} {st.label}</option>)}
            </select></label>}
          {<div className="scene-image" data-testid="scene-image">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: thumbnail, nothing for next/image to optimise */}
            {images[s.text] ? <img src={images[s.text].url} alt="" className="scene-thumb" /> : null}
            <label className="text-link">
              {images[s.text] ? "Ganti gambar" : "+ Gambar latar"}
              <input type="file" accept="image/*" hidden disabled={rendering} data-testid="scene-image-input" onChange={e => void onSceneImage(s.text, e)} />
            </label>
            <button type="button" className="text-link" disabled={rendering} onClick={() => { setPickerSource("pexels"); setPickerFor(pickerFor === s.text && pickerSource === "pexels" ? null : s.text); }} data-testid="scene-image-pexels">Cari di Pexels</button>
            <button type="button" className="text-link" disabled={rendering} onClick={() => { setPickerSource("pixabay"); setPickerFor(pickerFor === s.text && pickerSource === "pixabay" ? null : s.text); }} data-testid="scene-image-pixabay">Cari gambar Pixabay</button>
            <button type="button" className="text-link" disabled={rendering} onClick={() => { setPickerSource("pixabay-video"); setPickerFor(pickerFor === s.text && pickerSource === "pixabay-video" ? null : s.text); }} data-testid="scene-video-pixabay">Cari video Pixabay</button>
            {images[s.text] ? <button type="button" className="text-link" onClick={() => { player.current?.seekTo(from + Math.min(10, s.durationInFrames - 1)); document.querySelector(".preview-column")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} data-testid="scene-image-preview">Lihat di pratinjau</button> : null}
            {images[s.text] ? <button type="button" className="text-link" disabled={rendering} onClick={() => removeSceneImage(s.text)} data-testid="scene-image-remove">Hapus</button> : null}
            {images[s.text]?.credit ? <small className="scene-credit" data-testid="scene-credit"><a href={images[s.text].credit!.href} target="_blank" rel="noreferrer noopener">{images[s.text].credit!.text}</a></small> : null}
          </div>}
          {pickerFor === s.text && pickerSource === "pexels" && <ScenePhotoPicker initialQuery={directorInfo[s.text]?.imageQuery ?? queryHints[s.text]?.term ?? ""} onChoose={(file, photo) => putStockPhoto(s.text, file, photo)} onClose={() => setPickerFor(null)} />}
          {pickerFor === s.text && pickerSource === "pixabay" && <PixabayPhotoPicker initialQuery={directorInfo[s.text]?.imageQuery ?? queryHints[s.text]?.term ?? ""} onChoose={(file, photo) => putPixabayPhoto(s.text, file, photo)} onClose={() => setPickerFor(null)} />}
          {pickerFor === s.text && pickerSource === "pixabay-video" && <PixabayVideoPicker initialQuery={directorInfo[s.text]?.imageQuery ?? queryHints[s.text]?.term ?? ""} onChoose={video => putPixabayVideo(s.text, video)} onClose={() => setPickerFor(null)} />}
</>
  );
}
