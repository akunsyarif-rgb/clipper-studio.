// Runs the speech model over the parts of a recording that contain speech, one region at a time. The model itself is
// passed in, so this logic (offsets, retries, progress) is tested without downloading a model.
import { looksLooping, type RawChunk } from "../transcript";
import { ASR_SAMPLE_RATE, normalizeSpeech, speechRegions } from "./speech";

/** What the Transformers.js pipeline looks like from here. */
export type Pipe = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

export type RunResult = {
  granularity: "word" | "segment";
  chunks: RawChunk[];
  /** Seconds in which speech was found (the rest of the recording was skipped). */
  speechSeconds: number;
  /** Regions that had to be run again because the model started repeating itself. */
  retried: number;
};

/** Penalties for a second try of a region whose text looped. */
export const RETRY_OPTIONS = { repetition_penalty: 1.25, no_repeat_ngram_size: 3 } as const;

const chunksOf = (out: unknown): RawChunk[] => {
  const first = Array.isArray(out) ? out[0] : out;
  return ((first as { chunks?: RawChunk[] } | undefined)?.chunks ?? []).map(c => ({ text: c.text, timestamp: [c.timestamp?.[0] ?? null, c.timestamp?.[1] ?? null] as RawChunk["timestamp"] }));
};
const shift = (chunks: RawChunk[], by: number): RawChunk[] => chunks.map(c => ({ text: c.text, timestamp: [c.timestamp[0] === null ? null : c.timestamp[0] + by, c.timestamp[1] === null ? null : c.timestamp[1] + by] }));
const textOf = (chunks: RawChunk[]) => chunks.map(c => c.text).join(" ");
/** Not every model export carries the alignment heads needed for word timestamps. */
export const isAlignmentError = (e: unknown) => /alignment|cross.?attention|timestamp/i.test(String((e as Error)?.message ?? e));

/**
 * Transcribes `audio` (16 kHz mono) region by region. `onProgress(done, total)` counts seconds of speech.
 * Returns no chunks when there is no speech at all.
 */
export async function transcribeSpeech(pipe: Pipe, audio: Float32Array, language: string, onProgress: (done: number, total: number) => void = () => undefined): Promise<RunResult> {
  normalizeSpeech(audio);
  const regions = speechRegions(audio, ASR_SAMPLE_RATE);
  const total = regions.reduce((a, r) => a + (r.end - r.start), 0);
  onProgress(0, total);
  let mode: "word" | "segment" = "word";
  let retried = 0, done = 0;
  const all: RawChunk[] = [];
  for (const region of regions) {
    const slice = audio.subarray(Math.floor(region.start * ASR_SAMPLE_RATE), Math.ceil(region.end * ASR_SAMPLE_RATE));
    const run = async (extra: Record<string, unknown>) => {
      const base = { language, task: "transcribe", ...extra };
      try {
        return chunksOf(await pipe(slice, { ...base, return_timestamps: mode === "word" ? "word" : true }));
      } catch (err) {
        if (mode === "segment" || !isAlignmentError(err)) throw err;
        // Switch the whole run to segment timestamps, as the whole-recording version did.
        mode = "segment";
        return chunksOf(await pipe(slice, { ...base, return_timestamps: true }));
      }
    };
    let chunks = await run({});
    if (looksLooping(textOf(chunks))) { retried++; chunks = await run(RETRY_OPTIONS); }
    all.push(...shift(chunks, region.start));
    done += region.end - region.start;
    onProgress(done, total);
  }
  return { granularity: mode, chunks: all, speechSeconds: total, retried };
}
