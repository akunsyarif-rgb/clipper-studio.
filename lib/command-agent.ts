// Prompt-driven creation: one sentence from the creator ("video produk 30 detik, gaya keynote, tenang") becomes a Brief for the
// Cinematic Studio, which builds the storyboard on the device exactly as if the form had been filled in by hand. The AI is called
// once, only to fill the brief; it never renders, saves or changes anything. The result is a plan the creator approves first.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";
import { buildCinematic, clean, GENRE_IDS, isGenre, normalizeBrief, TONES, type Brief, type CinePlan } from "./cinematic";

export const MAX_COMMAND_CHARS = 600;
export const MAX_SEARCH_TERMS = 4;
/** The brief the model filled in, plus short search words for pictures and video (used by the asset search the studio already has). */
export type CommandResult = { brief: Brief; searchTerms: string[] };

export function commandPrompt(command: string, language: "id" | "en"): string {
  const en = language === "en";
  return [
    `Kamu perencana video pendek vertikal. Ubah permintaan pengguna menjadi brief singkat (${en ? "bahasa Inggris" : "bahasa Indonesia"}). Hanya isi brief; jangan menulis naskah panjang.`,
    "Aturan: jangan mengarang klaim, angka, harga, nama orang, atau fitur yang tidak disebut pengguna; bila tidak disebut, kosongkan isiannya (string kosong atau daftar kosong).",
    `genre salah satu: ${GENRE_IDS.join(", ")}. tone salah satu: ${TONES.map(t => t.id).join(", ")}. seconds salah satu: 15, 30, 45, 60.`,
    "features: maks. 4 butir pendek (maks. 10 kata). searchTerms: 2-4 kata kunci pendek dalam bahasa Inggris untuk mencari foto/video latar (benda nyata dan tempat, bukan kata abstrak).",
    "Kalimat pembuka (tagline) maks. 12 kata, tanpa tanda bintang.",
    'Balas hanya JSON: {"genre":"","product":"","tagline":"","problem":"","features":[],"proof":"","cta":"","tone":"","seconds":30,"searchTerms":[]}',
    "Permintaan pengguna:",
    JSON.stringify(command.slice(0, MAX_COMMAND_CHARS)),
  ].join("\n");
}

export function parseCommand(response: unknown, language: "id" | "en"): CommandResult {
  const j = answerJson(response) as Record<string, unknown> | null;
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new GeminiError("format", "AI tidak mengembalikan brief yang bisa dibaca. Coba lagi.");
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const brief = normalizeBrief({
    genre: isGenre(j.genre) ? j.genre : "produk", product: text(j.product), tagline: text(j.tagline), problem: text(j.problem),
    features: list(j.features), proof: text(j.proof), cta: text(j.cta),
    tone: TONES.some(t => t.id === j.tone) ? (j.tone as Brief["tone"]) : "keynote",
    seconds: [15, 30, 45, 60].includes(Number(j.seconds)) ? Number(j.seconds) : 30, language,
  });
  if (!brief.product) throw new GeminiError("format", "AI belum menangkap topik videonya. Tulis perintah dengan menyebut produk atau temanya, lalu coba lagi.");
  const searchTerms = [...new Set(list(j.searchTerms).map(s => clean(s, 40).toLowerCase()).filter(Boolean))].slice(0, MAX_SEARCH_TERMS);
  return { brief, searchTerms };
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    genre: { type: "STRING" }, product: { type: "STRING" }, tagline: { type: "STRING" }, problem: { type: "STRING" },
    features: { type: "ARRAY", items: { type: "STRING" } }, proof: { type: "STRING" }, cta: { type: "STRING" }, tone: { type: "STRING" },
    seconds: { type: "NUMBER" }, searchTerms: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["product"],
};

/** One AI call (cached and counted by `ask`), then the storyboard is built locally. Nothing is applied; the caller shows the plan. */
export async function planFromCommand(command: string, o: CleanupOptions): Promise<{ plan: CinePlan; searchTerms: string[] }> {
  const text = command.replace(/\s+/g, " ").trim();
  if (text.length < 8) throw new GeminiError("format", "Tulis perintah yang lebih jelas, misalnya: video produk kopi 30 detik, suasana hangat.");
  const language = o.language === "en" ? "en" : "id";
  const { brief, searchTerms } = await ask(o, [{ text: commandPrompt(text, language) }], SCHEMA, json => parseCommand(json, language));
  return { plan: buildCinematic(brief), searchTerms };
}
