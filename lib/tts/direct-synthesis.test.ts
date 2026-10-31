import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FPS } from "../script";
import { analyzeVoiceScript, paceToSpeed, scenePause, spokenForDirection, type VoiceDirection } from "../voice-director";
import { ClipCache } from "./clip-cache";
import { SynthesisCancelled, synthesizeDirected, type SynthFn } from "./direct-synthesis";
import { assembleNarration, clipKey } from "./narration";
import { MODEL_FILES, parseIndexer, parseVoiceBank, Supertonic, type OrtModule, type TtsConfig } from "./supertonic";

const clip = (n: number, v = 0.1) => new Float32Array(n).fill(v);

describe("ClipCache", () => {
  it("evicts the least recently used clips when the sample budget is exceeded", () => {
    const c = new ClipCache(100);
    c.set("a", clip(40)); c.set("b", clip(40));
    c.get("a"); // a is now the most recent
    c.set("c", clip(40));
    expect(c.has("b")).toBe(false);
    expect(c.has("a") && c.has("c")).toBe(true);
    expect(c.samples).toBe(80);
  });
  it("keeps a clip that alone exceeds the budget, and replaces a key without double counting", () => {
    const c = new ClipCache(10);
    c.set("big", clip(50));
    expect(c.has("big")).toBe(true);
    c.set("big", clip(20));
    expect(c.samples).toBe(20);
    c.set("small", clip(5));
    expect(c.has("big")).toBe(false); // over budget again: the older one goes, the new one stays
    expect(c.has("small")).toBe(true);
    c.clear();
    expect([c.size, c.samples]).toEqual([0, 0]);
  });
});

/** A fake engine: records what it was asked to say and at which speed; can fail or stall on a given call. */
function engine(opts: { failOn?: number; stepsPerClip?: number } = {}) {
  const calls: { text: string; speed: number }[] = [];
  const synth: SynthFn = async (text, speed, onStep) => {
    const n = calls.length;
    calls.push({ text, speed });
    for (let s = 1; s <= (opts.stepsPerClip ?? 2); s++) await onStep(s, opts.stepsPerClip ?? 2);
    if (opts.failOn === n) throw new Error("boom");
    return clip(Math.round(1000 / speed) + text.length, 0.1 * (n + 1));
  };
  return { synth, calls };
}
const dirs = (texts: string[]): VoiceDirection[] => analyzeVoiceScript(texts);
const run = (o: { texts: string[]; directions?: VoiceDirection[]; cache: ClipCache; synth: SynthFn; baseSpeed?: number; voice?: number; lang?: string; cancel?: () => boolean }) =>
  synthesizeDirected({ spoken: o.texts, directions: o.directions ?? dirs(o.texts), baseSpeed: o.baseSpeed ?? 1.05, lang: o.lang ?? "id", voice: o.voice ?? 0, cache: o.cache, synth: o.synth, isCancelled: o.cancel ?? (() => false) });

describe("synthesizeDirected: regenerate only what changed", () => {
  const texts = ["Satu kalimat awal.", "Apa kabar semuanya?", "Ternyata ini jawabannya.", "Sampai jumpa."];
  it("a second identical run does no synthesis at all", async () => {
    const cache = new ClipCache(), e = engine();
    const first = await run({ texts, cache, synth: e.synth });
    expect(first.made).toEqual([0, 1, 2, 3]);
    const second = await run({ texts, cache, synth: e.synth });
    expect([second.made, second.reused]).toEqual([[], [0, 1, 2, 3]]);
    expect(e.calls).toHaveLength(4);
    expect(second.clips.map(c => c.length)).toEqual(first.clips.map(c => c.length));
  });
  it("changing one sentence, or one tempo, re-synthesises that sentence alone", async () => {
    const cache = new ClipCache(), e = engine();
    const d = dirs(texts);
    await run({ texts, directions: d, cache, synth: e.synth });
    const edited = [texts[0], texts[1], "Ternyata ini jawaban lain.", texts[3]];
    expect((await run({ texts: edited, directions: dirs(edited), cache, synth: e.synth })).made).toEqual([2]);
    const slower = d.map((x, i) => (i === 3 ? { ...x, pace: "slow" as const } : x));
    const r = await run({ texts, directions: slower, cache, synth: e.synth });
    expect(r.made).toEqual([3]);
    expect(e.calls.at(-1)!.speed).toBe(paceToSpeed("slow", 1.05));
  });
  it("guidance-only changes (emotion, style, emphasis) never trigger synthesis", async () => {
    const cache = new ClipCache(), e = engine();
    const d = dirs(texts);
    await run({ texts, directions: d, cache, synth: e.synth });
    const guided = d.map(x => ({ ...x, emotion: "joyful" as const, delivery: "gentle" as const, emphasis: ["kata"], reason: "x" }));
    expect((await run({ texts, directions: guided, cache, synth: e.synth })).made).toEqual([]);
  });
  it("a different base speed, voice or language re-synthesises everything", async () => {
    const cache = new ClipCache(), e = engine();
    await run({ texts, cache, synth: e.synth });
    expect((await run({ texts, cache, synth: e.synth, baseSpeed: 1.2 })).made).toHaveLength(4);
    expect((await run({ texts, cache, synth: e.synth, voice: 5 })).made).toHaveLength(4);
    expect((await run({ texts, cache, synth: e.synth, lang: "en" })).made).toHaveLength(4);
  });
  it("the same sentence at the same tempo is synthesised once", async () => {
    const same = ["Sama saja.", "Sama saja."];
    const e = engine();
    const r = await run({ texts: same, cache: new ClipCache(), synth: e.synth });
    expect(e.calls).toHaveLength(1);
    expect([r.made, r.reused]).toEqual([[0], [1]]);
  });
  it("a rising sentence is a different clip from the same words as a statement", async () => {
    const cache = new ClipCache(), e = engine();
    const d = dirs(["Tahukah kamu apa yang terjadi"]);
    const asQuestion = [spokenForDirection("Tahukah kamu apa yang terjadi.", d[0])];
    await run({ texts: asQuestion, directions: d, cache, synth: e.synth });
    await run({ texts: ["Tahukah kamu apa yang terjadi."], directions: d, cache, synth: e.synth });
    expect(e.calls.map(c => c.text)).toEqual(["Tahukah kamu apa yang terjadi?", "Tahukah kamu apa yang terjadi."]);
  });
  it("refuses directions that do not match the segments", async () => {
    await expect(run({ texts, directions: dirs(texts).slice(1), cache: new ClipCache(), synth: engine().synth })).rejects.toThrow(/Jumlah arahan/);
  });
});

describe("synthesizeDirected: cancel and failure keep the progress that was made", () => {
  const texts = ["Satu dua tiga.", "Empat lima enam.", "Tujuh delapan sembilan.", "Sepuluh."];
  it("a failure on the third sentence keeps the first two; the retry does only the rest", async () => {
    const cache = new ClipCache();
    const bad = engine({ failOn: 2 });
    await expect(run({ texts, cache, synth: bad.synth })).rejects.toThrow("boom");
    expect(cache.size).toBe(2);
    const good = engine();
    const retry = await run({ texts, cache, synth: good.synth });
    expect([retry.reused, retry.made]).toEqual([[0, 1], [2, 3]]);
    expect(good.calls.map(c => c.text)).toEqual([texts[2], texts[3]]);
  });
  it("cancelling between sentences stops at once, and cancelling inside a sentence caches nothing half-made", async () => {
    const cache = new ClipCache();
    let allowed = 2;
    const e = engine();
    await expect(run({ texts, cache, synth: e.synth, cancel: () => cache.size >= allowed })).rejects.toBeInstanceOf(SynthesisCancelled);
    expect(cache.size).toBe(2);

    const cache2 = new ClipCache();
    const e2 = engine({ stepsPerClip: 3 });
    let steps = 0;
    const err = await run({ texts, cache: cache2, synth: async (t, s, onStep) => e2.synth(t, s, async (a, b) => { steps++; await onStep(a, b); }), cancel: () => steps >= 5 }).catch(x => x);
    expect(err).toBeInstanceOf(SynthesisCancelled);
    expect(cache2.size).toBe(1); // the second sentence was interrupted: it is not cached
    allowed = 99;
  });
  it("a run replaced by a newer one stops without touching the newer run's cache entries", async () => {
    const cache = new ClipCache();
    let current = 1;
    const old = run({ texts, cache, synth: engine().synth, cancel: () => current !== 1 });
    current = 2;
    await expect(old).rejects.toBeInstanceOf(SynthesisCancelled);
    expect(cache.size).toBe(0);
  });
});

describe("pauses are not duplicated or excessive", () => {
  const rate = 1000;
  it("the directed pause and the [jeda] tag overlap; the directed extra comes on top of the usual lead and tail only once", () => {
    const d = dirs(["Apa kabar semuanya?", "Ternyata begini.", "Selesai."]);
    expect(d.map(x => x.pauseAfter)).toEqual([0.25, 0.5, 0]);
    const clips = [clip(1000), clip(1000), clip(1000)];
    const plain = assembleNarration(clips, rate, FPS, [0, 0, 0]);
    const directed = assembleNarration(clips, rate, FPS, [0, 0.5, 0].map((tag, i) => scenePause(tag, d[i])));
    const tagged = assembleNarration(clips, rate, FPS, [2, 0, 0].map((tag, i) => scenePause(tag, d[i])));
    // First scene: the 2 s tag wins over the 0.25 s direction; second: 0.5 s direction alone; third: none.
    expect(tagged.sceneSeconds[0] - plain.sceneSeconds[0]).toBeCloseTo(2, 5);
    expect(directed.sceneSeconds[0] - plain.sceneSeconds[0]).toBeCloseTo(0.25, 5);
    expect(directed.sceneSeconds[1] - plain.sceneSeconds[1]).toBeCloseTo(0.5, 5);
    expect(directed.sceneSeconds[2]).toBeCloseTo(plain.sceneSeconds[2], 5);
  });
  it("a plain script keeps its original length: sentences ending in a period add nothing", () => {
    const d = dirs(["Satu kalimat biasa.", "Dua kalimat biasa.", "Tiga kalimat biasa."]);
    expect(d.every(x => x.pauseAfter === 0)).toBe(true);
  });
  it("the key of a clip does not depend on the pause", () => {
    expect(clipKey("a", "id", 0, 1.05)).toBe(clipKey("a", "id", 0, 1.05));
  });
});

// ---- the real model: the claims above are about what the engine actually does ------------------------------------------------
const dir = join(process.cwd(), "public", "supertonic");
const hasModel = existsSync(join(dir, "manifest.json"));
describe.skipIf(!hasModel)("with the real Supertonic 3 model", () => {
  let tts: Supertonic;
  const load = async () => {
    if (tts) return tts;
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { files: Record<string, { size: number; parts: string[] }> };
    const ab = (f: string) => { const b = Buffer.concat(manifest.files[f].parts.map(p => readFileSync(join(dir, p)))); expect(b.length).toBe(manifest.files[f].size); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const [durationPredictor, textEncoder, vectorEstimator, vocoder] = await Promise.all(MODEL_FILES.map(f => ort.InferenceSession.create(new Uint8Array(ab(f)))));
    tts = new Supertonic(ort as unknown as OrtModule, { durationPredictor, textEncoder, vectorEstimator, vocoder }, JSON.parse(new TextDecoder().decode(ab("tts.json"))) as TtsConfig, parseIndexer(ab("unicode_indexer.bin")), parseVoiceBank(ab("voice.bin")));
    return tts;
  };

  it("pace really changes the length of the speech by the speed ratio, every segment is clean, and the joined track has the planned length", async () => {
    const t = await load();
    const texts = ["Hari ini kita belajar satu hal sederhana.", "Ternyata hasilnya cukup mengejutkan."];
    const base = analyzeVoiceScript(texts);
    const normal = base.map(d => ({ ...d, pace: "normal" as const, pauseAfter: 0 as const }));
    const slow = normal.map(d => ({ ...d, pace: "slow" as const }));
    const cache = new ClipCache();
    const make = (directions: VoiceDirection[]) => synthesizeDirected({
      spoken: texts, directions, baseSpeed: 1.05, lang: "id", voice: 5, cache, isCancelled: () => false,
      synth: (text, speed, onStep) => t.synthesize(text, "id", 5, { speed, steps: 8, onStep }),
    });
    const a = await make(normal), b = await make(slow);
    expect(b.made).toEqual([0, 1]);
    for (let i = 0; i < 2; i++) {
      // 0.9x speed: the clip is 1/0.9 times as long (the engine divides the predicted duration by the speed).
      expect(b.clips[i].length / a.clips[i].length).toBeGreaterThan(1.06);
      expect(b.clips[i].length / a.clips[i].length).toBeLessThan(1.16);
      let peak = 0, clipped = 0;
      for (const v of b.clips[i]) { const x = Math.abs(v); if (x > peak) peak = x; if (x >= 0.999) clipped++; }
      expect(peak).toBeGreaterThan(0.05);
      expect(clipped).toBe(0); // at the app's own 8 steps; 4 steps can go past full scale, which is why the app never lowers them
      expect(Number.isFinite(peak)).toBe(true);
      // Each clip starts and ends in silence, so joining clips cannot click.
      expect(Math.abs(b.clips[i][0])).toBeLessThan(0.001);
      expect(Math.abs(b.clips[i][b.clips[i].length - 1])).toBeLessThan(0.001);
    }
    const sr = t.sampleRate;
    const joined = assembleNarration(b.clips, sr, FPS, [0.5, 0]);
    const seconds = joined.sceneSeconds.reduce((s, x) => s + x, 0);
    expect(Math.abs(joined.samples.length / sr - Math.round(seconds * FPS) / FPS)).toBeLessThan(0.1);
    let joinedPeak = 0; for (const v of joined.samples) joinedPeak = Math.max(joinedPeak, Math.abs(v));
    expect(joinedPeak).toBeLessThanOrEqual(1);
  }, 600_000);

  it("a final question mark changes the pitch of the sentence (the one intonation control that reaches the audio)", async () => {
    const t = await load();
    const median = (x: Float32Array) => {
      const sr = t.sampleRate, win = Math.round(0.04 * sr), hop = Math.round(0.01 * sr), lo = Math.floor(sr / 400), hi = Math.floor(sr / 70), f: number[] = [];
      for (let i = 0; i + win < x.length; i += hop) {
        let e = 0; for (let j = 0; j < win; j++) e += x[i + j] ** 2;
        if (Math.sqrt(e / win) < 0.02) continue;
        let best = 0, bk = 0; for (let k = lo; k < hi; k++) { let c = 0; for (let j = 0; j + k < win; j++) c += x[i + j] * x[i + j + k]; if (c > best) { best = c; bk = k; } }
        if (best / e > 0.45) f.push(sr / bk);
      }
      f.sort((a, b) => a - b); return f[Math.floor(f.length / 2)] ?? 0;
    };
    const statement = await t.synthesize("Kamu sudah makan siang hari ini.", "id", 5);
    const question = await t.synthesize("Kamu sudah makan siang hari ini?", "id", 5);
    expect(median(question)).toBeGreaterThan(median(statement) * 1.1); // measured: +5 to +6 semitones; not a claim about how it sounds
  }, 600_000);
});
