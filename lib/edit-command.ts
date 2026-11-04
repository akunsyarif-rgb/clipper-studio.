// Prompt-driven editing of a video that is already chosen: one sentence from the creator ("buat lucu, subtitle besar di bawah,
// animasi seperlunya") becomes a handful of the studio's own settings. The AI is called once, only to choose among options that
// already exist; it never cuts, renders or deletes anything, and what it cannot do is said plainly. The creator sees the plan first.
import { answerJson, ask, GeminiError, type CleanupOptions } from "./gemini";
import { clean } from "./cinematic";
import { MAX_VISUALS, type Visual } from "./command-agent";
import { EDIT_PROFILES, type EditProfile } from "./edit-profile";
import { DENSITIES, type Density } from "./importance";
import type { BrandMotion, OverlayPosition } from "./overlay";
import { CAPTION_STYLES, type CaptionStyleId } from "./script";

export const MAX_EDIT_COMMAND_CHARS = 600;
/** Short videos only: this is the longest source the agent works on (seconds). */
export const MAX_AGENT_SECONDS = 180;
const MAX_CONTEXT_LINES = 30;

export type EditPlan = {
  profile?: EditProfile;
  captions?: boolean;
  captionStyle?: CaptionStyleId;
  overlayPos?: OverlayPosition;
  density?: Density;
  brandMotion?: BrandMotion;
  /** Pictures or short clips to put behind scenes that are full-screen cutaways. */
  inserts?: { visuals: Visual[] };
  /** The wish depends on what is said in the video, so a transcript is needed first. */
  needsTranscript: boolean;
  /** Parts of the request the studio cannot do (said back to the creator, never faked). */
  unsupported: string[];
};

export type EditContext = { hasTranscript: boolean; lines: string[]; seconds: number };

export function editPrompt(command: string, ctx: EditContext): string {
  const lines = ctx.lines.slice(0, MAX_CONTEXT_LINES).map(l => clean(l, 100));
  return [
    "Kamu asisten edit video pendek vertikal. Pilih pengaturan yang cocok dengan permintaan pengguna HANYA dari pilihan di bawah. Jangan menambah pilihan baru.",
    `profile: ${EDIT_PROFILES.map(p => p.id).join(" | ")} (komedi = zoom dan jeda di punchline; musik = efek mengikuti ketukan).`,
    "captions: true atau false (subtitle tampil atau tidak).",
    `captionStyle: ${CAPTION_STYLES.map(c => c.id).join(" | ")}.`,
    "overlayPos: top (animasi di atas kepala) | lower (di atas subtitle).",
    `density: ${DENSITIES.map(d => d.id).join(" | ")} (berapa banyak animasi).`,
    "brandMotion: simple | full (gaya animasi istilah populer).",
    "inserts: bila pengguna ingin foto atau video pendek sisipan, isi visuals: 2-8 objek term dan kind (kind video bila ada gerakan/aksi, photo bila diam; term = kata kunci Inggris pendek untuk benda atau tempat nyata).",
    "needsTranscript: true bila permintaan bergantung pada isi ucapan (animasi di bagian penting, punchline, sisipan sesuai isi), false bila tidak.",
    "unsupported: daftar bagian permintaan yang tidak bisa dilakukan dengan pilihan di atas (misalnya memotong bagian tertentu, mengganti latar, menghapus objek, mengubah suara). Tulis singkat dalam bahasa Indonesia. Jangan pura-pura bisa.",
    "Isi hanya kolom yang diminta pengguna; kolom lain dihilangkan. Jangan mengarang.",
    ctx.hasTranscript ? `Kalimat video (untuk konteks):\n${JSON.stringify(lines)}` : "Belum ada transkrip; isi video belum diketahui.",
    'Balas hanya JSON: {"profile":"","captions":true,"captionStyle":"","overlayPos":"","density":"","brandMotion":"","inserts":{"visuals":[{"term":"","kind":"photo"}]},"needsTranscript":false,"unsupported":[]}',
    "Permintaan pengguna:",
    JSON.stringify(command.slice(0, MAX_EDIT_COMMAND_CHARS)),
  ].join("\n");
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

export function parseEditPlan(response: unknown): EditPlan {
  const j = answerJson(response) as Record<string, unknown> | null;
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new GeminiError("format", "AI tidak mengembalikan rencana yang bisa dibaca. Coba lagi.");
  const plan: EditPlan = { needsTranscript: j.needsTranscript === true, unsupported: [] };
  const profile = oneOf(j.profile, EDIT_PROFILES.map(p => p.id));
  if (profile) plan.profile = profile;
  if (typeof j.captions === "boolean") plan.captions = j.captions;
  const captionStyle = oneOf(j.captionStyle, CAPTION_STYLES.map(c => c.id));
  if (captionStyle) plan.captionStyle = captionStyle;
  const overlayPos = oneOf(j.overlayPos, ["top", "lower"] as const);
  if (overlayPos) plan.overlayPos = overlayPos;
  const density = oneOf(j.density, DENSITIES.map(d => d.id));
  if (density) plan.density = density;
  const brandMotion = oneOf(j.brandMotion, ["simple", "full"] as const);
  if (brandMotion) plan.brandMotion = brandMotion;
  const ins = j.inserts as { visuals?: unknown } | null | undefined;
  if (ins && Array.isArray(ins.visuals)) {
    const seen = new Set<string>(), visuals: Visual[] = [];
    for (const v of ins.visuals) {
      const term = clean(typeof v === "string" ? v : (v as { term?: unknown } | null)?.term, 40).toLowerCase();
      if (!term || seen.has(term)) continue;
      seen.add(term);
      visuals.push({ term, kind: (v as { kind?: unknown } | null)?.kind === "video" ? "video" : "photo" });
      if (visuals.length >= MAX_VISUALS) break;
    }
    if (visuals.length) plan.inserts = { visuals };
  }
  if (Array.isArray(j.unsupported)) plan.unsupported = j.unsupported.filter((x): x is string => typeof x === "string").map(x => clean(x, 120)).filter(Boolean).slice(0, 5);
  // What depends on the words of the video needs its transcript, whatever the model said.
  if (plan.density || plan.inserts || plan.profile === "comedy") plan.needsTranscript = true;
  return plan;
}

/** What the plan will change, in the creator's words (computed here, not written by the AI). */
export function describePlan(plan: EditPlan): string[] {
  const out: string[] = [];
  if (plan.profile) out.push(`Profil editing: ${EDIT_PROFILES.find(p => p.id === plan.profile)?.label}`);
  if (plan.captions !== undefined) out.push(plan.captions ? "Subtitle: tampil" : "Subtitle: mati");
  if (plan.captionStyle) out.push(`Gaya subtitle: ${CAPTION_STYLES.find(c => c.id === plan.captionStyle)?.label}`);
  if (plan.overlayPos) out.push(`Posisi animasi: ${plan.overlayPos === "top" ? "atas (di atas kepala)" : "bawah (di atas subtitle)"}`);
  if (plan.density) out.push(`Banyak animasi: ${DENSITIES.find(d => d.id === plan.density)?.label}`);
  if (plan.brandMotion) out.push(`Gaya animasi istilah populer: ${plan.brandMotion === "full" ? "lengkap" : "sederhana"}`);
  if (plan.inserts) out.push(`Sisipan gambar: ${plan.inserts.visuals.map(v => `${v.term} (${v.kind === "video" ? "video" : "foto"})`).join(", ")}`);
  return out;
}

export const planIsEmpty = (plan: EditPlan) => describePlan(plan).length === 0;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    profile: { type: "STRING" }, captions: { type: "BOOLEAN" }, captionStyle: { type: "STRING" }, overlayPos: { type: "STRING" }, density: { type: "STRING" }, brandMotion: { type: "STRING" },
    inserts: { type: "OBJECT", properties: { visuals: { type: "ARRAY", items: { type: "OBJECT", properties: { term: { type: "STRING" }, kind: { type: "STRING" } }, required: ["term"] } } } },
    needsTranscript: { type: "BOOLEAN" }, unsupported: { type: "ARRAY", items: { type: "STRING" } },
  },
};

/** One AI call (cached and counted by `ask`). Nothing is applied; the caller shows the plan and waits for the creator. */
export async function planEdit(command: string, ctx: EditContext, o: CleanupOptions): Promise<EditPlan> {
  const text = command.replace(/\s+/g, " ").trim();
  if (text.length < 8) throw new GeminiError("format", "Tulis perintah yang lebih jelas, misalnya: buat lucu, subtitle gaya pop di bawah, animasi seperlunya.");
  if (ctx.seconds > MAX_AGENT_SECONDS) throw new GeminiError("format", "Asisten edit untuk video sampai 3 menit. Potong videonya dulu di Potong video.");
  return ask(o, [{ text: editPrompt(text, ctx) }], SCHEMA, parseEditPlan);
}
