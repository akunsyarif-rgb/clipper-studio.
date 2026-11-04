// AI use kept on this device: tokens counted today and this month, with a limit for each that the creator can change (0 = no limit).
// The budget only warns: it never stops a request. Prices differ per model and are not known here, so it is in tokens, and models
// that cost nothing (":free", "openrouter/free") are not counted at all, so the numbers are about what may be billed.
const KEY = "clipper:ai-budget:v1";
export const DEFAULT_DAILY_TOKENS = 200_000;
export const DEFAULT_MONTHLY_TOKENS = 3_000_000;
/** From this share of a limit the warning starts. */
export const WARN_AT = 0.8;
export type Budget = { day: string; tokens: number; requests: number; limit: number; month: string; monthTokens: number; monthLimit: number };

/** Use the device's local calendar day (not UTC), so the budget rolls over at local midnight. */
export const localDayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => localDayKey();
const thisMonth = () => localDayKey().slice(0, 7);

let memory: Budget | null = null;
const limitOf = (v: unknown, fallback: number) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;

function read(): Budget {
  let b: Partial<Budget> | null = null;
  try { b = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { b = memory; }
  const limit = limitOf(b?.limit, DEFAULT_DAILY_TOKENS), monthLimit = limitOf(b?.monthLimit, DEFAULT_MONTHLY_TOKENS);
  const sameMonth = b?.month === thisMonth();
  const monthTokens = sameMonth ? Math.max(0, Number(b?.monthTokens) || 0) : 0;
  if (!b || b.day !== today()) return { day: today(), tokens: 0, requests: 0, limit, month: thisMonth(), monthTokens, monthLimit };
  return { day: b.day, tokens: Math.max(0, Number(b.tokens) || 0), requests: Math.max(0, Number(b.requests) || 0), limit, month: thisMonth(), monthTokens, monthLimit };
}
function write(b: Budget) { memory = b; try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* kept in memory for this session */ } }

export const getBudget = (): Budget => read();
export function setDailyLimit(limit: number) { write({ ...read(), limit: Math.max(0, Math.floor(Number(limit) || 0)) }); }
export function setMonthlyLimit(limit: number) { write({ ...read(), monthLimit: Math.max(0, Math.floor(Number(limit) || 0)) }); }
/** Models that cost nothing: OpenRouter's free alias and ":free" variants. Anything else may be billed by the provider. */
export const isFreeModel = (model: string) => model === "openrouter/free" || /:free$/.test(model);
/** One request was sent. Its tokens count towards the limits unless the model is free. */
export function recordUsage(tokens: number, model?: string) {
  const b = read();
  const counted = model && isFreeModel(model) ? 0 : Math.max(0, Math.round(tokens));
  write({ ...b, tokens: b.tokens + counted, monthTokens: b.monthTokens + counted, requests: b.requests + 1 });
}
export type BudgetStatus = { level: "ok" | "warn" | "over"; scope: "day" | "month" | null; pct: number };
/** How close the use is to the limits: "warn" from 80 % of one, "over" once one is reached (the more serious of the two is reported). */
export function budgetStatus(): BudgetStatus {
  const b = read();
  const parts = ([["day", b.tokens, b.limit], ["month", b.monthTokens, b.monthLimit]] as const)
    .filter(([, , limit]) => limit > 0).map(([scope, used, limit]) => ({ scope, ratio: used / limit }));
  if (!parts.length) return { level: "ok", scope: null, pct: 0 };
  const worst = parts.reduce((a, c) => (c.ratio > a.ratio ? c : a));
  return { level: worst.ratio >= 1 ? "over" : worst.ratio >= WARN_AT ? "warn" : "ok", scope: worst.scope, pct: Math.round(worst.ratio * 100) };
}
export const budgetExceeded = (): boolean => budgetStatus().level === "over";
/** Internal test reset only; there is deliberately no user-facing reset control. */
export const resetToday = () => write({ ...read(), tokens: 0, requests: 0, monthTokens: 0 });
/** Rough token estimate (about 4 characters per token) for services that report no usage. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
