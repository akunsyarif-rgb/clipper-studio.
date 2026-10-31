// Turns a directed script into clips: one per segment, reusing what the cache already holds. Only the audible parts of a
// direction (pace) reach the synthesiser; changing one sentence's pace or text re-synthesises that sentence alone. Pure apart from
// the injected `synth`, so cancel, failure and reuse are unit-tested without the model.
import { paceToSpeed, type VoiceDirection } from "../voice-director";
import { clipKey } from "./narration";
import type { ClipCache } from "./clip-cache";

export class SynthesisCancelled extends Error { constructor() { super("cancelled"); this.name = "SynthesisCancelled"; } }

export type SynthFn = (text: string, speed: number, onStep: (step: number, total: number) => void | Promise<void>) => Promise<Float32Array>;

export type SynthesisInput = {
  /** The text to speak per segment (numbers already written out). */
  spoken: string[];
  directions: VoiceDirection[];
  baseSpeed: number;
  lang: string;
  voice: number;
  synth: SynthFn;
  cache: ClipCache;
  /** Polled between steps; true stops the run (the user cancelled, or a newer run replaced this one). */
  isCancelled: () => boolean;
  onProgress?: (p: { index: number; count: number; step: number; steps: number }) => void | Promise<void>;
};

export type SynthesisResult = { clips: Float32Array[]; /** Segments synthesised now. */ made: number[]; /** Segments served from the cache. */ reused: number[] };

/**
 * Clips for every segment. Each finished clip is cached at once, so a run that is cancelled or fails part-way keeps its progress:
 * the next run only does the rest. Throws SynthesisCancelled when cancelled, or the synthesiser's own error.
 */
export async function synthesizeDirected(i: SynthesisInput): Promise<SynthesisResult> {
  if (i.spoken.length !== i.directions.length) throw new Error("Jumlah arahan tidak sama dengan jumlah segmen.");
  const clips: Float32Array[] = [], made: number[] = [], reused: number[] = [];
  for (let index = 0; index < i.spoken.length; index++) {
    if (i.isCancelled()) throw new SynthesisCancelled();
    const speed = paceToSpeed(i.directions[index].pace, i.baseSpeed);
    const key = clipKey(i.spoken[index], i.lang, i.voice, speed);
    let clip = i.cache.get(key);
    if (clip) reused.push(index);
    else {
      clip = await i.synth(i.spoken[index], speed, async (step, steps) => {
        await i.onProgress?.({ index, count: i.spoken.length, step, steps });
        if (i.isCancelled()) throw new SynthesisCancelled();
      });
      i.cache.set(key, clip);
      made.push(index);
    }
    clips.push(clip);
  }
  return { clips, made, reused };
}
