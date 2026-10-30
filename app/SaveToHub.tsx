"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cloud } from "@/lib/cloud";
import { explainHubError, FORMATS, HubError, makeThumbnail, PLATFORMS, uploadToHub, type FormatId, type PlatformId } from "@/lib/content-hub";
import { formatBytes } from "@/lib/clip";
import "./content-hub.css";

type Phase = "idle" | "form" | "sending" | "error" | "done";

/**
 * The "where does this video go" choice under a finished export. Saving on the device stays the default (the download button
 * above); nothing is sent anywhere until the creator opens this, picks a category and ticks the consent box.
 */
export default function SaveToHub({ getBlob, fileName, title, source, seconds, width, height, tone = "light" }: {
  getBlob: () => Promise<Blob>;
  fileName: string;
  title: string;
  source: "clipper" | "motion";
  seconds?: number;
  width?: number;
  height?: number;
  tone?: "light" | "dark";
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [signedIn, setSignedIn] = useState(false); // read after mount: the server render cannot know
  const [name, setName] = useState(title);
  const [platform, setPlatform] = useState<PlatformId>("uncategorized");
  const [format, setFormat] = useState<FormatId>("video");
  const [agreed, setAgreed] = useState(false);
  const [sent, setSent] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const resume = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { const sync = () => setSignedIn(!!cloud.user()); sync(); return cloud.subscribe(sync); }, []);
  useEffect(() => () => abort.current?.abort(), []);

  async function start() {
    const ctl = new AbortController();
    abort.current = ctl;
    setPhase("sending"); setError(""); setSent(0);
    try {
      const blob = await getBlob();
      setTotal(blob.size);
      const thumbnail = resume.current ? null : await makeThumbnail(blob);
      await uploadToHub(
        { blob, fileName, title: name.trim() || title, platform, contentFormat: format, source, durationSeconds: seconds, width, height, thumbnail },
        { signal: ctl.signal, resume: resume.current, onProgress: p => { setSent(p.sent); setTotal(p.total); } },
      );
      resume.current = undefined;
      setPhase("done");
    } catch (e) {
      if (e instanceof HubError && e.assetId) resume.current = e.assetId;
      if (e instanceof HubError && e.kind === "cancelled") { resume.current = undefined; setPhase("form"); return; }
      setError(explainHubError(e)); setPhase("error");
    }
  }

  const pct = total ? Math.floor((sent / total) * 100) : 0;
  return <div className={"hub-box" + (tone === "dark" ? " hub-dark" : "")} data-testid="hub-save">
    {phase === "idle" && <>
      <h3>Simpan ke Content Hub</h3>
      {signedIn
        ? <p>Opsional. Video hanya dikirim ke penyimpanan cloud Anda jika Anda memilihnya di sini. Tanpa itu, video tetap hanya di perangkat.</p>
        : <p>Content Hub memakai akun. Masuk lewat tautan ☁ di bagian atas halaman. Menyimpan di perangkat tidak memerlukan akun.</p>}
      <div className="hub-row"><button className="hub-btn" disabled={!signedIn} onClick={() => setPhase("form")} data-testid="hub-open">Simpan ke Content Hub</button></div>
    </>}

    {phase === "form" && <form onSubmit={e => { e.preventDefault(); void start(); }}>
      <h3>Simpan ke Content Hub</h3>
      <label className="hub-field">Judul<input value={name} maxLength={120} onChange={e => setName(e.target.value)} data-testid="hub-title" /></label>
      <div className="hub-two">
        <label className="hub-field">Platform<select value={platform} onChange={e => setPlatform(e.target.value as PlatformId)} data-testid="hub-platform">{PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className="hub-field">Format<select value={format} onChange={e => setFormat(e.target.value as FormatId)} data-testid="hub-format">{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
      </div>
      <label className="hub-consent"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} data-testid="hub-consent" />
        <span>Saya setuju video ini dikirim dan disimpan di penyimpanan cloud privat (Cloudflare R2) milik akun saya. Saya bisa menghapus file kapan saja dari Content Hub.</span></label>
      <div className="hub-row">
        <button type="submit" className="hub-btn solid" disabled={!agreed} data-testid="hub-upload">Unggah</button>
        <button type="button" className="hub-btn" onClick={() => { setPhase("idle"); setAgreed(false); }}>Batal</button>
      </div>
    </form>}

    {phase === "sending" && <div data-testid="hub-sending">
      <h3>Mengunggah…</h3>
      <div className="hub-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Kemajuan unggahan"><i style={{ width: pct + "%" }} /></div>
      <p style={{ marginTop: 6 }} data-testid="hub-progress">{total ? `${formatBytes(sent)} dari ${formatBytes(total)} · ${pct}%` : "Menyiapkan…"}</p>
      <div className="hub-row"><button className="hub-btn" onClick={() => abort.current?.abort()} data-testid="hub-cancel">Batalkan</button></div>
    </div>}

    {phase === "error" && <div>
      <h3>Belum tersimpan</h3>
      <div className="hub-error" role="alert" data-testid="hub-error">{error}</div>
      <div className="hub-row">
        <button className="hub-btn solid" onClick={() => void start()} data-testid="hub-retry">Coba lagi</button>
        <button className="hub-btn" onClick={() => { resume.current = undefined; setPhase("form"); }}>Ubah pilihan</button>
      </div>
      <p style={{ marginTop: 8 }}>Video masih ada di perangkat. Gunakan tombol Simpan MP4 di atas bila perlu.</p>
    </div>}

    {phase === "done" && <div data-testid="hub-done">
      <p className="hub-ok">Tersimpan di Content Hub.</p>
      <div className="hub-row"><Link className="hub-btn solid" href="/hub" data-testid="hub-link">Buka Content Hub</Link></div>
    </div>}
  </div>;
}
