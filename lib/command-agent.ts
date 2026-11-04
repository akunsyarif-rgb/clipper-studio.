// Prompt-driven creation: one sentence from the creator ("video produk 30 detik, gaya keynote, tenang") becomes a Brief for the
// Cinematic Studio, which builds the storyboard on the device exactly as if the form had been filled in by hand. The AI is called
// once, only to fill the brief; it never renders, saves or changes anything. The result is a plan the creator approves first.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";
import { buildCinematic, clean, GENRE_IDS, isGenre, normalizeBrief, TONES, type Brief, type CinePlan } from "./cinematic";

export const MAX_COMMAND_CHARS = 600;
export const MAX_VISUALS = 8;
/** What to look for behind a scene, and whether a still photo or a short clip of a few seconds suits it better. */
export type Visual = { term: string; kind: "photo" | "video" };
/** The brief the model filled in, plus the pictures to look for (used by the asset search the studio already has). */
export type CommandResult = { brief: Brief; visuals: Visual[] };

export function commandPrompt(command: string, language: "id" | "en"): string {
  const en = language === "en";
  return [
    `Kamu perencana video pendek vertikal. Ubah permintaan pengguna menjadi brief singkat (${en ? "bahasa Inggris" : "bahasa Indonesia"}). Hanya isi brief; jangan menulis naskah panjang.`,
    "Aturan: jangan mengarang klaim, angka, harga, nama orang, atau fitur yang tidak disebut pengguna; bila tidak disebut, kosongkan isiannya (string kosong atau daftar kosong).",
    `genre salah satu: ${GENRE_IDS.join(", ")}. tone salah satu: ${TONES.map(t => t.id).join(", ")}. seconds salah satu: 15, 30, 45, 60.`,
    "features: maks. 4 butir pendek (maks. 10 kata). visuals: 3-8 objek berisi term dan kind untuk gambar latar, berurutan sesuai alur cerita; term = kata kunci pendek bahasa Inggris (benda nyata atau tempat, bukan kata abstrak). kind video bila adegannya menggambarkan gerakan atau aksi yang lebih hidup sebagai klip beberapa detik (menuang, berjalan, ombak, mengetik); kind photo untuk benda, tempat, atau suasana yang diam.",
    "Kalimat pembuka (tagline) maks. 12 kata, tanpa tanda bintang.",
    'Balas hanya JSON: {"genre":"","product":"","tagline":"","problem":"","features":[],"proof":"","cta":"","tone":"","seconds":30,"visuals":[{"term":"","kind":"photo"}]}',
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
  // Objects {term, kind}; a plain string (older answers) is a photo. Anything but "video" is a photo.
  const raw = Array.isArray(j.visuals) ? j.visuals : Array.isArray(j.searchTerms) ? j.searchTerms : [];
  const seen = new Set<string>();
  const visuals: Visual[] = [];
  for (const v of raw) {
    const term = clean(typeof v === "string" ? v : (v as { term?: unknown } | null)?.term, 40).toLowerCase();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    visuals.push({ term, kind: (v as { kind?: unknown } | null)?.kind === "video" ? "video" : "photo" });
    if (visuals.length >= MAX_VISUALS) break;
  }
  return { brief, visuals };
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    genre: { type: "STRING" }, product: { type: "STRING" }, tagline: { type: "STRING" }, problem: { type: "STRING" },
    features: { type: "ARRAY", items: { type: "STRING" } }, proof: { type: "STRING" }, cta: { type: "STRING" }, tone: { type: "STRING" },
    seconds: { type: "NUMBER" }, visuals: { type: "ARRAY", items: { type: "OBJECT", properties: { term: { type: "STRING" }, kind: { type: "STRING" } }, required: ["term"] } },
  },
  required: ["product"],
};

/** One AI call (cached and counted by `ask`), then the storyboard is built locally. Nothing is applied; the caller shows the plan. */
export async function planFromCommand(command: string, o: CleanupOptions): Promise<{ plan: CinePlan; visuals: Visual[] }> {
  const text = command.replace(/\s+/g, " ").trim();
  if (text.length < 8) throw new GeminiError("format", "Tulis perintah yang lebih jelas, misalnya: video produk kopi 30 detik, suasana hangat.");
  const language = o.language === "en" ? "en" : "id";
  const { brief, visuals } = await ask(o, [{ text: commandPrompt(text, language) }], SCHEMA, json => parseCommand(json, language));
  return { plan: buildCinematic(brief), visuals };
}
