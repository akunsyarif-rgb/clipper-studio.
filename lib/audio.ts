// Pure audio helpers shared by the browser, the Remotion composition and unit tests. No Web Audio here.

export type Mood = "tenang" | "semangat" | "sinematik";

export const MOODS: { id: Mood; label: string; hint: string }[] = [
  { id: "tenang", label: "Tenang", hint: "Pad lembut, 76 BPM" },
  { id: "semangat", label: "Semangat", hint: "Arpeggio + ketukan ringan, 104 BPM" },
  { id: "sinematik", label: "Sinematik", hint: "Drone + swell lambat, 60 BPM" },
];

export type Music = {
  /** blob:/http(s):/data: URL in the browser, or a file name inside public/ for CLI renders. */
  src: string;
  /** 0..1 */
  volume: number;
  /** Lower the music while the narration is speaking. */
  duck: boolean;
  /** Uploaded tracks loop when shorter than the video; generated tracks already match it. */
  loop: boolean;
};

export const DEFAULT_MUSIC_VOLUME = 0.35;
/** Music level relative to its base volume while someone is speaking. */
export const DUCK_LEVEL = 0.3;
export const FADE_IN_SECONDS = 1;
export const FADE_OUT_SECONDS = 1.5;
export const MAX_RECORDING_SECONDS = 180;

/** 16-bit PCM WAV. Channels must have equal length. */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = channels.length;
  const length = channels[0]?.length ?? 0;
  const dataBytes = length * numChannels * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + dataBytes, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * numChannels * 2, true); v.setUint16(32, numChannels * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return buf;
}

/** Peak-normalises in place so quiet phone recordings are audible; never amplifies more than maxGain. */
export function normalize(samples: Float32Array, target = 0.9, maxGain = 8): Float32Array {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return samples;
  const gain = Math.min(maxGain, target / peak);
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

/**
 * Speech activity per video frame (0 = silence, 1 = speaking) from mono narration samples.
 * RMS per frame, gated at a level relative to the loudest frame, then smoothed with a fast attack
 * and a slow release so the music does not pump between words.
 */
export function speechEnvelope(samples: Float32Array, sampleRate: number, fps: number): number[] {
  const perFrame = sampleRate / fps;
  const frames = Math.ceil(samples.length / perFrame);
  const rms: number[] = [];
  for (let f = 0; f < frames; f++) {
    const a = Math.floor(f * perFrame), b = Math.min(samples.length, Math.floor((f + 1) * perFrame));
    let sum = 0;
    for (let i = a; i < b; i++) sum += samples[i] * samples[i];
    rms.push(b > a ? Math.sqrt(sum / (b - a)) : 0);
  }
  let loud = 0;
  for (const r of rms) loud = Math.max(loud, r);
  if (loud < 1e-4) return rms.map(() => 0);
  const gate = Math.max(0.02, loud * 0.12);
  const attack = 0.6, release = 0.08;
  let level = 0;
  return rms.map(r => {
    const target = r >= gate ? 1 : 0;
    level += (target - level) * (target > level ? attack : release);
    return Math.round(level * 100) / 100;
  });
}

/** Music gain for a frame: base volume, fade in/out, and ducking under the narration. */
export function musicGain(frame: number, totalFrames: number, fps: number, music: Pick<Music, "volume" | "duck">, speech: number[] | null): number {
  const fadeIn = Math.min(1, frame / Math.max(1, FADE_IN_SECONDS * fps));
  const fadeOut = Math.min(1, (totalFrames - frame) / Math.max(1, FADE_OUT_SECONDS * fps));
  const s = music.duck && speech ? speech[Math.min(speech.length - 1, Math.max(0, frame))] ?? 0 : 0;
  const duck = 1 - (1 - DUCK_LEVEL) * s;
  return Math.max(0, Math.min(1, music.volume * Math.max(0, fadeIn) * Math.max(0, fadeOut) * duck));
}

// ---------- Generated backsound plan (pure; played by lib/backsound.ts with Tone.js) ----------

export type NoteEvent = { time: number; duration: number; notes: string[]; part: "pad" | "bass" | "arp" | "kick" | "hat" | "drone"; velocity: number };

const PROGRESSIONS: Record<Mood, string[][]> = {
  // I – V – vi – IV in C, voiced around middle C
  tenang: [["C4", "E4", "G4", "B4"], ["G3", "B3", "D4", "A4"], ["A3", "C4", "E4", "G4"], ["F3", "A3", "C4", "E4"]],
  // vi – IV – I – V in C (A minor feel), brighter voicing
  semangat: [["A3", "C4", "E4", "A4"], ["F3", "A3", "C4", "F4"], ["C4", "E4", "G4", "C5"], ["G3", "B3", "D4", "G4"]],
  // i – VI – III – VII in D minor, open voicing
  sinematik: [["D3", "A3", "D4", "F4"], ["Bb2", "F3", "Bb3", "D4"], ["F3", "C4", "F4", "A4"], ["C3", "G3", "C4", "E4"]],
};
const BPM: Record<Mood, number> = { tenang: 76, semangat: 104, sinematik: 60 };

/** Small deterministic PRNG so the same seed always gives the same track. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

export function backsoundPlan(mood: Mood, seconds: number, seed = 1): { bpm: number; events: NoteEvent[] } {
  const bpm = BPM[mood];
  const beat = 60 / bpm;
  const bar = beat * 4;
  const chords = PROGRESSIONS[mood];
  const rand = rng(seed);
  const events: NoteEvent[] = [];
  for (let b = 0; b * bar < seconds; b++) {
    const t = b * bar;
    const chord = chords[b % chords.length];
    const len = Math.min(bar, seconds - t);
    if (mood === "sinematik") {
      events.push({ time: t, duration: len, notes: chord.slice(1), part: "pad", velocity: 0.45 });
      events.push({ time: t, duration: len, notes: [chord[0]], part: "drone", velocity: 0.6 });
    } else {
      events.push({ time: t, duration: len * 0.98, notes: chord, part: "pad", velocity: mood === "tenang" ? 0.5 : 0.35 });
      events.push({ time: t, duration: beat * 2, notes: [chord[0].replace(/\d/, d => String(Math.max(1, Number(d) - 1)))], part: "bass", velocity: 0.55 });
    }
    if (mood === "semangat") {
      for (let i = 0; i < 8; i++) {
        const at = t + i * beat / 2;
        if (at >= seconds) break;
        const note = chord[(i + Math.floor(rand() * 2)) % chord.length].replace(/\d/, d => String(Number(d) + 1));
        events.push({ time: at, duration: beat / 2, notes: [note], part: "arp", velocity: 0.25 + rand() * 0.1 });
        if (i % 2 === 0) events.push({ time: at, duration: beat / 2, notes: ["C1"], part: "kick", velocity: i % 4 === 0 ? 0.7 : 0.45 });
        events.push({ time: at + beat / 4, duration: beat / 8, notes: [], part: "hat", velocity: 0.12 });
      }
    }
    if (mood === "tenang" && rand() > 0.35) {
      // A gentle melody note on beat 3 of most bars.
      const at = t + beat * 2;
      if (at < seconds) events.push({ time: at, duration: beat * 2, notes: [chord[2 + Math.floor(rand() * 2)].replace(/\d/, d => String(Number(d) + 1))], part: "arp", velocity: 0.2 });
    }
  }
  return { bpm, events: events.filter(e => e.time < seconds) };
}

export function moodForStyle(style: string): Mood {
  if (style === "cinematic") return "sinematik";
  if (style === "popup" || style === "kinetic") return "semangat";
  return "tenang";
}
