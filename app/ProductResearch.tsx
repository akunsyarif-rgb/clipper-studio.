"use client";

import { useEffect, useRef, useState } from "react";
import { downloadProductImage, normalizeLink, ProductError } from "@/lib/product";
import { aiExtractor, researchEverything, type ProductResearch as Research, type ResearchFact, type ResearchImage } from "@/lib/product-research";
import { GeminiError } from "@/lib/gemini";
import { getAccess } from "@/lib/gemini-access";

const factKey = (f: ResearchFact) => f.text;

/**
 * Research for an affiliate product, done by the app (web search and page reading, no AI browsing): specifications with
 * their sources, a price hint, and the product's own pictures from its shop or brand page. The creator's AI, if there is one,
 * only turns the pages' text into short facts, each with the page's own words as a quote. Nothing is added to the video's
 * data without the creator ticking it, and the creator's own check remains the last word.
 */
export default function ProductResearch({ product, link, onUseFacts, onUsePrice, onPhoto, disabled }: {
  product: string;
  link: string;
  onUseFacts: (texts: string[]) => void;
  onUsePrice: (text: string) => void;
  /** Puts a product picture behind the scenes that name the product; resolves with how many scenes got it. */
  onPhoto: (file: File, credit: { text: string; href: string }) => Promise<number>;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Research | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const pasted = link.trim() ? normalizeLink(link) : null;
  const linkProblem = link.trim() !== "" && !pasted;
  const canRun = (product.trim().length >= 2 || !!pasted) && !linkProblem;

  async function run() {
    abort.current?.abort();
    const ctl = new AbortController(); abort.current = ctl;
    setBusy(true); setError(""); setMsg(""); setResult(null);
    try {
      const settings = await getAccess();
      const extract = settings ? aiExtractor({ apiKey: settings.apiKey, model: settings.model, language: "id", signal: ctl.signal, transport: settings.transport, format: settings.format, timeoutMs: 90_000 }) : undefined;
      const r = await researchEverything({ product: product.trim(), link: pasted ?? undefined }, { signal: ctl.signal, extract });
      setResult(r);
      setTicked(new Set(r.facts.filter(f => f.verified && !f.risky).map(factKey)));
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(e instanceof GeminiError || e instanceof ProductError ? e.message : "Pencarian gagal. Coba lagi.");
    } finally { setBusy(false); }
  }

  async function choosePicture(img: ResearchImage) {
    setPicking(img.url); setMsg("");
    try {
      const file = await downloadProductImage(img.url, { name: `produk-${img.host}.jpg` });
      const n = await onPhoto(file, { text: `Gambar: ${img.host}`, href: img.pageUrl });
      setMsg(n > 0 ? `Gambar produk dipasang di ${n} scene (yang menyebut produk dan scene terakhir). Ganti atau hapus per scene di daftar scene bila perlu.` : "Belum ada scene untuk dipasangi gambar.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Gambar gagal dipasang."); }
    finally { setPicking(null); }
  }

  const chosen = result?.facts.filter(f => ticked.has(factKey(f))) ?? [];
  return <div className="aff-research" data-testid="aff-research">
    <div className="range-tools">
      <button onClick={() => void run()} disabled={busy || disabled || !canRun} data-testid="aff-research-run">{busy ? "Mencari info produk…" : result ? "Cari ulang info produk" : "Cari info produk dengan AI"}</button>
      {busy && <button onClick={() => abort.current?.abort()} data-testid="aff-research-cancel">Batal</button>}
    </div>
    <small>App mencari di web dan membaca halaman toko atau merek (tanpa AI). AI, bila ada kunci, hanya merangkum teks halaman menjadi fakta pendek dengan kutipan aslinya; ringkasan yang kutipannya tidak ada di halaman dibuang. Tiap fakta menampilkan sumbernya, dan hanya yang Anda centang yang dipakai. Perlu masuk ke akun.</small>
    {linkProblem && <small className="aff-flag" data-testid="aff-link-problem">Tautan belum benar. Tempel alamat halaman produk, mis. https://toko.contoh/produk.</small>}
    {error && <div className="notice notice-error" role="alert" data-testid="aff-research-error">{error}</div>}

    {result && <div className="aff-result" data-testid="aff-result">
      <b>Hasil riset{result.officialName ? `: ${result.officialName}` : ""}</b>
      {result.brand && <small data-testid="aff-brand">Merek: {result.brand}</small>}
      {result.notes.map((n, i) => <small key={i} className="aff-flag" data-testid="aff-note">{n}</small>)}

      {result.facts.length > 0 && <>
        <ul className="aff-facts">
          {result.facts.map(f => <li key={f.text} data-testid="aff-fact">
            <label>
              <input type="checkbox" checked={ticked.has(factKey(f))} onChange={e => setTicked(prev => { const n = new Set(prev); if (e.target.checked) n.add(factKey(f)); else n.delete(factKey(f)); return n; })} />
              <span>{f.text}</span>
            </label>
            <small className={f.risky ? "aff-flag" : undefined}>
              {f.risky ? "⚠ Kata promosi atau klaim, tidak dicentang. " : ""}
              Sumber: <a href={f.url} target="_blank" rel="noreferrer noopener">{f.host}</a>
              {f.quote ? <> · Kutipan halaman: “{f.quote}”</> : null}
            </small>
          </li>)}
        </ul>
        <div className="range-tools">
          <button onClick={() => { onUseFacts(chosen.map(f => f.text)); setMsg(`${chosen.length} fakta ditambahkan ke Manfaat dan fakta nyata.`); }} disabled={chosen.length === 0 || disabled} data-testid="aff-use-facts">Pakai {chosen.length} fakta yang dicentang</button>
        </div>
      </>}

      {result.price && <small data-testid="aff-price-hint">Harga yang ditemukan{result.price.host ? ` di ${result.price.host}` : ""}: <b>{result.price.text}</b>{result.price.verified ? "" : " (sumber tidak bisa dipastikan)"}. Harga sering berubah, jadi periksa dulu di tokonya.{" "}
        <button type="button" className="text-link" onClick={() => { onUsePrice(result.price!.text); setMsg("Harga dimasukkan ke kolom Harga."); }} disabled={disabled} data-testid="aff-use-price">Pakai harga ini</button></small>}

      {result.images.length > 0 && <div className="aff-images" data-testid="aff-images">
        <b>Gambar dari halaman produk</b>
        <div className="photo-grid">
          {result.images.slice(0, 8).map(img => <div key={img.url} className="photo-card">
            <button type="button" onClick={() => void choosePicture(img)} disabled={disabled || picking !== null} data-testid="aff-image" aria-label={`Pakai gambar dari ${img.host}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- third-party product pictures shown as they are; no referrer so shop hotlink rules do not blank them */}
              <img src={img.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              {picking === img.url && <span className="photo-busy">Mengambil…</span>}
            </button>
            <small><a href={img.pageUrl} target="_blank" rel="noreferrer noopener">{img.host}</a></small>
          </div>)}
        </div>
        <small>Gambar produk milik toko atau merek yang membuatnya. Pakai untuk mempromosikan produk itu dan sesuai izin program afiliasi atau penjual; pastikan Anda boleh memakainya. Sumbernya ikut tampil di bawah scene.</small>
      </div>}
    </div>}
    {msg && <small role="status" data-testid="aff-research-msg">{msg}</small>}
  </div>;
}
