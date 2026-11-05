"use client";

import { useEffect, useRef, useState } from "react";
import { isFreeModel } from "@/lib/ai-budget";
import { GeminiError } from "@/lib/gemini";
import { chooseModel, isOpenRouter, listAvailableModels, notifyAccessChanged, OPENROUTER_FREE_MODEL } from "@/lib/gemini-access";
import { fetchFreeModels } from "@/lib/openrouter-free";
import { allowPaidModel } from "@/lib/paid-consent";
import { useGeminiAccess } from "./useGeminiAccess";

const RECENT_KEY = "clipper:ai-recent-models:v1";
const MAX_RECENT = 6;
const readRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : []; } catch { return []; } };
const writeRecent = (list: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch { /* storage blocked */ } };
const tag = (id: string) => (isFreeModel(id) ? "gratis" : "bisa ditagih");

/**
 * The AI model in use, right where AI is used: change it here and every AI feature follows (the setting is the same one as in the
 * AI settings). Free models come from OpenRouter's public list; models used before are remembered so a paid one can be picked
 * again in one tap. A model that is not free is labelled, and nothing is ever switched without the creator picking it.
 */
export default function AiModelSelect({ onPick, disabled }: { onPick?: (model: string) => void; disabled?: boolean }) {
  const access = useGeminiAccess();
  const [free, setFree] = useState<{ id: string; name: string }[]>([]);
  const [listed, setListed] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadedList, setLoadedList] = useState(false);
  const [custom, setCustom] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setRecent(readRecent()); }, []);

  const model = access?.model ?? "";
  const openRouter = !!access && isOpenRouter(access.baseUrl);
  // Remember what is in use, so it can be chosen again later.
  useEffect(() => {
    if (!model) return;
    const next = [model, ...readRecent().filter(x => x !== model)];
    writeRecent(next); setRecent(next.slice(0, MAX_RECENT));
  }, [model]);
  // OpenRouter's free list is public: load it right away.
  useEffect(() => {
    if (!openRouter) return;
    const ctl = new AbortController();
    fetchFreeModels({ signal: ctl.signal }).then(m => { if (alive.current) setFree(m.map(x => ({ id: x.id, name: x.name }))); }).catch(() => { /* the list is a convenience */ });
    return () => ctl.abort();
  }, [openRouter]);

  async function loadList() {
    if (!access || loadedList || busy) return;
    setBusy(true); setError("");
    try { const list = await listAvailableModels(access); if (alive.current) { setListed(list); setLoadedList(true); } }
    catch (e) { if (alive.current) setError(e instanceof GeminiError ? e.message : "Daftar model gagal diambil."); }
    finally { if (alive.current) setBusy(false); }
  }
  async function pick(id: string) {
    if (!access || !id || id === model) return;
    setBusy(true); setError("");
    try { await chooseModel(access, id); allowPaidModel(id); notifyAccessChanged(); onPick?.(id); }
    catch (e) { if (alive.current) setError(e instanceof GeminiError ? e.message : "Model gagal disimpan. Coba lagi."); }
    finally { if (alive.current) setBusy(false); }
  }

  if (!access) return null;
  const seen = new Set<string>();
  const options: { id: string; label: string }[] = [];
  const add = (id: string, name?: string) => { if (!id || seen.has(id)) return; seen.add(id); options.push({ id, label: `${name && name !== id ? name : id} · ${tag(id)}` }); };
  add(model);
  if (openRouter) add(OPENROUTER_FREE_MODEL, "Otomatis (OpenRouter memilih model gratis yang tersedia)");
  for (const r of recent) add(r);
  for (const m of free) add(m.id, m.name);
  for (const id of listed) add(id);
  return <div className="ai-model-select" data-testid="ai-model-select">
    <label>Model AI yang dipakai
      <select value={model} onChange={e => void pick(e.target.value)} onFocus={() => { if (!openRouter) void loadList(); }} disabled={disabled || busy} data-testid="ai-model-pick">
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
    <small className="field-hint" data-testid="ai-model-hint">{isFreeModel(model) ? "Model gratis kadang lambat atau penuh. Bila terlalu lama menjawab, pilih model lain di sini lalu coba lagi." : "Model ini bisa ditagih penyedia; pemakaiannya masuk anggaran AI."} Berlaku untuk semua fitur AI.</small>
    <details className="ai-model-custom"><summary><small>Model berbayar atau model lain (ketik nama)</small></summary>
      <div className="button-row">
        <input value={custom} onChange={e => setCustom(e.target.value.slice(0, 120))} placeholder={openRouter ? "contoh: anthropic/claude-sonnet-4" : "nama model dari layanan Anda"} disabled={disabled || busy} data-testid="ai-model-custom" />
        <button type="button" onClick={() => { const id = custom.trim(); if (id) { void pick(id); setCustom(""); } }} disabled={disabled || busy || !custom.trim()} data-testid="ai-model-custom-set">Pakai model ini</button>
      </div>
      <small className="field-hint">Memilih model yang bisa ditagih berarti Anda setuju memakainya; pemakaiannya masuk anggaran AI.</small>
    </details>
    {error && <small className="notice notice-error" role="alert" data-testid="ai-model-error">{error}</small>}
  </div>;
}
