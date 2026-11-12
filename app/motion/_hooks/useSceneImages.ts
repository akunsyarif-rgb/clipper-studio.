import { type Cut } from "@/lib/visuals";
import { scenesForProductPhoto, type AffiliateBrief } from "@/lib/affiliate";
import type { PixabayPhoto, PixabayVideo } from "@/lib/pixabay";
import { pixabayCredit, pixabayVideoCredit } from "@/lib/pixabay";
import { creditText, type PexelsPhoto } from "@/lib/pexels";
import { imageProblem, prepareImage } from "@/lib/scene-image";
import type { SceneImageFile } from "../_components/types";
import type { Dispatch, SetStateAction, ChangeEvent } from "react";
import type { TimelineResult } from "@/lib/script";

type Inputs = {
  setCutOverrides: Dispatch<SetStateAction<Record<string, Cut>>>;
  setImageError: Dispatch<SetStateAction<string>>;
  setImages: Dispatch<SetStateAction<Record<string, SceneImageFile>>>;
  source: { file: File; url: string; seconds: number; } | null;
  timeline: TimelineResult;
  videoEdit: boolean;
};

export default function useSceneImages({ setCutOverrides, setImageError, setImages, source, timeline, videoEdit }: Inputs) {
async function onSceneImage(text: string, e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const problem = imageProblem(f);
    if (problem) { setImageError(problem); return; }
    setImageError("");
    try { await putSceneImage(text, f); }
    catch (err) { setImageError(err instanceof Error ? err.message : String(err)); }
  }
  /** Reduces the picture for memory and sets it behind the scene, replacing any earlier one. */
  async function putSceneImage(text: string, file: File, credit?: SceneImageFile["credit"]) {
    const blob = await prepareImage(file);
    const url = URL.createObjectURL(blob);
    setImages(prev => { if (prev[text]) URL.revokeObjectURL(prev[text].url); return { ...prev, [text]: { url, name: file.name, credit } }; });
    // Over a source video a picture can only be seen as a full-screen cutaway, so choosing one makes the scene a cutaway.
    if (videoEdit && source) setCutOverrides(prev => prev[text] === "graphic" ? prev : { ...prev, [text]: "graphic" });
  }
  /** The creator's own product photo behind every scene that names the product, and the last one; resolves with how many. */
  async function placeProductPhoto(file: File, brief: AffiliateBrief, credit?: SceneImageFile["credit"]): Promise<number> {
    if (!timeline.ok) return 0;
    const problem = imageProblem(file);
    if (problem) throw new Error(problem);
    const blob = await prepareImage(file); // reduced once, then shared by every scene
    const prepared = new File([blob], file.name, { type: blob.type || "image/jpeg" });
    const texts = timeline.scenes.map(sc => sc.text);
    const targets = scenesForProductPhoto(texts, brief.product);
    for (const i of targets) await putSceneImage(texts[i], prepared, credit);
    return targets.length;
  }
  const putStockPhoto = (text: string, file: File, photo: PexelsPhoto) => putSceneImage(text, file, { text: creditText(photo), href: photo.pexelsUrl || photo.photographerUrl || "https://www.pexels.com" });
  const putPixabayPhoto = (text: string, file: File, photo: PixabayPhoto) => putSceneImage(text, file, pixabayCredit(photo));
  function putPixabayVideo(text: string, video: PixabayVideo) {
    setImages(prev => { if (prev[text]?.url.startsWith("blob:")) URL.revokeObjectURL(prev[text].url); return { ...prev, [text]: { url: video.url, name: `pixabay-video-${video.id}.mp4`, mediaType: "video", credit: pixabayVideoCredit(video) } }; });
    if (videoEdit && source) setCutOverrides(prev => prev[text] === "graphic" ? prev : { ...prev, [text]: "graphic" });
  }
  function removeSceneImage(text: string) {
    setImages(prev => { if (!prev[text]) return prev; URL.revokeObjectURL(prev[text].url); const next = { ...prev }; delete next[text]; return next; });
  }
  return { onSceneImage, placeProductPhoto, putPixabayPhoto, putPixabayVideo, putStockPhoto, removeSceneImage };
}
