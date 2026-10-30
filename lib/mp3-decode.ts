// Browser-only: the samples of a small MP3 (one part of a long video) for lib/align.ts. Any failure returns null, and the caller
// then keeps the AI's own times.
export async function decodeMono(bytes: Uint8Array): Promise<{ samples: Float32Array; rate: number } | null> {
  try {
    const Ctx = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    try {
      const copy = bytes.slice().buffer;
      const buf: AudioBuffer = await new Promise((resolve, reject) => { const p = ctx.decodeAudioData(copy, resolve, reject); if (p && typeof p.then === "function") p.then(resolve, reject); });
      const out = new Float32Array(buf.length);
      for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += ch[i] / buf.numberOfChannels; }
      return { samples: out, rate: buf.sampleRate };
    } finally { void ctx.close().catch(() => undefined); }
  } catch { return null; }
}
