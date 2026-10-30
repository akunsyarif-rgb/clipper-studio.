// Cover-image prompts for the SEO & distribution pack. The picture itself is made elsewhere by the creator; this module only
// writes the prompt (and a negative prompt), always: a plain one built in code from the content (no AI needed), and rules that
// are also given to the AI and enforced on its answer. The rules aim at "not AI slop": a documentary photograph with one clear
// subject, natural light and honest imperfections, no text drawn in the image (the headline is added in the editor), and none of the
// buzzwords and effects that make generated pictures look generated. A prompt lowers the odds of that look; it cannot guarantee it.
import type { SeoPlatform } from "./seo";

export type CoverAspect = { ratio: string; size: string; use: string; /** Share of the frame at the top and bottom that the app's own interface covers. */ topPct: number; bottomPct: number };

export const COVER_ASPECTS: Record<SeoPlatform, CoverAspect> = {
  tiktok: { ratio: "9:16", size: "1080x1920", use: "sampul video TikTok", topPct: 12, bottomPct: 20 },
  instagram: { ratio: "9:16", size: "1080x1920", use: "sampul Reels (pangkasan grid 4:5 di tengah)", topPct: 12, bottomPct: 18 },
  youtube: { ratio: "9:16", size: "1080x1920", use: "sampul Shorts", topPct: 12, bottomPct: 20 },
  x: { ratio: "16:9", size: "1280x720", use: "gambar pratinjau X", topPct: 6, bottomPct: 10 },
  linkedin: { ratio: "4:5", size: "1080x1350", use: "gambar sampul LinkedIn", topPct: 8, bottomPct: 10 },
};

/** Words that make a picture look generated; removed from any prompt the AI writes (and never used by the plain prompt). */
export const SLOP_WORDS = [
  "ultra-detailed", "ultra detailed", "hyper-detailed", "hyperdetailed", "hyperrealistic", "hyper-realistic", "photorealistic 8k", "8k", "4k", "uhd", "hdr",
  "masterpiece", "best quality", "award-winning", "award winning", "trending on artstation", "artstation", "octane render", "unreal engine", "ray tracing",
  "cinematic lighting", "volumetric lighting", "volumetric light", "epic", "stunning", "breathtaking", "glowing", "neon glow", "lens flare", "bokeh orbs",
  "dramatic lighting", "golden hour glow", "magical", "ethereal", "surreal", "futuristic", "holographic", "hologram", "3d render", "digital art", "concept art",
];

/** The things to keep out, for tools that take a negative prompt (or to paste as "avoid" lines in the others). */
export const NEGATIVE_PROMPT = [
  "text", "letters", "words", "numbers", "captions", "subtitles", "logos", "watermark", "signature", "user interface elements",
  "plastic or waxy skin", "airbrushed skin", "perfectly symmetrical face", "uncanny eyes", "extra or fused fingers", "deformed hands", "extra limbs",
  "glossy 3D render", "CGI look", "neon teal-and-orange glow", "lens flare", "floating icons", "holograms", "glowing orbs", "futuristic city",
  "cluttered collage", "oversaturated HDR", "stock-photo smile", "generic robot", "glowing brain", "emoji faces",
].join(", ");

const NO_TEXT = "Do not draw any text, letters, numbers, logos or watermarks in the image; the headline is added later in a video editor.";

const MOODS: { re: RegExp; mood: string }[] = [
  { re: /\b(uang|gaji|hemat|tabung|investasi|utang|cicil|harga|belanja|money|salary|save|saving|budget|debt)\b/i, mood: "calm, practical, money-conscious everyday life" },
  { re: /\b(sehat|olahraga|lari|diet|tidur|sakit|health|workout|sleep|run)\b/i, mood: "honest, energetic but unglamorous, real effort" },
  { re: /\b(masak|resep|makan|kopi|cooking|recipe|food|coffee)\b/i, mood: "warm, appetising, a real kitchen or table in use" },
  { re: /\b(ternyata|lucu|ngakak|kocak|bercanda|funny|joke|prank)\b/i, mood: "playful and candid, a caught-in-the-moment feeling" },
  { re: /\b(kerja|kantor|bisnis|karier|freelance|rapat|work|office|business|career)\b/i, mood: "focused, grounded, a lived-in workplace" },
  { re: /\b(belajar|sekolah|kuliah|ujian|study|school|exam|learn)\b/i, mood: "quiet, curious, a real desk or classroom with everyday clutter" },
];
const PERSON = /\b(aku|saya|kamu|kita|kami|dia|mereka|you|we|i|my|your)\b/i;

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const firstSentence = (script: string) => clip(script.replace(/\*/g, "").replace(/\[jeda[^\]]*\]/gi, " ").split(/(?<=[.!?])\s+|\n+/).find(l => l.trim().length > 8) ?? "", 140);

export type CoverInput = { topic: string; title?: string; transcript: string; platform: SeoPlatform; audience?: string };
export type CoverPrompt = { prompt: string; negative: string; aspect: CoverAspect };

/** The prompt built in code from the content, for the platform's own cover shape. Always available. */
export function buildCoverPrompt(i: CoverInput): CoverPrompt {
  const aspect = COVER_ASPECTS[i.platform];
  const subject = clip(i.title || i.topic, 80) || firstSentence(i.transcript) || "an everyday situation described in the video";
  const hook = firstSentence(i.transcript);
  const mood = MOODS.find(m => m.re.test(`${i.topic} ${i.title ?? ""} ${i.transcript}`))?.mood ?? "natural, honest and human, nothing staged";
  const person = PERSON.test(i.transcript) || /\b(orang|people|person|karyawan|ibu|bapak|anak)\b/i.test(i.transcript);
  const lines = [
    `Editorial documentary photograph used as a ${aspect.use}, ${aspect.ratio} (${aspect.size}).`,
    `Subject: ${subject}.${hook && hook.toLowerCase() !== subject.toLowerCase() ? ` The video opens with: "${hook}" (use it only as context for what is shown, not as text).` : ""}`,
    person
      ? "One real-looking adult in a candid mid-action moment (hands doing something specific, a natural unposed expression, looking at the task rather than the camera), in a believable ordinary setting."
      : "One concrete real-world object or scene that the video is about, shown in use in a believable ordinary setting (not a symbolic or abstract arrangement).",
    `Mood: ${mood}.`,
    "Look: shot on a 35mm or 50mm lens at f/2.8, natural available light (window light or overcast daylight), true-to-life colours with gentle contrast, fine film grain, visible skin pores and fabric texture, small honest imperfections (creased clothing, stray hair, worn surfaces, a little clutter in the background).",
    `Composition: one clear focal point with a simple, uncluttered background and strong separation between subject and background; the key subject sits in the middle band, away from the top ${aspect.topPct}% and bottom ${aspect.bottomPct}% of the frame (covered by the app's interface); calm empty space in the upper third for a headline.`,
    NO_TEXT,
  ];
  return { prompt: lines.join("\n"), negative: NEGATIVE_PROMPT, aspect };
}

const slopRe = new RegExp(`\\b(?:${SLOP_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s-]+")).sort((a, b) => b.length - a.length).join("|")})\\b`, "gi");

/**
 * A prompt written by the AI, made safe: buzzwords that cause the generated look are removed (with the comma they leave behind),
 * the "no text in the image" rule is added when missing, and the length is kept sensible. Returns what was removed so it can be shown.
 */
export function cleanAiCoverPrompt(raw: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  let text = raw.replace(/\r\n?/g, "\n").replace(slopRe, m => { removed.push(m.toLowerCase()); return ""; });
  text = text.replace(/\s*,(\s*,)+/g, ",").replace(/,\s*([.;\n])/g, "$1").replace(/\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ").replace(/ +([,.;])/g, "$1").replace(/(^|\n)\s*,\s*/g, "$1").trim().slice(0, 1400);
  if (text && !/(no text|do not draw any text|without (any )?text|text-free)/i.test(text)) text += `\n${NO_TEXT}`;
  return { text, removed: [...new Set(removed)] };
}

/** The AI's negative prompt, or the standard one when it gave none; the standard terms are always included. */
export function cleanNegativePrompt(raw: string): string {
  const own = raw.replace(/\s+/g, " ").trim().replace(/^negative prompt:\s*/i, "").slice(0, 600);
  if (!own) return NEGATIVE_PROMPT;
  const have = new Set(own.toLowerCase().split(/\s*,\s*/));
  return [own, ...NEGATIVE_PROMPT.split(", ").filter(t => !have.has(t.toLowerCase()))].join(", ");
}

/** What the AI is asked for (also shown to the creator as the rules of the prompt). */
export const COVER_AI_ASK = "prompt gambar sampul dalam bahasa Inggris (70-120 kata): foto dokumenter/editorial dengan satu subjek konkret yang diambil dari isi skrip (benda, tempat, atau momen nyata, bukan simbol abstrak), lensa 35 atau 50 mm, cahaya alami, tekstur dan ketidaksempurnaan yang wajar, satu titik fokus, latar sederhana, subjek di bagian tengah dan ruang kosong di sepertiga atas untuk judul, tanpa teks atau logo di dalam gambar. DILARANG memakai kata: ultra-detailed, 8k, masterpiece, hyperrealistic, cinematic lighting, trending on artstation, glowing, epic, stunning, futuristic";
export const COVER_NEG_ASK = "negative prompt dalam bahasa Inggris, daftar yang dipisah koma (teks, logo, kulit plastik, jari tambahan, tampilan 3D/CGI, cahaya neon, dll.)";
