"use client";

import { useEffect, useState, type FormEvent } from "react";
import { cloud, CloudError } from "@/lib/cloud";

/** Optional sign-in so the work session and transcripts follow the creator to other devices. Video never leaves the device. */
export default function CloudAccount({ onUser }: { onUser?: (email: string | null) => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = () => { const u = cloud.user(); setEmail(u); onUser?.(u); };
    sync();
    return cloud.subscribe(sync);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent, mode: "in" | "up") {
    e.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "in") await cloud.signIn(mail.trim(), password);
      else if ((await cloud.signUp(mail.trim(), password)) === "confirm") { setMessage("Akun dibuat. Buka email dari Supabase untuk konfirmasi, lalu pilih Masuk."); return; }
      setPassword(""); setOpen(false);
    } catch (err) { setError(err instanceof CloudError ? err.message : "Gagal masuk."); }
    finally { setBusy(false); }
  }

  if (email) return <div className="cloud-box" data-testid="cloud-signed-in">
    <small>☁ Tersinkron sebagai <b>{email}</b> (hanya naskah, pengaturan, dan transkrip; video tetap di perangkat)</small>
    <button className="text-button" onClick={() => cloud.signOut()} data-testid="cloud-signout">Keluar</button>
  </div>;

  return <div className="cloud-box" data-testid="cloud-box">
    {!open
      ? <button className="text-button" onClick={() => setOpen(true)} data-testid="cloud-open">☁ Masuk untuk sinkron antar perangkat</button>
      : <form onSubmit={e => void submit(e, "in")} className="cloud-form">
        <small>Hanya naskah, pengaturan, dan transkrip yang disimpan di akun. Video tidak pernah diunggah.</small>
        <input type="email" autoComplete="email" placeholder="Email" value={mail} onChange={e => setMail(e.target.value)} required data-testid="cloud-email" />
        <input type="password" autoComplete="current-password" placeholder="Kata sandi" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} data-testid="cloud-password" />
        <div className="range-tools">
          <button type="submit" disabled={busy} data-testid="cloud-signin">{busy ? "Memproses…" : "Masuk"}</button>
          <button type="button" disabled={busy} onClick={e => void submit(e, "up")} data-testid="cloud-signup">Daftar (pertama kali)</button>
          <button type="button" onClick={() => setOpen(false)}>Tutup</button>
        </div>
      </form>}
    {message && <div className="notice" role="status" data-testid="cloud-message">{message}</div>}
    {error && <div className="notice notice-error" role="alert" data-testid="cloud-error">{error}</div>}
  </div>;
}
