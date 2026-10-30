"use client";

import { useEffect, useState } from "react";
import { GENRES, type Genre } from "@/lib/clip-assist";

const KEY = "clipper:genre:v1";

/** The kind of video the AI looks for clips in; remembered on this device. */
export function useGenre(): [Genre, (g: Genre) => void] {
  const [genre, set] = useState<Genre>("umum");
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v === "komedi" || v === "umum") set(v); } catch { /* storage blocked: stays general */ } }, []);
  return [genre, g => { set(g); try { localStorage.setItem(KEY, g); } catch { /* not remembered */ } }];
}

export default function GenreSelect({ genre, onGenre, disabled }: { genre: Genre; onGenre: (g: Genre) => void; disabled?: boolean }) {
  return (
    <label>Jenis video
      <select value={genre} disabled={disabled} onChange={e => onGenre(e.target.value as Genre)} data-testid="flow-genre">
        {GENRES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
      </select>
      <small className="field-hint">{GENRES.find(g => g.id === genre)?.hint}. Setiap saran diuji: apakah penonton yang belum melihat bagian lain tetap paham.</small>
    </label>
  );
}
