"use client";

import type { ReactNode } from "react";

/**
 * What to do when the MP4 is ready: the download (it is the video, so it stays), and the three next moves as buttons instead of a
 * paragraph to read: save to the library, make another version, go to the SEO pack.
 */
export default function PostRenderActions({ download, info, onSave, onAnother, onSeo, saveOpen, prefix = "post", extra }: {
  download: ReactNode; info: string; onSave: () => void; onAnother: () => void; onSeo: () => void; saveOpen?: boolean; prefix?: string; extra?: ReactNode;
}) {
  return <div className="render-result post-render" data-testid={prefix === "post" ? "result" : `${prefix}-result`}>
    <b>✓ Video siap</b>
    <small>{info}</small>
    <div className="post-primary">{download}{extra}</div>
    <div className="post-actions" data-testid={`${prefix}-actions`}>
      <button type="button" className="motion-primary" onClick={onSave} aria-expanded={saveOpen} data-testid={`${prefix}-save`}>Simpan ke Perpustakaan</button>
      <button type="button" className="motion-secondary" onClick={onAnother} data-testid={`${prefix}-another`}>Buat Versi Lain</button>
      <button type="button" className="motion-secondary" onClick={onSeo} data-testid={`${prefix}-seo`}>Lanjut ke Paket SEO</button>
    </div>
    <small className="field-hint">Unduh dulu sebelum memilih “Buat Versi Lain”: gaya diganti dan hasil ini dilepas sampai Anda merender lagi.</small>
  </div>;
}
