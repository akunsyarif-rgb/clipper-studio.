// Where the Gemini key lives. Signed in, the key is kept on the owner's server (Supabase) and every call goes through it,
// so a device never holds the key. Signed out, it stays in this browser as before.
import { cloud } from "./cloud";
import { cleanKey, DEFAULT_GEMINI_MODEL, GeminiError, listModelsDirect, loadGeminiSettings, parseModelList, saveGeminiSettings, type Transport } from "./gemini";

export type Access = { where: "server" | "device"; model: string; /** Empty when the key is on the server. */ apiKey: string; transport?: Transport };

const serverTransport = (model: string): Transport => (payload, o) => cloud.fn("gemini", { action: "generate", model, body: payload }, o);

/** What is available right now: the server's key if signed in and one is saved there, else this device's key, else nothing. */
export async function getAccess(): Promise<Access | null> {
  if (cloud.user()) {
    try {
      const res = await cloud.fn("gemini", { action: "status" }, { timeoutMs: 15_000 });
      if (res?.ok) {
        const s = (await res.json()) as { hasKey?: boolean; model?: string };
        if (s.hasKey) { const model = s.model || DEFAULT_GEMINI_MODEL; return { where: "server", model, apiKey: "", transport: serverTransport(model) }; }
      }
    } catch { /* offline: fall back to the device's key */ }
  }
  const local = loadGeminiSettings();
  return local ? { where: "device", model: local.model, apiKey: local.apiKey } : null;
}

async function ok(res: Response | null, what: string) {
  if (!res) throw new GeminiError("key", "Sesi masuk berakhir. Masuk lagi.");
  if (!res.ok) throw new GeminiError("server", `${what} gagal. Coba lagi sebentar lagi.`);
}

/** Puts the key on the server (signed in only). It is not kept in this browser. */
export async function saveToServer(rawKey: string, model: string): Promise<void> {
  const apiKey = cleanKey(rawKey);
  if (!apiKey) throw new GeminiError("key", "Kunci tidak valid. Tempel seluruh kunci API Gemini (tanpa spasi).");
  await ok(await cloud.fn("gemini", { action: "save-key", apiKey, model: model.trim() || DEFAULT_GEMINI_MODEL }, { timeoutMs: 20_000 }), "Menyimpan kunci");
}

/** The models the key can use. A key typed but not saved yet can be passed; otherwise the saved key (server or device) is used. */
export async function listAvailableModels(access: Access | null, typedKey?: string): Promise<string[]> {
  const typed = typedKey ? cleanKey(typedKey) : null;
  if (typed && !cloud.user()) return listModelsDirect(typed);
  if (access?.where === "device" && !typed) return listModelsDirect(access.apiKey);
  const res = await cloud.fn("gemini", typed ? { action: "list-models", apiKey: typed } : { action: "list-models" }, { timeoutMs: 40_000 });
  if (!res) throw new GeminiError("key", "Sesi masuk berakhir. Masuk lagi.");
  let json: unknown = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const code = (json as { error?: { status?: string } } | null)?.error?.status ?? "";
    throw new GeminiError(/NO_KEY/.test(code) ? "key" : res.status === 400 || res.status === 403 ? "key" : "server", /NO_KEY/.test(code) ? "Belum ada kunci Gemini di akun Anda." : res.status === 400 || res.status === 403 ? "Kunci ditolak Google. Periksa kuncinya." : "Daftar model gagal diambil. Coba lagi.");
  }
  return parseModelList(json);
}

/** Remembers which model to use (on the server when the key is there, else in this browser). */
export async function chooseModel(access: Access, model: string): Promise<void> {
  if (access.where === "server") await ok(await cloud.fn("gemini", { action: "set-model", model }, { timeoutMs: 20_000 }), "Menyimpan model");
  else { const s = loadGeminiSettings(); if (s) saveGeminiSettings({ ...s, model }); }
}

export async function forgetOnServer(): Promise<void> {
  await ok(await cloud.fn("gemini", { action: "forget" }, { timeoutMs: 20_000 }), "Menghapus kunci");
}
