// "Sutradara AI": the model arranges the whole video (style, palette, each scene's template, icon and screen cut)
// from the script, following a short playbook distilled from motion-graphics skills (see MOTION_STUDIO.md).
// It only chooses among the app's own options and never rewrites text; the creator audits every choice, can change
// any of them, and can ask for another pass with feedback. Pure: the app supplies the transport (lib/gemini.ts ask()).
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";
import { PALETTES, STYLES, type PaletteId, type StyleId } from "./script";
import { detectNumber, ICONS, resolveVisual, TEMPLATES, type Cut, type Template, type VisualOverride } from "./visuals";

const STYLE_IDS = STYLES.map(s => s.id);
const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];
const TEMPLATE_IDS = TEMPLATES.map(t => t.id);
const CUTS: Cut[] = ["video", "overlay", "graphic"];

export type DirectorInput = {
  scenes: { text: string; seconds: number }[];
  /** Editing over a source video: scenes may also choose what the screen shows. */
  videoEdit: boolean;
  style: StyleId;
  palette: PaletteId;
  /** What each scene shows now (after earlier passes or manual changes), so feedback can adjust rather than restart. */
  current?: { template?: Template; icon?: string; cut?: Cut }[];
  /** The creator's words about the previous result, e.g. "terlalu ramai, lebih tenang". */
  feedback?: string;
  /** An affiliate (selling) video for this product: price and promo become number scenes, the buying prompt closes the video. */
  affiliate?: { product: string };
  language: "id" | "en";
  /** A scoped revision: only these scene indexes may change; the answer is also filtered to them (lib/revision.ts). */
  scope?: number[];
};

export type DirectorScene = { template?: Template; icon?: string; cut?: Cut; reason: string; /** What kind of photo fits, in Indonesian, for the creator to read. */ imageIdea?: string; /** The same as a search phrase in English, for the stock-photo search. */ imageQuery?: string };
export type DirectorPlan = { style?: StyleId; palette?: PaletteId; scenes: (DirectorScene | undefined)[]; note: string };

/**
 * The craft rules the model works from. Distilled (not copied) from the Remotion agent skills, claude-remotion-skill
 * (MIT), iart-ai tiktok/explainer packs (MIT) and the short-form retention guidance they share.
 */
export const PLAYBOOK = [
  "Pembuka: scene 1 harus paling kuat dan jelas; ada sesuatu yang bergerak dalam 1,5 detik pertama. Jangan buka dengan ajakan (cta).",
  "Satu fokus visual per scene. Pilih tampilan dari ISI kalimat: angka/uang/persen -> number; dua sisi/lawan -> compare; urutan/langkah -> list; pertanyaan -> question; kutipan/ucapan -> quote; ajakan bertindak -> cta (hanya di akhir); selain itu -> statement dengan ikon yang benar-benar mewakili.",
  "Variasi dengan tujuan: jangan lebih dari 2 scene berturut-turut dengan tampilan sama. Beri jeda tenang (statement tanpa ikon) setelah dua scene padat; kontras antara ramai dan tenang terasa mahal, gerak terus-menerus terasa amatir.",
  "Ikon hanya bila mewakili isi kalimat; kalau ragu pakai \"none\". Jangan memakai ikon sama berturut-turut.",
  "Satu warna dominan: palet mengikuti suasana topik (edukasi: pearl; teknologi/bisnis: obsidian; motivasi/sinematik: gold; refleksi/tenang: forest atau ivory; sosial yang cepat: violet).",
  "Gaya mengikuti tempo: kinetic untuk hook cepat dan media sosial; cinematic untuk cerita/motivasi; editorial untuk refleksi tenang; hybrid bila campuran; popup untuk penekanan.",
  "Video sumber (bila ada): pembicara tetap yang utama. \"video\" = hanya pembicara; \"overlay\" = animasi kecil untuk istilah/angka penting; \"graphic\" = ganti layar penuh (maks. 4 detik) hanya untuk poin kunci, tidak lebih dari 1 dari 3 scene, dan bukan di momen emosional.",
  "Ide gambar: untuk setiap scene beri \"imageIdea\" (2-4 kata bahasa Indonesia untuk dibaca pembuat video) dan \"imageQuery\" (2-4 kata bahasa INGGRIS untuk mencari foto vertikal di situs foto stok): benda atau situasi nyata yang mudah dicari, bukan konsep abstrak; hindari orang tertentu, teks, dan logo.",
];

const iconList = () => Object.keys(ICONS).sort().join(", ");

export function directorPrompt(i: DirectorInput): string {
  const lang = i.language === "en" ? "bahasa Inggris" : "bahasa Indonesia";
  const cutRule = i.videoEdit ? "Karena ini edit di atas video, isi juga \"cut\" (video | overlay | graphic) untuk tiap scene." : "Ini video tanpa video sumber: jangan isi \"cut\".";
  return [
    `Kamu sutradara motion graphics untuk video pendek vertikal 9:16 (${lang}). Susun tampilan video dari kalimat-kalimat berikut. Kamu hanya MEMILIH di antara opsi yang tersedia; jangan mengubah, menambah, atau membuang kalimat.`,
    "",
    "Panduan kerja:",
    ...PLAYBOOK.map((r, n) => `${n + 1}. ${r}`),
    "",
    `Opsi gaya (style): ${STYLE_IDS.join(", ")}`,
    `Opsi palet (palette): ${PALETTE_IDS.join(", ")}`,
    `Opsi tampilan (template): ${TEMPLATE_IDS.join(", ")}`,
    `Opsi ikon (icon, atau "none"): ${iconList()}`,
    cutRule,
    "",
    ...(i.affiliate ? [
      "",
      `Ini video AFFILIATE untuk produk "${i.affiliate.product.replace(/\s+/g, " ").trim().slice(0, 80)}". Tambahan aturan: hook di scene 1 menyebut satu manfaat atau masalah nyata; kalimat berisi harga atau promo memakai tampilan number; ajakan membeli ada di scene terakhir dengan tampilan cta (hanya di sana); jangan menambah klaim lewat pilihan tampilan; imageQuery berisi kategori produk dan situasi pemakaian (mis. "water bottle office desk"), bukan merek atau logo.`,
      "",
    ] : []),
    ...(i.scope ? [`REVISI TERBATAS: ubah HANYA scene dengan index ${i.scope.join(", ")}. Jangan mengubah style, palette, atau scene lain; jangan sertakan scene lain dalam jawaban. Teks naskah tidak boleh berubah.`] : []),
    `Sekarang: style=${i.style}, palette=${i.palette}.`,
    i.feedback ? `Masukan pembuat video tentang hasil sebelumnya (utamakan ini): "${i.feedback.replace(/\s+/g, " ").trim().slice(0, 400)}"` : "Belum ada masukan; susun yang terbaik menurut panduan.",
    "Beri alasan (reason) singkat dalam bahasa Indonesia, maksimal 10 kata, yang menjelaskan PILIHAN itu kepada pembuat video. Beri juga \"note\": satu kalimat ringkasan arah keseluruhan (maks. 25 kata).",
    "Balas hanya JSON: {\"style\":\"...\",\"palette\":\"...\",\"note\":\"...\",\"scenes\":[{\"index\":n,\"template\":\"...\",\"icon\":\"...\",\"cut\":\"...\",\"reason\":\"...\",\"imageIdea\":\"...\",\"imageQuery\":\"...\"}]} untuk setiap kalimat.",
    "",
    "Kalimat (JSON):",
    JSON.stringify(i.scenes.map((s, index) => ({ index, text: s.text.replace(/\*/g, ""), seconds: Math.round(s.seconds * 10) / 10, ...(i.current?.[index] ? { sekarang: i.current[index] } : {}) }))),
  ].join("\n");
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Reads the model's answer. Unknown or invalid values are dropped, never guessed; a scene the model skipped stays undefined. */
export function parseDirector(response: unknown, expected: number, videoEdit: boolean): DirectorPlan {
  const parsedJson = answerJson(response);
  const obj = parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson) ? parsedJson as Record<string, unknown> : null;
  const list = Array.isArray(parsedJson) ? parsedJson : obj?.scenes;
  if (!Array.isArray(list)) throw new GeminiError("format", "Jawaban AI tidak berisi susunan scene. Coba lagi.");
  const scenes: (DirectorScene | undefined)[] = Array.from({ length: expected }, () => undefined);
  for (const it of list as Record<string, unknown>[]) {
    if (typeof it?.index !== "number" || !Number.isInteger(it.index) || it.index < 0 || it.index >= expected) continue;
    const template = TEMPLATE_IDS.includes(it.template as Template) ? it.template as Template : undefined;
    const icon = typeof it.icon === "string" && (it.icon === "none" || it.icon in ICONS) ? it.icon : undefined;
    const cut = videoEdit && CUTS.includes(it.cut as Cut) ? it.cut as Cut : undefined;
    if (!template && !icon && !cut) continue;
    scenes[it.index] = { template, icon, cut, reason: clean(it.reason, 80), imageIdea: clean(it.imageIdea, 60) || undefined, imageQuery: clean(it.imageQuery, 60) || undefined };
  }
  if (!scenes.some(Boolean)) throw new GeminiError("format", "AI tidak memberi susunan yang bisa dipakai. Coba lagi.");
  return {
    style: STYLE_IDS.includes(obj?.style as StyleId) ? obj!.style as StyleId : undefined,
    palette: PALETTE_IDS.includes(obj?.palette as PaletteId) ? obj!.palette as PaletteId : undefined,
    scenes,
    note: clean(obj?.note, 200),
  };
}

/**
 * Turns a plan into the overrides the studio already understands. A template the text cannot support (a "number" scene
 * without a number, "compare" without two sides) is dropped, a call to action never opens the video, and icons are not
 * set on templates that have none.
 */
export function planToOverrides(plan: DirectorPlan, texts: string[]): { overrides: Record<string, VisualOverride>; cuts: Record<string, Cut> } {
  const overrides: Record<string, VisualOverride> = {};
  const cuts: Record<string, Cut> = {};
  plan.scenes.forEach((s, i) => {
    const text = texts[i];
    if (!s || text === undefined) return;
    let template = s.template;
    if (template === "cta" && i === 0 && texts.length > 1) template = undefined;
    if (template === "number" && !detectNumber(text)) template = undefined;
    if (template) {
      const v = resolveVisual(text, { template });
      if (template === "compare" && !v.compare) template = undefined;
    }
    const icon = template === "compare" || template === "cta" ? undefined : s.icon;
    if (template || icon) overrides[text] = { ...(template ? { template } : {}), ...(icon ? { icon } : {}) };
    if (s.cut) cuts[text] = s.cut;
  });
  return { overrides, cuts };
}

/** Asks the model to arrange the video. Only the sentences' text (and the creator's feedback) is sent. */
export async function directVideo(input: DirectorInput, o: CleanupOptions): Promise<DirectorPlan> {
  if (input.scenes.length === 0) throw new GeminiError("format", "Belum ada scene untuk disusun.");
  const sceneSchema = { type: "OBJECT", properties: { index: { type: "INTEGER" }, template: { type: "STRING" }, icon: { type: "STRING" }, cut: { type: "STRING" }, reason: { type: "STRING" }, imageIdea: { type: "STRING" }, imageQuery: { type: "STRING" } }, required: ["index", "template", "reason"] };
  const schema = { type: "OBJECT", properties: { style: { type: "STRING" }, palette: { type: "STRING" }, note: { type: "STRING" }, scenes: { type: "ARRAY", items: sceneSchema } }, required: ["style", "palette", "note", "scenes"] };
  return ask(o, [{ text: directorPrompt(input) }], schema, json => parseDirector(json, input.scenes.length, input.videoEdit));
}
