// Content Hub client: talks to the `media-library` Edge Function (signed-in users only) and sends a finished video straight
// to private Cloudflare R2 through short-lived presigned URLs: one PUT for small files, parallel retryable parts for big ones.
// The video never goes through the function or through Vercel. Nothing here runs unless the creator chose "Simpan ke Content
// Hub" and agreed. Pure apart from the default XHR transport (injectable), so it is unit-tested.
import { cloud } from "./cloud";

export const PLATFORMS = [
  { id: "tiktok", label: "TikTok" }, { id: "youtube", label: "YouTube" }, { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" }, { id: "threads", label: "Threads" }, { id: "x", label: "X" },
  { id: "other", label: "Lainnya" }, { id: "uncategorized", label: "Belum dikategorikan" },
] as const;
export const FORMATS = [
  { id: "shorts", label: "Shorts" }, { id: "reels", label: "Reels" }, { id: "long_form", label: "Long-form" },
  { id: "story", label: "Story" }, { id: "video", label: "Video biasa" },
] as const;
export type PlatformId = (typeof PLATFORMS)[number]["id"];
export type FormatId = (typeof FORMATS)[number]["id"];
export type AssetStatus = "uploading" | "ready" | "failed" | "deleting" | "deleted";
export const platformLabel = (id: string) => PLATFORMS.find(p => p.id === id)?.label ?? "Lainnya";
export const formatLabel = (id: string) => FORMATS.find(f => f.id === id)?.label ?? "Video biasa";

export type HubAsset = {
  id: string; title: string; fileName: string; mimeType: string; fileSize: number; durationSeconds: number | null;
  width: number | null; height: number | null; source: "clipper" | "motion"; status: AssetStatus;
  createdAt: string; updatedAt: string; fileDeletedAt: string | null;
  platform: PlatformId; contentFormat: FormatId; hasThumb: boolean; thumbUrl?: string | null;
};

export type HubErrorKind = "signed-out" | "network" | "cancelled" | "storage" | "server" | "rejected";
export class HubError extends Error {
  /** The asset an interrupted upload belongs to, so "Coba lagi" resumes it instead of starting a second one. */
  assetId?: string;
  constructor(readonly kind: HubErrorKind, message: string, readonly code?: string, readonly detail?: Record<string, unknown>) { super(message); }
}

/** What to tell the creator, with the way out. */
export function explainHubError(e: unknown): string {
  if (!(e instanceof HubError)) return "Terjadi masalah. Coba lagi.";
  switch (e.kind) {
    case "signed-out": return "Sesi masuk berakhir. Masuk lagi, lalu coba lagi. Video tetap aman di perangkat.";
    case "network": return "Koneksi terputus. Periksa internet, lalu ketuk Coba lagi. Bagian yang sudah terkirim tidak diulang.";
    case "cancelled": return "Dibatalkan.";
    case "storage": return `Video tidak bisa dikirim ke penyimpanan dari alamat ini (${typeof location !== "undefined" ? location.origin : "halaman ini"}). Jika internet normal, alamat itu belum diizinkan di CORS bucket R2: tambahkan persis alamat tersebut di AllowedOrigins (lihat README), lalu ketuk Coba lagi.`;
    case "rejected": return e.message;
    default: return e.message || "Layanan sedang bermasalah. Coba lagi sebentar lagi.";
  }
}

export type HubApi = (action: string, body?: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The Edge Function as an awaitable call. Signed out -> HubError("signed-out"); a refused request -> its Indonesian message. */
export function createHubApi(c: Pick<typeof cloud, "fn"> = cloud): HubApi {
  return async (action, body = {}, opts = {}) => {
    let res: Response | null;
    try { res = await c.fn("media-library", { action, ...body }, { signal: opts.signal, timeoutMs: 60_000 }); }
    catch (e) {
      if (opts.signal?.aborted) throw new HubError("cancelled", "Dibatalkan.");
      throw new HubError("network", e instanceof Error ? e.message : "Koneksi terputus.");
    }
    if (!res) throw new HubError("signed-out", "Masuk dulu.");
    const json = await res.json().catch(() => null) as { error?: { status?: string; message?: string; [k: string]: unknown } } | null;
    if (res.ok) return json;
    const err = json?.error ?? {};
    if (res.status === 401) throw new HubError("signed-out", "Masuk dulu.", err.status);
    throw new HubError(res.status >= 500 ? "server" : "rejected", err.message ?? "Permintaan ditolak.", err.status, err);
  };
}

/** Sends `blob` to `url`. Reports bytes sent so far. Must reject with HubError("cancelled") on abort and a "storage"/"network" error otherwise. */
export type PutFn = (url: string, blob: Blob, headers: Record<string, string>, onProgress: (loaded: number) => void, signal?: AbortSignal) => Promise<void>;

export const xhrPut: PutFn = (url, blob, headers, onProgress, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new HubError("cancelled", "Dibatalkan."));
  const x = new XMLHttpRequest();
  x.open("PUT", url);
  for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
  x.upload.onprogress = e => onProgress(e.loaded);
  x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new HubError("storage", `Penyimpanan menjawab ${x.status}.`)));
  // A browser reports a CORS refusal exactly like a dead connection. While the device is online, point at the likelier cause.
  x.onerror = () => reject(typeof navigator !== "undefined" && navigator.onLine === false ? new HubError("network", "Koneksi terputus.") : new HubError("storage", "Browser tidak bisa mengirim ke penyimpanan."));
  x.ontimeout = () => reject(new HubError("network", "Koneksi habis waktu."));
  x.onabort = () => reject(new HubError("cancelled", "Dibatalkan."));
  signal?.addEventListener("abort", () => x.abort(), { once: true });
  x.send(blob);
});

export type UploadInput = {
  blob: Blob; fileName: string; title: string; platform: PlatformId; contentFormat: FormatId; source: "clipper" | "motion";
  durationSeconds?: number; width?: number; height?: number; thumbnail?: Blob | null;
};
export type UploadOptions = {
  api?: HubApi; put?: PutFn; signal?: AbortSignal; onProgress?: (p: { sent: number; total: number }) => void;
  /** Continue an interrupted upload of this asset. */
  resume?: string; concurrency?: number; sleep?: (ms: number) => Promise<void>;
};

const PART_TRIES = 3;
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const videoType = (b: Blob) => (b.type.split(";")[0].trim().toLowerCase() || "video/mp4");

/** Uploads one video. Resolves with the finished ("ready") asset. On failure throws a HubError carrying `assetId` for a resume. */
export async function uploadToHub(input: UploadInput, o: UploadOptions = {}): Promise<HubAsset> {
  const api = o.api ?? createHubApi(), put = o.put ?? xhrPut, sleep = o.sleep ?? wait, total = input.blob.size;
  const progress = (sent: number) => o.onProgress?.({ sent: Math.min(sent, total), total });
  let assetId = o.resume;
  try {
    const mime = videoType(input.blob);
    const init = await api("init-upload", o.resume
      ? { assetId: o.resume }
      : {
        fileName: input.fileName, mimeType: mime, fileSize: total, title: input.title, platform: input.platform, contentFormat: input.contentFormat,
        source: input.source, durationSeconds: input.durationSeconds, width: input.width, height: input.height, thumbnail: !!input.thumbnail,
      }, { signal: o.signal });
    assetId = init.asset.id as string;
    progress(0);
    if (init.thumbPutUrl && input.thumbnail) await put(init.thumbPutUrl, input.thumbnail, { "content-type": "image/jpeg" }, () => {}, o.signal).catch(e => { if (e instanceof HubError && e.kind === "cancelled") throw e; });

    if (init.mode === "single") {
      await put(init.putUrl, input.blob, { "content-type": init.contentType ?? mime }, progress, o.signal);
      return (await api("complete-single", { assetId }, { signal: o.signal })).asset;
    }

    const { partSize, partCount } = (await api("multipart-init", { assetId }, { signal: o.signal })) as { partSize: number; partCount: number };
    const sizeOf = (n: number) => (n < partCount ? partSize : total - partSize * (partCount - 1));
    const held = new Set<number>(((await api("list-parts", { assetId }, { signal: o.signal })).parts as { partNumber: number; size: number }[])
      .filter(p => p.size === sizeOf(p.partNumber)).map(p => p.partNumber)); // what R2 already has is not sent again
    const loaded = new Map<number, number>();
    let done = [...held].reduce((s, n) => s + sizeOf(n), 0);
    const report = () => progress(done + [...loaded.values()].reduce((s, v) => s + v, 0));
    report();
    const queue = Array.from({ length: partCount }, (_, i) => i + 1).filter(n => !held.has(n));
    const failure: { e?: unknown } = {};

    async function sendPart(n: number) {
      const slice = input.blob.slice((n - 1) * partSize, (n - 1) * partSize + sizeOf(n));
      for (let attempt = 1; ; attempt++) {
        try {
          const url = (await api("sign-parts", { assetId, partNumbers: [n] }, { signal: o.signal })).parts[0].url as string; // fresh URL per attempt
          await put(url, slice, {}, l => { loaded.set(n, l); report(); }, o.signal);
          loaded.delete(n); done += slice.size; report();
          return;
        } catch (e) {
          loaded.delete(n); report();
          const fatal = e instanceof HubError && (e.kind === "cancelled" || e.kind === "signed-out" || e.kind === "rejected");
          if (fatal || attempt >= PART_TRIES || o.signal?.aborted) throw e;
          await sleep(1000 * 2 ** (attempt - 1));
        }
      }
    }
    const worker = async () => {
      for (let n = queue.shift(); n !== undefined && failure.e === undefined; n = queue.shift()) {
        try { await sendPart(n); } catch (e) { failure.e ??= e; }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency ?? 3, queue.length)) }, worker));
    if (failure.e !== undefined) throw failure.e;
    return (await api("complete-upload", { assetId }, { signal: o.signal })).asset;
  } catch (e) {
    const err = e instanceof HubError ? e : new HubError("server", e instanceof Error ? e.message : "Unggahan gagal.");
    err.assetId = assetId;
    // Cancelled by the creator: stop the cloud side too, so nothing half-sent is left behind. Best effort.
    if (err.kind === "cancelled" && assetId) await api("abort-upload", { assetId }).catch(() => {});
    throw err;
  }
}

export type SortOrder = "newest" | "oldest";
export type Filter = { platform: PlatformId | "all"; query: string; sort: SortOrder };

/** Search matches the title or file name (case-insensitive, any word order). */
export function filterAssets(list: HubAsset[], f: Filter): HubAsset[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter(a => (f.platform === "all" || a.platform === f.platform) && words.every(w => `${a.title} ${a.fileName}`.toLowerCase().includes(w)))
    .sort((a, b) => (f.sort === "newest" ? 1 : -1) * (Date.parse(b.createdAt) - Date.parse(a.createdAt)));
}

/** Videos per category (all categories, including empty ones) and in total. */
export function countByPlatform(list: HubAsset[]): Record<PlatformId | "all", number> {
  const out = Object.fromEntries([["all", list.length], ...PLATFORMS.map(p => [p.id, 0])]) as Record<PlatformId | "all", number>;
  for (const a of list) out[a.platform] = (out[a.platform] ?? 0) + 1;
  return out;
}

export const formatDuration = (s: number | null) => {
  if (s === null || !Number.isFinite(s)) return "";
  const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/** A small JPEG of the video's first moments, drawn in the browser (nothing leaves the device). Null when the browser cannot decode it. */
export async function makeThumbnail(blob: Blob, maxSide = 360): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("decode")); setTimeout(() => rej(new Error("timeout")), 8000); });
    const at = Math.min(0.5, (v.duration || 1) / 2);
    await new Promise<void>(res => { v.onseeked = () => res(); v.currentTime = at; setTimeout(res, 3000); });
    if (!v.videoWidth) return null;
    const k = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas"); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>(res => c.toBlob(b => res(b && b.size <= 400 * 1024 ? b : null), "image/jpeg", 0.8));
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}
