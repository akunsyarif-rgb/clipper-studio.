// Natural-language revision support for the AI director: which scenes a request targets, how far a model's answer
// may reach, and a version history so every revision can be undone. Pure; the model call stays in lib/director.ts.
import type { DirectorPlan } from "./director";

export type RevisionScope = { kind: "all" } | { kind: "scenes"; indices: number[] };
export type ScopeResult = { scope: RevisionScope; /** Scene numbers named in the request that do not exist. */ outOfRange: number[] };

const ALL = /\b(semua|seluruh|keseluruhan|all|every|whole|entire|global)\b|\bsemua scene\b/i;
const FIRST = /\b(pembuka|pembukaan|hook|awal|pertama|opening|first|intro)\b/i;
const LAST = /\b(penutup|ending|akhir|terakhir|closing|last|final|cta)\b/i;
// "scene 2", "scene 2-4", "scene 2 dan 4", "scene 2, 3 & 5", "adegan 3"
const NAMED = /\b(?:scene|adegan|babak|slide)s?\s*((?:\d+\s*(?:-|–|sampai|hingga|to|,|dan|&|and)?\s*)+)/gi;

/**
 * Reads the scope out of a request ("buat scene 2 lebih dinamis", "ending lebih kuat", "ubah semua latar jadi biru").
 * No explicit target means the whole project, and the caller shows that scope before applying.
 */
export function parseScope(request: string, count: number): ScopeResult {
  const wanted = new Set<number>();
  const outOfRange: number[] = [];
  const add = (n: number) => { if (n >= 1 && n <= count) wanted.add(n - 1); else outOfRange.push(n); };
  for (const m of request.matchAll(NAMED)) {
    const body = m[1];
    const range = body.match(/(\d+)\s*(?:-|–|sampai|hingga|to)\s*(\d+)/i);
    if (range) { const a = +range[1], b = +range[2]; for (let n = Math.min(a, b); n <= Math.max(a, b) && n - Math.min(a, b) < 200; n++) add(n); }
    else for (const n of body.match(/\d+/g) ?? []) add(+n);
  }
  const named = wanted.size > 0 || outOfRange.length > 0;
  if (!named) {
    if (FIRST.test(request) && !ALL.test(request)) wanted.add(0);
    if (LAST.test(request) && !ALL.test(request)) wanted.add(count - 1);
  }
  if (wanted.size === 0 || (ALL.test(request) && !named)) return { scope: { kind: "all" }, outOfRange };
  return { scope: { kind: "scenes", indices: [...wanted].sort((a, b) => a - b) }, outOfRange };
}

/** The scenes a revision may touch: the scope minus locked scenes. */
export function editableScenes(scope: RevisionScope, count: number, locked: ReadonlySet<number> = new Set()): number[] {
  const base = scope.kind === "all" ? Array.from({ length: count }, (_, i) => i) : scope.indices;
  return base.filter(i => i >= 0 && i < count && !locked.has(i));
}

/**
 * Enforces the scope on the model's answer, whatever the model did: scenes outside it are dropped, and a scoped
 * revision never changes the style or palette (those are global). Returns what was dropped so the creator can see it.
 */
export function restrictPlan(plan: DirectorPlan, scope: RevisionScope, locked: ReadonlySet<number> = new Set()): { plan: DirectorPlan; dropped: number[] } {
  const ok = new Set(editableScenes(scope, plan.scenes.length, locked));
  const dropped: number[] = [];
  const scenes = plan.scenes.map((s, i) => { if (s && !ok.has(i)) { dropped.push(i); return undefined; } return s; });
  return { plan: { ...plan, scenes, ...(scope.kind === "all" ? {} : { style: undefined, palette: undefined, typography: undefined, backdrop: undefined, grain: undefined, captionStyle: undefined }) }, dropped };
}

export function describeScope(scope: RevisionScope, count: number): string {
  if (scope.kind === "all") return `seluruh proyek (${count} scene)`;
  return `scene ${scope.indices.map(i => i + 1).join(", ")}`;
}

/** Version history with undo and redo. Snapshots are whatever the studio needs to restore; this only orders them. */
export type History<T> = { past: { label: string; state: T }[]; future: { label: string; state: T }[] };
export const emptyHistory = <T,>(): History<T> => ({ past: [], future: [] });
const MAX_VERSIONS = 20;

/** Records `before` (the state a revision is about to replace); a new revision clears redo. */
export function record<T>(h: History<T>, label: string, before: T): History<T> {
  return { past: [...h.past, { label, state: before }].slice(-MAX_VERSIONS), future: [] };
}
export function undo<T>(h: History<T>, current: T): { history: History<T>; state: T; label: string } | null {
  const last = h.past[h.past.length - 1];
  if (!last) return null;
  return { history: { past: h.past.slice(0, -1), future: [...h.future, { label: last.label, state: current }] }, state: last.state, label: last.label };
}
export function redo<T>(h: History<T>, current: T): { history: History<T>; state: T; label: string } | null {
  const next = h.future[h.future.length - 1];
  if (!next) return null;
  return { history: { past: [...h.past, { label: next.label, state: current }], future: h.future.slice(0, -1) }, state: next.state, label: next.label };
}
