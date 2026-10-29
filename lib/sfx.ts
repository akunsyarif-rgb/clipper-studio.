// Sound effects for short-form video: when they play (planned from the scenes) is decided here; how they sound is lib/sfx-synth.ts.
// Pure and deterministic. The effects are synthesised on the device (no audio files, nothing to license, nothing downloaded).
import type { NarrativePlan } from "./narrative";

export type SfxMode = "off" | "subtle" | "punchy";
export const SFX_MODES: SfxMode[] = ["off", "subtle", "punchy"];
export const SFX_LABELS: Record<SfxMode, string> = { off: "Mati", subtle: "Halus", punchy: "Tegas" };
export type SfxKind = "whoosh" | "pop" | "ding" | "thud";
export type SfxEvent = { frame: number; kind: SfxKind; /** 0..1 */ gain: number };

/** Volume of the whole effects track in the mix; effects are short accents, always under the narration. */
export const SFX_VOLUME = 0.55;

type PlanScene = {
  durationInFrames: number;
  narrative?: Pick<NarrativePlan, "role" | "intensity">;
  visual?: { template: string };
  sticker?: string;
  cut?: string;
};

/** A whoosh leads the cut by a few frames, so the sound arrives with the new picture rather than after it. */
const WHOOSH_LEAD = 4;
const STICKER_AT = 3;
const CTA_AT = 8;
/** Effects of one kind closer than this are one effect (the stronger stays). */
const MIN_GAP = 8;

/**
 * Where the effects go. Text scenes: a whoosh into every new scene (softer for calm scenes, firmer for impact), a pop when a
 * sticker appears, a ding on the call to action or the closing resolution, and (punchy) a low thud under an impact hook.
 * Over a source video the speaker is talking, so only full-screen graphic cutaways get a whoosh.
 */
export function planSfx(scenes: PlanScene[], mode: SfxMode, o: { videoEdit?: boolean } = {}): SfxEvent[] {
  if (mode === "off") return [];
  const k = mode === "punchy" ? 1 : 0.6;
  const events: SfxEvent[] = [];
  let start = 0;
  scenes.forEach((sc, i) => {
    const intensity = sc.narrative?.intensity ?? "emphasis";
    const weight = intensity === "impact" ? 1 : intensity === "quiet" ? 0.55 : 0.8;
    if (o.videoEdit) {
      if (sc.cut === "graphic") events.push({ frame: Math.max(0, start - WHOOSH_LEAD), kind: "whoosh", gain: 0.7 * k });
    } else {
      if (i > 0 && !(mode === "subtle" && sc.durationInFrames < 45)) events.push({ frame: Math.max(0, start - WHOOSH_LEAD), kind: "whoosh", gain: 0.75 * k * weight });
      if (sc.sticker) events.push({ frame: start + STICKER_AT, kind: "pop", gain: 0.8 * k });
      const closing = sc.visual?.template === "cta" || (i === scenes.length - 1 && sc.narrative?.role === "resolution");
      if (closing) events.push({ frame: start + CTA_AT, kind: "ding", gain: 0.7 * k });
      if (mode === "punchy" && i === 0 && intensity === "impact") events.push({ frame: 2, kind: "thud", gain: 0.9 });
    }
    start += sc.durationInFrames;
  });
  // Merge close effects of the same kind, keeping the stronger, and order by time.
  const out: SfxEvent[] = [];
  for (const e of events.sort((a, b) => a.frame - b.frame)) {
    const near = out.find(x => x.kind === e.kind && Math.abs(x.frame - e.frame) < MIN_GAP);
    if (near) { if (e.gain > near.gain) { near.gain = e.gain; near.frame = e.frame; } } else out.push({ ...e });
  }
  return out.sort((a, b) => a.frame - b.frame).map(e => ({ ...e, gain: Math.round(Math.min(1, Math.max(0, e.gain)) * 100) / 100 }));
}
