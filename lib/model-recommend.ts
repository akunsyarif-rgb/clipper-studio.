// "Which model should I pick?" answered by the app: at most five choices, from the cheapest to the most expensive, each with a plain
// label. For OpenRouter the prices come live from its public model list (so they are right today); a model that is no longer offered
// simply drops out. For Google the choices are the lite, flash and pro models the key can use.
export type Rec = { id: string; name: string; tier: "Gratis" | "Hemat" | "Seimbang" | "Cerdas" | "Terbaik"; note: string; free: boolean; /** USD per one million tokens. */ price?: { input: number; output: number } };
export type Priced = { id: string; name: string; input: number; output: number };

/** Good, well-known text models, in no particular order; only those the live list still offers are used. */
const CANDIDATES: { id: string; name: string; note: string }[] = [
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", note: "sangat hemat, cukup untuk rencana dan naskah pendek" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", note: "hemat dan cepat" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini", note: "murah dan stabil" },
  { id: "openai/gpt-4.1-mini", name: "GPT-4.1 mini", note: "murah, rapi mengikuti perintah" },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", note: "cepat, tulisan enak dibaca" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", note: "cepat, tulisan enak dibaca" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", note: "seimbang: cepat dan pintar" },
  { id: "openai/gpt-4.1", name: "GPT-4.1", note: "pintar mengikuti perintah panjang" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", note: "cerdas untuk tugas rumit" },
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", note: "naskah dan arahan paling rapi" },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", note: "naskah dan arahan paling rapi" },
  { id: "openai/gpt-5", name: "GPT-5", note: "terkuat, paling mahal" },
  { id: "anthropic/claude-opus-4.1", name: "Claude Opus 4.1", note: "terkuat, paling mahal" },
];
const PAID_TIERS = ["Hemat", "Seimbang", "Cerdas", "Terbaik"] as const;
export const FREE_REC: Rec = { id: "openrouter/free", name: "Otomatis gratis", tier: "Gratis", note: "model gratis yang tersedia; kadang lambat atau penuh", free: true };

const perMillion = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : NaN; };
/** The model list of OpenRouter -> price per million tokens by id. */
export function parsePrices(json: unknown): Map<string, Priced> {
  const out = new Map<string, Priced>();
  const list = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) return out;
  for (const m of list as Record<string, unknown>[]) {
    const id = typeof m?.id === "string" ? m.id : "";
    const pr = m?.pricing as { prompt?: unknown; completion?: unknown } | undefined;
    const input = perMillion(pr?.prompt), output = perMillion(pr?.completion);
    if (!id || Number.isNaN(input) || Number.isNaN(output)) continue;
    out.set(id, { id, name: typeof m.name === "string" && m.name ? m.name : id, input, output });
  }
  return out;
}
/** What a typical request costs relative to others: our requests send much more than they receive (3 : 1). */
const blended = (p: { input: number; output: number }) => p.input * 0.75 + p.output * 0.25;

/** Up to `max` choices (default 5) for OpenRouter: the free option first, then up to four paid ones spread from cheap to the strongest. */
export function recommendOpenRouter(prices: Map<string, Priced>, max = 5): Rec[] {
  const paid = CANDIDATES.map(c => ({ c, p: prices.get(c.id) })).filter((x): x is { c: (typeof CANDIDATES)[number]; p: Priced } => !!x.p && blended(x.p) > 0)
    .sort((a, b) => blended(a.p) - blended(b.p));
  const slots = Math.max(0, max - 1);
  let chosen = paid;
  if (paid.length > slots) {
    const idx = new Set<number>();
    for (let i = 0; i < slots; i++) idx.add(Math.round((i * (paid.length - 1)) / Math.max(1, slots - 1)));
    chosen = [...idx].sort((a, b) => a - b).map(i => paid[i]);
  }
  const tiers = chosen.length >= PAID_TIERS.length ? PAID_TIERS : PAID_TIERS.slice(0, chosen.length);
  const recs: Rec[] = [FREE_REC];
  chosen.forEach((x, i) => recs.push({ id: x.c.id, name: x.c.name, tier: tiers[i] ?? "Terbaik", note: x.c.note, free: false, price: { input: x.p.input, output: x.p.output } }));
  return recs.slice(0, max);
}

/** For a Google key: the cheapest tier first (lite), then flash, then pro; the newest of each that the key can use. */
export function recommendGoogle(models: string[]): Rec[] {
  const version = (n: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
  const stable = (n: string) => !/preview|exp|image|tts|live/i.test(n);
  const newest = (re: RegExp) => models.filter(m => re.test(m) && stable(m)).sort((a, b) => version(b) - version(a) || a.length - b.length)[0];
  const lite = newest(/flash-lite/), flash = newest(/flash(?!-lite)/), pro = newest(/-pro/);
  const out: Rec[] = [];
  if (lite) out.push({ id: lite, name: lite, tier: "Hemat", note: "paling hemat dan cepat", free: false });
  if (flash) out.push({ id: flash, name: flash, tier: "Seimbang", note: "seimbang: cepat dan pintar", free: false });
  if (pro) out.push({ id: pro, name: pro, tier: "Terbaik", note: "paling cerdas, paling mahal", free: false });
  return out;
}

const usd = (n: number) => (n < 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 10 ? 1 : 0)}`).replace(".", ",");
export const formatPrice = (p?: { input: number; output: number }) => (p ? `${usd(p.input)} / ${usd(p.output)} per 1 juta token (masuk / keluar)` : "");

let cached: Map<string, Priced> | null = null;
export async function fetchPrices(o: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<Map<string, Priced>> {
  if (cached) return cached;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  const onAbort = () => ctl.abort();
  o.signal?.addEventListener("abort", onAbort);
  try {
    const res = await (o.fetchImpl ?? fetch)("https://openrouter.ai/api/v1/models", { signal: ctl.signal });
    if (!res.ok) throw new Error("status " + res.status);
    const prices = parsePrices(await res.json());
    if (prices.size === 0) throw new Error("empty");
    cached = prices;
    return prices;
  } finally { clearTimeout(timer); o.signal?.removeEventListener("abort", onAbort); }
}
export const resetPricesCache = () => { cached = null; };
