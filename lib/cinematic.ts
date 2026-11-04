// Cinematic Studio: a creative brief becomes a concept, a beat map and a storyboard (the script, one motion preset per
// scene, and beat-aligned scene lengths) using the studio's own timeline, scenes and Remotion composition. Everything here is
// deterministic and runs on the device; the AI (lib/gemini.ts ask(), free model first) may only polish the wording.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";
import { BPM, type Mood } from "./audio";
import { clamp01, easeOut } from "./brand-motion";
import { easeOutBack } from "./icon-motion";
import { MAX_SCENE_CHARS, MIN_SCENE_SECONDS, splitScript, type PaletteId, type StyleId } from "./script";
import type { TypePackId } from "./fonts";
import type { SfxMode } from "./sfx";
import { hasCtaWords, sceneIsTooFast } from "./prerender";

// ---- motion presets -----------------------------------------------------------------------------------------------

export type FxId = "keynote-reveal" | "morph" | "liquid-glass" | "parallax-push" | "light-sweep" | "blur-rise" | "hold-cut" | "page-push" | "flood";
/** `legacy` presets still render (old sessions and saved presets keep working) but are no longer offered or chosen automatically. */
export const FX: { id: FxId; label: string; description: string; legacy?: boolean }[] = [
  { id: "keynote-reveal", label: "Muncul membal", description: "Membesar dengan pegas dan sedikit melampaui ukuran, lalu tenang; pembuka dan pengungkapan produk." },
  { id: "blur-rise", label: "Naik dari garis", description: "Teks naik keluar dari garis tak terlihat, tanpa blur; kalimat pendukung dan fitur." },
  { id: "page-push", label: "Halaman mendorong", description: "Adegan baru mendorong masuk dari kanan; perpindahan tegas tanpa fade." },
  { id: "flood", label: "Bentuk hitam menyusut", description: "Layar hitam penuh yang menyusut membuka adegan; penanda momen besar." },
  { id: "liquid-glass", label: "Kartu kaca", description: "Kartu kaca tembus pandang yang muncul membal dan melayang di belakang teks; fitur dan bukti." },
  { id: "hold-cut", label: "Tahan & potong", description: "Tanpa animasi masuk, langsung terlihat dan tahan; ketukan tegas atau ajakan penutup." },
  { id: "morph", label: "Morph (lama)", legacy: true, description: "Mulai besar lalu mengecil; kontinuitas tanpa potongan." },
  { id: "parallax-push", label: "Dorongan kamera (lama)", legacy: true, description: "Dorongan kamera lambat dengan geser halus." },
  { id: "light-sweep", label: "Sapuan cahaya (lama)", legacy: true, description: "Sapuan cahaya melintasi teks." },
];
/** What the pickers offer: the current presets, plus the legacy one a scene already uses. */
export const fxChoices = (current?: string) => FX.filter(f => !f.legacy || f.id === current);
export const FX_IDS = FX.map(f => f.id);
export const isFx = (v: unknown): v is FxId => typeof v === "string" && (FX_IDS as string[]).includes(v);

export type FxFrame = { opacity: number; scale: number; x: number; y: number; blur: number; /** 0..1 strength of the glass card. */ glass: number; /** -1 none, else 0..1 position of the light band across the scene. */ sweep: number; /** 1 = everything shown; below 1 the text rises out from behind a fixed line. */ reveal: number; /** 0..1 size of the black shape that floods the frame and contracts (0 = none). */ flood: number };

/** The look of a preset at `frame` of a scene of `d` frames. Pure and frame-exact, so preview and MP4 match. */
export function fxFrame(id: FxId, frame: number, d: number): FxFrame {
  const p = (start: number, len: number) => easeOut(clamp01((frame - start) / Math.max(1, len)));
  const life = clamp01(frame / Math.max(1, d - 1));
  const base: FxFrame = { opacity: 1, scale: 1, x: 0, y: 0, blur: 0, glass: 0, sweep: -1, reveal: 1, flood: 0 };
  switch (id) {
    case "keynote-reveal": { const t = clamp01(frame / 16); return { ...base, opacity: p(0, 4), scale: 0.88 + 0.12 * easeOutBack(t, 1.2) + 0.03 * life }; }
    case "morph": { const a = p(0, 20); return { ...base, scale: 1.35 - 0.35 * a + 0.02 * life }; }
    case "liquid-glass": { const t = clamp01(frame / 16); return { ...base, scale: 0.9 + 0.1 * easeOutBack(t, 1.1), y: Math.sin(frame / 24) * 6, glass: 1 }; }
    case "parallax-push": return { ...base, opacity: p(0, 8), scale: 1 + 0.06 * life, x: -22 * (1 - life) };
    case "light-sweep": return { ...base, opacity: p(0, 8), sweep: frame < 6 || frame > 40 ? -1 : (frame - 6) / 34 };
    case "blur-rise": { const a = p(0, 16); return { ...base, y: 130 * (1 - a), reveal: a >= 1 ? 1 : a }; }
    case "page-push": { const a = p(0, 16); return { ...base, x: 900 * (1 - a) }; }
    case "flood": { const a = p(3, 14); return { ...base, flood: frame < 3 ? 1 : 1 - a }; }
    case "hold-cut": return { ...base, scale: 1 + 0.02 * life };
  }
}

// ---- knowledge handed to the AI and shown to the creator ------------------------------------------------------------------

/** Craft rules (distilled, not copied) used both by the deterministic planner and as the AI's playbook. */
export const CINEMATIC_PLAYBOOK = [
  "Struktur film: hook (satu pernyataan berani) -> masalah atau konflik -> pengungkapan atau titik balik -> 2-4 poin (satu ide per adegan) -> bukti atau hasil -> penutup atau ajakan.",
  "Gaya Keynote: kalimat pendek, satu fokus per layar, banyak ruang kosong, kontras tinggi, gerak halus dan percaya diri; jangan ramai.",
  "Morph: beri kontinuitas antara adegan berurutan dengan mulai dari ukuran/blur adegan sebelumnya, bukan memudar dari hitam.",
  "Liquid glass: kaca tembus pandang hanya untuk fitur dan bukti, maksimal 2 adegan berurutan, teks tetap kontras tinggi.",
  "Tipografi: satu keluarga huruf untuk seluruh film; ukuran besar untuk hook dan pengungkapan, tenang untuk fitur.",
  "Ritme: potong pada hitungan ketukan; adegan 2-4 ketukan; pengungkapan jatuh tepat di ketukan pertama sebuah bar; jeda tenang setelah dua adegan padat.",
  "Suara: musik sinematik rendah di bawah, efek halus pada pengungkapan; tidak ada suara yang menutupi narasi.",
  "Jangan mengulang preset gerak lebih dari dua kali berturut-turut; pengungkapan dan penutup memakai preset yang berbeda.",
] as const;

// ---- brief -> concept ------------------------------------------------------------------------------------------------------

export type Tone = "keynote" | "luxury" | "energetic" | "warm";
export const TONES: { id: Tone; label: string }[] = [
  { id: "keynote", label: "Keynote (bersih, teknologi)" },
  { id: "luxury", label: "Mewah (emas, sinematik)" },
  { id: "energetic", label: "Energik (cepat, tegas)" },
  { id: "warm", label: "Hangat (ramah, gaya hidup)" },
];

/** What the film is about. Same story structure (hook, problem, reveal, points, proof, closing); the labels and the default wording change. */
export type Genre = "produk" | "cerita" | "edukasi" | "profil";
type GenreInfo = {
  label: string; subject: string; tagline: string; problem: string; points: string; proof: string; cta: string; act: Record<Act, string>;
  fallback: (b: { product: string; tagline: string }, en: boolean) => { hook: string; reveal: string; cta: string };
};
export const GENRES: Record<Genre, GenreInfo> = {
  produk: {
    label: "Produk / peluncuran", subject: "Produk", tagline: "Kalimat utama (hook)", problem: "Masalah", points: "Fitur (satu per baris, maks. 4)", proof: "Bukti", cta: "Ajakan",
    act: { hook: "hook", problem: "masalah", reveal: "pengungkapan", feature: "fitur", proof: "bukti", cta: "ajakan" },
    fallback: (b, en) => ({ hook: b.tagline || (en ? `Meet ${b.product}.` : `Kenalkan ${b.product}.`), reveal: b.tagline ? (en ? `Introducing ${b.product}.` : `Inilah ${b.product}.`) : (en ? "Everything, made simple." : "Semuanya jadi lebih sederhana."), cta: en ? `Try ${b.product} today.` : `Coba ${b.product} sekarang.` }),
  },
  cerita: {
    label: "Cerita / motivasi", subject: "Judul atau tema", tagline: "Kalimat pembuka (hook)", problem: "Tantangan atau konflik", points: "Poin cerita (satu per baris, maks. 4)", proof: "Hasil atau pelajaran", cta: "Penutup atau ajakan",
    act: { hook: "pembuka", problem: "konflik", reveal: "titik balik", feature: "isi", proof: "hasil", cta: "penutup" },
    fallback: (b, en) => ({ hook: b.tagline || `${b.product}.`, reveal: en ? "Then everything changed." : "Lalu semuanya berubah.", cta: en ? "Take the first step today." : "Mulai langkah pertamamu hari ini." }),
  },
  edukasi: {
    label: "Edukasi / penjelasan", subject: "Topik", tagline: "Pertanyaan atau pembuka", problem: "Kesalahpahaman umum", points: "Langkah atau poin penting (satu per baris, maks. 4)", proof: "Contoh atau fakta", cta: "Ringkasan atau ajakan",
    act: { hook: "pembuka", problem: "masalah", reveal: "kuncinya", feature: "poin", proof: "contoh", cta: "ringkasan" },
    fallback: (b, en) => ({ hook: b.tagline || (en ? `What is ${b.product}?` : `Apa itu ${b.product}?`), reveal: en ? "Here is the key." : "Inilah kuncinya.", cta: en ? "Try it now, one step at a time." : "Coba sekarang, mulai dari satu langkah." }),
  },
  profil: {
    label: "Brand / acara / profil", subject: "Nama brand atau acara", tagline: "Slogan atau kalimat utama", problem: "Latar atau kebutuhan", points: "Sorotan (satu per baris, maks. 4)", proof: "Capaian atau angka", cta: "Ajakan (daftar, kunjungi, hubungi)",
    act: { hook: "pembuka", problem: "latar", reveal: "perkenalan", feature: "sorotan", proof: "capaian", cta: "ajakan" },
    fallback: (b, en) => ({ hook: b.tagline || (en ? `This is ${b.product}.` : `Inilah ${b.product}.`), reveal: en ? `Welcome to ${b.product}.` : `Selamat datang di ${b.product}.`, cta: en ? `Join ${b.product} today.` : `Bergabunglah dengan ${b.product} sekarang.` }),
  },
};
export const GENRE_IDS = Object.keys(GENRES) as Genre[];
export const isGenre = (v: unknown): v is Genre => typeof v === "string" && (GENRE_IDS as string[]).includes(v);

export type Brief = { genre?: Genre; product: string; tagline: string; problem: string; features: string[]; proof: string; cta: string; tone: Tone; seconds: number; /** Language of the generated lines. */ language?: "id" | "en" };

export const MAX_FEATURES = 4;
export const clean = (s: unknown, max = MAX_SCENE_CHARS) => String(s ?? "").replace(/\s+/g, " ").replace(/[*\n]/g, " ").trim().slice(0, max);

export function normalizeBrief(b: Partial<Brief>): Brief {
  const tone = TONES.some(t => t.id === b.tone) ? b.tone! : "keynote";
  return {
    genre: isGenre(b.genre) ? b.genre : "produk",
    product: clean(b.product, 60), tagline: clean(b.tagline, 100), problem: clean(b.problem, 120),
    features: (b.features ?? []).map(f => clean(f, 100)).filter(Boolean).slice(0, MAX_FEATURES),
    proof: clean(b.proof, 120), cta: clean(b.cta, 80), tone,
    seconds: Math.min(60, Math.max(12, Math.round(Number(b.seconds) || 30))), language: b.language === "en" ? "en" : "id",
  };
}

export type Concept = { style: StyleId; palette: PaletteId; typography: TypePackId; backdrop: "plain" | "mesh"; grain: boolean; sfx: SfxMode; mood: Mood; glass: boolean };
const CONCEPTS: Record<Tone, Concept> = {
  keynote: { style: "cinematic", palette: "obsidian", typography: "modern", backdrop: "mesh", grain: false, sfx: "subtle", mood: "sinematik", glass: true },
  luxury: { style: "cinematic", palette: "gold", typography: "cinema", backdrop: "mesh", grain: true, sfx: "subtle", mood: "sinematik", glass: true },
  energetic: { style: "kinetic", palette: "violet", typography: "impact", backdrop: "plain", grain: false, sfx: "punchy", mood: "semangat", glass: false },
  warm: { style: "hybrid", palette: "sunset", typography: "friendly", backdrop: "mesh", grain: false, sfx: "subtle", mood: "tenang", glass: true },
};
export const conceptFor = (tone: Tone): Concept => CONCEPTS[tone];

// ---- beat map ---------------------------------------------------------------------------------------------------------------------

export type BeatMap = { bpm: number; beat: number; bar: number; beats: number };
export function beatMap(seconds: number, mood: Mood): BeatMap {
  const bpm = BPM[mood], beat = 60 / bpm;
  return { bpm, beat, bar: beat * 4, beats: Math.floor(seconds / beat) };
}
/** Scene lengths in whole beats that fill the video as exactly as possible, each at least the minimum scene length. */
export function beatDurations(weights: number[], total: number, map: BeatMap): number[] {
  const n = weights.length;
  const minBeats = Math.max(1, Math.ceil(MIN_SCENE_SECONDS / map.beat));
  const totalBeats = Math.max(n * minBeats, Math.round(total / map.beat));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const spare = totalBeats - n * minBeats;
  const beats = weights.map(w => minBeats + Math.floor((spare * w) / sum));
  let rest = totalBeats - beats.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % n, rest--) beats[i]++;
  return beats.map(b => b * map.beat);
}

// ---- storyboard -------------------------------------------------------------------------------------------------------------------

export type Act = "hook" | "problem" | "reveal" | "feature" | "proof" | "cta";
export type CineScene = { act: Act; text: string; fx: FxId; seconds: number };
export type CinePlan = { brief: Brief; concept: Concept; map: BeatMap; scenes: CineScene[]; script: string; fxByText: Record<string, FxId> };

const ACT_FX: Record<Act, FxId[]> = {
  hook: ["hold-cut", "keynote-reveal"], problem: ["page-push", "blur-rise"], reveal: ["flood", "keynote-reveal"],
  feature: ["liquid-glass", "blur-rise", "page-push"], proof: ["liquid-glass", "page-push"], cta: ["hold-cut", "keynote-reveal"],
};
const ACT_WEIGHT: Record<Act, number> = { hook: 1, problem: 1.2, reveal: 1.6, feature: 1.3, proof: 1.2, cta: 1.1 };

/** Default wording for an empty field, so a brief with only a product name still makes a complete film. */
function lines(b: Brief): { act: Act; text: string }[] {
  const en = b.language === "en";
  const d = GENRES[b.genre ?? "produk"].fallback(b, en);
  const out: { act: Act; text: string }[] = [];
  out.push({ act: "hook", text: d.hook });
  if (b.problem) out.push({ act: "problem", text: b.problem });
  out.push({ act: "reveal", text: d.reveal });
  for (const f of b.features) out.push({ act: "feature", text: f });
  if (b.proof) out.push({ act: "proof", text: b.proof });
  out.push({ act: "cta", text: b.cta || d.cta });
  return out;
}

/** Picks a preset per scene: the act's preferred ones, never the same twice in a row, never 3 glass scenes in a row, and morph only after another scene. */
export function chooseFx(acts: Act[], glass: boolean): FxId[] {
  const used: FxId[] = [];
  acts.forEach((act, i) => {
    const prev = used[i - 1];
    const options = ACT_FX[act].filter(f => (glass || f !== "liquid-glass") && (i > 0 || f !== "morph") && f !== prev);
    const fallback = ACT_FX[act].filter(f => (i > 0 || f !== "morph") && f !== prev);
    used.push((options[0] ?? fallback[0] ?? "blur-rise") as FxId);
  });
  return used;
}

export function buildCinematic(input: Partial<Brief>, linesOverride?: { act: Act; text: string }[]): CinePlan {
  const brief = normalizeBrief(input);
  const concept = conceptFor(brief.tone);
  const map = beatMap(brief.seconds, concept.mood);
  const base = (linesOverride && linesOverride.length ? linesOverride : lines(brief)).map(l => ({ act: l.act, text: clean(l.text) })).filter(l => l.text);
  // The studio splits a script into sentences and folds one-word fragments into the scene before; do the same here so the plan's
  // scenes are exactly the timeline's scenes.
  const split: { act: Act; text: string }[] = [];
  for (const l of base.flatMap(x => splitScript(x.text).map(t => ({ act: x.act, text: t })))) {
    const prev = split[split.length - 1];
    if (prev && l.text.split(/\s+/).length <= 1 && (prev.text + " " + l.text).length <= MAX_SCENE_CHARS) prev.text += " " + l.text;
    else split.push({ ...l });
  }
  const texts = new Set<string>();
  const unique = split.filter(l => !texts.has(l.text) && texts.add(l.text));
  const fx = chooseFx(unique.map(l => l.act), concept.glass);
  const secs = beatDurations(unique.map(l => ACT_WEIGHT[l.act] * Math.max(3, l.text.split(/\s+/).length)), brief.seconds, map);
  const scenes = unique.map((l, i): CineScene => ({ act: l.act, text: l.text, fx: fx[i], seconds: secs[i] }));
  return { brief, concept, map, scenes, script: scenes.map(s => s.text).join("\n"), fxByText: Object.fromEntries(scenes.map(s => [s.text, s.fx])) };
}

// ---- validation -------------------------------------------------------------------------------------------------------------------

export type CineIssue = { level: "error" | "warning"; message: string };

/** Checks the plan the way a director would: structure, continuity of motion, timing against the beat map, and sound. */
export function validateCinematic(plan: CinePlan, o: { hasMusic?: boolean; hasVoice?: boolean; frames?: number[]; fps?: number } = {}): CineIssue[] {
  const issues: CineIssue[] = [];
  const s = plan.scenes;
  if (s.length < 3) issues.push({ level: "error", message: "Film terlalu pendek: minimal 3 adegan (hook, pengungkapan, ajakan)." });
  if (s[0] && s[0].act !== "hook") issues.push({ level: "error", message: "Adegan pertama harus hook." });
  if (s.length && s[s.length - 1].act !== "cta") issues.push({ level: "error", message: "Film harus ditutup dengan ajakan." });
  if (!s.some(x => x.act === "reveal")) issues.push({ level: "warning", message: "Belum ada adegan pengungkapan produk." });
  s.forEach((x, i) => {
    if (i > 0 && x.fx === s[i - 1].fx && x.fx !== "hold-cut") issues.push({ level: "warning", message: `Adegan ${i} dan ${i + 1} memakai preset gerak yang sama (${x.fx}).` });
    if (x.fx === "morph" && i === 0) issues.push({ level: "error", message: "Morph tidak bisa dipakai di adegan pertama (tidak ada adegan sebelumnya)." });
    if (x.text.length > MAX_SCENE_CHARS) issues.push({ level: "error", message: `Adegan ${i + 1} terlalu panjang.` });
    if (x.seconds + 1e-6 < MIN_SCENE_SECONDS) issues.push({ level: "error", message: `Adegan ${i + 1} lebih pendek dari ${MIN_SCENE_SECONDS} detik.` });
  });
  for (let i = 2; i < s.length; i++) if ([s[i], s[i - 1], s[i - 2]].every(x => x.fx === "liquid-glass")) issues.push({ level: "warning", message: "Tiga adegan kaca berturut-turut terlalu berat; selingi satu preset lain." });
  if (new Set(s.map(x => x.text)).size !== s.length) issues.push({ level: "error", message: "Ada kalimat yang sama di dua adegan." });
  if (plan.concept.glass && plan.concept.palette && ["pearl", "ivory", "mint", "lavender"].includes(plan.concept.palette)) issues.push({ level: "warning", message: "Kartu kaca di palet terang berkontras rendah." });
  if (o.frames) {
    const fps = o.fps ?? 30, beatFrames = plan.map.beat * fps;
    let at = 0;
    o.frames.forEach((f, i) => {
      const off = at % beatFrames, drift = Math.min(off, beatFrames - off);
      if (i > 0 && drift > 0.12 * beatFrames) issues.push({ level: "warning", message: `Potongan ke adegan ${i + 1} meleset ${(drift / fps * 1000).toFixed(0)} ms dari ketukan.` });
      at += f;
    });
  }
  if (!o.hasMusic && !o.hasVoice) issues.push({ level: "warning", message: "Belum ada musik: potongan tidak punya ketukan untuk diikuti. Nyalakan backsound otomatis." });
  // The same quality checks the "Siap render?" list shows: an invitation in the closing line, reading time, and a length that suits a short video.
  const closing = s.at(-1);
  if (closing && closing.act === "cta" && !hasCtaWords(closing.text)) issues.push({ level: "warning", message: "Kalimat penutup belum berupa ajakan yang jelas (pesan, ikuti, coba, kunjungi)." });
  s.forEach((x, i) => { if (sceneIsTooFast(x) && x.seconds + 1e-6 >= MIN_SCENE_SECONDS) issues.push({ level: "warning", message: `Adegan ${i + 1} terlalu cepat untuk dibaca nyaman.` }); });
  const total = s.reduce((a, x) => a + x.seconds, 0);
  if (s.length && (total < 6 || total > 90)) issues.push({ level: "warning", message: `Panjang film ${Math.round(total)} detik; video pendek paling baik 6 sampai 90 detik.` });
  return issues;
}

// ---- optional AI polish (free model first; never changes structure) -----------------------------------------------------------

export function polishPrompt(plan: CinePlan): string {
  const en = plan.brief.language === "en";
  return [
    `Kamu penulis naskah film pendek sinematik gaya Keynote (jenis: ${GENRES[plan.brief.genre ?? "produk"].label}) (${en ? "bahasa Inggris" : "bahasa Indonesia"}). Tulis ulang kalimat tiap adegan agar lebih tajam dan sinematik.`,
    "Aturan: jumlah dan urutan adegan TIDAK berubah; tiap kalimat maks. 12 kata dan 100 karakter; jangan menambah klaim, angka, atau fitur yang tidak ada di brief; jangan memakai tanda bintang.",
    ...CINEMATIC_PLAYBOOK.slice(0, 2).map((r, n) => `${n + 1}. ${r}`),
    `Produk: ${plan.brief.product}`,
    'Balas hanya JSON: {"lines":["...","..."]} dengan jumlah persis sama dengan adegan.',
    "Adegan (JSON):",
    JSON.stringify(plan.scenes.map((s, i) => ({ index: i, act: s.act, text: s.text }))),
  ].join("\n");
}

export function parsePolish(response: unknown, expected: number): string[] {
  const j = answerJson(response) as { lines?: unknown } | unknown[] | null;
  const list = Array.isArray(j) ? j : (j as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(list) || list.length !== expected || list.some(x => typeof x !== "string" || !clean(x))) throw new GeminiError("format", "AI tidak mengembalikan jumlah kalimat yang sama. Coba lagi.");
  return list.map(x => clean(x, 100));
}

/** Rewrites the wording only; the structure, presets and beat-aligned lengths stay exactly the plan's. */
export async function polishCinematic(plan: CinePlan, o: CleanupOptions): Promise<CinePlan> {
  const schema = { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "STRING" } } }, required: ["lines"] };
  const lines = await ask(o, [{ text: polishPrompt(plan) }], schema, json => parsePolish(json, plan.scenes.length));
  const scenes = plan.scenes.map((s, i) => ({ ...s, text: lines[i] }));
  if (new Set(scenes.map(s => s.text)).size !== scenes.length) throw new GeminiError("format", "AI menghasilkan kalimat kembar. Coba lagi.");
  return { ...plan, scenes, script: scenes.map(s => s.text).join("\n"), fxByText: Object.fromEntries(scenes.map(s => [s.text, s.fx])) };
}

// ---- saving and restoring an applied plan ---------------------------------------------------------------------------------------

export type SavedCine = {
  fx: Record<string, string>;
  script: string;
  seconds: number[];
  bpm: number;
  tone: Tone;
  /** Added without changing the session version; absent in existing saved sessions. */
  brief?: Brief;
  /** Act role aligned by index with the script's split scenes; absent in legacy sessions. */
  acts?: Act[];
};
export const saveCine = (c: { plan: CinePlan; fx: Record<string, string> }): SavedCine => ({
  fx: c.fx,
  script: c.plan.script,
  seconds: c.plan.scenes.map(s => s.seconds),
  bpm: c.plan.map.bpm,
  tone: c.plan.brief.tone,
  brief: { ...c.plan.brief, features: [...c.plan.brief.features] },
  acts: c.plan.scenes.map(s => s.act),
});

/** Rebuilds the applied plan from what a session stored; null when it no longer fits its own script. */
export function restoreCine(saved: SavedCine): { plan: CinePlan; fx: Record<string, string> } | null {
  if (!saved || typeof saved.script !== "string" || !Array.isArray(saved.seconds) || !Number.isFinite(saved.bpm) || saved.bpm <= 0 || !TONES.some(t => t.id === saved.tone)) return null;
  const texts = splitScript(saved.script);
  if (texts.length === 0 || texts.length !== saved.seconds.length || (saved.acts && saved.acts.length !== texts.length)) return null;
  if (saved.acts && saved.acts.some(act => !["hook", "problem", "reveal", "feature", "proof", "cta"].includes(act))) return null;
  if (saved.brief && saved.brief.tone !== saved.tone) return null;
  const concept = conceptFor(saved.tone);
  const beat = 60 / saved.bpm;
  const total = saved.seconds.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || saved.seconds.some(n => !Number.isFinite(n) || n <= 0)) return null;
  const brief = normalizeBrief(saved.brief ?? { tone: saved.tone, seconds: total });
  const scenes: CineScene[] = texts.map((text, i) => ({
    act: saved.acts?.[i] ?? (i === 0 ? "hook" : i === texts.length - 1 ? "cta" : "feature"),
    text,
    fx: isFx(saved.fx?.[text]) ? saved.fx[text] as FxId : "blur-rise",
    seconds: saved.seconds[i],
  }));
  const plan: CinePlan = { brief, concept, map: { bpm: saved.bpm, beat, bar: beat * 4, beats: Math.floor(total / beat) }, scenes, script: saved.script, fxByText: Object.fromEntries(scenes.map(x => [x.text, x.fx])) };
  return { plan, fx: plan.fxByText };
}
