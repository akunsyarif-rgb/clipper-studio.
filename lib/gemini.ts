// Optional help from Google's Gemini API to tidy up a transcript. Opt-in and local: the key is typed by the creator,
// kept in this browser only, and used to call Google directly from the page (there is no server). Only the transcript
// text is sent, never audio or video. The key is never put into an error message, a log, a project or an export.
import { alignWords, spreadWords, type Transcript, type Word } from "./transcript";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** A sensible starting model; the creator can change it because model names come and go. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
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
/** Sends the request body somewhere other than straight to Google (the owner's server, which holds the key). Null when signed out. */
export type Transport = (payload: object, opts: { signal: AbortSignal; timeoutMs: number }) => Promise<Response | null>;
export type CleanupOptions = { apiKey: string; model: string; language: string; fetchImpl?: Fetch; signal?: AbortSignal; timeoutMs?: number; transport?: Transport };

function explain(status: number, body: unknown): GeminiError {
  const err = (body as { error?: { status?: string; message?: string } } | null)?.error;
  const text = `${err?.status ?? ""} ${err?.message ?? ""}`;
  // Answers of the owner's own server, before Google's are considered.
  if (/NO_KEY/.test(text)) return new GeminiError("key", "Belum ada kunci Gemini di akun Anda. Simpan kunci di pengaturan Gemini.");
  if (/NOT_SIGNED_IN/.test(text)) return new GeminiError("key", "Sesi masuk berakhir. Masuk lagi.");
  if (/TOO_LARGE/.test(text) || status === 413) return new GeminiError("format", "Permintaan terlalu besar. Pilih bagian video yang lebih pendek.");
  if (/UPSTREAM_UNREACHABLE|AUTH_UNREACHABLE|DB_ERROR|SERVER_ERROR/.test(text)) return new GeminiError("server", "Server sinkron sedang bermasalah. Coba lagi sebentar lagi.");
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return new GeminiError("quota", "Batas pemakaian Gemini habis (kuota atau laju). Tunggu sebentar atau periksa kuota key Anda.");
  if (status === 404 || /NOT_FOUND|not found for API/i.test(text)) return new GeminiError("model", "Model tidak ditemukan. Periksa nama model di pengaturan Gemini.");
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED|referer/i.test(text)) return new GeminiError("key", "Key ditolak Google. Periksa key, izin API, atau batasan alamat situs pada key itu.");
  if (status >= 500) return new GeminiError("server", "Layanan Gemini sedang bermasalah. Coba lagi sebentar lagi.");
  return new GeminiError("format", "Permintaan ditolak oleh Gemini. Coba lagi, atau periksa nama model.");
}

/** The JSON the model answered with (it may sit inside a code fence), after the safety checks. */
function answerJson(response: unknown): unknown {
  const r = response as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] } | null;
  if (r?.promptFeedback?.blockReason) throw new GeminiError("blocked", "Gemini menolak memproses teks ini (diblokir oleh filter keamanannya).");
  const cand = r?.candidates?.[0];
  if (cand?.finishReason && /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/.test(cand.finishReason)) throw new GeminiError("blocked", "Gemini menghentikan jawabannya karena filter keamanan.");
  const text = (cand?.content?.parts ?? []).map(p => p.text ?? "").join("").trim();
  if (!text) throw new GeminiError("format", "Gemini tidak memberi jawaban. Coba lagi.");
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
  catch { throw new GeminiError("format", "Jawaban Gemini tidak berbentuk JSON yang bisa dibaca. Coba lagi."); }
}

/** Reads the answer: a JSON object with `lines`, possibly inside a code fence, with exactly `expected` strings. */
export function parseLines(response: unknown, expected: number): string[] {
  const parsed = answerJson(response);
  const lines = Array.isArray(parsed) ? parsed : (parsed as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines) || !lines.every(l => typeof l === "string")) throw new GeminiError("format", "Jawaban Gemini tidak berisi daftar baris. Coba lagi.");
  if (lines.length !== expected) throw new GeminiError("format", `Gemini mengembalikan ${lines.length} baris, seharusnya ${expected}. Coba lagi.`);
  return lines as string[];
}

/** One call to the model. The key travels in a header, never in the address. One automatic retry if the answer is malformed. */
async function ask<T>(o: CleanupOptions, parts: unknown[], schema: object, parse: (json: unknown) => T): Promise<T> {
  const fetchImpl = o.fetchImpl ?? fetch;
  const payload = { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schema } };
  const body = JSON.stringify(payload);
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(o.model)}:generateContent`;
  const once = async () => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? TIMEOUT_MS);
    const onAbort = () => ctl.abort();
    o.signal?.addEventListener("abort", onAbort);
    try {
      const res = o.transport
        ? await o.transport(payload, { signal: ctl.signal, timeoutMs: o.timeoutMs ?? TIMEOUT_MS })
        : await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey }, body, signal: ctl.signal });
      if (!res) throw new GeminiError("key", "Sesi masuk berakhir. Masuk lagi.");
      let json: unknown = null;
      try { json = await res.json(); } catch { /* an error page without JSON */ }
      if (!res.ok) throw explain(res.status, json);
      return parse(json);
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

const LINES_SCHEMA = { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "STRING" } } }, required: ["lines"] };

/** Sends the lines to Gemini and returns the corrected lines (same count). With `audio`, the model also listens to the speech. */
export async function cleanupLines(lines: string[], o: CleanupOptions & { audio?: AudioPart; starts?: number[] }): Promise<string[]> {
  if (lines.length === 0) return [];
  const text = o.audio ? audioCleanupPrompt(lines, o.starts ?? [], o.language) : cleanupPrompt(lines, o.language);
  const parts: unknown[] = [...(o.audio ? [{ inlineData: { mimeType: o.audio.mimeType, data: o.audio.data } }] : []), { text }];
  return ask(o, parts, LINES_SCHEMA, json => parseLines(json, lines.length));
}

// ---- which models this key can use -------------------------------------------------------------------------------
// Model names come and go (older ones are switched off), so the app asks Google instead of trusting a fixed name.

const NOT_TEXT = /image|tts|embedding|live|aqa|imagen|veo|robotics|computer-use|native-audio|audio-dialog|learnlm|gemma/i;

/** The Gemini models in a model-list answer that can write text from text and audio, best first: stable before preview, flash before pro/lite, newer first. */
export function parseModelList(json: unknown): string[] {
  const list = (json as { models?: { name?: string; supportedGenerationMethods?: string[] }[] } | null)?.models;
  if (!Array.isArray(list)) throw new GeminiError("format", "Daftar model dari Google tidak terbaca. Coba lagi.");
  const names = list
    .filter(m => typeof m?.name === "string" && /^models\/gemini-/.test(m.name) && (m.supportedGenerationMethods ?? []).includes("generateContent") && !NOT_TEXT.test(m.name))
    .map(m => m.name!.replace(/^models\//, ""));
  const version = (n: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
  const rank = (n: string) => (/preview|exp/i.test(n) ? 100 : 0) + (/lite/i.test(n) ? 20 : /pro/i.test(n) ? 10 : /flash/i.test(n) ? 0 : 30);
  return [...new Set(names)].sort((a, b) => rank(a) - rank(b) || version(b) - version(a) || a.localeCompare(b));
}

/** Asks Google which models a key can use (straight from the browser). */
export async function listModelsDirect(apiKey: string, o: { fetchImpl?: Fetch; signal?: AbortSignal } = {}): Promise<string[]> {
  let res: Response;
  try { res = await (o.fetchImpl ?? fetch)(`${GEMINI_ENDPOINT}?pageSize=200`, { headers: { "x-goog-api-key": apiKey }, signal: o.signal }); }
  catch { throw new GeminiError("network", "Tidak bisa terhubung ke Gemini. Periksa koneksi internet (atau pemblokir iklan)."); }
  let json: unknown = null;
  try { json = await res.json(); } catch { /* an error page */ }
  if (!res.ok) throw explain(res.status, json);
  return parseModelList(json);
}

// ---- listening to the speech (the creator opts in each time) -----------------------------------------------------

/** Inline audio must keep the whole request under about 20 MB; 16 kHz mono 16-bit is 32 kB per second. */
export const MAX_AUDIO_SECONDS = 360;
export type AudioPart = { mimeType: string; data: string };

/** 16 kHz mono samples as a base64 WAV, ready to attach to a request. */
export function wavPart(samples: Float32Array, rate = 16000): AudioPart {
  if (samples.length / rate > MAX_AUDIO_SECONDS) throw new GeminiError("format", `Audio terlalu panjang untuk dikirim (maksimal ${MAX_AUDIO_SECONDS / 60} menit). Pilih bagian video yang lebih pendek.`);
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const tag = (at: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(at + i, t.charCodeAt(i)); };
  tag(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); tag(8, "WAVE"); tag(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mimeType: "audio/wav", data: btoa(bin) };
}

/** Like the text-only instruction, but the model also hears the speech and each line carries the second it starts. */
export function audioCleanupPrompt(lines: string[], starts: number[], language: string): string {
  const lang = language === "en" ? "bahasa Inggris" : "bahasa Indonesia";
  return [
    `Terlampir audio sebuah video (${lang}) beserta transkrip otomatisnya yang berisi salah dengar. Dengarkan audionya dan perbaiki transkrip.`,
    "Aturan:",
    "- tiap baris adalah potongan ucapan pada detik mulai yang tertera; dengarkan bagian itu untuk memastikan kata yang benar;",
    "- perbaiki kata yang salah dengar, nama merek, istilah, angka, ejaan dan tanda baca; pertahankan gaya bicara dan urutan kata (bahasa gaul tetap gaul);",
    "- jangan menambah, membuang, memecah, atau menggabungkan baris: jumlah baris keluaran harus persis sama dengan masukan;",
    "- bila audio tidak jelas, biarkan baris apa adanya; jangan mengarang kata yang tidak diucapkan.",
    "Balas hanya JSON dengan bentuk {\"lines\": [...]} sesuai urutan masukan.",
    "",
    `Detik mulai tiap baris: ${JSON.stringify(starts.map(x => Math.round(x * 10) / 10))}`,
    "Masukan (JSON):",
    JSON.stringify(lines),
  ].join("\n");
}

// ---- judging which sentences deserve an animation ----------------------------------------------------------------

export type SceneScore = { score: number; reason: string };

export function judgePrompt(scenes: { text: string; seconds: number }[], language: string): string {
  const lang = language === "en" ? "bahasa Inggris" : "bahasa Indonesia";
  return [
    `Kamu membantu editor video pendek (${lang}). Berikut kalimat-kalimat sebuah video yang dibacakan satu per satu. Nilai tiap kalimat 0 sampai 1: seberapa pantas diberi animasi grafis di atas pembicara.`,
    "Nilai tinggi: istilah/merek populer, angka atau uang, perbandingan, ajakan bertindak, poin kunci yang perlu diingat penonton.",
    "Nilai rendah: basa-basi, pengisi, transisi, pengulangan, kalimat yang cukup didengar saja.",
    "Beri alasan singkat (maksimal 6 kata, bahasa Indonesia). Jangan menilai berdasarkan panjang kalimat saja.",
    "Balas hanya JSON {\"scenes\": [{\"index\": n, \"score\": 0..1, \"reason\": \"...\"}]} untuk setiap kalimat.",
    "",
    "Masukan (JSON):",
    JSON.stringify(scenes.map((s, index) => ({ index, text: s.text.replace(/\*/g, ""), seconds: Math.round(s.seconds * 10) / 10 }))),
  ].join("\n");
}

/** Scores by scene index; a scene the model skipped or scored with something that is not a number stays undefined. */
export function parseScores(response: unknown, expected: number): (SceneScore | undefined)[] {
  const parsed = answerJson(response);
  const list = Array.isArray(parsed) ? parsed : (parsed as { scenes?: unknown } | null)?.scenes;
  if (!Array.isArray(list)) throw new GeminiError("format", "Jawaban Gemini tidak berisi daftar nilai. Coba lagi.");
  const out: (SceneScore | undefined)[] = Array.from({ length: expected }, () => undefined);
  for (const item of list as { index?: unknown; score?: unknown; reason?: unknown }[]) {
    if (typeof item?.index !== "number" || !Number.isInteger(item.index) || item.index < 0 || item.index >= expected) continue;
    if (typeof item.score !== "number" || !Number.isFinite(item.score)) continue;
    out[item.index] = { score: Math.round(Math.min(1, Math.max(0, item.score)) * 100) / 100, reason: String(item.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 60) };
  }
  if (!out.some(Boolean)) throw new GeminiError("format", "Gemini tidak memberi nilai yang bisa dipakai. Coba lagi.");
  return out;
}

/** Asks Gemini how much each sentence deserves an animation. Only the sentences' text is sent. */
export async function judgeScenesWithGemini(scenes: { text: string; seconds: number }[], o: CleanupOptions): Promise<(SceneScore | undefined)[]> {
  if (scenes.length === 0) return [];
  const schema = { type: "OBJECT", properties: { scenes: { type: "ARRAY", items: { type: "OBJECT", properties: { index: { type: "INTEGER" }, score: { type: "NUMBER" }, reason: { type: "STRING" } }, required: ["index", "score", "reason"] } } }, required: ["scenes"] };
  return ask(o, [{ text: judgePrompt(scenes, o.language) }], schema, json => parseScores(json, scenes.length));
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
