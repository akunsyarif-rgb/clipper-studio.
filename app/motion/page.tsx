"use client";

import { useMemo, useState } from "react";
import "./motion.css";

type Style = "Hybrid" | "Kinetic typography" | "Pop-up" | "Cinematic";
type Palette = "Violet / Cyan" | "Midnight / Gold" | "Pearl / Black";

const palettes: Record<Palette, { a: string; b: string; accent: string }> = {
  "Violet / Cyan": { a: "#15132f", b: "#542b79", accent: "#67f5ed" },
  "Midnight / Gold": { a: "#11151e", b: "#473522", accent: "#f6ce78" },
  "Pearl / Black": { a: "#e9edf2", b: "#bfc8d5", accent: "#242c3a" },
};

export default function MotionStudio() {
  const [prompt, setPrompt] = useState("Jangan tunggu semangat. Mulailah, meski langkahmu kecil. Disiplin membuatmu tetap bergerak. Mulai sekarang.");
  const [title, setTitle] = useState("JANGAN TUNGGU");
  const [style, setStyle] = useState<Style>("Hybrid");
  const [palette, setPalette] = useState<Palette>("Violet / Cyan");
  const [duration, setDuration] = useState("30");
  const [music, setMusic] = useState(true);
  const [status, setStatus] = useState("");
  const colors = palettes[palette];

  const scenes = useMemo(() => [
    { time: "00–04s", name: "HOOK", copy: title || "MULAI SEKARANG", motion: "Blur-in + scale pop" },
    { time: "04–09s", name: "TANTANGAN", copy: "SEMANGAT TAK SELALU DATANG", motion: "Kinetic word reveal" },
    { time: "09–15s", name: "LANGKAH KECIL", copy: "MULAI, MESKI KECIL", motion: "Popup symbols + arrow" },
    { time: "15–22s", name: "KONSISTENSI", copy: "DISIPLIN MENJAGAMU BERGERAK", motion: "Progress ring + parallax" },
    { time: "22–30s", name: "PENUTUP", copy: "MULAI SEKARANG.", motion: "Light sweep + fade" },
  ], [title]);

  const brief = useMemo(() => [
    "MOTION GRAPHICS BRIEF",
    "Tema / pesan: " + prompt,
    "Judul hook: " + title,
    "Gaya: " + style,
    "Palet: " + palette,
    "Durasi: " + duration + " detik",
    "Format: 9:16, 1080x1920, 30 fps",
    "Audio: " + (music ? "musik instrumental latar" : "tanpa audio"),
    "Tanpa footage, tanpa wajah, tanpa avatar. Hanya teks, simbol, garis, bentuk geometris, dan latar gradasi.",
    "Animasi: kinetic typography, pop-up bounce, easing sinematik, glow halus, transisi yang sinkron dengan beat.",
    "Urutan adegan: " + scenes.map(s => s.time + " " + s.name + ": " + s.copy).join(" | "),
    "Render target: MP4 H.264; jangan mulai layanan berbayar atau render eksternal tanpa persetujuan.",
  ].join("\n"), [prompt, title, style, palette, duration, music, scenes]);

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(brief);
      setStatus("Brief berhasil disalin. Belum ada video yang dirender.");
    } catch {
      setStatus("Salin manual brief yang ditampilkan pada tombol ekspor. Browser tidak memberi izin clipboard.");
    }
  }

  function downloadBrief() {
    const blob = new Blob([JSON.stringify({ prompt, title, style, palette, durationSeconds: Number(duration), aspectRatio: "9:16", fps: 30, music, scenes }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "motion-graphics-brief.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Konfigurasi brief diunduh sebagai JSON. Ini belum berupa video MP4.");
  }

  return (
    <main className="motion-shell">
      <header className="motion-header">
        <a className="motion-brand" href="/"><span className="motion-logo">✳</span> clipper<span>studio</span></a>
        <a className="back-link" href="/">← Clipper Studio</a>
      </header>

      <section className="motion-intro">
        <div className="motion-eyebrow"><span className="live-dot" /> MOTION GRAPHICS LAB · BETA</div>
        <h1>Words that <em>move.</em><br />Ideas that stay.</h1>
        <p>Rancang video dari prompt: tipografi kinetik, simbol pop-up, dan transisi sinematik. Tanpa footage atau wajah.</p>
      </section>

      <div className="studio-grid">
        <section className="studio-panel">
          <div className="panel-heading"><div><small>01 / CREATIVE BRIEF</small><h2>Atur ide video</h2></div><span className="local-tag">Lokal · tanpa render</span></div>
          <label className="field-label" htmlFor="motion-prompt">Prompt / pesan utama</label>
          <textarea id="motion-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} placeholder="Jelaskan pesan video yang ingin dibuat..." />
          <label className="field-label" htmlFor="motion-title">Teks pembuka</label>
          <input id="motion-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={48} />
          <div className="field-row">
            <div><label className="field-label" htmlFor="motion-style">Gaya animasi</label><select id="motion-style" value={style} onChange={e => setStyle(e.target.value as Style)}><option>Hybrid</option><option>Kinetic typography</option><option>Pop-up</option><option>Cinematic</option></select></div>
            <div><label className="field-label" htmlFor="motion-duration">Durasi</label><select id="motion-duration" value={duration} onChange={e => setDuration(e.target.value)}><option value="15">15 detik</option><option value="30">30 detik</option><option value="45">45 detik</option></select></div>
          </div>
          <label className="field-label" htmlFor="motion-palette">Palet warna</label>
          <select id="motion-palette" value={palette} onChange={e => setPalette(e.target.value as Palette)}><option>Violet / Cyan</option><option>Midnight / Gold</option><option>Pearl / Black</option></select>
          <label className="music-toggle"><input type="checkbox" checked={music} onChange={e => setMusic(e.target.checked)} /><span className="toggle-mark">♫</span><span><b>Musik instrumental</b><small>Placeholder sampai audio berlisensi disediakan</small></span></label>
          <div className="panel-actions"><button className="motion-primary" onClick={copyBrief}>Salin prompt lengkap <span>↗</span></button><button className="motion-secondary" onClick={downloadBrief}>Ekspor JSON</button></div>
          {status && <p className="motion-status" role="status">{status}</p>}
          <p className="privacy-note">Tidak ada layanan render eksternal yang dipanggil. Tombol ini hanya menyalin brief atau mengekspor konfigurasi.</p>
        </section>

        <section className="preview-column">
          <div className="panel-heading"><div><small>02 / LIVE PREVIEW</small><h2>Pratinjau gaya</h2></div><span className="preview-badge"><i /> DEMO</span></div>
          <div className={"motion-canvas palette-" + (palette === "Violet / Cyan" ? "violet" : palette === "Midnight / Gold" ? "gold" : "pearl")} style={{ "--color-a": colors.a, "--color-b": colors.b, "--accent": colors.accent } as React.CSSProperties}>
            <div className="canvas-grain" />
            <div className="canvas-orbit orbit-one" /><div className="canvas-orbit orbit-two" />
            <div className="canvas-topline"><span>MG / 001</span><span>30 FPS</span></div>
            <div className="canvas-content">
              <div className="canvas-kicker">SEBUAH PENGINGAT</div>
              <div className="canvas-title">{title || "MULAI SEKARANG"}</div>
              <div className="canvas-rule" />
              <div className="canvas-subtitle">MESKI LANGKAHMU KECIL.</div>
              <div className="symbol-row"><span>↗</span><span>✳</span><span>✓</span></div>
            </div>
            <div className="canvas-bottom"><span>KEEP MOVING FORWARD</span><span className="canvas-progress"><i /></span></div>
          </div>
          <p className="preview-disclaimer">Pratinjau visual statis/interaktif untuk menyepakati desain; bukan playback video atau hasil render.</p>
          <div className="timeline-heading"><h3>Storyboard</h3><span>{duration}s · 9:16</span></div>
          <div className="scene-list">{scenes.map((scene, index) => <div className="scene-row" key={scene.name}><span className="scene-index">0{index + 1}</span><div className="scene-info"><b>{scene.name}</b><small>{scene.copy}</small></div><div className="scene-meta"><b>{scene.time}</b><small>{scene.motion}</small></div></div>)}</div>
        </section>
      </div>

      <section className="remotion-note"><span className="remotion-icon">R</span><div><b>Pipeline Remotion</b><p>Komposisi video berbasis frame disiapkan dalam repo. Preview ini belum mengeksekusi render MP4; rendering memerlukan proses Node/Chromium/FFmpeg yang sesuai.</p></div><span className="status-chip">NO PAID RENDER</span></section>
      <footer className="motion-footer"><span>CLIPPER STUDIO / MOTION LAB</span><span>Built for prompt-led creation</span></footer>
    </main>
  );
}
