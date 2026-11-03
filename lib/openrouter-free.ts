// The free models OpenRouter currently offers, from its public model list (no key needed). Used to pick one from a list instead of typing a name.
export type FreeModel = { id: string; name: string; context: number };
const URL_MODELS = "https://openrouter.ai/api/v1/models";

const isZero = (v: unknown) => v === 0 || v === "0" || v === "0.0" || (typeof v === "string" && Number(v) === 0 && v.trim() !== "");

/** Free text models, longest context first. Only models whose prompt and completion are both free. */
export function parseFreeModels(json: unknown): FreeModel[] {
  const list = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) return [];
  const out: FreeModel[] = [];
  for (const m of list as Record<string, unknown>[]) {
    const id = typeof m?.id === "string" ? m.id : "";
    const pricing = m?.pricing as { prompt?: unknown; completion?: unknown } | undefined;
    const outputs = (m?.architecture as { output_modalities?: unknown } | undefined)?.output_modalities;
    if (!id || id === "openrouter/free" || !(id.endsWith(":free") || (pricing && isZero(pricing.prompt) && isZero(pricing.completion)))) continue;
    if (Array.isArray(outputs) && !outputs.includes("text")) continue;
    out.push({ id, name: typeof m.name === "string" && m.name ? m.name : id, context: Number(m.context_length) || 0 });
  }
  return out.sort((a, b) => b.context - a.context || a.name.localeCompare(b.name));
}

let cached: FreeModel[] | null = null;
export async function fetchFreeModels(o: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<FreeModel[]> {
  if (cached) return cached;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  const onAbort = () => ctl.abort();
  o.signal?.addEventListener("abort", onAbort);
  try {
    const res = await (o.fetchImpl ?? fetch)(URL_MODELS, { signal: ctl.signal });
    if (!res.ok) throw new Error("status " + res.status);
    const models = parseFreeModels(await res.json());
    if (models.length === 0) throw new Error("empty");
    cached = models;
    return models;
  } finally { clearTimeout(timer); o.signal?.removeEventListener("abort", onAbort); }
}
export const resetFreeModelsCache = () => { cached = null; };
