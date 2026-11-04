// Honest, rough time estimates for the two heavy jobs on a phone or tablet, and the one sentence that keeps them from being interrupted.
export const KEEP_OPEN = "Jangan tutup layar, ubah tab, atau pindah aplikasi.";

const range = (seconds: number): string => {
  const lo = Math.max(1, Math.round(seconds * 0.7 / 60)), hi = Math.max(lo, Math.ceil(seconds * 1.4 / 60));
  return lo === hi ? `${lo} menit` : `${lo}–${hi} menit`;
};
/** Rendering runs at roughly 4x the video length on a laptop and about twice as slow on a phone or tablet. */
export function renderEstimate(videoSeconds: number, touch: boolean): string { return `sekitar ${range(Math.max(10, videoSeconds * (touch ? 8 : 4)))}`; }
/** Transcribing runs at roughly 0.7x the audio length on a laptop and 1.5x on a phone or tablet; the first run also downloads the model. */
export function transcriptEstimate(audioSeconds: number, touch: boolean, modelCached: boolean | null): string {
  return `sekitar ${range(Math.max(30, audioSeconds * (touch ? 1.5 : 0.7)))}${modelCached === false ? " (ditambah mengunduh model sekali ini)" : ""}`;
}
export const heavyMessage = (what: "render" | "transcript", estimate: string): string => `${what === "render" ? "Merender" : "Membuat transkrip"} ${estimate}. ${KEEP_OPEN}`;
