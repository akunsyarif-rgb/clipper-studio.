"use client";

import type { Check, FixId } from "@/lib/prerender";

/** "Siap render?": what is in order and what is not, each warning with a one-tap fix. Warnings never stop the render. */
export default function PreRenderChecklist({ checks, onFix, prefix, disabled }: { checks: Check[]; onFix: (id: FixId) => void; prefix: string; disabled?: boolean }) {
  if (checks.length === 0) return null;
  const warns = checks.filter(c => c.level === "warn").length;
  return <div className="prerender" data-testid={`${prefix}-checklist`} data-warnings={warns}>
    <h3>Siap render? <small>{warns === 0 ? "Semua beres" : `${warns} hal bisa diperbaiki`}</small></h3>
    <ul>
      {checks.map(c => <li key={c.id} data-level={c.level} data-testid={`${prefix}-check-${c.id}`}>
        <span aria-hidden="true">{c.level === "ok" ? "✓" : "⚠"}</span>
        <div><b>{c.title}</b><small>{c.detail}</small></div>
        {c.fix && <button type="button" className="text-button" disabled={disabled} onClick={() => onFix(c.fix!.id)} data-testid={`${prefix}-fix-${c.fix.id}`}>{c.fix.label}</button>}
      </li>)}
    </ul>
    {warns > 0 && <small className="field-hint">Peringatan tidak menghalangi render; Anda boleh tetap merender.</small>}
  </div>;
}
