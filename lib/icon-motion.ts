// Entrance animations for icon layers. Pure functions of the frame, so the preview and the MP4 look the same.
export type Entrance = "draw" | "pop" | "slide-up";
export const ENTRANCES: { id: Entrance; label: string }[] = [
  { id: "pop", label: "Pop (membal)" },
  { id: "slide-up", label: "Pudar + naik" },
  { id: "draw", label: "Digambar (garis)" },
];
export const isEntrance = (v: unknown): v is Entrance => v === "draw" || v === "pop" || v === "slide-up";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Ease-out with a small overshoot: 0 -> ~1.1 -> 1 (the "pop"). */
export const easeOutBack = (t: number, overshoot = 1.70158) => { const x = clamp01(t) - 1; return 1 + (overshoot + 1) * x * x * x + overshoot * x * x; };
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

export const POP_FRAMES = 18;
export const SLIDE_FRAMES = 16;
export const SLIDE_DISTANCE = 44;

/** Scale, opacity and vertical offset (px) of an icon `frame - delay` frames into its entrance. "draw" is drawn by the icon itself. */
export function iconEntrance(kind: Entrance, frame: number, delay = 0): { scale: number; opacity: number; y: number } {
  const f = frame - delay;
  if (kind === "pop") { const t = f / POP_FRAMES; return { scale: Math.max(0, easeOutBack(t)), opacity: clamp01(f / 4), y: 0 }; }
  if (kind === "slide-up") { const e = easeOutCubic(f / SLIDE_FRAMES); return { scale: 1, opacity: e, y: SLIDE_DISTANCE * (1 - e) }; }
  return { scale: 1, opacity: 1, y: 0 };
}
