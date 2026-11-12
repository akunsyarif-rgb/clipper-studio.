import { useEffect, useState } from "react";
import { type CaptionStyleId, type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import type { BrandMotion } from "@/lib/overlay";
import { type CaptionPos } from "@/lib/caption-box";
import { setCustomIconEntrance } from "@/lib/visuals";
import type { Entrance } from "@/lib/icon-motion";
import { type CinePlan } from "@/lib/cinematic";
import { type StickerMode } from "@/lib/stickers";
import { type SfxMode } from "@/lib/sfx";
import { DEFAULT_TYPE_PACK, resolveTypePack, type TypePackId } from "@/lib/fonts";
import { ensureFonts } from "../../../remotion/fonts";
import { DEFAULT_WATERMARK, loadWatermark, saveWatermark, type Watermark } from "@/lib/watermark";
import { SAMPLE } from "../_components/constants";

export default function useLookState() {
const [script, setScript] = useState(SAMPLE);
  const [title, setTitle] = useState("Sebuah pengingat");
  const [style, setStyle] = useState<StyleId>("hybrid");
  const [palette, setPalette] = useState<PaletteId>("violet");
  const [contentPreset, setContentPreset] = useState<ContentPresetId | "custom">("custom");
  const [target, setTarget] = useState("auto");
  const [captions, setCaptions] = useState(true);
  const [brandMotion, setBrandMotion] = useState<BrandMotion>("simple");
  const [storyVisuals, setStoryVisuals] = useState(true);
  const [stickerMode, setStickerMode] = useState<StickerMode>("off");
  const [stickerOverrides, setStickerOverrides] = useState<Record<string, string>>({});
  const [sfxMode, setSfxMode] = useState<SfxMode>("off");
  const [backdrop, setBackdrop] = useState<"plain" | "mesh">("plain");
  const [grain, setGrain] = useState(false);
  // Cinematic Studio: the applied plan (motion preset per scene text + beat-aligned lengths); it stays valid only while the script is unchanged.
  // Icons from Iconify used by scenes (also stored in the session, so they return without the network).
  const [iconEntrance, setIconEntranceState] = useState<Entrance>("pop");
  const chooseEntrance = (e: Entrance) => { setCustomIconEntrance(e); setIconEntranceState(e); };
  const [customIcons, setCustomIcons] = useState<Record<string, { label: string; node: [string, Record<string, string>][] }>>({});
  const [cine, setCine] = useState<{ plan: CinePlan; fx: Record<string, string> } | null>(null);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleId>("classic");
  /** Subtitle position and size over a source video (percent of the frame); undefined = the usual place and size. */
  const [captionPos, setCaptionPos] = useState<CaptionPos | undefined>(undefined);
  const [typography, setTypography] = useState<TypePackId>(DEFAULT_TYPE_PACK);
  // Fonts of the chosen pack are fetched as soon as it is chosen, so the preview never shows a fallback face for long.
  useEffect(() => { void ensureFonts(resolveTypePack(typography)); }, [typography]);
  // Watermark: remembered for this editing session, so it is back for every re-render (and shared with the clipper).
  const [watermark, setWatermarkState] = useState<Watermark>(DEFAULT_WATERMARK);
  useEffect(() => { setWatermarkState(loadWatermark()); }, []);
  const setWatermark = (w: Watermark) => { setWatermarkState(w); saveWatermark(w); };
  return { backdrop, brandMotion, captionPos, captionStyle, captions, chooseEntrance, cine, contentPreset, customIcons, grain, iconEntrance, palette, script, setBackdrop, setBrandMotion, setCaptionPos, setCaptionStyle, setCaptions, setCine, setContentPreset, setCustomIcons, setGrain, setPalette, setScript, setSfxMode, setStickerMode, setStickerOverrides, setStoryVisuals, setStyle, setTarget, setTitle, setTypography, setWatermark, sfxMode, stickerMode, stickerOverrides, storyVisuals, style, target, title, typography, watermark };
}
