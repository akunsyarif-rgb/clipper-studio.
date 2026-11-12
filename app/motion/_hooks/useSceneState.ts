import { useRef, useState } from "react";
import { type Cut, type VisualOverride } from "@/lib/visuals";
import { emptyHistory, type History } from "@/lib/revision";
import type { SceneScore } from "@/lib/gemini";
import type { DirectorSnap, SceneImageFile } from "../_components/types";

export default function useSceneState() {
/** Manual visual corrections, keyed by scene text so they survive edits to other sentences. */
  const [overrides, setOverrides] = useState<Record<string, VisualOverride>>({});
  // Gemini's opinion per sentence (by its text); optional, kept for this visit only.
  const [aiScores, setAiScores] = useState<Record<string, SceneScore>>({});
  const [cutOverrides, setCutOverrides] = useState<Record<string, Cut>>({});
  // Scene pictures for faceless videos, keyed by scene text like the other per-scene choices.
  const [images, setImages] = useState<Record<string, SceneImageFile>>({});
  const [imageError, setImageError] = useState("");
  // The last "Sutradara AI" pass: why each scene looks as it does (by scene text), and what to restore on undo.
  const [directorInfo, setDirectorInfo] = useState<Record<string, { reason: string; imageIdea?: string; imageQuery?: string }>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerSource, setPickerSource] = useState<"pexels" | "pixabay" | "pixabay-video">("pexels");
  const [directorHistory, setDirectorHistory] = useState<History<DirectorSnap>>(emptyHistory());
  const imagesRef = useRef(images);
  imagesRef.current = images;
  // Where in the source video a "clip" scene starts (seconds), per scene text.
  const [clipStarts, setClipStarts] = useState<Record<string, number>>({});
  return { aiScores, clipStarts, cutOverrides, directorHistory, directorInfo, imageError, images, imagesRef, overrides, pickerFor, pickerSource, setAiScores, setClipStarts, setCutOverrides, setDirectorHistory, setDirectorInfo, setImageError, setImages, setOverrides, setPickerFor, setPickerSource };
}
