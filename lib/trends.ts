// The trend radar's client: asks the `trends` function (as the signed-in user) for real public signals (YouTube views when the
// owner saved a YouTube key, Wikipedia surges, Hacker News) and turns the ticked ones into text for the "Mulai dari tren" step.
// The YouTube key lives on the server (table user_youtube_api), never on this device or in the page.
import { cloud } from "./cloud";

export type TrendSource = "youtube" | "wikipedia" | "hn";
export type TrendSignal = { source: TrendSource; title: string; url: string; engLabel: string; ts: number; score: number; also: TrendSource[] };
export type SourceStatus = { source: TrendSource; ok: boolean; n?: number; note?: string };
export type Scan = { at: number; q: string; region: "ID" | "US"; status: SourceStatus[]; items: TrendSignal[] };

export const SOURCE_LABEL: Record<TrendSource, string> = { youtube: "YouTube", wikipedia: "Wikipedia", hn: "Hacker News" };

export type TrendsErrorKind = "signed-out" | "key" | "quota" | "network" | "server";
export class TrendsError extends Error {
  constructor(readonly kind: TrendsErrorKind, message: string) { super(message); this.name = "TrendsError"; }
}

type Fn = (name: string, body: unknown, opts?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<Response | null>;
const defaultFn: Fn = (name, body, opts) => cloud.fn(name, body, opts);

async function failure(res: Response | null): Promise<TrendsError> {
  if (!res) return new TrendsError("signed-out", "Sesi masuk berakhir. Masuk lagi.");
  let code = "", message = "";
  try { const e = ((await res.json()) as { error?: { status?: string; message?: string } }).error; code = e?.status ?? ""; message = e?.message ?? ""; } catch { /* not JSON */ }
  if (code === "BAD_KEY" || code === "KEY_REJECTED") return new TrendsError("key", message || "YouTube menolak kunci ini.");
  if (res.status === 401) return new TrendsError("signed-out", "Masuk dulu untuk memakai radar tren.");
  if (res.status === 404) return new TrendsError("server", "Fungsi radar tren belum dipasang di server.");
  return new TrendsError("server", message || "Radar tren bermasalah. Coba lagi.");
}

/** true / false when signed in; null when signed out or the server cannot be reached. */
export async function youtubeStatus(fn: Fn = defaultFn): Promise<boolean | null> {
  try {
    const res = await fn("trends", { action: "status" }, { timeoutMs: 15_000 });
    if (!res?.ok) return null;
    return ((await res.json()) as { hasKey?: boolean }).hasKey === true;
  } catch { return null; }
}

export async function saveYoutubeKey(key: string, fn: Fn = defaultFn): Promise<void> {
  const k = key.trim();
  if (!/^[\w-]{20,200}$/.test(k)) throw new TrendsError("key", "Kunci tidak valid. Tempel seluruh kunci YouTube Data API (tanpa spasi).");
  let res: Response | null;
  try { res = await fn("trends", { action: "save-key", apiKey: k }, { timeoutMs: 30_000 }); }
  catch { throw new TrendsError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res?.ok) throw await failure(res);
}

export async function forgetYoutubeKey(fn: Fn = defaultFn): Promise<void> {
  let res: Response | null;
  try { res = await fn("trends", { action: "forget" }, { timeoutMs: 20_000 }); }
  catch { throw new TrendsError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res?.ok) throw await failure(res);
}

const isSignal = (x: unknown): x is TrendSignal => {
  const s = x as Partial<TrendSignal> | null;
  return !!s && typeof s.title === "string" && typeof s.url === "string" && typeof s.engLabel === "string" && (s.source === "youtube" || s.source === "wikipedia" || s.source === "hn");
};

export async function scanTrends(q: string, region: "ID" | "US", o: { signal?: AbortSignal; fn?: Fn } = {}): Promise<Scan> {
  let res: Response | null;
  try { res = await (o.fn ?? defaultFn)("trends", { action: "scan", q: q.trim(), region }, { signal: o.signal, timeoutMs: 40_000 }); }
  catch { throw new TrendsError("network", "Tidak bisa terhubung ke server. Periksa koneksi internet."); }
  if (!res?.ok) throw await failure(res);
  const b = (await res.json().catch(() => null)) as Partial<Scan> | null;
  return {
    at: typeof b?.at === "number" ? b.at : Date.now(), q: typeof b?.q === "string" ? b.q : q, region: b?.region === "US" ? "US" : "ID",
    status: Array.isArray(b?.status) ? b!.status!.filter(s => s && typeof s.source === "string") : [],
    items: Array.isArray(b?.items) ? b!.items!.filter(isSignal).map(s => ({ ...s, also: Array.isArray(s.also) ? s.also : [] })) : [],
  };
}

/** The ticked signals as one line for the trend note: "Judul (YouTube, 1,2 jt tayangan, ...)". Titles only; the creator can edit it. */
export function signalsText(picked: TrendSignal[]): string {
  return picked.map(s => `${s.title} (${SOURCE_LABEL[s.source]}: ${s.engLabel})`).join("; ");
}

/** Which sources answered, in words the creator can read. */
export function statusLine(status: SourceStatus[]): string {
  return status.map(s => `${SOURCE_LABEL[s.source]}: ${s.ok ? `${s.n ?? 0} hasil` : s.note ?? "gagal"}`).join(" · ");
}

export const ageLabel = (ts: number, now = Date.now()) => {
  if (!ts) return "";
  const d = Math.max(0, Math.round((now - ts) / 864e5));
  return d <= 0 ? "hari ini" : d === 1 ? "kemarin" : `${d} hari lalu`;
};
