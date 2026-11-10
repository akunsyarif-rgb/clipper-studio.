import { type Mood } from "@/lib/audio";
import { type Narration } from "@/lib/recorder";
import { type CaptionStyleId, type ContentPresetId, type PaletteId, type StyleId } from "@/lib/script";
import { type Cut, type VisualOverride } from "@/lib/visuals";
import { type StickerMode } from "@/lib/stickers";
import { type SfxMode } from "@/lib/sfx";
import { type TypePackId } from "@/lib/fonts";
import type { SceneScore } from "@/lib/gemini";

export type Mode = "normal" | "affiliate";
export type Track = { file: File; url: string; seconds: number };
/** A scene picture kept in memory only (never uploaded or saved with the session). */
export type SceneImageFile = { url: string; name: string; mediaType?: "image" | "video"; /** Set for stock media: contributor and source page. */ credit?: { text: string; href: string } };
export type Generated = Track & { mood: Mood; seed: number };
export type MusicMode = "none" | "auto" | "upload";
export type VoiceMode = "ai" | "manual" | "none";
export type AiNarration = { key: string; narration: Narration; sceneSeconds: number[] };
export type VoiceProgress = { phase: "download" | "synth"; loaded: number; total: number; label: string };
export type DirectorSnap = { stickerMode: StickerMode; stickerOverrides: Record<string, string>; sfxMode: SfxMode; typography: TypePackId; backdrop: "plain" | "mesh"; grain: boolean; captionStyle: CaptionStyleId; style: StyleId; palette: PaletteId; contentPreset: ContentPresetId | "custom"; overrides: Record<string, VisualOverride>; cutOverrides: Record<string, Cut>; info: Record<string, { reason: string; imageIdea?: string; imageQuery?: string }>; aiScores: Record<string, SceneScore>; note: string };
