// A bounded cache of synthesised clips, so regenerating a narration only re-synthesises what changed without the cache growing
// for ever (every variant of every sentence would otherwise stay in memory: a long editing session on an iPad runs out).
// Least recently used goes first. Pure and DOM-free so it is unit-tested.

/** About 4.5 minutes of speech at 44.1 kHz (48 MB as Float32). */
export const DEFAULT_CLIP_BUDGET_SAMPLES = 12_000_000;

export class ClipCache {
  private readonly map = new Map<string, Float32Array>();
  private used = 0;
  constructor(private readonly maxSamples = DEFAULT_CLIP_BUDGET_SAMPLES) {}

  get size() { return this.map.size; }
  get samples() { return this.used; }
  has(key: string) { return this.map.has(key); }

  /** The clip, marked as most recently used. */
  get(key: string): Float32Array | undefined {
    const clip = this.map.get(key);
    if (!clip) return undefined;
    this.map.delete(key); this.map.set(key, clip);
    return clip;
  }

  set(key: string, clip: Float32Array) {
    const old = this.map.get(key);
    if (old) { this.used -= old.length; this.map.delete(key); }
    this.map.set(key, clip); this.used += clip.length;
    // Never evict the clip just stored, even when one clip alone exceeds the budget.
    for (const [k, v] of this.map) {
      if (this.used <= this.maxSamples || k === key) break;
      this.map.delete(k); this.used -= v.length;
    }
  }

  clear() { this.map.clear(); this.used = 0; }
}
