// "Siap render?": the checks a beginner would never think of, shown before the long render starts. Pure, so it is easy to test.
// Warnings never block a render; they say what is missing and, where there is one, offer a one-tap fix.
import { MIN_SCENE_SECONDS, readingSeconds } from "./script";

export type FixId = "music" | "duration" | "cta" | "voice";
export type Check = { id: "voice" | "sound" | "scene-length" | "cta" | "length"; level: "ok" | "warn"; title: string; detail: string; fix?: { id: FixId; label: string } };
export type PrerenderInput = {
  hasMusic: boolean;
  /** A voice-over (own recording or automatic voice) is in the video. */
  hasVoice: boolean;
  /** The video chosen as the base brings its own sound. */
  hasSourceAudio: boolean;
  scenes: { text: string; seconds: number }[];
  totalSeconds: number;
  /** The length can be changed by the "Durasi" setting (a fixed target); false when scenes follow a beat plan, a narration or a transcript. */
  durationAdjustable: boolean;
  /** The automatic voice is chosen but not made yet (or no longer matches the script): the render cannot start until it is made. */
  voicePending?: boolean;
  /** The film was built by the Cinematic Studio, which always closes with a call to action. */
  closesWithCta: boolean;
};

/** Words that make a closing line an invitation to do something (Indonesian and English). */
const CTA_WORDS = /\b(pesan|beli|order|klik|tap|ketuk|follow|ikuti|subscribe|langganan|kunjungi|visit|coba|cobain|try|daftar|join|gabung|hubungi|chat|dm|simpan|bagikan|share|komen|comment|link|bio|cek|check|mulai|start|ambil|dapatkan|get|download|unduh|tonton|watch|temukan|mampir|cicipi|segera|sekarang|hari ini|today|now)\b/i;
export const hasCtaWords = (text: string): boolean => CTA_WORDS.test(text);

/** Under this a scene flashes past; the automatic duration never goes below it either. */
export const COMFORT_SCENE_SECONDS = 1.6;
const SHORT_VIDEO_MIN = 6, SHORT_VIDEO_MAX = 90;

/** True when a scene is shorter than it takes to read it, or than the comfortable minimum. */
export const sceneIsTooFast = (s: { text: string; seconds: number }): boolean => s.seconds + 1e-6 < COMFORT_SCENE_SECONDS || s.seconds < 0.7 * readingSeconds(s.text);

export function prerenderChecks(i: PrerenderInput): Check[] {
  const out: Check[] = [];
  if (i.voicePending) out.push({ id: "voice", level: "warn", title: "Suara otomatis belum dibuat", detail: "Render baru bisa dimulai setelah suara dari naskah dibuat (cukup sekali; hanya kalimat yang berubah dibuat ulang).", fix: { id: "voice", label: "Buat suara otomatis" } });
  const sound = i.hasMusic || i.hasVoice || i.hasSourceAudio;
  out.push(sound
    ? { id: "sound", level: "ok", title: "Suara atau musik", detail: i.hasVoice ? "Ada suara narasi." : i.hasMusic ? "Ada musik latar." : "Memakai suara dari video sumber." }
    : { id: "sound", level: "warn", title: "Belum ada suara atau musik", detail: "Video tanpa suara terasa sepi dan cepat dilewati penonton.", fix: { id: "music", label: "Tambah musik default" } });

  const fast = i.scenes.map((s, n) => ({ n, s })).filter(x => sceneIsTooFast(x.s));
  out.push(fast.length === 0
    ? { id: "scene-length", level: "ok", title: "Lama tiap adegan", detail: "Semua adegan cukup lama untuk dibaca." }
    : { id: "scene-length", level: "warn", title: `${fast.length} adegan terlalu cepat`, detail: `Adegan ${fast.slice(0, 4).map(x => x.n + 1).join(", ")}${fast.length > 4 ? ", …" : ""} lebih singkat dari waktu baca yang nyaman (minimal ${COMFORT_SCENE_SECONDS} detik).`, ...(i.durationAdjustable ? { fix: { id: "duration" as const, label: "Sesuaikan durasi minimal" } } : {}) });

  const last = i.scenes.at(-1);
  const cta = i.closesWithCta || (!!last && hasCtaWords(last.text));
  out.push(cta
    ? { id: "cta", level: "ok", title: "Ajakan di akhir", detail: "Video ditutup dengan ajakan." }
    : { id: "cta", level: "warn", title: "Belum ada ajakan di akhir", detail: "Beri tahu penonton apa yang harus dilakukan setelah menonton (pesan, ikuti, coba).", fix: { id: "cta", label: "Tambah ajakan di akhir" } });

  const t = i.totalSeconds;
  out.push(t >= SHORT_VIDEO_MIN && t <= SHORT_VIDEO_MAX
    ? { id: "length", level: "ok", title: "Panjang video", detail: `${Math.round(t)} detik, pas untuk video pendek.` }
    : { id: "length", level: "warn", title: t < SHORT_VIDEO_MIN ? "Video sangat singkat" : "Video cukup panjang", detail: t < SHORT_VIDEO_MIN ? `${Math.round(t)} detik: tambah satu dua kalimat agar pesannya sempat dipahami.` : `${Math.round(t)} detik: video pendek paling baik di bawah ${SHORT_VIDEO_MAX} detik. Ringkas naskahnya bila perlu.` });
  return out;
}

export const MIN_SCENE_FOR_FIX = MIN_SCENE_SECONDS;
