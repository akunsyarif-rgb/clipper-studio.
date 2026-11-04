// A model that may be billed is only used after the creator chose it on purpose: by picking it in the model list, or by saving
// a key with that model. The choice is remembered on this device per model, so there is no second question each time.
import { isFreeModel } from "./ai-budget";

const KEY = "clipper:ai-paid-ok:v1";
let memory: string[] = [];
const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : memory; } catch { return memory; } };
export function allowPaidModel(model: string) {
  if (!model || isFreeModel(model)) return;
  const next = [model, ...read().filter(x => x !== model)].slice(0, 20);
  memory = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept in memory */ }
}
/** Free models are always fine; any other needs the creator's earlier choice. */
export const isPaidAllowed = (model: string): boolean => isFreeModel(model) || read().includes(model);
