"use client";

import { BAND_LABEL, HOOK_LABEL, hookScorable, scoreHook } from "@/lib/hook-score";

const NOTE = "Perkiraan lokal, tanpa AI, tidak ada yang dikirim. Ini heuristik, bukan prediksi: pola dan bobotnya dirancang dari hook berbahasa Inggris dan belum dikalibrasi dengan hasil nyata berbahasa Indonesia. Skor rendah = alasan membaca ulang; skor tinggi bukan janji.";

/**
 * How strong an opening line is, in five properties and one verdict. Full: a closed row with the score, opening to the five bars, the
 * formula it resembles and the one change to make first. Compact: a one-line badge for a list of options. Nothing under three words.
 */
export default function HookMeter({ text, compact = false, label = "Kalimat pembuka" }: { text: string; compact?: boolean; label?: string }) {
  if (!hookScorable(text)) return null;
  const h = scoreHook(text);
  if (compact) {
    return <small className={`hook-badge hook-${h.band}`} data-testid="hook-badge" title={`${NOTE}\n\nTerlemah: ${HOOK_LABEL[h.weakest]}, ${h.fix}.`}>
      Hook {h.verdict}/100 · {BAND_LABEL[h.band]}{h.band !== "kuat" ? ` · lemah di ${HOOK_LABEL[h.weakest].toLowerCase()}` : ""}
    </small>;
  }
  return <details className={`hook-meter hook-${h.band}`} data-testid="hook-meter">
    <summary>{label}: <b data-testid="hook-score">{h.verdict}</b>/100 · <span data-testid="hook-band">{BAND_LABEL[h.band]}</span><small>{h.band === "kuat" ? "Siap dipakai." : `Perbaiki dulu: ${HOOK_LABEL[h.weakest].toLowerCase()}.`}</small></summary>
    <ul className="hook-bars">
      {h.properties.map(p => <li key={p.key} data-testid={"hook-prop-" + p.key}><span>{p.label}</span><i aria-hidden="true"><em style={{ width: p.value + "%" }} /></i><b>{p.value}</b></li>)}
    </ul>
    <p className="hook-hint" data-testid="hook-fix"><b>Ubah dulu:</b> {h.fix}.</p>
    <p className="hook-hint" data-testid="hook-formula">{h.formula ? `Bentuknya mirip rumus “${h.formula.name}”.` : "Belum mirip rumus pembuka mana pun: biasanya ini ringkasan, bukan hook."} {h.words} kata{h.words > 24 ? " (lebih dari 24: bacakan dan pangkas)" : ""}.</p>
    <small className="hook-note" data-testid="hook-note">{NOTE}</small>
  </details>;
}
