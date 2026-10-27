// Which sentences deserve an animation, and which should be left to the speaker. Animating everything is noise: the
// eye follows one thing at a time. Each sentence gets a score from what it says (an amount of money, a popular name,
// a call to action, a comparison, the idea the whole script is about), the reasons are kept so they can be shown, and
// only the strongest are chosen, spaced apart, within a limit on how much of the video they may cover.
// A transparent heuristic, not a model; the creator can always override a scene.
import { stripMarks, wordKey } from "./text";
import { matchConcepts, type Cut, type SceneVisual } from "./visuals";

export type Density = "sparse" | "balanced" | "rich";

export const DENSITIES: { id: Density; label: string; hint: string }[] = [
  { id: "sparse", label: "Sedikit", hint: "hanya momen terpenting: angka uang, istilah populer, penekanan manual" },
  { id: "balanced", label: "Seimbang", hint: "momen penting dengan jeda yang lega" },
  { id: "rich", label: "Banyak", hint: "juga pertanyaan dan konsep umum" },
];

const SETTINGS: Record<Density, { threshold: number; minGapSeconds: number; maxCoverage: number }> = {
  sparse: { threshold: 0.8, minGapSeconds: 8, maxCoverage: 0.18 },
  balanced: { threshold: 0.6, minGapSeconds: 5, maxCoverage: 0.3 },
  rich: { threshold: 0.3, minGapSeconds: 3, maxCoverage: 0.45 },
};

/** How long an animation stays (see MAX_OVERLAY_FRAMES), used to budget how much of the video it may cover. */
const ANIMATION_SECONDS = 4;

export type SceneInput = { text: string; visual: SceneVisual; seconds: number };
export type Judgement = { score: number; reasons: string[] };

/** Spoken-language filler: a sentence made mostly of these has little to show. */
const FILLER = new Set([
  "gue", "gua", "lu", "lo", "loe", "ya", "yaa", "yah", "kok", "sih", "deh", "dong", "nih", "tuh", "gitu", "kan", "loh", "lah", "aja", "doang", "eh", "hmm", "ga", "gak", "nggak", "tau", "kayak", "emang",
  "um", "uh", "like", "you", "know", "well", "so", "okay", "oke", "i", "mean", "just", "kinda", "actually", "basically",
]);
const MONEY = /\b(rp|rupiah|dolar|dollars?|usd|euro|juta|jutaan|ribu|miliar|milyar|triliun|jt|rb)\b|[$€£]/i;

const isMoney = (v: SceneVisual, text: string) => !!v.number && (v.number.prefix !== "" || MONEY.test(text));
const NUMBER_WORD = "satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|seribu|one|two|three|four|five|six|seven|eight|nine|ten";
const UNIT = "juta|jutaan|ribu|ribuan|miliar|milyar|triliun|jt|rb|persen|percent|bulan|tahun|hari|minggu|jam|menit|dolar|dollars?|months?|years?|days?|weeks?|hours?|million|thousand|billion";
/** The amounts a sentence states ("100 juta", "tiga bulan"), normalised so the same amount compares equal. */
export function amountsIn(text: string): string[] {
  const plain = stripMarks(text).toLowerCase();
  const out = new Set<string>();
  for (const m of plain.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)*|${NUMBER_WORD})\\s*(%|${UNIT})?`, "g"))) {
    // A bare number word ("satu", "lima") is an amount only with a unit after it.
    if (/^[a-z]/.test(m[1]) && !m[2]) continue;
    out.add(`${m[1]}${m[2] ? " " + m[2].replace(/(juta|ribu)an$/, "$1") : ""}`);
  }
  return [...out];
}
const wordsOf = (text: string) => stripMarks(text).split(/\s+/).filter(Boolean);

/** Scores every sentence of a script (0..1) with the reasons behind the score. */
export function judgeScenes(scenes: SceneInput[]): Judgement[] {
  // Concepts the whole script keeps coming back to; their first mention matters, the repeats do not.
  const iconCount = new Map<string, number>();
  scenes.forEach(s => { if (s.visual.icon && !s.visual.brands?.length) iconCount.set(s.visual.icon, (iconCount.get(s.visual.icon) ?? 0) + 1); });
  const core = new Set([...iconCount].filter(([, n]) => n >= 3).map(([id]) => id));
  const seenCore = new Set<string>();
  const seenNumbers = new Set<string>();
  const recentIcons: (string | null)[] = [];

  return scenes.map((s, i) => {
    const v = s.visual;
    const words = wordsOf(s.text);
    const reasons: string[] = [];
    let score = 0;
    const add = (value: number, reason: string) => { if (value > score) { score = value; reasons.length = 0; reasons.push(reason); } else if (value === score && !reasons.includes(reason)) reasons.push(reason); };

    if (v.brands?.length) add(0.9, "istilah populer");
    if (/\*[^*]+\*/.test(s.text)) add(0.85, "ditandai manual");
    if (v.number) {
      const stated = amountsIn(s.text);
      // Repeating amounts already shown is not news; a new amount next to them (money → months) is.
      const repeated = stated.length > 0 && stated.every(a => seenNumbers.has(a));
      stated.forEach(a => seenNumbers.add(a));
      const base = v.number.year ? 0.3 : isMoney(v, s.text) ? 0.9 : 0.8;
      add(repeated ? base * 0.5 : base + (stated.length >= 2 ? 0.1 : 0), v.number.year ? "tahun" : isMoney(v, s.text) ? "angka uang" : "angka penting");
    }
    if (v.template === "cta") add(0.7, "ajakan");
    if (v.template === "compare") add(0.75, "perbandingan");
    if (v.template === "list") add(0.6, "langkah");
    if (v.template === "question") add(i === 0 ? 0.5 : 0.35, "pertanyaan");
    const concepts = matchConcepts(s.text);
    if (concepts.length >= 3) add(0.75, "rangkuman konsep");
    if (v.icon && !v.brands?.length) {
      if (core.has(v.icon)) { add(seenCore.has(v.icon) ? 0.2 : 0.65, "konsep inti naskah"); seenCore.add(v.icon); }
      else add(0.3, "ikon konsep");
    }
    if (score === 0 && v.emphasis.length > 0) add(0.15, "kata kunci");

    // A scene can add a little when it opens or closes the video.
    if (score > 0 && i === 0) { score = Math.min(1, score + 0.2); reasons.push("pembuka"); }
    if (score > 0 && i === scenes.length - 1) score = Math.min(1, score + 0.1);

    // Little to show: very short, mostly filler, too brief to read, or the same icon as just before. What the creator
    // marked by hand, and a popular name, are exempt: they were asked for.
    const chosen = /\*[^*]+\*/.test(s.text) || !!v.brands?.length;
    const filler = words.length ? words.filter(w => FILLER.has(wordKey(w))).length / words.length : 0;
    if (!chosen) {
      if (words.length < 4) score *= 0.6;
      if (filler > 0.3) score *= 0.7;
      if (s.seconds < 1.5) score *= 0.5;
      if (v.icon && recentIcons.slice(-3).includes(v.icon) && !v.number) { score *= 0.55; reasons.push("ikon sama dengan sebelumnya"); }
    }
    recentIcons.push(v.icon);

    return { score: Math.round(score * 100) / 100, reasons };
  });
}

export type AnimationPlan = { cuts: Cut[]; judgements: Judgement[] };

/**
 * Chooses the scenes that get an animation drawn over the speaker (the rest stay on the speaker). Strongest first; a
 * scene is taken only if it reaches the density's bar, starts far enough from the animations already chosen and fits
 * the share of the video that animations may cover.
 */
export function planAnimations(scenes: SceneInput[], density: Density): AnimationPlan {
  const judgements = judgeScenes(scenes);
  const { threshold, minGapSeconds, maxCoverage } = SETTINGS[density];
  const starts: number[] = [];
  let at = 0;
  for (const s of scenes) { starts.push(at); at += s.seconds; }
  const budget = Math.max(ANIMATION_SECONDS, at * maxCoverage);
  const chosen: number[] = [];
  const order = judgements.map((j, i) => i).filter(i => judgements[i].score >= threshold).sort((a, b) => judgements[b].score - judgements[a].score || a - b);
  for (const i of order) {
    if ((chosen.length + 1) * ANIMATION_SECONDS > budget) break;
    if (chosen.some(j => Math.abs(starts[i] - starts[j]) < minGapSeconds)) continue;
    chosen.push(i);
  }
  const picked = new Set(chosen);
  return { cuts: scenes.map((_, i) => (picked.has(i) ? "overlay" : "video")), judgements };
}

/** One line for the scene list: why a scene is animated, or why it is not. */
export function explainScene(j: Judgement, animated: boolean): string {
  if (animated) return `Animasi: ${j.reasons.join(", ") || "terpilih"} (skor ${j.score.toFixed(2)})`;
  if (j.score === 0) return "Tanpa animasi: tidak ada yang perlu ditunjukkan";
  return `Tanpa animasi: kurang penting (skor ${j.score.toFixed(2)}${j.reasons.length ? `, ${j.reasons.join(", ")}` : ""})`;
}
