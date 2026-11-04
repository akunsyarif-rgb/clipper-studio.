// "Mulai Cepat": the three-step way into the studio for someone new (write what you want, look at the plan, press render).
// Only wording and small helpers live here; the plan itself comes from lib/command-agent.ts and lib/cinematic.ts.
import { GENRES, TONES, type CinePlan, type Genre } from "./cinematic";

export type QuickExample = { id: Genre; label: string; hint: string; prompt: string; /** What the plain form is filled with when there is no AI. */ form: { product: string; tagline: string; cta: string } };
/** Four tap-to-fill examples, one per kind of film. */
export const QUICK_EXAMPLES: QuickExample[] = [
  { id: "produk", label: "Produk", hint: "jual atau kenalkan produk", prompt: "Video produk kopi susu 30 detik, suasana hangat, ajak orang memesan sekarang", form: { product: "Kopi Susu Pagi", tagline: "Mulai harimu dengan hangat", cta: "Pesan sekarang" } },
  { id: "cerita", label: "Cerita", hint: "motivasi atau kisah singkat", prompt: "Video cerita motivasi 30 detik tentang memulai dari langkah kecil, suasana tenang", form: { product: "Mulai dari langkah kecil", tagline: "Kamu tidak perlu menunggu siap", cta: "Mulai hari ini" } },
  { id: "edukasi", label: "Edukasi", hint: "jelaskan satu hal", prompt: "Video edukasi 45 detik tentang 3 tips mengatur uang bulanan, gaya santai", form: { product: "3 tips mengatur uang bulanan", tagline: "Uangmu cepat habis?", cta: "Coba mulai minggu ini" } },
  { id: "profil", label: "Profil", hint: "kenalkan brand atau acara", prompt: "Video profil singkat 30 detik untuk toko roti keluarga kami, hangat dan ramah", form: { product: "Toko Roti Keluarga", tagline: "Hangat dari oven kami", cta: "Mampir hari ini" } },
];

const SKIP_KEY = "clipper:ai-skip:v1";
let skippedInMemory = false;
/** The creator chose to carry on without AI (a plain form instead of the command box). Kept on this device (in memory when storage is blocked). */
export function isAiSkipped(): boolean { try { const v = localStorage.getItem(SKIP_KEY); return v === null ? skippedInMemory : v === "1"; } catch { return skippedInMemory; } }
export function setAiSkipped(on: boolean) { skippedInMemory = on; try { if (on) localStorage.setItem(SKIP_KEY, "1"); else localStorage.removeItem(SKIP_KEY); } catch { /* storage blocked */ } }

export type PlanSummary = { headline: string; facts: string[]; scenes: { text: string; seconds: number }[] };
/** The plan in everyday words: how long, how many scenes, what mood, and each line with its length. No jargon (BPM, beat, preset). */
export function summarizePlan(plan: CinePlan, o: { autoPictures: boolean }): PlanSummary {
  const total = plan.scenes.reduce((a, s) => a + s.seconds, 0);
  const tone = TONES.find(t => t.id === plan.brief.tone)?.label ?? "";
  const genre = GENRES[plan.brief.genre ?? "produk"].label;
  return {
    headline: plan.brief.product,
    facts: [
      `${genre}, sekitar ${Math.round(total)} detik, ${plan.scenes.length} adegan`,
      tone ? `Suasana: ${tone}` : "",
      "Musik latar dibuat otomatis di perangkat Anda",
      o.autoPictures ? "Foto atau video latar dicari otomatis untuk tiap adegan; bisa diganti nanti" : "",
    ].filter(Boolean),
    scenes: plan.scenes.map(s => ({ text: s.text, seconds: Math.round(s.seconds * 10) / 10 })),
  };
}
