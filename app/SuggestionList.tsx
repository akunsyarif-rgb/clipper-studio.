"use client";

import type { ReactNode } from "react";
import { formatTime } from "@/lib/clip";

export type Item = { start: number; end: number; title: string; reason: string; checked: boolean };

const MIN_SECONDS = 5;
const MAX_SECONDS = 180;

/** Moves a clip's start or end by a few seconds, keeping it between 5 s and 3 min and inside the video. */
export function nudged(m: Item, edge: "start" | "end", delta: number, duration: number): Item {
  if (edge === "start") return { ...m, start: Math.min(Math.max(m.start + delta, Math.max(0, m.end - MAX_SECONDS)), m.end - MIN_SECONDS) };
  return { ...m, end: Math.max(Math.min(m.end + delta, duration, m.start + MAX_SECONDS), m.start + MIN_SECONDS) };
}

/** The list of suggested clips: check the ones you want, adjust the times a little, and use the buttons the caller adds. */
export default function SuggestionList({ items, onItems, duration, actions, intro, children }: {
  items: Item[];
  onItems: (items: Item[]) => void;
  duration: number;
  /** Buttons under each suggestion (preview, send to Motion, open on YouTube…). */
  actions: (m: Item, index: number) => ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  const set = (i: number, patch: (m: Item) => Item) => onItems(items.map((m, k) => (k === i ? patch(m) : m)));
  return <div className="flow-list" data-testid="flow-list">
    {intro && <p><small>{intro}</small></p>}
    {items.map((m, i) => <div className="flow-item" key={i} data-testid="flow-item">
      <label className="flow-title"><input type="checkbox" checked={m.checked} onChange={e => set(i, x => ({ ...x, checked: e.target.checked }))} data-testid="flow-check" /> <b>{m.title}</b></label>
      <small>{formatTime(m.start)} – {formatTime(m.end)} · {Math.round(m.end - m.start)} detik{m.reason ? ` · ${m.reason}` : ""}</small>
      <div className="range-tools">{actions(m, i)}</div>
      <details className="flow-adjust"><summary>Sesuaikan waktu</summary>
        <div className="range-tools">
          <button onClick={() => set(i, x => nudged(x, "start", -2, duration))} aria-label="Mulai 2 detik lebih awal">Mulai −2 dtk</button>
          <button onClick={() => set(i, x => nudged(x, "start", 2, duration))} aria-label="Mulai 2 detik lebih lambat">Mulai +2 dtk</button>
          <button onClick={() => set(i, x => nudged(x, "end", -2, duration))} aria-label="Selesai 2 detik lebih awal">Selesai −2 dtk</button>
          <button onClick={() => set(i, x => nudged(x, "end", 2, duration))} aria-label="Selesai 2 detik lebih lambat" data-testid="flow-end-plus">Selesai +2 dtk</button>
        </div>
      </details>
    </div>)}
    {children}
  </div>;
}
