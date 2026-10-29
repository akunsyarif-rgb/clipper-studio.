// "Mulai dari tren": before any video exists, the creator names a platform, a niche and the trend or season they saw, and the AI
// proposes a few angles, each with a title, a hook and a ready script. Pure: the model call is lib/gemini.ts ask().
// The AI knows no live trends. The creator's own trend text is the only trend input; ideas may refer to it, never claim more.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";
import { SEO_PLATFORMS, type SeoPlatform } from "./seo";

export type TrendGoal = "edukasi" | "hiburan" | "opini";
export const TREND_GOALS: { id: TrendGoal; label: string; hint: string }[] = [
  { id: "edukasi", label: "Edukasi", hint: "menjelaskan sesuatu yang berguna, langkah atau tips" },
  { id: "hiburan", label: "Hiburan", hint: "ringan, relatable, ada kejutan atau punchline" },
  { id: "opini", label: "Opini", hint: "sudut pandang tegas yang mengundang diskusi" },
];

/** Seasons and recurring moments the creator can add with one tap (their own text still decides). */
export const TREND_CHIPS = ["Ramadan", "Lebaran", "Gajian akhir bulan", "Tahun ajaran baru", "Harbolnas 11.11", "Musim hujan", "Liburan sekolah", "Tahun baru"];

export type TrendBrief = { platform: SeoPlatform; niche: string; audience: string; trend: string; goal: TrendGoal };
export const EMPTY_TREND: TrendBrief = { platform: "tiktok", niche: "", audience: "", trend: "", goal: "edukasi" };

export type TrendIdea = { angle: string; title: string; hook: string; whyFits: string; lines: string[] };

export function trendProblem(b: TrendBrief): string | null {
  if (b.niche.trim().length < 3) return "Tulis niche atau topik Anda (minimal 3 huruf).";
  if (b.trend.trim().length < 3) return "Tulis tren, musim, atau hal yang sedang ramai yang Anda lihat. AI tidak punya data tren langsung.";
  return null;
}

export function trendPrompt(b: TrendBrief, feedback?: string): string {
  const platform = SEO_PLATFORMS.find(p => p.id === b.platform)?.label ?? b.platform;
  const goal = TREND_GOALS.find(g => g.id === b.goal);
  const facts = { platform, niche: b.niche.trim(), ...(b.audience.trim() ? { target_penonton: b.audience.trim() } : {}), tren_dari_pembuat: b.trend.trim(), tujuan: goal ? `${goal.label}: ${goal.hint}` : b.goal };
  return [
    "Kamu penulis ide dan naskah video pendek vertikal dalam bahasa Indonesia. Pembuat video menemukan tren di bawah dan ingin membuat konten dari tren itu.",
    "",
    "Aturan keras:",
    "1. Kamu TIDAK punya data tren langsung. Anggap tren hanya apa yang tertulis di TREN_DARI_PEMBUAT. Jangan menyebut sesuatu \"sedang viral\", \"trending\", atau menyebut angka tayangan, nama akun, lagu, berita, atau statistik yang tidak tertulis di data.",
    "2. Beri 3 ide dengan sudut yang BERBEDA (bukan variasi kalimat yang sama). Setiap ide menghubungkan tren itu dengan niche dengan cara yang masuk akal bagi penonton.",
    "3. Tiap ide berisi: angle (nama sudut, maks. 5 kata), title (judul pendek maks. 40 karakter, tanpa klaim berlebihan), hook (kalimat pembuka maks. 12 kata yang memancing berhenti menggulir), whyFits (satu kalimat: mengapa cocok dengan tren yang ditulis pembuat), lines (naskah 6 sampai 9 kalimat, satu kalimat per baris, maks. 110 karakter, bahasa lisan; kalimat pertama = hook; kalimat terakhir = ajakan simpan, bagikan, atau komentar).",
    "4. Jangan klaim kesehatan, keuangan, atau hasil pasti; jangan \"terbaik/nomor 1/dijamin\". Jika butuh fakta yang tidak kamu yakini, tulis tips umum, bukan angka. Boleh menandai satu kata kunci per kalimat dengan *tanda bintang*.",
    feedback?.trim() ? `\nMasukan pembuat video untuk ide sebelumnya (utamakan, tanpa melanggar aturan): "${feedback.replace(/\s+/g, " ").trim().slice(0, 300)}"` : "",
    "",
    "Balas hanya JSON: {\"ideas\":[{\"angle\":\"...\",\"title\":\"...\",\"hook\":\"...\",\"whyFits\":\"...\",\"lines\":[\"kalimat 1\",\"kalimat 2\"]}]}.",
    "",
    "DATA (JSON):",
    JSON.stringify(facts),
  ].filter(l => l !== "").join("\n");
}

const clean = (s: unknown, max: number) => String(s ?? "").replace(/\*\*/g, "").replace(/^\s*(?:[-•·]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim().slice(0, max);

/** Keeps only ideas that have a usable script; the rest are dropped, and at least one must remain. */
export function parseTrend(response: unknown): TrendIdea[] {
  const json = answerJson(response) as { ideas?: unknown } | unknown[] | null;
  const raw = Array.isArray(json) ? json : (json as { ideas?: unknown } | null)?.ideas;
  if (!Array.isArray(raw)) throw new GeminiError("format", "Jawaban AI tidak berisi ide. Coba lagi.");
  const ideas: TrendIdea[] = [];
  for (const item of raw.slice(0, 5)) {
    const o = item as { angle?: unknown; title?: unknown; hook?: unknown; whyFits?: unknown; lines?: unknown } | null;
    if (!o || typeof o !== "object" || !Array.isArray(o.lines)) continue;
    const lines = o.lines.map(l => clean(l, 200)).filter(Boolean).slice(0, 14);
    if (lines.length < 3) continue;
    ideas.push({ angle: clean(o.angle, 40) || `Ide ${ideas.length + 1}`, title: clean(o.title, 60), hook: clean(o.hook, 120) || lines[0], whyFits: clean(o.whyFits, 240), lines });
  }
  if (!ideas.length) throw new GeminiError("format", "AI tidak memberi ide yang bisa dipakai. Coba lagi.");
  return ideas;
}

export async function writeTrendIdeas(b: TrendBrief, o: CleanupOptions, feedback?: string): Promise<TrendIdea[]> {
  const problem = trendProblem(b);
  if (problem) throw new GeminiError("format", problem);
  const idea = { type: "OBJECT", properties: { angle: { type: "STRING" }, title: { type: "STRING" }, hook: { type: "STRING" }, whyFits: { type: "STRING" }, lines: { type: "ARRAY", items: { type: "STRING" } } }, required: ["angle", "title", "hook", "whyFits", "lines"] };
  const schema = { type: "OBJECT", properties: { ideas: { type: "ARRAY", items: idea } }, required: ["ideas"] };
  return ask(o, [{ text: trendPrompt(b, feedback) }], schema, parseTrend);
}

/** Adds a chip's text to the trend note without duplicating it. */
export function addTrendChip(current: string, chip: string): string {
  const parts = current.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.some(p => p.toLowerCase() === chip.toLowerCase())) return current;
  return [...parts, chip].join(", ").slice(0, 300);
}
