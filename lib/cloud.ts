// Optional sync of small text data (the work session and transcripts) between the creator's devices, through
// Supabase. Sync never carries media (a video goes to Content Hub only when the creator chooses it, see lib/content-hub.ts). Signed out, nothing is sent: every call quietly does nothing.
// Plain fetch against the Supabase REST endpoints (no SDK), so there is no extra dependency.
import type { SessionData } from "./session";
import { isSession } from "./session";
import type { Transcript } from "./transcript";

// Public by design: the URL and the publishable key only identify the project; row-level security protects the data.
export const CLOUD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://smwealrfgnzxquqqscxs.supabase.co";
export const CLOUD_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_uou0iIJfg6dMfrtcMa8DoQ_yvjWyY0n";
const STORAGE_KEY = "clipper:cloud:v1";
const SESSION_ID = "current";
const TIMEOUT_MS = 20_000;

export type CloudErrorKind = "disabled" | "credentials" | "closed" | "exists" | "unconfirmed" | "weak" | "network" | "expired" | "server";
export class CloudError extends Error {
  constructor(readonly kind: CloudErrorKind, message: string) { super(message); }
}

type Stored = { accessToken: string; refreshToken: string; expiresAt: number; email: string };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Fetch = typeof fetch;
export type CallOptions = { signal?: AbortSignal; timeoutMs?: number };
export type CloudOptions = { url?: string; key?: string; fetchImpl?: Fetch; store?: Store; now?: () => number };

const defaultStore = (): Store | undefined => { try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; } };

/** What the auth service said, in words the creator can act on (never containing the password). */
export function explainAuth(status: number, body: unknown): CloudError {
  const b = (body ?? {}) as { error_code?: string; code?: string | number; msg?: string; message?: string; error_description?: string };
  const code = String(b.error_code ?? b.code ?? "");
  const text = `${code} ${b.msg ?? b.message ?? b.error_description ?? ""}`;
  if (/email_provider_disabled|Email logins are disabled/i.test(text)) return new CloudError("disabled", "Login email dimatikan di Supabase. Nyalakan \"Enable Email provider\" di Authentication → Sign In / Providers → Email, lalu coba lagi.");
  if (/Database error saving new user|signup_disabled|signups? (are )?disabled/i.test(text)) return new CloudError("closed", "Pendaftaran ditolak: aplikasi ini masih pribadi dan biasanya akun pemiliknya sudah ada. Coba Masuk. Jika memang belum punya akun, buat dari dashboard Supabase.");
  if (/user_already_exists|already (been )?registered/i.test(text)) return new CloudError("exists", "Email ini sudah terdaftar. Pilih Masuk.");
  if (/email_not_confirmed|not confirmed/i.test(text)) return new CloudError("unconfirmed", "Email belum dikonfirmasi. Buka tautan di email dari Supabase (atau matikan \"Confirm email\" di pengaturan Auth).");
  if (/weak_password|at least \d+ characters|Password should/i.test(text)) return new CloudError("weak", "Kata sandi terlalu lemah. Pakai minimal 8 karakter.");
  if (/invalid_credentials|Invalid login|invalid_grant|Invalid Refresh Token|refresh_token/i.test(text)) return new CloudError("credentials", "Email atau kata sandi salah.");
  if (status === 429 || /over_request_rate_limit|rate limit/i.test(text)) return new CloudError("server", "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.");
  if (status === 401 || status === 403) return new CloudError("expired", "Sesi masuk berakhir. Masuk lagi.");
  return new CloudError("server", "Layanan sinkron sedang bermasalah. Coba lagi sebentar lagi.");
}

export function createCloud(o: CloudOptions = {}) {
  const url = o.url ?? CLOUD_URL, key = o.key ?? CLOUD_KEY;
  const doFetch = (u: string, init: RequestInit) => (o.fetchImpl ?? fetch)(u, init);
  const store = o.store ?? defaultStore();
  const now = o.now ?? (() => Date.now());
  const listeners = new Set<() => void>();
  let refreshing: Promise<Stored | null> | null = null;

  const read = (): Stored | null => {
    try {
      const v = JSON.parse(store?.getItem(STORAGE_KEY) ?? "null") as Partial<Stored> | null;
      return v && typeof v.accessToken === "string" && typeof v.refreshToken === "string" && typeof v.email === "string" && typeof v.expiresAt === "number" ? (v as Stored) : null;
    } catch { return null; }
  };
  const write = (s: Stored | null) => {
    try { if (s) store?.setItem(STORAGE_KEY, JSON.stringify(s)); else store?.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
    listeners.forEach(l => l());
  };

  async function call(path: string, init: RequestInit = {}, token?: string, opts: CallOptions = {}): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
    const onAbort = () => ctl.abort();
    if (opts.signal?.aborted) ctl.abort(); else opts.signal?.addEventListener("abort", onAbort);
    try {
      return await doFetch(`${url}${path}`, { ...init, headers: { apikey: key, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers as Record<string, string> | undefined) }, signal: ctl.signal });
    } catch { throw new CloudError("network", "Tidak bisa terhubung ke layanan sinkron. Periksa koneksi internet."); }
    finally { clearTimeout(timer); opts.signal?.removeEventListener("abort", onAbort); }
  }
  const json = async (res: Response): Promise<unknown> => { try { return await res.json(); } catch { return null; } };

  function toStored(body: unknown, fallbackEmail: string): Stored | null {
    const b = body as { access_token?: string; refresh_token?: string; expires_in?: number; expires_at?: number; user?: { email?: string } } | null;
    if (!b?.access_token || !b.refresh_token) return null;
    return { accessToken: b.access_token, refreshToken: b.refresh_token, expiresAt: b.expires_at ? b.expires_at * 1000 : now() + (b.expires_in ?? 3600) * 1000, email: b.user?.email ?? fallbackEmail };
  }

  async function signIn(email: string, password: string) {
    const res = await call("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
    const body = await json(res);
    if (!res.ok) throw explainAuth(res.status, body);
    const s = toStored(body, email);
    if (!s) throw new CloudError("server", "Jawaban layanan masuk tidak dikenali.");
    write(s);
    return s.email;
  }
  /** Creates the owner's account. Returns "signed-in", or "confirm" when the email must be confirmed first. */
  async function signUp(email: string, password: string): Promise<"signed-in" | "confirm"> {
    const res = await call("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email, password }) });
    const body = await json(res);
    if (!res.ok) throw explainAuth(res.status, body);
    const s = toStored(body, email);
    if (!s) return "confirm";
    write(s);
    return "signed-in";
  }
  const signOut = () => write(null);

  async function refresh(old: Stored): Promise<Stored | null> {
    refreshing ??= (async () => {
      try {
        const res = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: old.refreshToken }) });
        const s = res.ok ? toStored(await json(res), old.email) : null;
        if (s) write(s); else if (res.status >= 400 && res.status < 500) write(null);
        return s;
      } catch { return null; } finally { refreshing = null; }
    })();
    return refreshing;
  }
  async function token(): Promise<string | null> {
    let s = read();
    if (!s) return null;
    if (s.expiresAt - 60_000 < now()) s = await refresh(s);
    return s?.accessToken ?? null;
  }

  /** An authorised request; one refresh and retry on 401. Null when signed out. */
  async function rest(path: string, init: RequestInit = {}): Promise<Response | null> {
    const t = await token();
    if (!t) return null;
    let res = await call(`/rest/v1/${path}`, init, t);
    if (res.status === 401) {
      const s = read();
      const fresh = s ? await refresh(s) : null;
      if (!fresh) return null;
      res = await call(`/rest/v1/${path}`, init, fresh.accessToken);
    }
    return res;
  }
  /** Calls one of the project's server functions as the signed-in user (one refresh and retry on 401). Null when signed out. */
  async function fn(name: string, body: unknown, opts: CallOptions = {}): Promise<Response | null> {
    const t = await token();
    if (!t) return null;
    const init = { method: "POST", body: JSON.stringify(body) };
    const o = { timeoutMs: 120_000, ...opts };
    let res = await call(`/functions/v1/${name}`, init, t, o);
    if (res.status === 401) {
      const s = read();
      const fresh = s ? await refresh(s) : null;
      if (!fresh) return null;
      res = await call(`/functions/v1/${name}`, init, fresh.accessToken, o);
    }
    return res;
  }
  const upsert = (table: string, conflict: string, row: object) =>
    rest(`${table}?on_conflict=${conflict}`, { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });

  // Data calls never throw into the studio: sync is a convenience, so a failure just means "not synced this time".
  async function pushSession(s: SessionData): Promise<boolean> {
    try { const res = await upsert("app_sessions", "user_id,id", { id: SESSION_ID, data: s }); return !!res?.ok; } catch { return false; }
  }
  async function pullSession(): Promise<SessionData | null> {
    try {
      const res = await rest(`app_sessions?id=eq.${SESSION_ID}&select=data`);
      if (!res?.ok) return null;
      const rows = (await json(res)) as { data?: unknown }[] | null;
      const d = rows?.[0]?.data;
      return isSession(d) ? d : null;
    } catch { return null; }
  }
  async function putTranscript(cacheKey: string, t: Transcript): Promise<boolean> {
    try { const res = await upsert("app_transcripts", "user_id,cache_key", { cache_key: cacheKey, data: t }); return !!res?.ok; } catch { return false; }
  }
  async function getTranscript(cacheKey: string): Promise<Transcript | null> {
    try {
      const res = await rest(`app_transcripts?cache_key=eq.${encodeURIComponent(cacheKey)}&select=data`);
      if (!res?.ok) return null;
      const rows = (await json(res)) as { data?: Transcript }[] | null;
      const d = rows?.[0]?.data;
      return d && Array.isArray(d.segments) && d.segments.length ? d : null;
    } catch { return null; }
  }

  // The production history: one row per video (see lib/history-sync.ts). Never throws; null / false means "not synced this time".
  type HistoryRow = { id: string; data: unknown; deleted: boolean; updated_ms: number };
  async function pullHistory(): Promise<HistoryRow[] | null> {
    try {
      const res = await rest("app_history?select=id,data,deleted,updated_ms&order=updated_ms.desc&limit=1000");
      if (!res?.ok) return null;
      const rows = (await json(res)) as HistoryRow[] | null;
      return Array.isArray(rows) ? rows.filter(r => r && typeof r.id === "string" && typeof r.updated_ms === "number") : null;
    } catch { return null; }
  }
  async function pushHistory(rows: HistoryRow[]): Promise<boolean> {
    try {
      for (let i = 0; i < rows.length; i += 25) {
        const res = await rest("app_history?on_conflict=user_id,id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 25)) });
        if (!res?.ok) return false;
      }
      return true;
    } catch { return false; }
  }

  return {
    user: () => read()?.email ?? null,
    signIn, signUp, signOut, fn, pushSession, pullSession, putTranscript, getTranscript, pullHistory, pushHistory,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

/** The app-wide instance (the browser's storage and fetch). */
export const cloud = createCloud();
