// Browser-only backsound generator: renders the plan from lib/audio.ts offline with Tone.js to a WAV file.
// The music is synthesised on the device, so there is nothing to license and nothing is downloaded.
import { backsoundPlan, encodeWav, type Mood } from "./audio";

const SAMPLE_RATE = 44100;

export async function generateBacksound(mood: Mood, seconds: number, seed = 1): Promise<File> {
  if (!(seconds > 0)) throw new Error("Durasi backsound tidak valid.");
  const Tone = await import("tone");
  const plan = backsoundPlan(mood, seconds, seed);
  const tail = 0.05;
  const buffer = await Tone.Offline(async () => {
    const reverb = new Tone.Reverb({ decay: mood === "sinematik" ? 7 : mood === "tenang" ? 4 : 2.5, wet: mood === "semangat" ? 0.22 : 0.4 });
    await reverb.generate();
    const master = new Tone.Gain(0.8).toDestination();
    reverb.connect(master);

    const lowpass = new Tone.Filter(mood === "sinematik" ? 900 : 2200, "lowpass").connect(reverb);
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: mood === "semangat" ? "triangle" : "sine" },
      envelope: { attack: mood === "semangat" ? 0.3 : 1.4, decay: 0.6, sustain: 0.7, release: 2.2 },
    }).connect(lowpass);
    pad.volume.value = -16;
    const bass = new Tone.MonoSynth({ oscillator: { type: "sine" }, envelope: { attack: 0.05, decay: 0.4, sustain: 0.5, release: 1 }, filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.4, baseFrequency: 120, octaves: 2 } }).connect(master);
    bass.volume.value = -14;
    const arp = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.1, release: 0.6 } }).connect(reverb);
    arp.volume.value = -18;
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 6, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 } }).connect(master);
    kick.volume.value = -12;
    const hat = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).connect(new Tone.Filter(7000, "highpass").connect(master));
    hat.volume.value = -30;
    const drone = new Tone.FMSynth({ harmonicity: 0.5, modulationIndex: 2, envelope: { attack: 2.5, decay: 1, sustain: 0.8, release: 3 } }).connect(lowpass);
    drone.volume.value = -20;

    for (const e of plan.events) {
      const dur = Math.max(0.05, e.duration);
      switch (e.part) {
        case "pad": pad.triggerAttackRelease(e.notes, dur, e.time, e.velocity); break;
        case "bass": bass.triggerAttackRelease(e.notes[0], dur, e.time, e.velocity); break;
        case "arp": arp.triggerAttackRelease(e.notes[0], dur, e.time, e.velocity); break;
        case "kick": kick.triggerAttackRelease(e.notes[0], dur, e.time, e.velocity); break;
        case "hat": hat.triggerAttackRelease(dur, e.time, e.velocity); break;
        case "drone": drone.triggerAttackRelease(e.notes[0], dur, e.time, e.velocity); break;
      }
    }
  }, seconds + tail, 2, SAMPLE_RATE);

  const audio = buffer.get();
  if (!audio) throw new Error("Backsound kosong.");
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c).slice(0, Math.round(seconds * SAMPLE_RATE)));
  // Normalise both channels with one shared gain so the stereo image is preserved.
  let peak = 0;
  for (const ch of channels) for (const v of ch) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) throw new Error("Backsound tidak menghasilkan suara.");
  const gain = 0.85 / peak;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
  return new File([encodeWav(channels, SAMPLE_RATE)], `backsound-${mood}-${Math.round(seconds)}s.wav`, { type: "audio/wav" });
}
