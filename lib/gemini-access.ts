// Where the AI key lives. Signed in, the key is kept on the owner's server (Supabase) and every call goes through it, so a
// device never holds the key; it belongs to Google's Gemini API or to an OpenAI-format router (such as Flatkey).
// Signed out, only a Google key is possible and it stays in this browser.
import { cloud } from "./cloud";
import { cleanKey, DEFAULT_GEMINI_MODEL, GeminiError, listModelsDirect, loadGeminiSettings, parseModelList, parseOpenAiModels, saveGeminiSettings, type Transport } from "./gemini";

export type Provider = "google" | "openai";
export type Access = {
  where: "server" | "device";
  provider: Provider;
  /** The router's base address (OpenAI-format providers only). */
  baseUrl: string | null;
  model: string;
  /** Empty when the key is on the server. */
  apiKey: string;
  format: "gemini" | "openai";
  transport?: Transport;
};

/** What the creator typed in the setup form, before anything is saved. */
export type Setup = { key: string; provider: Provider; baseUrl: string };

export const OPENROUTER_URL = "https://openrouter.ai/api/v1";
export const FLATKEY_URL = "https://router.flatkey.ai/v1";
/** Ready-made addresses for OpenAI-format routers; "other" lets the creator type one. */
export const ROUTER_PRESETS = [
  { id: "openrouter", label: "OpenRouter (openrouter.ai)", url: OPENROUTER_URL, modelHint: "google/gemini-2.5-flash-lite" },
  { id: "flatkey", label: "Flatkey", url: FLATKEY_URL, modelHint: "google/gemini-…" },
  { id: "other", label: "Lainnya (ketik alamat sendiri)", url: "", modelHint: "nama model dari layanan Anda" },
] as const;

const serverTransport = (model: string): Transport => (payload, o) => cloud.fn("gemini", { action: "generate", model, body: payload }, o);

/** What is available right now: the server's key if signed in and one is saved there, else this device's key, else nothing. */
export async function getAccess(): Promise<Access | null> {
  if (cloud.user()) {
    try {
      const res = await cloud.fn("gemini", { action: "status" }, { timeoutMs: 15_000 });
      if (res?.ok) {
        const s = (await res.json()) as { hasKey?: boolean; model?: string; provider?: Provider; baseUrl?: string | null };
        if (s.hasKey) {
          const provider: Provider = s.provider === "openai" ? "openai" : "google";
          const model = s.model || (provider === "google" ? DEFAULT_GEMINI_MODEL : "");
          return { where: "server", provider, baseUrl: s.baseUrl ?? null, model, apiKey: "", format: provider === "openai" ? "openai" : "gemini", transport: serverTransport(model) };
        }
      }
    } catch { /* offline: fall back to the device's key */ }
  }
  const local = loadGeminiSettings();
  return local ? { where: "device", provider: "google", baseUrl: null, model: local.model, apiKey: local.apiKey, format: "gemini" } : null;
}

async function ok(res: Response | null, what: string) {
  if (!res) throw new GeminiError("key", "Sesi masuk berakhir. Masuk lagi.");
  if (!res.ok) {
    let code = "";
    try { code = ((await res.json()) as { error?: { status?: string } }).error?.status ?? ""; } catch { /* not JSON */ }
    if (code === "BAD_BASE_URL") throw new GeminiError("key", "Alamat dasar harus alamat https publik, mis. https://router.flatkey.ai/v1.");
    throw new GeminiError("server", `${what} gagal. Coba lagi sebentar lagi.`);
  }
}

/** Puts the key on the server (signed in only). It is not kept in this browser. */
export async function saveToServer(rawKey: string, model: string, provider: Provider = "google", baseUrl = ""): Promise<void> {
  const apiKey = cleanKey(rawKey);
  if (!apiKey) throw new GeminiError("key", "Kunci tidak valid. Tempel seluruh kunci API (tanpa spasi).");
  const name = model.trim() || (provider === "google" ? DEFAULT_GEMINI_MODEL : "");
  await ok(await cloud.fn("gemini", { action: "save-key", apiKey, model: name, provider, baseUrl: provider === "openai" ? baseUrl.trim() : undefined }, { timeoutMs: 20_000 }), "Menyimpan kunci");
}

/**
 * The models the key can use. A key typed but not saved yet can be passed (with its provider and address); otherwise the
 * saved key (server or device) is used.
 */
export async function listAvailableModels(access: Access | null, setup?: Setup): Promise<string[]> {
  const typed = setup?.key ? cleanKey(setup.key) : null;
  const provider: Provider = typed ? setup!.provider : access?.provider ?? "google";
  if (!cloud.user()) {
    const key = typed ?? (access?.where === "device" ? access.apiKey : null);
    if (!key) throw new GeminiError("key", "Tempel kunci dulu.");
    if (provider === "openai") throw new GeminiError("key", "Layanan berformat OpenAI hanya bisa dipakai setelah masuk ke akun.");
    return listModelsDirect(key);
  }
  if (!typed && access?.where === "device") return listModelsDirect(access.apiKey);
  const res = await cloud.fn("gemini", typed ? { action: "list-models", apiKey: typed, provider, baseUrl: setup!.baseUrl.trim() } : { action: "list-models" }, { timeoutMs: 40_000 });
  if (!res) throw new GeminiError("key", "Sesi masuk berakhir. Masuk lagi.");
  let json: unknown = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const code = (json as { error?: { status?: string } } | null)?.error?.status ?? "";
    if (code === "BAD_BASE_URL") throw new GeminiError("key", "Alamat dasar harus alamat https publik, mis. https://router.flatkey.ai/v1.");
    if (/NO_KEY/.test(code) || res.status === 400 || res.status === 401 || res.status === 403) throw new GeminiError("key", /NO_KEY/.test(code) ? "Belum ada kunci di akun Anda." : "Kunci ditolak oleh layanan. Periksa kuncinya (dan alamat dasar).");
    throw new GeminiError("server", "Daftar model gagal diambil. Coba lagi.");
  }
  return provider === "openai" ? parseOpenAiModels(json) : parseModelList(json);
}

/** Remembers which model to use (on the server when the key is there, else in this browser). */
export async function chooseModel(access: Access, model: string): Promise<void> {
  if (access.where === "server") await ok(await cloud.fn("gemini", { action: "set-model", model }, { timeoutMs: 20_000 }), "Menyimpan model");
  else { const s = loadGeminiSettings(); if (s) saveGeminiSettings({ ...s, model }); }
}

export async function forgetOnServer(): Promise<void> {
  await ok(await cloud.fn("gemini", { action: "forget" }, { timeoutMs: 20_000 }), "Menghapus kunci");
}
