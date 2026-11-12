# Audit & Evaluasi Repositori — Clipper Studio

Tanggal audit: 2026-11-10 · Cakupan: `app/`, `lib/`, `remotion/`, `supabase/`, `.github/`, konfigurasi build · Metode: pembacaan kode statis (grep/read/ls). Aplikasi **tidak dijalankan**, jadi temuan runtime (performa nyata, rendering) adalah inferensi dari kode, bukan hasil pengukuran.

---

## 1. Executive Summary

**Status kesehatan: BAIK untuk fase pribadi (single-owner), BELUM SIAP untuk multi-user.**

Clipper Studio adalah aplikasi Next.js 15 / React 19 yang memproses video di browser (FFmpeg WASM, Remotion web-renderer, TTS/ASR on-device), dengan backend tipis di Supabase (Auth, tabel sinkron teks, 6 Edge Function) dan Cloudflare R2 untuk Content Hub.

| Aspek | Penilaian | Catatan singkat |
|---|---|---|
| Kualitas kode `lib/` | Kuat | ~146 berkas, mayoritas punya `*.test.ts`, TypeScript `strict`, handler Edge Function ditulis murni (dependency-injected) sehingga bisa di-unit-test |
| Keamanan data (RLS) | Kuat | RLS per `user_id`, tabel rahasia (`user_secrets`, `user_pexels`, `user_youtube_api`) ditutup total dari klien, kolom storage `media_assets` disembunyikan lewat column-level grant |
| Keamanan perimeter | Cukup, ada celah | Endpoint Next.js `/api/pixabay` tanpa autentikasi/rate-limit; CORS `*` di semua Edge Function; tidak ada kuota server-side |
| Arsitektur UI | Lemah | `app/motion/page.tsx` 1.414 baris dengan ±96 `useState` dan 29 `useEffect` dalam satu komponen; tidak ada `error.tsx` / `loading.tsx` |
| Aksesibilitas | Kurang | Hanya ±103 atribut `aria-*`/`role` di seluruh `app/`; CSS minified satu-baris, font 8–10px banyak dipakai |
| CI/Testing | Sangat baik | lint + typecheck + unit + build di CI; 18 skrip e2e Playwright; workflow e2e penuh |
| Kesiapan skala | Rendah–sedang | Dirancang sengaja "personal phase"; trigger `only_first_user` dan tidak adanya kuota membuat pembukaan ke publik tidak aman |

Kesimpulan: fondasi rekayasa (test, RLS, validasi input, desain "gagal dengan tenang") jauh di atas rata-rata proyek sejenis. Hambatan utama bukan kualitas kode per berkas, melainkan (a) satu komponen halaman yang monolitik, (b) belum adanya kontrol penyalahgunaan/kuota di sisi server, dan (c) aksesibilitas serta konsistensi UI.

---

## 2. Critical Issues (High Priority)

### C1 — Endpoint `/api/pixabay` terbuka tanpa autentikasi dan tanpa rate-limit
- **Lokasi:** `app/api/pixabay/route.ts` (seluruh `POST`).
- **Masalah:** Route memakai `PIXABAY_API_KEY` milik server tetapi tidak memeriksa sesi pengguna (berbeda dengan semua Edge Function yang memverifikasi token Supabase). Siapa pun yang mengetahui URL deployment dapat menghabiskan kuota Pixabay milik Anda, dan aksi `image` mengunduh hingga 12 MB per permintaan lewat server Anda (bandwidth/biaya Vercel).
- **Mitigasi yang sudah ada (dicatat adil):** URL sudah di-whitelist ketat (`cleanPixabayImageUrl` hanya `cdn.pixabay.com/photo/` dan `pixabay.com/get/`), redirect dicek manual, tipe konten dan ukuran dibatasi. Risiko SSRF rendah; yang tersisa adalah **penyalahgunaan kuota**.
- **Saran:** Verifikasi bearer token Supabase (pola yang sama dengan `fetch /auth/v1/user` di Edge Function) atau pindahkan ke Edge Function `pixabay` agar seragam; tambahkan rate-limit per pengguna/IP.

### C2 — Tidak ada kuota/penagihan server-side pada proxy AI
- **Lokasi:** `supabase/functions/gemini/handler.ts` (aksi `generate`), `lib/ai-budget.ts`.
- **Masalah:** `lib/ai-budget.ts` menyatakan sendiri "The budget only warns: it never stops a request" dan disimpan di `localStorage`, sehingga bisa dilewati (hapus storage, perangkat lain, panggil Edge Function langsung). `supabase/README.md` juga mencatat "Add per-account usage limits to the gemini function" sebagai TODO sebelum dibuka ke pengguna lain. Karena kunci AI milik pengguna sendiri, ini bukan kebocoran biaya milik Anda saat ini, tetapi akan menjadi masalah begitu ada akun lain atau kunci bersama.
- **Saran:** Tabel `ai_usage(user_id, day, tokens, requests)` dengan penghitungan di Edge Function dan penolakan 429 saat melewati batas.

### C3 — Pendaftaran dikunci oleh trigger sementara
- **Lokasi:** `supabase/migrations/20261027121834_clipper_sync_tables.sql` (`only_first_user`).
- **Masalah:** Ini disengaja dan terdokumentasi, tetapi merupakan satu-satunya "gerbang" akses. Pesan error di `lib/cloud.ts` (`explainAuth`, kasus `closed`) bergantung pada teks "Database error saving new user" yang rapuh. Menghapus trigger tanpa menyiapkan kuota (C2), validasi email, dan rate-limit membuka permukaan serangan sekaligus.
- **Saran:** Jadikan "buka pendaftaran" sebagai checklist rilis resmi (lihat Roadmap Fase 1), jangan sekadar `drop trigger`.

### C4 — CORS `access-control-allow-origin: *` di seluruh Edge Function
- **Lokasi:** `supabase/functions/{gemini,media-library,pexels,product,trends,youtube}/handler.ts`.
- **Masalah:** Autentikasi memakai bearer token (bukan cookie), sehingga risiko CSRF rendah, tetapi origin lain tetap dapat memanggil fungsi jika memegang token. Praktik terbaiknya adalah membatasi ke origin deployment.
- **Saran:** Ubah menjadi daftar origin yang diizinkan (env `ALLOWED_ORIGINS`), dipusatkan di satu modul bersama (lihat R5).

### C5 — Token sesi disimpan di `localStorage`
- **Lokasi:** `lib/cloud.ts` (`STORAGE_KEY = "clipper:cloud:v1"`, menyimpan `accessToken` dan `refreshToken`).
- **Masalah:** Setiap XSS (termasuk dari dependensi pihak ketiga) dapat mengambil refresh token. Mitigasi positif: tidak ada `dangerouslySetInnerHTML`/`innerHTML`/`eval` di `app`, `lib`, `remotion`. Risiko karenanya rendah, tetapi tidak nol, terutama dengan banyak dependensi (`@huggingface/transformers`, `onnxruntime-web`, `tone`).
- **Saran:** Tambahkan header keamanan (CSP, `X-Content-Type-Options`, `Referrer-Policy`) di `next.config.mjs` — saat ini belum ada. CSP perlu disetel hati-hati karena WASM/WebGPU/blob URL dipakai luas.

### C6 — Risiko performa/kestabilan pada `app/motion/page.tsx`
- **Lokasi:** `app/motion/page.tsx` (1.414 baris).
- **Masalah:** Satu komponen memegang ±96 `useState` dan 29 `useEffect`. Setiap perubahan state kecil (mis. slider volume musik) me-render ulang seluruh halaman termasuk panel yang tidak terkait. Efek di baris 544 (`setResult(null)` pada 14 dependensi) menghapus hasil render setiap kali salah satu opsi berubah, tanpa peringatan kepada pengguna. Pada Safari iOS (target utama README) memori terbatas, sehingga re-render berlebih dan blob URL yang menumpuk berisiko.
- **Saran:** Lihat R1 (pecah komponen, `useReducer`/store terpusat).

---

## 3. Usability & UX Assessment

### Yang sudah baik
- **Mobile-first yang serius:** `interactiveWidget: "resizes-visual"`, aturan `font-size:16px` untuk input pada perangkat sentuh (`globals.css:67`) untuk mencegah zoom otomatis iOS, `useWakeLock.ts` agar layar tidak mati saat render, `HeavyWorkNotice`, `StableTyping`.
- **Feedback sistem lengkap:** komponen khusus `AiBusy`, `AiErrorNotice`, `AiNeeded`, `AiSetupCard`, `AiBudgetWarning`, `PreRenderChecklist`, `FlowStepper`, `NextSteps`, `PostRenderActions`; ±39 penggunaan `role="alert"`/`aria-live`.
- **Pesan error dalam bahasa pengguna** dan dapat ditindaklanjuti (`explainAuth` di `lib/cloud.ts`, pesan di handler Edge Function). Tidak ada `alert()/confirm()/prompt()` native.
- **Gagal dengan tenang:** `lib/session-store.ts`, `lib/cloud.ts` tetap berfungsi saat IndexedDB/localStorage diblokir.
- **Alur terpandu:** `QuickStart`, `TrendStart`, `FlowStepper` mengurangi beban pengguna baru.

### Temuan dan saran

| # | Temuan | Dampak | Saran |
|---|---|---|---|
| U1 | **Halaman `/motion` terlalu padat.** Satu halaman memuat naskah, visual, suara, musik, caption, watermark, CTA, SEO, afiliasi, riwayat, dst. Ada `advancedOpen` (baris 1332) tetapi isi dasar tetap panjang. | Beban kognitif tinggi, scroll panjang di ponsel | Bagi menjadi langkah/tab (Naskah → Visual → Suara → Ekspor) memakai `FlowStepper` yang sudah ada; sembunyikan panel lanjutan secara bawaan |
| U2 | **Hasil render dihapus diam-diam** saat opsi apa pun berubah (`page.tsx:544`). | Pengguna kehilangan render yang menghabiskan waktu lama | Tampilkan indikator "hasil kedaluwarsa" dengan tombol "Render ulang" alih-alih membuang; atau konfirmasi sebelum membuang |
| U3 | **Aksesibilitas rendah.** Hanya ±103 atribut ARIA di 47 komponen klien; teks sangat kecil (`font-size: 7–10px` banyak di `globals.css`/`motion.css`, mis. `.step small{font-size:8px}`, `.canvas-kicker` 7px); warna muted `#737891` di atas `#0f111c` mendekati batas kontras WCAG AA untuk teks kecil. | Sulit dibaca, tidak ramah pembaca layar | Minimum 11–12px untuk teks fungsional; audit kontras; tambahkan `aria-pressed/aria-selected` pada pemilih gaya/rasio (tombol `.tab`, `.ratio` meniru radio tanpa semantik); gunakan `<fieldset>/<legend>` atau `role="radiogroup"` |
| U4 | **Tidak ada `error.tsx`, `loading.tsx`, `not-found.tsx`** di `app/`. | Crash render menampilkan layar error generik Next.js; tidak ada skeleton saat memuat bundel berat | Tambahkan error boundary dengan tombol "Muat ulang, sesi Anda aman tersimpan" (karena sesi disimpan di IndexedDB) |
| U5 | **Bundel awal berat.** `app/motion/page.tsx` mengimpor `@remotion/player` dan `ScriptVideo` secara statis; tidak ada satu pun `dynamic()` di `app/`. | Waktu muat awal lama di seluler | `next/dynamic` untuk Player, panel AI, dan panel opsional; model TTS/ASR sudah di-lazy (pertahankan) |
| U6 | **Dua halaman, dua sistem desain.** `globals.css` (tema hijau/gelap, kelas `.shell/.card`) dan `motion.css` (kelas `.motion-*`, `.studio-*`) memakai warna, radius, dan skala tipografi yang berbeda; CSS ditulis minified satu baris sehingga sulit dipelihara. | Inkonsistensi visual, susah mengubah tema | Ekstrak design tokens (CSS variables) bersama; format ulang CSS dengan Prettier |
| U7 | **Onboarding AI memerlukan konsep teknis** (kunci API, "base URL" router OpenAI-format, nama model). `AiSetupCard`/`AiModelSelect` membantu, tetapi istilah masih teknis. | Hambatan bagi pengguna non-teknis | Preset penyedia sekali klik, tombol "Uji koneksi", dan tautan langsung ke halaman pembuatan kunci |
| U8 | **Gambar `<img>` mentah** (9 tempat) tanpa `next/image` atau `loading="lazy"` terjamin. | Kecil; sebagian besar gambar berasal dari blob/pihak ketiga sehingga `next/image` tidak selalu cocok | Cukup tambahkan `loading="lazy"`, `decoding="async"` dan dimensi eksplisit untuk mencegah layout shift |
| U9 | **Metadata terlalu minim:** tidak ada `manifest`, ikon PWA, atau service worker, padahal `appleWebApp.capable` sudah diset dan target utama adalah iPhone. | Tidak bisa "Add to Home Screen" yang rapi; tidak ada mode offline meski pemrosesan sebagian besar on-device | Tambahkan `manifest.webmanifest` dan ikon; pertimbangkan cache untuk aset FFmpeg/TTS |

---

## 4. Refinement & Code Optimization

### R1 — Pecah `app/motion/page.tsx` (prioritas tertinggi)
- 1.414 baris, ±96 `useState`, 29 `useEffect`, dan beberapa fungsi bantu non-UI (`probeRendered`, `audioDuration`, `SafeGuide`, `SceneVisualControls` yang di baris 1374 memiliki daftar prop sangat panjang) dalam satu berkas.
- **Langkah:** (1) ekstrak state per domain ke custom hooks (`useNarration`, `useMusic`, `useRenderPipeline`, `useSceneOverrides`, `useWatermark`); (2) gabungkan state yang saling bergantung ke `useReducer` atau store kecil (Zustand/`useSyncExternalStore`); (3) pindahkan fungsi non-UI ke `lib/`; (4) bungkus panel dengan `React.memo` setelah state-nya terisolasi.
- **Manfaat:** re-render terlokalisasi, bisa di-unit-test, e2e `motion.mjs` (1.146 baris) tidak perlu bergantung pada satu komponen raksasa.

### R2 — Kumpulan efek pembersih blob URL yang berulang
- `page.tsx` baris 326, 391–395, 461, 543 mengulang pola `useEffect(() => { ... return () => URL.revokeObjectURL(url) }, [x])` untuk 8 objek berbeda.
- **Saran:** satu hook `useObjectUrl(blobOrFile)` yang membuat dan mencabut URL secara otomatis.

### R3 — Efek `setResult(null)` dengan 14 dependensi (baris 544)
- Daftar dependensi manual rawan terlewat saat opsi baru ditambahkan (hasil basi tetap tampil). Gunakan satu "signature" turunan (`useMemo` dari semua opsi render, atau hash JSON) sebagai satu-satunya dependensi, dan tampilkan status kedaluwarsa (lihat U2).

### R4 — Penanganan error senyap (`catch {}`) ±50 tempat
- Sebagian besar sah (storage diblokir, player tidak tampil) dan diberi komentar. Namun sebaiknya ada satu utilitas `safely(fn, fallback)` / logger kecil agar kegagalan tak terduga bisa diamati (mis. kirim ke telemetri opsional atau `console.debug` di mode dev), bukan hilang total.

### R5 — Duplikasi di Edge Function
- Pola yang sama muncul berulang di `gemini`, `media-library`, `pexels`, `product`, `trends`, `youtube`: konstanta `CORS`, helper `reply`/`fail`, dan verifikasi pengguna lewat `fetch ${env.url}/auth/v1/user`.
- **Saran:** modul bersama `supabase/functions/_shared/` (`cors.ts`, `respond.ts`, `auth.ts`). Sekaligus tempat ideal untuk menaruh rate-limit (C2) dan CORS berbasis allowlist (C4). Dengan begitu perbaikan keamanan dilakukan sekali, bukan di enam tempat.

### R6 — Ketergantungan pada kueri string PostgREST buatan sendiri
- `gemini/handler.ts` dan `media-library/handler.ts` menyusun filter seperti `` `user_secrets?user_id=eq.${uid}` `` dan `status=in.(${from.join(",")})`. `uid` berasal dari Auth (aman) dan di `media-library` divalidasi regex UUID; `from` berasal dari konstanta internal. Saat ini aman, tetapi pola interpolasi string rapuh terhadap perubahan di masa depan.
- **Saran:** bungkus dalam helper `eq(col, val)` yang selalu `encodeURIComponent`, atau gunakan `@supabase/supabase-js` di Deno.

### R7 — Konfigurasi Supabase di-hardcode sebagai fallback
- `lib/cloud.ts:11-12` menanam URL proyek dan kunci *publishable* sebagai nilai bawaan. Ini publik secara desain (RLS yang melindungi data) dan sudah dikomentari, namun membuat fork/klon secara tak sengaja menunjuk ke backend Anda. Pindahkan ke `.env.example` dan buat build gagal jelas bila variabel tidak diisi (kecuali mode demo).

### R8 — Kebersihan repositori
- `clipper-export.mp4` (±70 KB) ada di working directory; sudah di-`.gitignore` dan tidak ter-track (aman), tetapi sebaiknya dihapus dari root agar tidak tercampur.
- Dokumen besar di root (`MOTION_STUDIO.md`, `STORY_MOTION_LAB.md`) lebih tepat berada di `docs/` bersama `AI_DIRECTOR_PRODUCT_SPEC.md`.
- Tidak ada `.env.example` ataupun `.nvmrc`/`engines` (CI memakai Node 22) — tambahkan agar lingkungan lokal seragam.
- `package.json`: `test:e2e` adalah satu rantai `&&` berisi 18 skrip; gunakan runner (mis. Playwright Test atau skrip `e2e/run-all.mjs`) agar bisa paralel, menampilkan ringkasan, dan menjalankan subset. `playwright.config.*` dirujuk di workflow tetapi tidak ada di repo.
- Dependensi dev bernama `@3sln/donki-lle-voice-multi*` (tiga paket) di `devDependencies` tetapi dipakai untuk aset TTS lewat `scripts/copy-tts-assets.mjs`; verifikasi asal paket, lisensi, dan apakah sebaiknya masuk `dependencies`/dikunci hash karena memengaruhi build produksi.

### R9 — Pemeriksaan lain
- ✅ Tidak ada `TODO/FIXME/HACK`, tidak ada `@ts-ignore`; ±36 kemunculan `any`/`eslint-disable` total (wajar).
- ✅ Tidak ada `innerHTML`/`dangerouslySetInnerHTML`/`eval`.
- ⚠️ ESLint hanya memakai `next/core-web-vitals` + `next/typescript`; tambahkan `eslint-plugin-jsx-a11y` (bagian dari U3) dan aturan `react-hooks/exhaustive-deps` sebagai error agar masalah seperti R3 tertangkap otomatis.
- ⚠️ `tsconfig` `target: ES2017`; aman, tetapi bisa dinaikkan karena target utama adalah browser modern (Safari terbaru) dan tidak ada polyfill yang bergantung pada target rendah.

---

## 5. Development Roadmap (Kesiapan Skala)

### Penilaian arsitektur saat ini
- **Struktur folder:** `lib/` datar dengan 146 berkas (domain: AI, TTS/ASR, video, hub, sync, tren, afiliasi) bercampur tanpa subfolder kecuali `asr/` dan `tts/`. Mudah dijelajahi sekarang, tetapi akan tidak terkendali pada puluhan fitur lagi.
- **Modularitas positif:** logika murni terpisah dari UI dan diuji; Edge Function `handler.ts` (murni) dipisahkan dari `index.ts` (runtime Deno); komponen panel di `app/*.tsx` cenderung kecil (rata-rata 100–250 baris) — kecuali `/motion`.
- **State management:** tidak ada pustaka; kombinasi `useState` lokal, `localStorage`, IndexedDB (`session-store`), dan sinkron Supabase. Berfungsi untuk satu pengguna, tetapi sumber kebenaran terpecah, dan tidak ada strategi penyelesaian konflik sinkron antar-perangkat selain `updated_at` (periksa `lib/history-sync.ts` untuk memastikan perilaku last-write-wins yang diinginkan).
- **Penambahan fitur baru:** saat ini harus menyentuh `app/motion/page.tsx` (titik kopling terbesar). Itulah risiko regresi utama.

### Fase 1 — Stabilkan fondasi (1–2 minggu)
1. Selesaikan R1–R3 (pecah `/motion`, hook `useObjectUrl`, sinyal hasil kedaluwarsa). Jaga e2e tetap hijau sebagai jaring pengaman.
2. Tambahkan `error.tsx`, `loading.tsx`, `not-found.tsx` (U4).
3. Header keamanan + CSP (C5), amankan `/api/pixabay` (C1).
4. Buat `supabase/functions/_shared/` dan satukan CORS/auth (R5, C4).
5. `.env.example`, `engines`, dan pindahkan dokumen ke `docs/` (R7, R8).

### Fase 2 — Siapkan multi-user (2–4 minggu)
1. Tabel `ai_usage` + penegakan kuota di `gemini` dan rate-limit per pengguna untuk `media-library`, `product`, `pexels`, `youtube`, `trends` (C2). `product` melakukan fetch URL arbitrer, jadi paling perlu pembatasan laju.
2. Kuota penyimpanan R2 per pengguna (saat ini `maxFileBytes` 5 TiB dan "tidak ada batas yang ditetapkan aplikasi"; tambahkan batas total per akun dan pembersihan unggahan multipart yang menggantung/status `uploading`).
3. Prosedur "buka pendaftaran": hapus `only_first_user`, aktifkan konfirmasi email, CAPTCHA/rate-limit Auth, halaman reset kata sandi (belum terlihat di `lib/cloud.ts` — hanya signIn/signUp/signOut), serta halaman privasi/ketentuan (aplikasi mengirim teks transkrip ke Google/router AI).
4. Enkripsi kolom `gemini_key`/kunci API pihak ketiga at-rest (Supabase Vault atau `pgsodium`) — saat ini plaintext di tabel yang hanya dapat dibaca service role.
5. Observabilitas: log terstruktur di Edge Function (ada `console.error` untuk upstream AI tanpa kunci — baik), error tracking klien (mis. Sentry), dan metrik kegagalan render/ekspor.

### Fase 3 — Skala fitur (berkelanjutan)
1. Reorganisasi `lib/` menjadi domain: `lib/ai/`, `lib/audio/` (tts, asr, sfx, backsound), `lib/video/` (clip, render, engine, layout, trim), `lib/content/` (hub, seo, trend, affiliate, youtube), `lib/cloud/` (cloud, session-store, history-sync). Gunakan barrel `index.ts` per domain dan aturan impor ESLint (`no-restricted-imports`) agar lapisan tidak saling menembus.
2. Terapkan pola registri untuk hal yang kini ditambah dengan menyunting banyak tempat: gaya video (`Families.tsx`, `StylePicker`), panel (`/motion`), penyedia AI (`gemini.ts`, handler), dan penyedia stok (Pexels, Pixabay, Iconify). Satu antarmuka penyedia (`search(query)`, `fetch(asset)`) memungkinkan tambah sumber tanpa menyentuh UI.
3. Rendering berat: bila pengguna bertambah dan perangkat lemah (iPhone lama) menjadi hambatan, sediakan opsi render server (Remotion Lambda/Cloud Run) sebagai jalur opsional dengan antrean job dan kuota, sambil mempertahankan jalur on-device sebagai bawaan.
4. Sinkron: pertimbangkan Supabase Realtime atau versioning (kolom `rev`) untuk penyelesaian konflik multi-perangkat yang eksplisit, bukan hanya `updated_at`.
5. Pengujian: tambahkan uji komponen (React Testing Library/Vitest) untuk panel hasil pemecahan R1, uji visual regresi untuk dua sistem CSS, dan pemeriksaan aksesibilitas otomatis (axe) di e2e. Jadikan e2e inti sebagai syarat merge (kini workflow e2e penuh berbasis `paths` dan berdurasi hingga 90 menit).
6. Performa: budget ukuran bundel di CI (mis. `@next/bundle-analyzer` + ambang), lazy-load Player dan panel (U5), serta caching aset berat lewat service worker (U9).

### Ringkasan prioritas

| Prioritas | Item | Usaha | Dampak |
|---|---|---|---|
| P0 | C1 amankan `/api/pixabay`; C5 header keamanan | S | Tinggi |
| P0 | R1 pecah `/motion` (bertahap) | L | Sangat tinggi (kemampuan pengembangan) |
| P1 | U4 error boundary; U2/R3 hasil kedaluwarsa | S | Tinggi (UX) |
| P1 | R5+C4 modul bersama Edge Function | M | Tinggi |
| P1 | C2 kuota server-side | M | Wajib sebelum multi-user |
| P2 | U3 aksesibilitas & kontras; U6 design tokens | M | Sedang–tinggi |
| P2 | U5 lazy-load; U9 PWA | M | Sedang |
| P3 | Reorganisasi `lib/`, registri penyedia, render server opsional | L | Strategis |

*Skala usaha: S ≤ 1 hari, M ≈ 2–5 hari, L > 1 minggu.*

---

### Batasan audit
- Analisis statis; tidak menjalankan `npm test`, build, atau e2e, dan tidak mengakses proyek Supabase/Vercel langsung. Konfigurasi dashboard (mis. "Confirm email", pengaturan rate-limit Auth) tidak dapat diverifikasi dari repositori.
- Metrik jumlah baris/hook dihitung dengan grep dan bersifat perkiraan.
- File yang dibaca mendalam: `lib/cloud.ts`, `lib/ai-budget.ts`, migrasi inti, handler `gemini`, `app/api/pixabay/route.ts`, `lib/pixabay-server.ts`, `app/layout.tsx`, konfigurasi build/CI, dan struktur `app/motion/page.tsx`. Handler lain (`media-library`, `product`) dibaca sebagian lewat grep pada fungsi keamanan. Komponen panel lainnya diperiksa berdasarkan ukuran dan pola, bukan baris per baris.
