"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { copyText } from "../SeoPanel";
import { filterEntries, toCsv, toJson, type Filter, type HistoryEntry } from "@/lib/history";
import { deleteHistory, loadHistory, onHistoryChange, onSyncChange, startHistorySync, syncHistory, syncState } from "@/lib/history-store";
import { cloud } from "@/lib/cloud";
import { seoToText, SEO_PLATFORMS } from "@/lib/seo";

const fmtDate = (t: number) => new Date(t).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const mb = (n: number) => (n / 1024 ** 2).toFixed(1) + " MB";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Production history: everything made so far, in one list on this device (text only, never video): the script, the trend it
 * started from, the SEO and distribution pack per platform, and when each video was rendered and saved. It survives
 * downloading, closing the tab and making the next video.
 */
export default function HistoryPage() {
  const [list, setList] = useState<HistoryEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>({ text: "", status: "all" });
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const [sync, setSync] = useState<ReturnType<typeof syncState>>({ phase: "off" });
  const [signedIn, setSignedIn] = useState(false); // read after mount: the server render cannot know
  useEffect(() => {
    let alive = true;
    const load = () => { void loadHistory().then(l => { if (alive) setList(l); }); };
    load();
    startHistorySync();
    const off = onHistoryChange(load), offSync = onSyncChange(() => setSync(syncState())), offCloud = cloud.subscribe(() => setSignedIn(!!cloud.user()));
    setSync(syncState()); setSignedIn(!!cloud.user());
    return () => { alive = false; off(); offSync(); offCloud(); };
  }, []);

  const shown = useMemo(() => filterEntries(list ?? [], filter), [list, filter]);
  const savedCount = (list ?? []).filter(e => e.videos.some(v => v.saved)).length;

  async function copy(id: string, text: string) {
    const ok = await copyText(text);
    setCopied(ok ? id : "gagal:" + id);
    setTimeout(() => setCopied(c => (c === id || c === "gagal:" + id ? "" : c)), 1800);
  }
  async function remove(id: string) { setList((list ?? []).filter(e => e.id !== id)); await deleteHistory([id]); }
  async function clearAll() { const ids = (list ?? []).map(e => e.id); setList([]); setConfirmClear(false); await deleteHistory(ids); }
  function openInStudio(e: HistoryEntry) {
    try { sessionStorage.setItem("clipper:history:open", JSON.stringify({ script: e.script, title: e.title })); } catch { /* storage blocked */ }
    window.location.href = "/motion";
  }

  return (
    <main className="history-page" style={{ maxWidth: 860, margin: "0 auto", padding: "16px" }}>
      <header className="topbar"><Link className="brand" href="/"><span className="logo">c</span><span>clipper<span className="light">studio</span></span></Link><Link className="text-link" href="/motion">Studio Motion →</Link></header>
      <h1>Riwayat produksi</h1>
      <p className="field-hint" data-testid="history-intro">Naskah, paket SEO &amp; distribusi, dan catatan render/unduh setiap video, disimpan di perangkat ini (teks, bukan video) dan, bila Anda masuk ke akun, disinkronkan ke perangkat lain. Tetap ada setelah video diunduh atau tab ditutup. Tanpa akun, riwayat hilang jika data situs browser dihapus, jadi ekspor secara berkala.</p>

      <div className="notice" role="status" data-testid="history-sync">
        {!signedIn ? <>Belum masuk: riwayat hanya ada di perangkat ini. Masuk ke akun di halaman utama untuk menyinkronkannya antar perangkat (hanya teks).</>
          : sync.phase === "syncing" ? <>Menyinkronkan…</>
          : sync.phase === "error" ? <>{sync.message} <button type="button" className="text-link" onClick={() => void syncHistory()} data-testid="history-sync-retry">Coba lagi</button></>
          : sync.phase === "done" ? <>✓ Tersinkron dengan akun {cloud.user()} · {new Date(sync.at ?? Date.now()).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} <button type="button" className="text-link" onClick={() => void syncHistory()} data-testid="history-sync-now">Sinkron sekarang</button></>
          : <>Menyiapkan sinkron…</>}
      </div>

      {list === null ? <p>Memuat…</p> : list.length === 0
        ? <div className="notice" data-testid="history-empty">Belum ada riwayat. Setelah video dirender atau paket SEO dibuat di Studio Motion, atau klip diekspor di Clipper, catatannya muncul di sini.</div>
        : <>
          <div className="range-tools" role="group" aria-label="Saring riwayat">
            <input type="search" value={filter.text} onChange={e => setFilter({ ...filter, text: e.target.value })} placeholder="Cari judul, naskah, caption, hashtag" aria-label="Cari riwayat" data-testid="history-search" />
            <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value as Filter["status"] })} aria-label="Status" data-testid="history-status">
              <option value="all">Semua</option><option value="saved">Sudah diunduh</option><option value="unsaved">Dirender, belum diunduh</option><option value="no-seo">Belum ada paket SEO</option>
            </select>
          </div>
          <small className="field-hint" data-testid="history-count">{shown.length} dari {list.length} catatan · {savedCount} sudah diunduh</small>
          <div className="range-tools">
            <button type="button" onClick={() => download("riwayat-clipper.csv", "﻿" + toCsv(shown), "text/csv;charset=utf-8")} data-testid="history-csv">Ekspor CSV ({shown.length})</button>
            <button type="button" onClick={() => download("riwayat-clipper.json", toJson(shown), "application/json")} data-testid="history-json">Ekspor JSON</button>
            {confirmClear
              ? <><button type="button" onClick={() => void clearAll()} data-testid="history-clear-yes">Ya, hapus semua riwayat</button><button type="button" className="text-link" onClick={() => setConfirmClear(false)}>Batal</button></>
              : <button type="button" className="text-link" onClick={() => setConfirmClear(true)} data-testid="history-clear">Hapus semua</button>}
          </div>
          {shown.length === 0 && <div className="notice" data-testid="history-none">Tidak ada catatan yang cocok.</div>}
          {shown.map(e => {
            const saved = e.videos.filter(v => v.saved).length;
            const packs = SEO_PLATFORMS.filter(p => e.seo[p.id]);
            const isOpen = open === e.id;
            return (
              <article className="seo-card" key={e.id} data-testid="history-entry">
                <div className="seo-card-head">
                  <b>{e.title || "(tanpa judul)"}</b>
                  <small>{fmtDate(e.updatedAt)} · {e.kind === "clip" ? "klip" : "motion"}</small>
                </div>
                <small data-testid="history-badges">
                  {e.videos.length === 0 ? "Belum dirender" : saved > 0 ? `✓ ${saved} file diunduh` : `${e.videos.length} dirender, belum diunduh`}
                  {packs.length ? " · SEO: " + packs.map(p => `${p.label} ${e.seo[p.id]!.result.score}`).join(", ") : " · belum ada paket SEO"}
                </small>
                <div className="range-tools">
                  <button type="button" className="text-link" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen} data-testid="history-toggle">{isOpen ? "Tutup" : "Buka detail"}</button>
                  {e.kind === "motion" && e.script && <button type="button" className="text-link" onClick={() => openInStudio(e)} data-testid="history-open-studio">Buka di studio</button>}
                  <button type="button" className="text-link" onClick={() => void remove(e.id)} data-testid="history-delete">Hapus</button>
                </div>
                {isOpen && <div data-testid="history-detail">
                  {e.trend && <p className="seo-text"><b>Dari tren:</b> {e.trend.trend || "-"} · niche {e.trend.niche || "-"}{e.trend.audience ? ` · ${e.trend.audience}` : ""}</p>}
                  {e.videos.length > 0 && <ul className="seo-list">{e.videos.map((v, i) => <li key={i}>{v.saved ? "✓ diunduh" : "dirender"} · {v.name} · {v.label} · {mb(v.size)} · {fmtDate(v.at)}</li>)}</ul>}
                  {e.script && <details><summary>Naskah</summary><p className="seo-text" style={{ whiteSpace: "pre-wrap" }}>{e.script}</p></details>}
                  {packs.map(p => {
                    const s = e.seo[p.id]!;
                    return (
                      <details key={p.id} open data-testid={"history-seo-" + p.id}>
                        <summary><b>{p.label}</b> · skor {s.result.score}/100 · {fmtDate(s.at)}</summary>
                        {s.result.cards.map(c => {
                          const text = Array.isArray(c.value) ? c.value.join(c.kind === "hashtags" ? " " : "\n") : c.value;
                          const id = `${e.id}:${p.id}:${c.key}`;
                          return <div key={c.key} className="seo-card-head"><span><small>{c.label}</small><br /><span className="seo-text" style={{ whiteSpace: "pre-wrap" }}>{text || "—"}</span></span>
                            <button type="button" className="text-link" onClick={() => void copy(id, text)} disabled={!text} data-testid={"history-copy-" + p.id + "-" + c.key}>{copied === id ? "Tersalin ✓" : copied === "gagal:" + id ? "Gagal" : "Salin"}</button></div>;
                        })}
                        <button type="button" className="text-link" onClick={() => void copy(`${e.id}:${p.id}:all`, seoToText(s.result))} data-testid={"history-copy-all-" + p.id}>{copied === `${e.id}:${p.id}:all` ? "Tersalin ✓" : "Salin semua teks"}</button>
                      </details>
                    );
                  })}
                </div>}
              </article>
            );
          })}
        </>}
    </main>
  );
}
