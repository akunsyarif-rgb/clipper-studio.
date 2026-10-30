"use client";

import type { ReactNode } from "react";
import { formatTime } from "@/lib/clip";
import { lineTextAt, nudged, stepped, WEAK_SCORE, type Item, type Line } from "@/lib/clip-assist";

export type { Item };

/** The list of suggested clips: check the ones you want, adjust the times a little, and use the buttons the caller adds. */
export default function SuggestionList({ items, onItems, duration, actions, intro, lines, children }: {
  items: Item[];
  onItems: (items: Item[]) => void;
  duration: number;
  /** Buttons under each suggestion (preview, send to Motion, open on YouTube…). */
  actions: (m: Item, index: number) => ReactNode;
  intro?: ReactNode;
  /** The transcript lines (with their times): lets a clip start or end move one sentence at a time and shows what is said there. */
  lines?: Line[];
  children?: ReactNode;
}) {
  const set = (i: number, patch: (m: Item) => Item) => onItems(items.map((m, k) => (k === i ? patch(m) : m)));
  return <div className="flow-list" data-testid="flow-list">
    {intro && <p><small>{intro}</small></p>}
    {items.map((m, i) => <div className="flow-item" key={i} data-testid="flow-item">
      <label className="flow-title"><input type="checkbox" checked={m.checked} onChange={e => set(i, x => ({ ...x, checked: e.target.checked }))} data-testid="flow-check" /> <b>{m.title}</b></label>
      <small>{formatTime(m.start)} – {formatTime(m.end)} · {Math.round(m.end - m.start)} detik{m.reason ? ` · ${m.reason}` : ""}</small>
      {lines && lines.length > 0 && <small className="flow-ends" data-testid="flow-ends">Mulai: “{lineTextAt(lines, m.start, "start") || "…"}” · Berakhir: “{lineTextAt(lines, m.end, "end") || "…"}”</small>}
      {m.score !== undefined && <small className={m.score >= WEAK_SCORE ? "flow-understood" : "flow-understood weak"} data-testid="flow-understood">
        {m.score >= WEAK_SCORE ? "Mudah dipahami" : "Konteks kurang"} {m.score}/10{m.understood ? ` · Penonton baru menangkap: ${m.understood}` : ""}{m.missing ? ` · Kurang: ${m.missing}` : ""}
      </small>}
      {m.note && <small className="field-hint" data-testid="flow-note-item">{m.note}</small>}
      <div className="range-tools">{actions(m, i)}</div>
      <details className="flow-adjust"><summary>Sesuaikan waktu</summary>
        {lines && lines.length > 0 && <div className="range-tools">
          <button onClick={() => set(i, x => stepped(x, "start", -1, lines, duration))} data-testid="flow-start-earlier">Mulai 1 kalimat lebih awal</button>
          <button onClick={() => set(i, x => stepped(x, "start", 1, lines, duration))} data-testid="flow-start-later">Mulai 1 kalimat lebih akhir</button>
          <button onClick={() => set(i, x => stepped(x, "end", -1, lines, duration))} data-testid="flow-end-earlier">Selesai 1 kalimat lebih awal</button>
          <button onClick={() => set(i, x => stepped(x, "end", 1, lines, duration))} data-testid="flow-end-later">Selesai 1 kalimat lebih akhir</button>
        </div>}
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
