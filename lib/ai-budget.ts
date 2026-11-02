// A daily AI budget kept on this device: tokens and requests used today, and a limit the creator can change (0 = no limit).
// Prices differ per model and are not known here, so the budget is in tokens; free models (":free", "openrouter/free") are marked as such.
const KEY = "clipper:ai-budget:v1";
export const DEFAULT_DAILY_TOKENS = 200_000;
export type Budget = { day: string; tokens: number; requests: number; limit: number };

const today = () => new Date().toISOString().slice(0, 10);
let memory: Budget | null = null;

function read(): Budget {
  let b: Partial<Budget> | null = null;
  try { b = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { b = memory; }
  const limit = typeof b?.limit === "number" && Number.isFinite(b.limit) && b.limit >= 0 ? Math.floor(b.limit) : DEFAULT_DAILY_TOKENS;
  if (!b || b.day !== today()) return { day: today(), tokens: 0, requests: 0, limit };
  return { day: b.day, tokens: Math.max(0, Number(b.tokens) || 0), requests: Math.max(0, Number(b.requests) || 0), limit };
}
function write(b: Budget) { memory = b; try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* kept in memory for this session */ } }

export const getBudget = (): Budget => read();
export function setDailyLimit(limit: number) { write({ ...read(), limit: Math.max(0, Math.floor(Number(limit) || 0)) }); }
export function recordUsage(tokens: number) { const b = read(); write({ ...b, tokens: b.tokens + Math.max(0, Math.round(tokens)), requests: b.requests + 1 }); }
/** True once today's use has reached the limit; the next request is then refused (the one that crossed it was already paid for). */
export const budgetExceeded = (): boolean => { const b = read(); return b.limit > 0 && b.tokens >= b.limit; };
export const resetToday = () => write({ ...read(), tokens: 0, requests: 0 });
/** Rough token estimate (about 4 characters per token) for services that report no usage. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
/** Models that cost nothing: OpenRouter's free alias and ":free" variants. Anything else may be billed by the provider. */
export const isFreeModel = (model: string) => model === "openrouter/free" || /:free$/.test(model);
