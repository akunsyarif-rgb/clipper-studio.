"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cloud } from "@/lib/cloud";
import { formatBytes } from "@/lib/clip";
import {
  countByPlatform, createHubApi, FREE_STORAGE_BYTES, staleUploads, storageUsed, usageLevel, explainHubError, filterAssets, formatDuration, formatLabel, FORMATS, platformLabel, PLATFORMS,
  type Filter, type FormatId, type HubAsset, type PlatformId,
} from "@/lib/content-hub";
import CloudAccount from "./CloudAccount";
import HistoryPanel, { EntryDetail } from "./HistoryPanel";
import { loadHistory, onHistoryChange } from "@/lib/history-store";
import type { HistoryEntry } from "@/lib/history";
import { SEO_PLATFORMS } from "@/lib/seo";
import "./content-hub.css";

const api = createHubApi();
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const VIEW_KEY = "clipper:hub:view";

/** The production notes of a video: only the entry it was saved from (matched by id, never by title: two videos can share a title). */
function noteFor(a: HubAsset, notes: HistoryEntry[]): HistoryEntry | null {
  return a.historyId ? notes.find(n => n.id === a.historyId) ?? null : null;
}
const seoLabels = (n: HistoryEntry | null) => (n ? SEO_PLATFORMS.filter(p => n.seo[p.id]).map(p => p.label) : []);

async function loadAll(): Promise<HubAsset[]> {
  const out: HubAsset[] = [];
  let before: string | undefined;
  for (let page = 0; page < 30; page++) {
    const { assets } = (await api("list", { limit: 100, before })) as { assets: HubAsset[] };
    out.push(...assets);
    if (assets.length < 100) break;
    before = assets[assets.length - 1].createdAt;
  }
  return out;
}

/** The Content Hub: every saved video, grouped by platform, with search, sort, download, move and delete. */
export default function HubLibrary() {
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // the signed-in state is read after mount
  const [assets, setAssets] = useState<HubAsset[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>({ platform: "all", query: "", sort: "newest" });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmClean, setConfirmClean] = useState(false);
  const [notes, setNotes] = useState<HistoryEntry[]>([]);
  const [tab, setTab] = useState<"video" | "catatan">("video");

  useEffect(() => { const sync = () => { setUser(cloud.user()); setReady(true); }; sync(); return cloud.subscribe(sync); }, []);
  useEffect(() => { try { const v = localStorage.getItem(VIEW_KEY); if (v === "list" || v === "grid") setView(v); } catch { /* storage blocked */ } }, []);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get("tab") === "catatan") setTab("catatan"); } catch { /* no URL */ } }, []);
  const pickTab = (t: "video" | "catatan") => { setTab(t); try { window.history.replaceState(null, "", t === "catatan" ? "/hub?tab=catatan" : "/hub"); } catch { /* no history API */ } };
  const pickView = (v: "grid" | "list") => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ } };

  const reload = useCallback(async () => {
    setError("");
    try { setAssets(await loadAll()); } catch (e) { setAssets(prev => prev ?? []); setError(explainHubError(e)); }
  }, []);
  useEffect(() => { if (user) { setAssets(null); void reload(); } else setAssets(null); }, [user, reload]);

  useEffect(() => {
    let alive = true;
    const load = () => { void loadHistory().then(l => { if (alive) setNotes(l); }).catch(() => {}); };
    load();
    const off = onHistoryChange(load);
    return () => { alive = false; off(); };
  }, [user]);

  const used = useMemo(() => storageUsed(assets ?? []), [assets]);
  const stale = useMemo(() => staleUploads(assets ?? []), [assets]);
  async function cleanStale() {
    setBusy("clean"); setNotice(""); setConfirmClean(false);
    for (const a of stale) {
      try { const { asset } = await api("delete-file", { assetId: a.id }); patch(a.id, { status: asset.status, fileDeletedAt: asset.fileDeletedAt, hasThumb: false, thumbUrl: null }); }
      catch (e) { setNotice(explainHubError(e)); break; }
    }
    setBusy(null);
  }

  const counts = useMemo(() => countByPlatform(assets ?? []), [assets]);
  const shown = useMemo(() => filterAssets(assets ?? [], filter), [assets, filter]);
  const current = assets?.find(a => a.id === open) ?? null;

  const patch = (id: string, p: Partial<HubAsset>) => setAssets(list => list?.map(a => (a.id === id ? { ...a, ...p } : a)) ?? list);

  async function update(a: HubAsset, change: { title?: string; platform?: PlatformId; contentFormat?: FormatId; historyId?: string | null }) {
    const before = { title: a.title, platform: a.platform, contentFormat: a.contentFormat, historyId: a.historyId ?? null };
    patch(a.id, change); setNotice("");
    try { await api("update-meta", { assetId: a.id, ...change }); }
    catch (e) { patch(a.id, before); setNotice(explainHubError(e)); }
  }
  async function download(a: HubAsset) {
    setBusy(a.id); setNotice("");
    try {
      const { url } = await api("get-download-url", { assetId: a.id });
      const link = document.createElement("a"); link.href = url; link.rel = "noopener"; link.click();
    } catch (e) { setNotice(explainHubError(e)); } finally { setBusy(null); }
  }
  async function remove(a: HubAsset) {
    setBusy(a.id); setNotice("");
    try {
      const { asset } = await api("delete-file", { assetId: a.id });
      patch(a.id, { status: asset.status, fileDeletedAt: asset.fileDeletedAt, hasThumb: false, thumbUrl: null });
      setConfirm(null);
    } catch (e) { setNotice(explainHubError(e)); } finally { setBusy(null); }
  }

  const empty = assets && assets.length === 0;
  return <main className="hub-page">
    <header className="hub-top">
      <Link className="brand" href="/"><span className="logo">c</span><span>clipper<span className="light">studio</span></span></Link>
      <span><Link className="text-link" href="/">Clipper</Link> · <Link className="text-link" href="/motion">Motion</Link></span>
    </header>
    <h1>Content Hub</h1>
    <p className="hub-note">Video yang Anda simpan sendiri dari Clipper Studio atau Motion Studio disimpan di penyimpanan cloud privat; tidak ada yang diunggah otomatis. Catatan produksi (naskah, paket SEO, riwayat render) ada di tab sebelahnya.</p>
    <CloudAccount />
    <div className="hub-tabs" role="tablist" aria-label="Bagian">
      <button role="tab" aria-selected={tab === "video"} onClick={() => pickTab("video")} data-testid="tab-video">Video</button>
      <button role="tab" aria-selected={tab === "catatan"} onClick={() => pickTab("catatan")} data-testid="tab-catatan">Catatan produksi</button>
    </div>

    {tab === "catatan" && <HistoryPanel />}

    {tab === "video" && ready && !user && <div className="hub-empty"><strong>Masuk untuk membuka Content Hub</strong>Video lokal Anda tidak terpengaruh. Content Hub hanya memakai akun yang sama dengan sinkron naskah.</div>}

    {tab === "video" && user && <>
      {assets && assets.length > 0 && <div className={"hub-usage " + usageLevel(used)} data-testid="hub-usage">
        <div className="hub-progress" role="progressbar" aria-label="Penyimpanan terpakai" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(used / FREE_STORAGE_BYTES * 100))}><i style={{ width: Math.min(100, used / FREE_STORAGE_BYTES * 100) + "%" }} /></div>
        <p>{formatBytes(used)} dari 10 GB gratis di R2{usageLevel(used) === "warn" ? ". Hampir penuh: hapus file yang tidak dipakai agar tidak ada tagihan." : usageLevel(used) === "over" ? ". Sudah melewati kuota gratis; R2 mulai menagih. Hapus file yang tidak dipakai." : "."}</p>
      </div>}
      {stale.length > 0 && <div className="hub-stale" data-testid="hub-stale">
        {confirmClean
          ? <><p>Hapus {stale.length} unggahan yang gagal atau tersangkut? Catatannya tetap ada, tetapi sisa file di cloud dibersihkan.</p>
            <div className="hub-actions"><button className="hub-btn small danger" onClick={() => void cleanStale()} data-testid="hub-clean-yes">Bersihkan {stale.length}</button><button className="hub-btn small" onClick={() => setConfirmClean(false)}>Batal</button></div></>
          : <button className="hub-btn small" disabled={busy === "clean"} onClick={() => setConfirmClean(true)} data-testid="hub-clean">{busy === "clean" ? "Membersihkan…" : `Bersihkan ${stale.length} unggahan yang tidak selesai`}</button>}
      </div>}
      <div className="hub-tools">
        <input className="hub-input" type="search" placeholder="Cari judul atau nama file" value={filter.query} onChange={e => setFilter({ ...filter, query: e.target.value })} aria-label="Cari" data-testid="hub-search" />
        <select className="hub-input" value={filter.sort} onChange={e => setFilter({ ...filter, sort: e.target.value as Filter["sort"] })} aria-label="Urutkan" data-testid="hub-sort">
          <option value="newest">Terbaru</option><option value="oldest">Terlama</option>
        </select>
        <div className="hub-seg" role="group" aria-label="Tampilan">
          <button aria-pressed={view === "grid"} onClick={() => pickView("grid")}>Grid</button>
          <button aria-pressed={view === "list"} onClick={() => pickView("list")}>Daftar</button>
        </div>
      </div>

      <nav className="hub-cats" aria-label="Kategori" data-testid="hub-cats">
        {([{ id: "all", label: "Semua" }, ...PLATFORMS] as { id: PlatformId | "all"; label: string }[]).map(c =>
          <button key={c.id} className={"hub-cat" + (counts[c.id] ? "" : " empty")} aria-pressed={filter.platform === c.id} onClick={() => setFilter({ ...filter, platform: c.id })} data-testid={"cat-" + c.id}>
            {c.label}<b>{counts[c.id]}</b>
          </button>)}
      </nav>

      {notice && <div className="hub-error" role="alert" data-testid="hub-notice">{notice}</div>}
      {error && <div className="hub-error" role="alert" data-testid="hub-load-error">{error} <button className="hub-btn small" onClick={() => void reload()}>Muat ulang</button></div>}
      {assets === null && <p className="hub-count" data-testid="hub-loading">Memuat video…</p>}

      {empty && !error && <div className="hub-empty" data-testid="hub-empty"><strong>Belum ada video</strong>Ekspor video di Clipper Studio atau Motion Studio, lalu pilih Simpan ke Content Hub.
        <div className="hub-row"><Link className="hub-btn solid" href="/">Clipper Studio</Link><Link className="hub-btn" href="/motion">Motion Studio</Link></div></div>}

      {assets && assets.length > 0 && shown.length === 0 && <div className="hub-empty" data-testid="hub-nomatch"><strong>Tidak ada yang cocok</strong>Coba kata lain atau kategori lain.
        <div className="hub-row"><button className="hub-btn" onClick={() => setFilter({ platform: "all", query: "", sort: filter.sort })}>Hapus filter</button></div></div>}

      {shown.length > 0 && <>
        <p className="hub-count" data-testid="hub-count">{shown.length} video</p>
        <div className={view === "list" ? "hub-list" : ""}><div className="hub-grid" data-testid="hub-grid">
          {shown.map(a => {
            const gone = a.status === "deleted", live = a.status === "ready";
            return <article key={a.id} className={"hub-item" + (gone ? " gone" : "")} data-testid="hub-item">
              <button className="hub-thumb" onClick={() => setOpen(a.id)} aria-label={`Buka ${a.title}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL, nothing for next/image to optimise */}
                {a.thumbUrl ? <img src={a.thumbUrl} alt="" loading="lazy" />
                  : a.previewUrl ? <video src={a.previewUrl + "#t=0.1"} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />
                  : <span className="ph">{gone ? "File dihapus" : live ? "Tanpa pratinjau" : ""}</span>}
                {a.durationSeconds !== null && <span className="hub-dur">{formatDuration(a.durationSeconds)}</span>}
                {a.status === "uploading" && <span className="hub-badge">Belum selesai</span>}
                {a.status === "failed" && <span className="hub-badge bad">Gagal</span>}
                {a.status === "deleting" && <span className="hub-badge bad">Menghapus</span>}
              </button>
              <div className="hub-title">{a.title}</div>
              <div className="hub-meta">{platformLabel(a.platform)} · {formatLabel(a.contentFormat)}<br />{formatBytes(a.fileSize)} · {fmtDate(a.createdAt)}{gone && a.fileDeletedAt ? ` · dihapus ${fmtDate(a.fileDeletedAt)}` : ""}
                {(() => { const l = seoLabels(noteFor(a, notes)); return l.length ? <><br /><span className="hub-notes-badge" data-testid="hub-seo-badge">SEO: {l.join(", ")}</span></> : null; })()}</div>
              {confirm === a.id
                ? <div className="hub-confirm" data-testid="hub-confirm"><p>Hapus file dari cloud? Judul dan kategori tetap tersimpan, tetapi videonya tidak bisa dipulihkan.</p>
                  <div className="hub-actions"><button className="hub-btn small danger" disabled={busy === a.id} onClick={() => void remove(a)} data-testid="hub-confirm-delete">{busy === a.id ? "Menghapus…" : "Hapus file"}</button><button className="hub-btn small" onClick={() => setConfirm(null)}>Batal</button></div></div>
                : <div className="hub-actions">
                  {live && <button className="hub-btn small solid" disabled={busy === a.id} onClick={() => void download(a)} data-testid="hub-download">Unduh</button>}
                  <select value={a.platform} onChange={e => void update(a, { platform: e.target.value as PlatformId })} aria-label={`Kategori ${a.title}`} data-testid="hub-move">{PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                  {!gone && <button className="hub-btn small danger" onClick={() => setConfirm(a.id)} data-testid="hub-delete">Hapus</button>}
                </div>}
            </article>;
          })}
        </div></div>
      </>}
    </>}

    {current && <Detail key={current.id} asset={current} note={noteFor(current, notes)} notes={notes} onClose={() => setOpen(null)} onUpdate={c => update(current, c)} onDownload={() => void download(current)} />}
  </main>;
}

/** One video: playback (when the file exists), editable title / platform / format. */
function Detail({ asset, note, notes, onClose, onUpdate, onDownload }: { asset: HubAsset; note: HistoryEntry | null; notes: HistoryEntry[]; onClose: () => void; onUpdate: (c: { title?: string; platform?: PlatformId; contentFormat?: FormatId; historyId?: string | null }) => Promise<void>; onDownload: () => void }) {
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");
  const [title, setTitle] = useState(asset.title);
  useEffect(() => {
    if (asset.status !== "ready") return;
    let alive = true;
    api("get-download-url", { assetId: asset.id, inline: true }).then(r => { if (alive) setSrc(r.url); }).catch(e => { if (alive) setErr(explainHubError(e)); });
    return () => { alive = false; };
  }, [asset.id, asset.status]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  return <div className="hub-modal" role="dialog" aria-modal="true" aria-label={asset.title} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="hub-detail">
    <div className="hub-sheet">
      <div className="head"><strong>{platformLabel(asset.platform)} · {formatLabel(asset.contentFormat)}</strong><button className="hub-btn small" onClick={onClose}>Tutup</button></div>
      {asset.status === "ready" && (src ? <video src={src} controls playsInline preload="metadata" poster={asset.thumbUrl ?? undefined} /> : !err && <p className="hub-note">Memuat pratinjau…</p>)}
      {asset.status === "deleted" && <p className="hub-note">File sudah dihapus. Judul dan kategori masih tersimpan.</p>}
      {asset.status === "uploading" && <p className="hub-note">Unggahan ini belum selesai (tab ditutup atau koneksi putus). Ekspor ulang videonya lalu simpan lagi, atau hapus entri ini.</p>}
      {err && <div className="hub-error" role="alert">{err}</div>}
      <label className="hub-field">Judul<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} onBlur={() => { const t = title.trim(); if (t && t !== asset.title) void onUpdate({ title: t }); else setTitle(asset.title); }} /></label>
      <div className="hub-two">
        <label className="hub-field">Platform<select value={asset.platform} onChange={e => void onUpdate({ platform: e.target.value as PlatformId })}>{PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className="hub-field">Format<select value={asset.contentFormat} onChange={e => void onUpdate({ contentFormat: e.target.value as FormatId })}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
      </div>
      <p className="hub-meta" style={{ marginTop: 10 }}>{asset.fileName}<br />{formatBytes(asset.fileSize)}{asset.durationSeconds !== null ? ` · ${formatDuration(asset.durationSeconds)}` : ""}{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""} · {fmtDate(asset.createdAt)}</p>
      {asset.status === "ready" && <div className="hub-row"><button className="hub-btn solid" onClick={onDownload}>Unduh</button></div>}
      <div className="hub-notes" data-testid="hub-notes">
        <h3>Paket SEO, prompt &amp; naskah</h3>
        {note
          ? <><EntryDetail e={note} /><button className="hub-btn small" style={{ marginTop: 10 }} onClick={() => void onUpdate({ historyId: null })} data-testid="hub-unlink">Lepas tautan catatan</button></>
          : <>
            <p className="hub-note">Belum ada catatan yang tertaut ke video ini. Paket SEO dibuat di Studio Motion atau Clipper (bagian Paket SEO &amp; distribusi) dan otomatis tertaut saat video disimpan ke sini.</p>
            {notes.length > 0 && <label className="hub-field">Tautkan ke catatan yang ada
              <select value="" onChange={e => { if (e.target.value) void onUpdate({ historyId: e.target.value }); }} data-testid="hub-link-note">
                <option value="">Pilih catatan…</option>
                {notes.map(n => <option key={n.id} value={n.id}>{(n.title || "(tanpa judul)").slice(0, 60)} · {n.kind === "clip" ? "klip" : "motion"} · {fmtDate(new Date(n.updatedAt).toISOString())}</option>)}
              </select>
            </label>}
          </>}
      </div>
    </div>
  </div>;
}
