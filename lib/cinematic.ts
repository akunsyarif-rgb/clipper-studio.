// Cinematic Studio: a creative brief becomes a concept, a beat map and a storyboard (the script, one motion preset per
// scene, and beat-aligned scene lengths) using the studio's own timeline, scenes and Remotion composition. Everything here is
// deterministic and runs on the device; the AI (lib/gemini.ts ask(), free model first) may only polish the wording.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";
import { BPM, type Mood } from "./audio";
import { clamp01, easeOut } from "./brand-motion";
import { MAX_SCENE_CHARS, MIN_SCENE_SECONDS, splitScript, type PaletteId, type StyleId } from "./script";
import type { TypePackId } from "./fonts";
import type { SfxMode } from "./sfx";

// ---- motion presets -----------------------------------------------------------------------------------------------

export type FxId = "keynote-reveal" | "morph" | "liquid-glass" | "parallax-push" | "light-sweep" | "blur-rise" | "hold-cut";
export const FX: { id: FxId; label: string; description: string }[] = [
  { id: "keynote-reveal", label: "Keynote reveal", description: "Muncul membesar dari sedikit kecil dengan blur yang mengering, lalu mendorong pelan; pembuka produk." },
  { id: "morph", label: "Morph", description: "Mulai besar dan buram seolah lanjutan adegan sebelumnya, lalu mengecil dan menajam; kontinuitas tanpa potongan." },
  { id: "liquid-glass", label: "Liquid glass", description: "Kartu kaca tembus pandang yang melayang di belakang teks; fitur dan bukti." },
  { id: "parallax-push", label: "Parallax push", description: "Dorongan kamera yang lambat dengan geser halus; suasana dan cerita." },
  { id: "light-sweep", label: "Light sweep", description: "Sapuan cahaya melintasi teks; momen pengungkapan." },
  { id: "blur-rise", label: "Blur rise", description: "Naik dari bawah sambil menajam; kalimat pendukung." },
  { id: "hold-cut", label: "Hold & cut", description: "Tanpa animasi masuk, langsung terlihat dan tahan; ketukan tegas atau ajakan penutup." },
];
export const FX_IDS = FX.map(f => f.id);
export const isFx = (v: unknown): v is FxId => typeof v === "string" && (FX_IDS as string[]).includes(v);

export type FxFrame = { opacity: number; scale: number; x: number; y: number; blur: number; /** 0..1 strength of the glass card. */ glass: number; /** -1 none, else 0..1 position of the light band across the scene. */ sweep: number };

/** The look of a preset at `frame` of a scene of `d` frames. Pure and frame-exact, so preview and MP4 match. */
export function fxFrame(id: FxId, frame: number, d: number): FxFrame {
  const p = (start: number, len: number) => easeOut(clamp01((frame - start) / Math.max(1, len)));
  const life = clamp01(frame / Math.max(1, d - 1));
  const base: FxFrame = { opacity: 1, scale: 1, x: 0, y: 0, blur: 0, glass: 0, sweep: -1 };
  switch (id) {
    case "keynote-reveal": { const a = p(0, 22); return { ...base, opacity: p(0, 10), scale: 0.9 + 0.1 * a + 0.03 * life, blur: 14 * (1 - a) }; }
    case "morph": { const a = p(0, 20); return { ...base, scale: 1.35 - 0.35 * a + 0.02 * life, blur: 24 * (1 - a) }; }
    case "liquid-glass": { const a = p(0, 16); return { ...base, opacity: p(0, 8), scale: 0.96 + 0.04 * a, y: Math.sin(frame / 24) * 6, glass: a }; }
    case "parallax-push": return { ...base, opacity: p(0, 8), scale: 1 + 0.06 * life, x: -22 * (1 - life) };
    case "light-sweep": return { ...base, opacity: p(0, 8), sweep: frame < 6 || frame > 40 ? -1 : (frame - 6) / 34 };
    case "blur-rise": { const a = p(0, 18); return { ...base, opacity: p(0, 10), y: 60 * (1 - a), blur: 12 * (1 - a) }; }
    case "hold-cut": return { ...base, scale: 1 + 0.02 * life };
  }
}

// ---- knowledge handed to the AI and shown to the creator ------------------------------------------------------------------

/** Craft rules (distilled, not copied) used both by the deterministic planner and as the AI's playbook. */
export const CINEMATIC_PLAYBOOK = [
  "Struktur film peluncuran: hook (satu pernyataan berani) -> masalah -> pengungkapan produk -> 2-4 fitur (satu ide per adegan) -> bukti -> ajakan.",
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

export type Brief = { product: string; tagline: string; problem: string; features: string[]; proof: string; cta: string; tone: Tone; seconds: number; /** Language of the generated lines. */ language?: "id" | "en" };

export const MAX_FEATURES = 4;
export const clean = (s: unknown, max = MAX_SCENE_CHARS) => String(s ?? "").replace(/\s+/g, " ").replace(/[*\n]/g, " ").trim().slice(0, max);

export function normalizeBrief(b: Partial<Brief>): Brief {
  const tone = TONES.some(t => t.id === b.tone) ? b.tone! : "keynote";
  return {
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
  hook: ["hold-cut", "keynote-reveal"], problem: ["parallax-push", "blur-rise"], reveal: ["keynote-reveal", "light-sweep"],
  feature: ["liquid-glass", "blur-rise", "morph"], proof: ["liquid-glass", "parallax-push"], cta: ["hold-cut", "light-sweep"],
};
const ACT_WEIGHT: Record<Act, number> = { hook: 1, problem: 1.2, reveal: 1.6, feature: 1.3, proof: 1.2, cta: 1.1 };

/** Default wording for an empty field, so a brief with only a product name still makes a complete film. */
function lines(b: Brief): { act: Act; text: string }[] {
  const en = b.language === "en";
  const out: { act: Act; text: string }[] = [];
  out.push({ act: "hook", text: b.tagline || (en ? `Meet ${b.product}.` : `Kenalkan ${b.product}.`) });
  if (b.problem) out.push({ act: "problem", text: b.problem });
  out.push({ act: "reveal", text: b.tagline ? (en ? `Introducing ${b.product}.` : `Inilah ${b.product}.`) : (en ? "Everything, made simple." : "Semuanya jadi lebih sederhana.") });
  for (const f of b.features) out.push({ act: "feature", text: f });
  if (b.proof) out.push({ act: "proof", text: b.proof });
  out.push({ act: "cta", text: b.cta || (en ? `Try ${b.product} today.` : `Coba ${b.product} sekarang.`) });
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
export function validateCinematic(plan: CinePlan, o: { hasMusic?: boolean; frames?: number[]; fps?: number } = {}): CineIssue[] {
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
  if (!o.hasMusic) issues.push({ level: "warning", message: "Belum ada musik: potongan tidak punya ketukan untuk diikuti. Nyalakan backsound otomatis." });
  return issues;
}

// ---- optional AI polish (free model first; never changes structure) -----------------------------------------------------------

export function polishPrompt(plan: CinePlan): string {
  const en = plan.brief.language === "en";
  return [
    `Kamu penulis naskah film peluncuran produk gaya Keynote (${en ? "bahasa Inggris" : "bahasa Indonesia"}). Tulis ulang kalimat tiap adegan agar lebih tajam dan sinematik.`,
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

export type SavedCine = { fx: Record<string, string>; script: string; seconds: number[]; bpm: number; tone: Tone };
export const saveCine = (c: { plan: CinePlan; fx: Record<string, string> }): SavedCine => ({ fx: c.fx, script: c.plan.script, seconds: c.plan.scenes.map(s => s.seconds), bpm: c.plan.map.bpm, tone: c.plan.brief.tone });

/** Rebuilds the applied plan from what a session stored; null when it no longer fits its own script. */
export function restoreCine(saved: SavedCine): { plan: CinePlan; fx: Record<string, string> } | null {
  const texts = splitScript(saved.script);
  if (texts.length === 0 || texts.length !== saved.seconds.length) return null;
  const concept = conceptFor(saved.tone);
  const beat = 60 / saved.bpm;
  const scenes: CineScene[] = texts.map((text, i) => ({ act: i === 0 ? "hook" : i === texts.length - 1 ? "cta" : "feature", text, fx: isFx(saved.fx[text]) ? saved.fx[text] as FxId : "blur-rise", seconds: saved.seconds[i] }));
  const total = saved.seconds.reduce((a, b) => a + b, 0);
  const brief = normalizeBrief({ tone: saved.tone, seconds: total });
  const plan: CinePlan = { brief, concept, map: { bpm: saved.bpm, beat, bar: beat * 4, beats: Math.floor(total / beat) }, scenes, script: saved.script, fxByText: Object.fromEntries(scenes.map(x => [x.text, x.fx])) };
  return { plan, fx: plan.fxByText };
}
