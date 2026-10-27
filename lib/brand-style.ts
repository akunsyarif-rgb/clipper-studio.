// Look and motion of each popular name: its own colour (kept light enough to read on the dark veil behind animations)
// and the kind of small animated scene it gets. Pure data, so every name is checked by tests.

export type StageKind =
  | "player" | "equalizer" | "hearts" | "reactions" | "chat" | "plane" | "search" | "ribbon" | "waves"
  | "cart" | "road" | "sparkle" | "network" | "live" | "cross" | "generic";

export type BrandStyle = { color: string; color2?: string; stage: StageKind };

export const BRAND_STYLE: Record<string, BrandStyle> = {
  youtube: { color: "#ff5a52", color2: "#ffffff", stage: "player" },
  tiktok: { color: "#25f4ee", color2: "#ff4d79", stage: "equalizer" },
  instagram: { color: "#ff6fa5", color2: "#ffb347", stage: "hearts" },
  facebook: { color: "#5b9dff", color2: "#ff6b81", stage: "reactions" },
  whatsapp: { color: "#3ddc84", color2: "#d9fdd3", stage: "chat" },
  x: { color: "#f2f2f2", stage: "cross" },
  telegram: { color: "#4cb8f0", color2: "#ffffff", stage: "plane" },
  linkedin: { color: "#59a6f0", stage: "network" },
  spotify: { color: "#2fe36f", color2: "#ffffff", stage: "equalizer" },
  google: { color: "#8ab4f8", color2: "#fbbc04", stage: "search" },
  netflix: { color: "#ff4a55", stage: "ribbon" },
  twitch: { color: "#b794ff", color2: "#ff5a52", stage: "live" },
  podcast: { color: "#c58bff", stage: "waves" },
  marketplace: { color: "#ff8a4d", color2: "#ffd166", stage: "cart" },
  ride: { color: "#4ade80", color2: "#ffd166", stage: "road" },
  chatai: { color: "#c4a8ff", color2: "#7dd3fc", stage: "sparkle" },
  capcut: { color: "#f5f5f5", stage: "generic" },
  canva: { color: "#4fd1c5", color2: "#a78bfa", stage: "generic" },
  meeting: { color: "#5aa9ff", stage: "live" },
  discord: { color: "#8ea1ff", stage: "generic" },
  pinterest: { color: "#ff6b6b", stage: "generic" },
  snapchat: { color: "#fff04d", stage: "generic" },
  github: { color: "#e6edf3", stage: "network" },
  gmail: { color: "#ff7b72", color2: "#ffffff", stage: "generic" },
  drive: { color: "#6ee7b7", color2: "#fbbc04", stage: "generic" },
  office: { color: "#7dd3fc", stage: "generic" },
  ewallet: { color: "#60e0ff", color2: "#ffd166", stage: "generic" },
  bank: { color: "#6ee7b7", stage: "generic" },
  games: { color: "#ffb86b", color2: "#ff5a52", stage: "generic" },
};

/** Style of a name; a neutral one for a name that has none (a name added later is never left without a look). */
export function brandStyle(id: string): BrandStyle {
  return BRAND_STYLE[id] ?? { color: "#e6edf3", stage: "generic" };
}
