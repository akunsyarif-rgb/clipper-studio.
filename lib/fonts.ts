// Self-hosted, open-licence (SIL OFL 1.1) typography. Files live in public/fonts (Latin subset, woff2) with their licences in
// public/fonts/licenses. A "type pack" names the display / label / quote fonts of a look; the composition reads the active pack
// through TYPE (lib/layout.ts), so every headline, label and counter follows it. Pure data: loading is in remotion/fonts.ts.

export type FontFaceSpec = {
  family: string;
  /** File name inside public/fonts. */
  file: string;
  /** CSS weight range this face answers for. Fonts with one or two weights cover the whole range, so the browser never fakes bold. */
  weight: string;
};

export const FONT_FACES: FontFaceSpec[] = [
  { family: "Anton", file: "anton-latin-400-normal.woff2", weight: "100 900" },
  { family: "Bebas Neue", file: "bebas-neue-latin-400-normal.woff2", weight: "100 900" },
  { family: "Montserrat", file: "montserrat-latin-600-normal.woff2", weight: "100 700" },
  { family: "Montserrat", file: "montserrat-latin-900-normal.woff2", weight: "800 900" },
  { family: "Plus Jakarta Sans", file: "plus-jakarta-sans-latin-600-normal.woff2", weight: "100 700" },
  { family: "Plus Jakarta Sans", file: "plus-jakarta-sans-latin-800-normal.woff2", weight: "800 900" },
  { family: "Space Grotesk", file: "space-grotesk-latin-700-normal.woff2", weight: "100 900" },
  { family: "Inter", file: "inter-latin-700-normal.woff2", weight: "100 700" },
  { family: "Inter", file: "inter-latin-800-normal.woff2", weight: "800 900" },
  { family: "Playfair Display", file: "playfair-display-latin-700-normal.woff2", weight: "100 800" },
  { family: "Playfair Display", file: "playfair-display-latin-900-normal.woff2", weight: "900 900" },
  { family: "DM Serif Display", file: "dm-serif-display-latin-400-normal.woff2", weight: "100 900" },
  { family: "Caveat", file: "caveat-latin-700-normal.woff2", weight: "100 900" },
  { family: "JetBrains Mono", file: "jetbrains-mono-latin-700-normal.woff2", weight: "100 900" },
  { family: "Poppins", file: "poppins-latin-600-normal.woff2", weight: "100 700" },
  { family: "Poppins", file: "poppins-latin-800-normal.woff2", weight: "800 900" },
];

export type TypePackId = "classic" | "impact" | "cinema" | "modern" | "editorial" | "street" | "friendly" | "tech";

export type TypePack = {
  id: TypePackId;
  label: string;
  description: string;
  /** Headlines and big figures. */
  display: string;
  /** Labels, chips, small text. */
  sans: string;
  /** Quotation marks and quotes. */
  serif: string;
  /** Headlines in capitals (condensed display faces read best that way). */
  caps: boolean;
  /** Letter spacing of display text, in em. */
  tracking: number;
  /** Families to load before drawing (empty = system fonts only). */
  families: string[];
};

const SYSTEM_DISPLAY = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const SYSTEM_SANS = "Arial, 'Helvetica Neue', sans-serif";
const SYSTEM_SERIF = "Georgia, 'Times New Roman', serif";

const stack = (name: string, fallback: string) => `'${name}', ${fallback}`;

export const TYPE_PACKS: Record<TypePackId, TypePack> = {
  classic: { id: "classic", label: "Klasik (font sistem)", description: "Arial Black dan Georgia: tanpa unduhan font, tampilan bawaan", display: SYSTEM_DISPLAY, sans: SYSTEM_SANS, serif: SYSTEM_SERIF, caps: false, tracking: -0.02, families: [] },
  impact: { id: "impact", label: "Impact (viral, huruf besar)", description: "Anton kapital padat, kuat untuk hook Shorts/Reels/TikTok", display: stack("Anton", "'Arial Narrow', 'Arial Black', sans-serif"), sans: stack("Inter", SYSTEM_SANS), serif: stack("Playfair Display", SYSTEM_SERIF), caps: true, tracking: 0.005, families: ["Anton", "Inter", "Playfair Display"] },
  cinema: { id: "cinema", label: "Cinema (sinematik)", description: "Bebas Neue kapital tinggi, nuansa trailer dan motivasi", display: stack("Bebas Neue", "'Arial Narrow', 'Arial Black', sans-serif"), sans: stack("Inter", SYSTEM_SANS), serif: stack("Playfair Display", SYSTEM_SERIF), caps: true, tracking: 0.02, families: ["Bebas Neue", "Inter", "Playfair Display"] },
  modern: { id: "modern", label: "Modern (bersih)", description: "Plus Jakarta Sans tebal: ramah, jelas, cocok edukasi dan bisnis", display: stack("Plus Jakarta Sans", SYSTEM_DISPLAY), sans: stack("Plus Jakarta Sans", SYSTEM_SANS), serif: stack("DM Serif Display", SYSTEM_SERIF), caps: false, tracking: -0.025, families: ["Plus Jakarta Sans", "DM Serif Display"] },
  editorial: { id: "editorial", label: "Editorial (majalah)", description: "Playfair Display tebal berkelas, cocok refleksi dan cerita", display: stack("Playfair Display", SYSTEM_SERIF), sans: stack("Inter", SYSTEM_SANS), serif: stack("Playfair Display", SYSTEM_SERIF), caps: false, tracking: -0.015, families: ["Playfair Display", "Inter"] },
  street: { id: "street", label: "Street (tegas)", description: "Montserrat ekstra tebal kapital, gaya konten sosial yang lugas", display: stack("Montserrat", SYSTEM_DISPLAY), sans: stack("Montserrat", SYSTEM_SANS), serif: stack("Playfair Display", SYSTEM_SERIF), caps: true, tracking: -0.01, families: ["Montserrat", "Playfair Display"] },
  friendly: { id: "friendly", label: "Friendly (santai)", description: "Poppins membulat dengan kutipan tulisan tangan Caveat", display: stack("Poppins", SYSTEM_DISPLAY), sans: stack("Poppins", SYSTEM_SANS), serif: stack("Caveat", SYSTEM_SERIF), caps: false, tracking: -0.02, families: ["Poppins", "Caveat"] },
  tech: { id: "tech", label: "Tech (futuristik)", description: "Space Grotesk dengan angka JetBrains Mono, untuk AI dan teknologi", display: stack("Space Grotesk", SYSTEM_DISPLAY), sans: stack("Space Grotesk", SYSTEM_SANS), serif: stack("JetBrains Mono", "ui-monospace, Menlo, monospace"), caps: false, tracking: -0.03, families: ["Space Grotesk", "JetBrains Mono"] },
};

export const TYPE_PACK_IDS = Object.keys(TYPE_PACKS) as TypePackId[];
export const DEFAULT_TYPE_PACK: TypePackId = "classic";

/** Unknown or missing ids (older projects) fall back to the classic system fonts. */
export function resolveTypePack(id: string | null | undefined): TypePack {
  return TYPE_PACKS[(id as TypePackId) ?? DEFAULT_TYPE_PACK] ?? TYPE_PACKS[DEFAULT_TYPE_PACK];
}

/** Faces (files) a pack needs. */
export function facesFor(pack: TypePack): FontFaceSpec[] {
  return FONT_FACES.filter(f => pack.families.includes(f.family));
}
