// Measurement harness for the Supertonic 3 voices (NOT part of CI): VOICE_AUDIT=1 npx vitest run lib/tts/voice-audit.test.ts
// It synthesises with the real model and prints objective numbers (duration, pitch, loudness, clipping). It cannot tell how
// a voice SOUNDS; every conclusion about quality still needs a person listening.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { MODEL_FILES, parseIndexer, parseVoiceBank, Supertonic, type OrtModule, type TtsConfig } from "./supertonic";

const dir = join(process.cwd(), "public", "supertonic");
const mode = process.env.VOICE_AUDIT ?? "";
const on = (mode === "1" || mode === "contour") && existsSync(join(dir, "manifest.json"));

async function load(): Promise<Supertonic> {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.numThreads = 1;
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { files: Record<string, { size: number; parts: string[] }> };
  const ab = (f: string) => { const b = Buffer.concat(manifest.files[f].parts.map(p => readFileSync(join(dir, p)))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const [durationPredictor, textEncoder, vectorEstimator, vocoder] = await Promise.all(MODEL_FILES.map(f => ort.InferenceSession.create(new Uint8Array(ab(f)))));
  return new Supertonic(ort as unknown as OrtModule, { durationPredictor, textEncoder, vectorEstimator, vocoder }, JSON.parse(new TextDecoder().decode(ab("tts.json"))) as TtsConfig, parseIndexer(ab("unicode_indexer.bin")), parseVoiceBank(ab("voice.bin")));
}

/** Voiced 40 ms frames: [time s, F0 Hz]. */
function f0Track(x: Float32Array, sr: number): [number, number][] {
  const win = Math.round(0.04 * sr), hop = Math.round(0.01 * sr), lo = Math.floor(sr / 400), hi = Math.floor(sr / 70);
  const out: [number, number][] = [];
  for (let i = 0; i + win < x.length; i += hop) {
    let e = 0;
    for (let j = 0; j < win; j++) e += x[i + j] ** 2;
    if (Math.sqrt(e / win) < 0.02) continue;
    let best = 0, bestK = 0;
    for (let k = lo; k < hi; k++) { let c = 0; for (let j = 0; j + k < win; j++) c += x[i + j] * x[i + j + k]; if (c > best) { best = c; bestK = k; } }
    if (best / e > 0.45) out.push([i / sr, sr / bestK]);
  }
  return out;
}
const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)] ?? 0; };
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
const semis = (hz: number, ref: number) => 12 * Math.log2(hz / ref);

function measure(x: Float32Array, sr: number, text: string) {
  const seconds = x.length / sr;
  const track = f0Track(x, sr);
  const f0 = track.map(t => t[1]);
  const med = median(f0);
  const tail = track.filter(t => t[0] >= seconds - 0.45).map(t => t[1]);
  const head = track.filter(t => t[0] <= seconds * 0.5).map(t => t[1]);
  let sum = 0, peak = 0, clip = 0;
  for (const v of x) { sum += v * v; const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.999) clip++; }
  const rms = Math.sqrt(sum / x.length);
  return {
    seconds: +seconds.toFixed(2), charsPerSecond: +(text.length / seconds).toFixed(1), medianF0: Math.round(med),
    rangeSemitones: +(semis(pct(f0, 0.9), Math.max(1, pct(f0, 0.1)))).toFixed(1),
    tailVsMedianSemitones: tail.length ? +semis(median(tail), med).toFixed(2) : null, // + = pitch ends above the utterance's median
    tailVsHeadSemitones: tail.length && head.length ? +semis(median(tail), median(head)).toFixed(2) : null,
    rmsDb: +(20 * Math.log10(Math.max(rms, 1e-9))).toFixed(1), peak: +peak.toFixed(2), clipped: clip,
  };
}

const report: Record<string, unknown> = {};
describe.skipIf(!on || mode !== "contour")("Supertonic 3 pitch contour by final punctuation", () => {
  it("median F0 in five equal time bins", async () => {
    const t = await load();
    const sr = t.sampleRate;
    const bins = (x: Float32Array) => {
      const seconds = x.length / sr, track = f0Track(x, sr), out: (number | null)[] = [];
      for (let b = 0; b < 5; b++) { const part = track.filter(p => p[0] >= (b / 5) * seconds && p[0] < ((b + 1) / 5) * seconds).map(p => p[1]); out.push(part.length >= 2 ? Math.round(median(part)) : null); }
      return { seconds: +seconds.toFixed(2), bins: out };
    };
    const lines = ["Kamu sudah makan siang hari ini", "Kita bisa mulai dari langkah yang paling mudah", "Dia datang ke rumah kemarin sore"];
    const out: Record<string, unknown> = {};
    for (const voice of [0, 5, 8]) for (const line of lines) for (const p of [".", "?"]) out[`v${voice} | ${line} ${p}`] = bins(await t.synthesize(line + p, "id", voice, { steps: 8, speed: 1.05 }));
    writeFileSync(join(process.env.AUDIT_OUT ?? "/tmp", "voice-contour.json"), JSON.stringify(out, null, 1));
  }, 1_800_000);
});

describe.skipIf(!on || mode !== "1")("Supertonic 3 measurements", () => {
  it("speed, final punctuation, and the ten voices", async () => {
    const t = await load();
    const sr = t.sampleRate;
    const steps = 8;
    const run = async (text: string, voice: number, speed = 1.05) => measure(await t.synthesize(text, "id", voice, { steps, speed }), sr, text);

    // 1. Does `speed` change the duration as the app assumes?
    const speedText = "Hari ini kita belajar satu hal sederhana yang bisa mengubah cara kita bekerja.";
    const speeds: Record<string, unknown> = {};
    for (const s of [0.81, 0.9, 1.05, 1.2, 1.32]) speeds[String(s)] = (await run(speedText, 5, s)).seconds;
    report.speedVsSeconds_voice5 = speeds;

    // 2. Does the final punctuation move the pitch at the end (the only intonation control the text offers)?
    const base = "Kamu sudah makan siang hari ini";
    const punct: Record<string, unknown> = {};
    for (const voice of [0, 5]) for (const p of [".", "?", "!", "...", ","]) punct[`voice${voice} "${p}"`] = await run(base + p, voice);
    report.finalPunctuation = punct;

    // 3. The ten voices on the same two Indonesian lines (a calm story line and a cheerful one).
    const story = "Dulu, aku juga pernah merasa tidak bisa. Tapi pelan-pelan, aku belajar satu langkah kecil setiap hari.";
    const cheer = "Selamat pagi semuanya! Hari ini kita punya kabar baik yang seru banget untuk kalian.";
    const voices: Record<string, unknown> = {};
    for (let v = 0; v < 10; v++) voices[`voice${v}`] = { story: await run(story, v), cheer: await run(cheer, v) };
    report.voices = voices;
    writeFileSync(join(process.env.AUDIT_OUT ?? "/tmp", "voice-audit.json"), JSON.stringify(report, null, 1));
  }, 1_800_000);
});
