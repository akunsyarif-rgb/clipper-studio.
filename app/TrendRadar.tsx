"use client";

import { useEffect, useRef, useState } from "react";
import { cloud } from "@/lib/cloud";
import { ageLabel, forgetYoutubeKey, saveYoutubeKey, scanTrends, signalsText, SOURCE_LABEL, statusLine, TrendsError, youtubeStatus, type Scan, type TrendSignal } from "@/lib/trends";

const CACHE_KEY = "clipper:trendscan:v1";
const CACHE_MS = 6 * 60 * 60 * 1000;

function cached(q: string, region: string): Scan | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { q?: string; region?: string; scan?: Scan } | null;
    return v && v.q === q && v.region === region && v.scan && Date.now() - v.scan.at < CACHE_MS ? v.scan : null;
  } catch { return null; }
}
function remember(q: string, region: string, scan: Scan) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ q, region, scan })); } catch { /* storage blocked: scans are just not cached */ } }

/**
 * "Radar tren": real public signals to start from (YouTube views when the creator saved a YouTube key, Wikipedia surges, Hacker
 * News), fetched by the server as the signed-in user. No AI is involved, and a signal is evidence that something is being
 * watched or read, not a promise that a video about it will do well. Ticked signals are added to the trend note, which the
 * creator can still edit before the AI sees it. The YouTube key is stored on the server, never on this device.
 */
export default function TrendRadar({ niche, onUse, disabled }: { niche: string; onUse: (text: string) => void; disabled: boolean }) {
  const [signedIn, setSignedIn] = useState(() => !!cloud.user());
  const [hasKey, setHasKey] = useState<boolean | null | undefined>(undefined);
  const [keyInput, setKeyInput] = useState("");
  const [region, setRegion] = useState<"ID" | "US">("ID");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => { setSignedIn(!!cloud.user()); void youtubeStatus().then(s => { if (alive) setHasKey(s); }); };
    refresh();
    const off = cloud.subscribe(refresh);
    return () => { alive = false; off(); abort.current?.abort(); };
  }, []);

  const topic = niche.trim();
  async function run(force: boolean) {
    setError(""); setAdded(false);
    if (!force) { const c = cached(topic, region); if (c) { setScan(c); setFromCache(true); setPicked(new Set()); return; } }
    const ctl = new AbortController(); abort.current = ctl;
    setBusy(true);
    try {
      const s = await scanTrends(topic, region, { signal: ctl.signal });
      setScan(s); setFromCache(false); setPicked(new Set()); remember(topic, region, s);
    } catch (e) { setError(e instanceof TrendsError ? e.message : "Pindai gagal."); }
    finally { setBusy(false); }
  }
  async function saveKey() {
    setBusy(true); setError("");
    try { await saveYoutubeKey(keyInput); setKeyInput(""); setHasKey(true); }
    catch (e) { setError(e instanceof TrendsError ? e.message : "Kunci gagal disimpan."); }
    finally { setBusy(false); }
  }
  async function forgetKey() {
    setBusy(true); setError("");
    try { await forgetYoutubeKey(); setHasKey(false); }
    catch (e) { setError(e instanceof TrendsError ? e.message : "Kunci gagal dihapus."); }
    finally { setBusy(false); }
  }

  const id = (s: TrendSignal) => s.source + ":" + s.url;
  const chosen = scan?.items.filter(s => picked.has(id(s))) ?? [];
  function toggle(s: TrendSignal) {
    setAdded(false);
    setPicked(prev => { const n = new Set(prev); if (n.has(id(s))) n.delete(id(s)); else if (n.size < 5) n.add(id(s)); return n; });
  }

  return (
    <div className="trend-radar" data-testid="trend-radar">
      <b>Radar tren</b> <small className="field-hint">sinyal nyata dari YouTube, Wikipedia, dan Hacker News, tanpa AI. Ini bukti sesuatu sedang ditonton atau dibaca, bukan jaminan videonya akan ramai.</small>
      {!signedIn || hasKey === null
        ? <small data-testid="radar-needs-login">Masuk ke akun untuk memakai radar tren. Kunci YouTube Anda disimpan di server akun, bukan di perangkat ini.</small>
        : <>
          <div className="range-tools">
            <select value={region} onChange={e => { setRegion(e.target.value as "ID" | "US"); setScan(null); }} aria-label="Wilayah" data-testid="radar-region">
              <option value="ID">Indonesia</option><option value="US">Global (AS)</option>
            </select>
            <button type="button" onClick={() => void run(false)} disabled={busy || disabled} data-testid="radar-scan">{busy ? "Memindai…" : scan ? "Pindai lagi" : topic ? `Pindai "${topic.slice(0, 24)}"` : "Pindai yang sedang ramai"}</button>
            {scan && fromCache && <button type="button" className="text-link" onClick={() => void run(true)} disabled={busy} data-testid="radar-refresh">Segarkan (hasil tersimpan {ageLabel(scan.at)})</button>}
          </div>
          {hasKey === false && <details data-testid="radar-key-fold"><summary>Tambahkan YouTube <small>(opsional, menambah jumlah tayangan nyata)</small></summary>
            <small className="field-hint">Tempel kunci YouTube Data API v3 Anda. Kunci disimpan di server akun Anda dan hanya dipakai untuk membaca jumlah tayangan video publik. Tanpa kunci, radar tetap memakai Wikipedia dan Hacker News.</small>
            <div className="range-tools"><input type="password" autoComplete="off" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Kunci YouTube Data API" aria-label="Kunci YouTube Data API" data-testid="radar-key" />
              <button type="button" onClick={() => void saveKey()} disabled={busy || keyInput.trim().length < 20} data-testid="radar-save-key">Simpan kunci</button></div>
          </details>}
          {hasKey === true && <small data-testid="radar-key-saved">YouTube aktif. <button type="button" className="text-link" onClick={() => void forgetKey()} disabled={busy} data-testid="radar-forget-key">Hapus kunci</button></small>}
        </>}
      {error && <div className="notice notice-error" role="alert" data-testid="radar-error">{error}</div>}
      {scan && <div data-testid="radar-result">
        <small className="field-hint" data-testid="radar-status">{statusLine(scan.status)}</small>
        {scan.items.length === 0
          ? <small data-testid="radar-empty">Tidak ada sinyal untuk topik ini. Coba kata yang lebih umum, atau pindai tanpa topik.</small>
          : <ul className="seo-list radar-list">{scan.items.map(s => (
            <li key={id(s)} data-testid="radar-item">
              <label><input type="checkbox" checked={picked.has(id(s))} onChange={() => toggle(s)} disabled={!picked.has(id(s)) && picked.size >= 5} /> <b>{s.title}</b></label>{" "}
              <small>{SOURCE_LABEL[s.source]}{s.also.length ? ` + ${s.also.map(a => SOURCE_LABEL[a]).join(", ")}` : ""} · {s.engLabel}{s.ts ? ` · ${ageLabel(s.ts)}` : ""} · <a href={s.url} target="_blank" rel="noopener noreferrer">buka</a></small>
            </li>))}</ul>}
        {scan.items.length > 0 && <div className="range-tools">
          <button type="button" onClick={() => { onUse(signalsText(chosen)); setAdded(true); }} disabled={!chosen.length || disabled} data-testid="radar-use">{added ? "Ditambahkan ✓" : `Masukkan ${chosen.length || ""} ke kolom tren`}</button>
          <small className="field-hint">Maksimal 5. Anda masih bisa mengubah teksnya sebelum AI menulis ide.</small>
        </div>}
      </div>}
    </div>
  );
}
