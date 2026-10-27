// Optional help from Google's Gemini API to tidy up a transcript. Opt-in and local: the key is typed by the creator,
// kept in this browser only, and used to call Google directly from the page (there is no server). Only the transcript
// text is sent, never audio or video. The key is never put into an error message, a log, a project or an export.
import { alignWords, spreadWords, type Transcript, type Word } from "./transcript";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** A sensible starting model; the creator can change it because model names come and go. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 60_000;

export type GeminiErrorKind = "key" | "model" | "quota" | "blocked" | "network" | "timeout" | "server" | "format";
export class GeminiError extends Error {
  constructor(readonly kind: GeminiErrorKind, message: string) { super(message); }
}

// ---- settings (this browser only) --------------------------------------------------------------------------------

export type GeminiSettings = { apiKey: string; model: string; /** The creator agreed that transcript text is sent to Google. */ consent: boolean };
const STORAGE_KEY = "clipper:gemini:v1";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const defaultStore = (): Store | undefined => { try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; } };

/** A key as typed is trimmed; one with spaces or line breaks inside is a paste mistake, not a key. */
export function cleanKey(raw: string): string | null {
  const k = raw.trim();
  return k.length >= 20 && !/\s/.test(k) ? k : null;
}

export function loadGeminiSettings(store: Store | undefined = defaultStore()): GeminiSettings | null {
  try {
    const v = JSON.parse(store?.getItem(STORAGE_KEY) ?? "null") as Partial<GeminiSettings> | null;
    if (!v || typeof v.apiKey !== "string" || !cleanKey(v.apiKey) || typeof v.model !== "string" || v.consent !== true) return null;
    return { apiKey: v.apiKey, model: v.model || DEFAULT_GEMINI_MODEL, consent: true };
  } catch { return null; }
}
export function saveGeminiSettings(s: GeminiSettings, store: Store | undefined = defaultStore()): boolean {
  try { if (!store) return false; store.setItem(STORAGE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function clearGeminiSettings(store: Store | undefined = defaultStore()) { try { store?.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ } }

/** "AIza••••••••k3Xz": enough to recognise the key, not enough to use it. */
export function maskKey(key: string): string {
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

// ---- the request -------------------------------------------------------------------------------------------------

/** The instruction sent with the lines of a transcript. */
export function cleanupPrompt(lines: string[], language: string): string {
  const lang = language === "en" ? "bahasa Inggris" : "bahasa Indonesia";
  return [
    `Kamu merapikan transkrip otomatis (${lang}) dari sebuah video, yang dihasilkan pengenal suara dan berisi salah dengar.`,
    "Aturan:",
    "- perbaiki kata yang salah dengar, nama merek, istilah, ejaan dan tanda baca berdasarkan konteks seluruh teks;",
    "- pertahankan gaya bicara, kata-kata asli, dan urutannya (bahasa gaul tetap gaul); jangan meringkas atau menulis ulang;",
    "- jangan menambah, membuang, memecah, atau menggabungkan baris: jumlah baris keluaran harus persis sama dengan masukan;",
    "- bila ragu pada satu kata, biarkan apa adanya.",
    "Balas hanya JSON dengan bentuk {\"lines\": [...]} berisi baris yang sudah diperbaiki, sesuai urutan masukan.",
    "",
    "Masukan (JSON):",
    JSON.stringify(lines),
  ].join("\n");
}

type Fetch = typeof fetch;
export type CleanupOptions = { apiKey: string; model: string; language: string; fetchImpl?: Fetch; signal?: AbortSignal; timeoutMs?: number };

function explain(status: number, body: unknown): GeminiError {
  const err = (body as { error?: { status?: string; message?: string } } | null)?.error;
  const text = `${err?.status ?? ""} ${err?.message ?? ""}`;
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return new GeminiError("quota", "Batas pemakaian Gemini habis (kuota atau laju). Tunggu sebentar atau periksa kuota key Anda.");
  if (status === 404 || /NOT_FOUND|not found for API/i.test(text)) return new GeminiError("model", "Model tidak ditemukan. Periksa nama model di pengaturan Gemini.");
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED|referer/i.test(text)) return new GeminiError("key", "Key ditolak Google. Periksa key, izin API, atau batasan alamat situs pada key itu.");
  if (status >= 500) return new GeminiError("server", "Layanan Gemini sedang bermasalah. Coba lagi sebentar lagi.");
  return new GeminiError("format", "Permintaan ditolak oleh Gemini. Coba lagi, atau periksa nama model.");
}

/** Reads the answer: a JSON object with `lines`, possibly inside a code fence, with exactly `expected` strings. */
export function parseLines(response: unknown, expected: number): string[] {
  const r = response as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] } | null;
  if (r?.promptFeedback?.blockReason) throw new GeminiError("blocked", "Gemini menolak memproses teks ini (diblokir oleh filter keamanannya).");
  const cand = r?.candidates?.[0];
  if (cand?.finishReason && /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/.test(cand.finishReason)) throw new GeminiError("blocked", "Gemini menghentikan jawabannya karena filter keamanan.");
  const text = (cand?.content?.parts ?? []).map(p => p.text ?? "").join("").trim();
  if (!text) throw new GeminiError("format", "Gemini tidak memberi jawaban. Coba lagi.");
  let parsed: unknown;
  try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
  catch { throw new GeminiError("format", "Jawaban Gemini tidak berbentuk JSON yang bisa dibaca. Coba lagi."); }
  const lines = Array.isArray(parsed) ? parsed : (parsed as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines) || !lines.every(l => typeof l === "string")) throw new GeminiError("format", "Jawaban Gemini tidak berisi daftar baris. Coba lagi.");
  if (lines.length !== expected) throw new GeminiError("format", `Gemini mengembalikan ${lines.length} baris, seharusnya ${expected}. Coba lagi.`);
  return lines as string[];
}

/** Sends the lines to Gemini and returns the corrected lines (same count). One automatic retry if the answer is malformed. */
export async function cleanupLines(lines: string[], o: CleanupOptions): Promise<string[]> {
  if (lines.length === 0) return [];
  const fetchImpl = o.fetchImpl ?? fetch;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: cleanupPrompt(lines, o.language) }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "STRING" } } }, required: ["lines"] },
    },
  });
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(o.model)}:generateContent`;
  const once = async () => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? TIMEOUT_MS);
    const onAbort = () => ctl.abort();
    o.signal?.addEventListener("abort", onAbort);
    try {
      // The key travels in a header, never in the address (addresses end up in logs and history).
      const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey }, body, signal: ctl.signal });
      let json: unknown = null;
      try { json = await res.json(); } catch { /* an error page without JSON */ }
      if (!res.ok) throw explain(res.status, json);
      return parseLines(json, lines.length);
    } catch (e) {
      if (e instanceof GeminiError) throw e;
      if (o.signal?.aborted) throw new GeminiError("timeout", "Dibatalkan.");
      if (ctl.signal.aborted) throw new GeminiError("timeout", "Gemini terlalu lama menjawab. Coba lagi, atau pakai bagian video yang lebih pendek.");
      throw new GeminiError("network", "Tidak bisa terhubung ke Gemini. Periksa koneksi internet (atau pemblokir iklan).");
    } finally { clearTimeout(timer); o.signal?.removeEventListener("abort", onAbort); }
  };
  try { return await once(); }
  catch (e) { if (e instanceof GeminiError && e.kind === "format") return once(); throw e; }
}

// ---- turning the answer into a better transcript -----------------------------------------------------------------

const norm = (w: string) => w.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");
const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** 0..1: how much of the two lines is the same words, order kept (1 = identical, 0 = nothing in common). */
export function lineSimilarity(a: string, b: string): number {
  const x = words(a).map(norm), y = words(b).map(norm);
  if (x.length === 0 && y.length === 0) return 1;
  const row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return 1 - row[y.length] / Math.max(x.length, y.length);
}

export type LineChange = { index: number; before: string; after: string; similarity: number; /** So different that it is probably a rewrite, not a correction. */ large: boolean };

/** The lines Gemini changed (an empty answer for a line counts as "no change"), with how far each moved. */
export function changedLines(before: string[], after: string[]): LineChange[] {
  const out: LineChange[] = [];
  before.forEach((b, index) => {
    const a = (after[index] ?? "").replace(/\s+/g, " ").trim();
    if (!a || a === b.replace(/\s+/g, " ").trim()) return;
    const similarity = lineSimilarity(b, a);
    out.push({ index, before: b, after: a, similarity, large: similarity < 0.5 });
  });
  return out;
}

/** Applies the accepted lines to a transcript, keeping the timing of the words that stayed (aligned, not guessed). */
export function applyCleanup(t: Transcript, changes: LineChange[], accepted: ReadonlySet<number>): Transcript {
  const byIndex = new Map(changes.filter(c => accepted.has(c.index)).map(c => [c.index, c.after]));
  const segments = t.segments.map((seg, i) => {
    const text = byIndex.get(i);
    if (text === undefined) return seg;
    const list = words(text);
    // The same number of words: each keeps the time of the word it replaces. Otherwise align, then spread as a last resort.
    const timed: Word[] = list.length === seg.words.length
      ? seg.words.map((w, k) => ({ ...w, text: list[k] }))
      : alignWords(list, seg.words) ?? spreadWords(text, seg.start, seg.end);
    return { ...seg, text: list.join(" "), words: timed };
  });
  return { ...t, segments };
}
