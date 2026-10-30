import { describe, expect, it } from "vitest";
import {
  analyzeMusic, beatGrid, bestMusicalMoment, DEFAULT_COMEDY, emphasisRanges, energyCurve, energyRises, estimateTempo, findPunchlines, isEdit,
  onsetEnvelope, planComedy, planMusic, sceneCuts, snapToBeat, suggestProfile, toRenderEdits, zoomAt, ENV_HOP, type MusicAnalysis,
} from "./edit-profile";

const RATE = 16000;
/** Real pseudo-random noise (mulberry32): a plain float LCG loses precision in JavaScript and repeats, which looks periodic. */
const rand = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** A click track: short noise bursts every `period` seconds over a quiet tone, with an optional louder second half. */
function clicks(seconds: number, bpm: number, o: { louderAfter?: number; noise?: number } = {}): Float32Array {
  const x = new Float32Array(seconds * RATE), period = 60 / bpm;
  const r = rand(1), rnd = () => r() - 0.5;
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE, k = o.louderAfter !== undefined && t >= o.louderAfter ? 1 : 0.35;
    const since = t % period;
    x[i] = 0.05 * Math.sin(2 * Math.PI * 220 * t) + (since < 0.03 ? k * rnd() * 1.6 * Math.exp(-since * 120) : 0) + (o.noise ?? 0) * rnd();
  }
  return x;
}

describe("music analysis", () => {
  it("reads the tempo and puts beats on the clicks", () => {
    const a = analyzeMusic(clicks(20, 120), RATE);
    expect(a.ok).toBe(true);
    expect(Math.abs(a.bpm - 120)).toBeLessThan(3);
    expect(a.confidence).toBeGreaterThanOrEqual(0.3);
    for (const b of a.beats.slice(2, 10)) expect(Math.min(b % 0.5, 0.5 - (b % 0.5))).toBeLessThan(0.07); // within about two frames at 30 fps
    expect(a.downbeats.length).toBeGreaterThan(5);
  });
  it("works at another tempo", () => {
    expect(Math.abs(analyzeMusic(clicks(20, 96), RATE).bpm - 96)).toBeLessThan(3);
  });
  it("falls back safely on silence, noise and very short audio", () => {
    const silent = analyzeMusic(new Float32Array(10 * RATE), RATE);
    expect(silent.ok).toBe(false); expect(silent.reason).toMatch(/senyap/); expect(silent.beats).toEqual([]);
    const short = analyzeMusic(clicks(3, 120), RATE);
    expect(short.ok).toBe(false); expect(short.reason).toMatch(/terlalu pendek/);
    for (const seed of [7, 99, 1234, 5]) {
      const r = rand(seed), noise = Float32Array.from({ length: 12 * RATE }, () => (r() - 0.5) * 0.4);
      const n = analyzeMusic(noise, RATE);
      expect(n.ok).toBe(false); expect(n.reason).toMatch(/tidak terbaca/);
      expect(planMusic(n, 0, 12)).toEqual([]);
    }
    // Speech-like: syllables at irregular intervals.
    const r = rand(5), speech = new Float32Array(15 * RATE);
    let next = 0;
    for (let i = 0; i < speech.length; i++) { const t = i / RATE; if (t > next) next = t + 0.12 + r() * 0.35; speech[i] = 0.3 * Math.sin(2 * Math.PI * 180 * t) * Math.min(1, (next - t) * 20); }
    expect(analyzeMusic(speech, RATE).ok).toBe(false);
  });
  it("shifts results onto the file timeline", () => {
    const a = analyzeMusic(clicks(12, 120), RATE, 30);
    expect(a.beats[0]).toBeGreaterThanOrEqual(30);
    expect(a.energy[0].t).toBe(30);
  });
  it("finds a clear rise in loudness", () => {
    const curve = energyCurve(clicks(20, 120, { louderAfter: 10 }).map((v, i) => (i / RATE >= 10 ? v * 4 : v)), RATE);
    const rises = energyRises(curve);
    expect(rises.length).toBe(1);
    expect(Math.abs(rises[0] - 10)).toBeLessThan(1.1);
  });
  it("tempo of nothing is nothing", () => {
    expect(estimateTempo(new Float32Array(100), RATE / ENV_HOP).bpm).toBe(0);
    expect(beatGrid(onsetEnvelope(new Float32Array(1000)), RATE / ENV_HOP, 0)).toEqual({ beats: [], downbeats: [] });
  });
});

const fake = (o: Partial<MusicAnalysis> = {}): MusicAnalysis => ({
  ok: true, bpm: 120, confidence: 0.8,
  beats: Array.from({ length: 80 }, (_, i) => i * 0.5), downbeats: Array.from({ length: 20 }, (_, i) => i * 2),
  energy: Array.from({ length: 80 }, (_, i) => ({ t: i * 0.5, db: i * 0.5 >= 20 ? -10 : -25 })), rises: [20.2], ...o,
});

describe("music plan", () => {
  it("pulses on downbeats of the loud part only, at most every two bars, and flashes on the rise snapped to a downbeat", () => {
    const e = planMusic(fake(), 0, 40);
    const pulses = e.filter(x => x.kind === "pulse");
    expect(pulses.length).toBeGreaterThan(0);
    for (const p of pulses) { expect(p.at).toBeGreaterThanOrEqual(20); expect(p.at % 2).toBe(0); expect(p.scale).toBe(1.04); }
    for (let i = 1; i < pulses.length; i++) expect(pulses[i].at - pulses[i - 1].at).toBeGreaterThanOrEqual(4 - 0.06);
    expect(e.filter(x => x.kind === "flash").map(x => x.at)).toEqual([20]);
  });
  it("keeps away from cuts already in the footage, respects options and the trim", () => {
    const withCut = planMusic(fake(), 0, 40, { pulse: "strong", flash: false }, [24.1]);
    expect(withCut.some(x => x.at === 24)).toBe(false);
    expect(withCut.every(x => x.kind === "pulse" && x.scale === 1.08)).toBe(true);
    expect(planMusic(fake(), 0, 40, { pulse: "off", flash: false })).toEqual([]);
    expect(planMusic(fake(), 30, 40).every(x => x.at >= 30.5 && x.at <= 39.5)).toBe(true);
  });
  it("snaps to the nearest beat and picks the loudest moment starting on a downbeat", () => {
    expect(snapToBeat(3.1, [2.5, 3, 3.5])).toBe(3);
    expect(snapToBeat(10, [2.5, 3])).toBe(10);
    expect(bestMusicalMoment(fake(), 10, 0, 40)).toEqual({ start: 20, end: 30 });
    expect(bestMusicalMoment(fake(), 50, 0, 40)).toBeNull();
  });
});

describe("scene changes", () => {
  it("finds a hard cut, not ordinary motion", () => {
    const frame = (v: number, wobble = 0) => Uint8ClampedArray.from({ length: 144 }, (_, i) => v + ((i + wobble) % 5));
    const frames = [frame(40), frame(40, 1), frame(41, 2), frame(200), frame(201, 1), frame(200, 2)];
    expect(sceneCuts(frames, [0, 0.5, 1, 1.5, 2, 2.5])).toEqual([1.5]);
  });
});

/** Word list from "text@start-end" tokens. */
const W = (spec: string) => spec.split(" ").map(tok => { const [text, time] = tok.split("@"); const [s, e] = time.split("-").map(Number); return { text, start: s, end: e }; });

describe("comedy analysis", () => {
  const words = W("Kamu@0-0.3 tahu@0.35-0.6 kenapa@0.65-1 dia@1.05-1.3 telat?@1.35-1.8 Ternyata@2.1-2.6 dia@2.65-2.9 nunggu@2.95-3.3 ojek@3.35-3.7 lewat.@3.75-4.2 "
    + "Terus@6.2-6.5 kita@6.55-6.8 lanjut@6.85-7.2 rapat@7.25-7.6 biasa@7.65-8 saja@8.05-8.4 tanpa@8.45-8.8 masalah@8.85-9.3 apa-apa@9.35-9.8 lagi.@9.85-10.2 Oke@10.4-10.7");
  it("finds the punchline after a pause, with its reasons, and never the setup", () => {
    const p = findPunchlines(words);
    expect(p).toHaveLength(1);
    expect(p[0].text).toMatch(/^Ternyata dia nunggu ojek lewat\./);
    expect(p[0].pause).toBeCloseTo(2, 5);
    expect(p[0].why.join(" ")).toMatch(/pembalik/);
    expect(p[0].why.join(" ")).toMatch(/pertanyaan/);
  });
  it("hears laughter in the pause when loudness is known", () => {
    const energy = Array.from({ length: 24 }, (_, i) => ({ t: i * 0.5, db: i * 0.5 >= 4.5 && i * 0.5 < 6 ? -8 : -30 }));
    const p = findPunchlines(words, { energy });
    expect(p[0].reaction).toBe(true);
    expect(p[0].why.join(" ")).toMatch(/reaksi/);
  });
  it("needs real pauses: talk without pauses has no punchlines; too few words is nothing", () => {
    const flat = W("satu@0-0.3 dua@0.35-0.6 tiga@0.65-1 empat@1.05-1.3 lima@1.35-1.7 enam@1.75-2");
    expect(findPunchlines(flat)).toEqual([]);
    expect(findPunchlines(W("a@0-1 b@3-4"))).toEqual([]);
  });
  it("plans a punch-in from the last word through the pause, never shortening it, with optional freeze and replay", () => {
    const p = findPunchlines(words);
    const e = planComedy(p, 0, 12, DEFAULT_COMEDY, words);
    expect(e.map(x => x.kind)).toEqual(["punch"]);
    expect(e[0].at).toBe(3.75);
    expect(e[0].at + e[0].duration).toBeCloseTo(4.2 + 2, 5);
    const all = planComedy(p, 0, 12, { punch: true, freeze: true, replay: true }, words);
    expect(all.map(x => x.kind)).toEqual(["punch", "freeze", "replay"]);
    const replay = all.find(x => x.kind === "replay")!;
    expect(replay.at).toBeCloseTo(4.4, 5); expect(replay.from! + replay.duration).toBeCloseTo(4.2, 5);
    expect(planComedy(p, 5, 12, DEFAULT_COMEDY, words)).toEqual([]);
    expect(emphasisRanges(p)).toEqual([{ from: 2.1, to: 4.2 }]);
  });
});

describe("edits on the output and safety", () => {
  const edits = [
    { id: "a", kind: "punch" as const, at: 13, duration: 2, scale: 1.2, reason: "", on: true },
    { id: "b", kind: "pulse" as const, at: 20, duration: 0.35, scale: 1.04, reason: "", on: false },
    { id: "c", kind: "freeze" as const, at: 2, duration: 0.5, reason: "", on: true },
    { id: "d", kind: "replay" as const, at: 14.5, duration: 1, from: 12, reason: "", on: true },
  ];
  it("keeps only switched-on edits inside the trim, on the output timeline", () => {
    const r = toRenderEdits(edits, 10, 10);
    expect(r).toEqual([{ kind: "punch", at: 3, duration: 2, scale: 1.2 }, { kind: "replay", at: 4.5, duration: 1, from: 12 }]);
    expect(toRenderEdits(edits, 10, 3.5)[0].duration).toBeCloseTo(0.5, 5);
  });
  it("zooms in and out smoothly and never below 1", () => {
    const r = toRenderEdits(edits, 10, 10);
    expect(zoomAt(r, 2.9)).toBe(1);
    expect(zoomAt(r, 3.05)).toBeGreaterThan(1); expect(zoomAt(r, 3.05)).toBeLessThan(1.2);
    expect(zoomAt(r, 4)).toBeCloseTo(1.2, 5);
    expect(zoomAt(r, 4.99)).toBeLessThan(1.2);
    expect(zoomAt(r, 6)).toBe(1);
    const pulse = [{ kind: "pulse" as const, at: 1, duration: 0.35, scale: 1.04 }];
    expect(zoomAt(pulse, 1.04)).toBeCloseTo(1.04, 3);
    expect(zoomAt(pulse, 1.34)).toBeLessThan(1.01);
  });
  it("accepts only sane stored edits", () => {
    expect(isEdit(edits[0])).toBe(true);
    expect(isEdit({ ...edits[0], kind: "explode" })).toBe(false);
    expect(isEdit({ ...edits[0], scale: 3 })).toBe(false);
    expect(isEdit({ ...edits[0], duration: 0 })).toBe(false);
  });
  it("suggests a profile only on clear signals", () => {
    expect(suggestProfile({ beatConfidence: 0.7, wordsPerMinute: 20 })).toBe("music");
    expect(suggestProfile({ punchlines: 3, wordsPerMinute: 140 })).toBe("comedy");
    expect(suggestProfile({ beatConfidence: 0.2, wordsPerMinute: 140, punchlines: 0 })).toBeNull();
  });
});
