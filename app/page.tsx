"use client";
import { useEffect, useMemo, useState } from "react";
type Mode = "upload" | "youtube";
function videoId(raw: string) {
  try {
    const u = new URL(raw.trim());
    if (u.hostname === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || null;
    if (!["youtube.com","www.youtube.com","m.youtube.com","youtube-nocookie.com","www.youtube-nocookie.com"].includes(u.hostname)) return null;
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const p = u.pathname.split("/").filter(Boolean);
    return ["shorts","embed","live"].includes(p[0]) ? p[1] || null : null;
  } catch { return null; }
}
export default function Home() {
  const [mode,setMode] = useState<Mode>("upload");
  const [file,setFile] = useState<File|null>(null);
  const [preview,setPreview] = useState("");
  const [url,setUrl] = useState("");
  const [start,setStart] = useState("00:00:00");
  const [end,setEnd] = useState("00:00:30");
  const [ratio,setRatio] = useState("9:16");
  const [quality,setQuality] = useState("1080p");
  const [message,setMessage] = useState("");
  const id = useMemo(()=>videoId(url),[url]);
  useEffect(()=>{if(!file){setPreview("");return;}const u=URL.createObjectURL(file);setPreview(u);return()=>URL.revokeObjectURL(u);},[file]);
  function validate() {
    if(mode==="upload"&&!file){setMessage("Pilih video dari Foto atau Files terlebih dahulu.");return;}
    if(mode==="youtube"&&!id){setMessage("Tautan belum dikenali. Masukkan URL video YouTube yang valid.");return;}
    setMessage("Sumber dan pengaturan valid pada prototipe. Mesin pemrosesan video belum terhubung; klip belum dibuat atau diunduh.");
  }
  return <main className="shell">
    <header><a className="brand" href="/"><span className="logo">▶</span>clipper<span className="light">studio</span></a><span className="pill"><i/> MVP PREVIEW</span></header>
    <section className="hero"><div className="eyebrow">VIDEO WORKSPACE</div><h1>Video panjang.<br/><em>Potongan yang tepat.</em></h1><p>Siapkan klip untuk Shorts, Reels, dan TikTok. Mulai dari video di perangkat atau tautan YouTube.</p></section>
    <section className="card">
      <div className="heading"><div><small>LANGKAH 01</small><h2>Pilih sumber video</h2></div><span>Pilih satu sumber</span></div>
      <div className="tabs">
        <button className={mode==="upload"?"tab selected":"tab"} onClick={()=>{setMode("upload");setMessage("");}}><b className="tabicon">↑</b><span><strong>Unggah video</strong><small>Foto atau Files</small></span><i/></button>
        <button className={mode==="youtube"?"tab selected":"tab"} onClick={()=>{setMode("youtube");setMessage("");}}><b className="tabicon yt">▶</b><span><strong>Tautan YouTube</strong><small>Tempel URL publik</small></span><i/></button>
      </div>
      {mode==="upload"?<div className="upload">
        {file&&preview?<><video src={preview} controls playsInline/><div className="fileinfo"><strong>{file.name}</strong><small>{(file.size/1048576).toFixed(1)} MB · Pratinjau lokal</small><button className="linkbtn" onClick={()=>{setFile(null);setMessage("");}}>Ganti video</button></div></>:<>
          <div className="uploadicon">↑</div><strong>Pilih video dari perangkat</strong><p>MP4, MOV, atau format video lain yang didukung browser.</p><label className="filebtn">Pilih berkas<input type="file" accept="video/*" onChange={e=>{const f=e.target.files?.[0];setFile(f&&f.type.startsWith("video/")?f:null);setMessage(f&&!f.type.startsWith("video/")?"Pilih berkas video yang valid.":"");}}/></label><small>Berkas hanya dipratinjau di browser pada prototipe ini.</small>
        </>}
      </div>:<div className="urlpanel"><label htmlFor="url">URL video YouTube</label><input id="url" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={e=>{setUrl(e.target.value);setMessage("");}}/><p className="hint">✓ Tautan publik saja. Status publik tidak otomatis memberi izin mengunduh atau menggunakan ulang video.</p>{id&&<div className="embed"><iframe src={"https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id)} title="Pratinjau YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/> </div>}</div>}
      <hr/>
      <div className="heading"><div><small>LANGKAH 02</small><h2>Atur klip</h2></div><span>Pengaturan awal</span></div>
      <div className="times"><label>Mulai dari<input value={start} onChange={e=>setStart(e.target.value)} aria-label="Waktu mulai"/></label><label>Selesai pada<input value={end} onChange={e=>setEnd(e.target.value)} aria-label="Waktu selesai"/></label></div>
      <label className="label">Format video</label><div className="ratios">{["9:16","16:9","1:1"].map(r=><button key={r} className={ratio===r?"ratio active":"ratio"} onClick={()=>setRatio(r)}><span className={"shape s"+r.replace(":","")}/>{r}{r==="9:16"&&<small>Vertikal</small>}</button>)}</div>
      <label className="label" htmlFor="quality">Resolusi ekspor</label><select id="quality" value={quality} onChange={e=>setQuality(e.target.value)}><option>1080p</option><option>720p</option><option>Ikuti resolusi sumber</option></select>
      <button className="primary" onClick={validate}>Validasi pengaturan <span>→</span></button>
      {message&&<div className="notice" role="status">{message}</div>}
      <p className="footnote">▣ Prototipe awal · Pemotongan FFmpeg, ekspor MP4, dan unduhan belum aktif.</p>
    </section>
    <section className="pipeline"><small>ALUR KERJA YANG SEDANG DIBANGUN</small><div className="steps"><div className="step done"><b>✓</b><span><strong>Pilih sumber</strong><small>Unggah atau URL</small></span></div><i/><div className="step"><b>02</b><span><strong>Potong video</strong><small>FFmpeg worker</small></span></div><i/><div className="step"><b>03</b><span><strong>Unduh MP4</strong><small>Ke perangkat</small></span></div></div></section>
    <footer><b>CLIPPER STUDIO</b><span>Dibuat untuk workflow mobile.</span></footer>
  </main>;
}