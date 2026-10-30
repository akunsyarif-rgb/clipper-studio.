# Clipper Studio

**Clipper Studio** adalah web app Next.js untuk memotong video dan membuat video vertikal berbasis naskah. Dirancang mobile-first untuk Safari di iPhone/iPad, dengan pemrosesan utama di browser agar file video dan audio tidak perlu diunggah ke server aplikasi. Penyimpanan default adalah di perangkat. Video baru dikirim ke Content Hub (penyimpanan cloud privat Cloudflare R2) hanya jika pengguna memilih "Simpan ke Content Hub" dan menyetujuinya.

## Fitur

### 1. Clipper — `/`

Memotong file video lokal menjadi MP4:

- Input MP4, MOV, WebM, atau M4V; batas aplikasi hingga 1 GB dan 60 menit.
- Pilih rentang waktu menggunakan posisi player atau input waktu. Satu klip maksimal 5 menit; hingga 5 rentang dapat disimpan dalam daftar kerja.
- Rasio 9:16, 16:9, atau 1:1 dengan resolusi 1080p, 720p, atau 480p.
- Pilihan latar hitam, latar blur, atau crop untuk memenuhi frame.
- Ekspor menggunakan FFmpeg WebAssembly di browser ke MP4 H.264 + AAC, 30 fps. Proses menampilkan progres, mendukung pembatalan, dan menyediakan percobaan ulang.
- Preview YouTube hanya berupa embed untuk membantu mencatat timestamp. Aplikasi tidak mengunduh video dari YouTube.

Kolom hook/subtitle pada Clipper adalah catatan; kolom tersebut tidak dibakar ke dalam hasil video.

### 2. Motion Graphics Studio — `/motion`

Membuat video vertikal dari naskah, visual, dan audio:

- Output 1080×1920, 30 fps, MP4 H.264 dengan AAC jika audio tersedia.
- Preview timeline menggunakan Remotion Player; scene dapat dipilih untuk berpindah ke bagian terkait.
- Pilihan gaya animasi, palet warna, template visual, dan koreksi manual per scene.
- Voice-over otomatis Bahasa Indonesia atau Inggris diproses di perangkat, atau gunakan rekaman/berkas audio sendiri.
- Backsound dapat disintesis di perangkat atau menggunakan audio yang diunggah.
- Render dilakukan di browser melalui WebCodecs; tidak memerlukan render server atau penyimpanan video di server aplikasi.

Baca [MOTION_STUDIO.md](MOTION_STUDIO.md) untuk batas input, detail audio, arsitektur render, dan catatan Remotion.

#### Script-First Visual Director

Perencanaan visual pada branch pengembangan ini memisahkan **maksud narasi** dari **cara visual menyajikannya**. Planner deterministik membaca sinyal bahasa dan konteks scene, lalu memberi rekomendasi untuk:

- Pertanyaan, kontras, sebab-akibat, proses, bukti/angka, insight, instruksi, cerita, refleksi, kesimpulan, dan pernyataan.
- Keluarga komposisi seperti editorial, kinetic typography, explainer, perbandingan, data, proses, metafora, dan story beats.
- Brief visual, alasan pemilihan, petunjuk kontinuitas, dan tingkat keyakinan heuristik agar rekomendasi dapat ditinjau sebelum render.
- Petunjuk kontinuitas dapat mengikuti referensi eksplisit seperti “hal ini” atau “cara tersebut”; ini heuristik konservatif, bukan pemahaman konteks sempurna.
- Peringatan review untuk scene panjang, sinyal makna lemah, dan angka/klaim yang perlu diverifikasi sumbernya. Peringatan bukan bukti bahwa naskah salah; keputusan akhir tetap pada kreator.

Planner deterministik ini **bukan model AI**: ia menggunakan aturan dan sinyal teks, sehingga interpretasinya dapat keliru. Ia tidak menulis ulang naskah. Komposisi yang membutuhkan pemisahan makna tertentu hanya menampilkan pemisahan saat ada pola teks yang cukup aman; jika tidak, komposisi fallback digunakan. Pengguna tetap perlu memeriksa dan dapat mengubah template/ikon secara manual.

Motion Studio juga memiliki bantuan AI opsional untuk pengarahan visual dan perapian transkrip. Penggunaan bantuan tersebut bergantung pada konfigurasi/consent dan dapat mengirim **teks naskah atau transkrip** ke penyedia AI. Jangan menganggap seluruh fitur AI berjalan lokal; periksa pengaturan dan persetujuan sebelum menggunakannya.

> Status pengembangan: Script-First Visual Director sedang ditinjau melalui pull request dan belum dianggap tersedia pada deployment produksi sampai perubahan digabung dan deployment terkait diperiksa.

## Arsitektur dan privasi

- **Clipper:** file video sumber diproses di browser dan tidak diunggah ke server aplikasi. Hasil ekspor hanya diunggah ke Content Hub atas pilihan dan persetujuan eksplisit pengguna (lihat bagian Content Hub). FFmpeg core disajikan dari origin aplikasi, bukan CDN pihak ketiga. File sumber dipasang read-only ke worker bila didukung, dengan fallback ke memori.
- **Motion Studio:** render video, TTS otomatis, dan backsound otomatis berjalan di perangkat/browser. Rekaman atau audio yang dipilih pengguna digunakan untuk membuat output lokal.
- **Fitur AI opsional:** beberapa alur dapat mengirim teks naskah/transkrip ke penyedia AI setelah konfigurasi dan persetujuan. Audio/video sumber tidak otomatis dikirim hanya karena fitur tersebut tersedia; baca penjelasan fitur yang digunakan.
- **Layanan eksternal:** aplikasi memuat Google Fonts; preview YouTube menggunakan embed dari `youtube-nocookie.com`. Remotion Web Renderer dapat mengirim event penggunaan ke `remotion.pro` (origin situs dan status sukses, bukan konten video).
- Tidak ada klaim bahwa seluruh aplikasi sepenuhnya offline. Pemrosesan lokal tetap bergantung pada browser, aset yang sudah dimuat, codec, dan memori perangkat.

## Batasan yang diketahui

- FFmpeg WebAssembly untuk Clipper berjalan single-threaded. Ekspor panjang, khususnya 1080p di iPhone/iPad, dapat berjalan lambat. Safari dapat menangguhkan tab latar belakang; pertahankan tab aktif selama ekspor.
- Video sangat besar atau codec yang tidak didukung (misalnya beberapa sumber HEVC 4K) dapat melampaui memori atau kemampuan browser.
- Render Motion Studio memerlukan dukungan WebCodecs/H.264. Chrome/Edge modern umumnya mendukung; Safari 17+ diharapkan mendukung, tetapi **uji perangkat iPhone/iPad nyata tetap diperlukan** sebelum mengandalkannya untuk produksi.
- Perencanaan semantik berbasis aturan bukan pemahaman bahasa sempurna. Periksa scene yang diberi keyakinan rendah, metafora abstrak, dan pemisahan sebab-akibat.
- Preview dan pengujian di Chromium tidak membuktikan kompatibilitas penuh pada Safari iPad.

## Pengembangan lokal

Persyaratan: Node.js sesuai konfigurasi proyek, npm, dan—untuk pengujian output media tertentu—FFmpeg serta Playwright.

```sh
npm ci
npm run dev          # menyiapkan aset FFmpeg/TTS lalu menjalankan Next.js
npm run lint
npm run typecheck
npm test             # unit tests; beberapa pemeriksaan media memerlukan FFmpeg native
npm run build
npm run test:e2e     # setelah build; memerlukan FFmpeg + Playwright
```

Untuk render Remotion melalui CLI:

```sh
npm run remotion:studio
npm run render:motion
npm run render:script
```

Perintah dan output CLI dapat berubah mengikuti konfigurasi proyek; periksa `package.json` sebelum menjalankan workflow produksi.

## Lisensi

Periksa ketentuan lisensi Remotion yang berlaku untuk ukuran organisasi dan penggunaan Anda: https://www.remotion.dev/license.

## Content Hub

Perpustakaan video pribadi di dalam Clipper Studio (`/hub`). **Default tetap lokal**: ekspor dan unduh bekerja tanpa akun. Di bawah hasil ekspor (Clipper dan Motion) ada pilihan *Simpan ke Content Hub*; video baru dikirim ke cloud setelah pengguna masuk, memilih kategori, dan mencentang persetujuan.

- **Alur:** browser meminta URL bertanda tangan ke Edge Function `media-library` (JWT wajib), lalu mengirim video **langsung ke bucket R2 privat** (satu `PUT` sampai 64 MB, di atasnya multipart 16 MB per bagian, 3 paralel, tiap bagian bisa diulang). Video tidak melewati Edge Function atau Vercel. Supabase hanya memegang login, metadata (`public.media_assets`), dan otorisasi. Kunci objek dibuat di server dan tidak pernah dikirim ke browser.
- **Kategori:** TikTok, YouTube, Instagram, Facebook, Threads, X, Lainnya, Belum dikategorikan; format Shorts, Reels, Long-form, Story, Video biasa. Nilainya sama di database (check constraint), Edge Function, dan `lib/content-hub.ts`.
- **Hapus:** manual oleh pengguna dan meminta konfirmasi. File dan thumbnail dihapus dari R2; barisnya tetap (status `deleted`, `file_deleted_at`).
- **Tanpa batas ukuran buatan aplikasi**; batasnya hanya batas R2 (5 TiB per objek, 10.000 bagian).
- **Secrets** (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_REGION`) hanya ada di Supabase Function Secrets.

### CORS bucket R2 (sekali, manual di Cloudflare)

Upload dari browser langsung ke R2 butuh CORS. Dashboard Cloudflare, R2, bucket `clipper-content-hub`, Settings, CORS Policy:

```json
[
  {
    "AllowedOrigins": ["https://<domain-produksi>", "https://<domain-preview>.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

Tanpa ini unggahan gagal dengan pesan "Penyimpanan cloud menolak atau tidak menjawab". Gratis.

### Perawatan Content Hub

- **Kuota gratis R2: 10 GB.** `/hub` menampilkan pemakaian terhadap 10 GB dan memberi peringatan mulai 80%. Aplikasi tidak memblokir unggahan; melewati kuota berarti R2 mulai menagih, jadi hapus file yang tidak dipakai.
- **Unggahan yang tersangkut** (tab ditutup, koneksi putus) tampil sebagai "Belum selesai" atau "Gagal". Tombol "Bersihkan ... unggahan yang tidak selesai" menghapus sisa filenya (catatannya tetap). R2 juga membatalkan multipart yang terbengkalai sendiri lewat aturan lifecycle bawaan.
- **Rotasi token R2** (disarankan tiap 3-6 bulan, atau segera jika dicurigai bocor): di Cloudflare buat API token R2 baru (Object Read & Write, hanya bucket ini), perbarui `R2_ACCESS_KEY_ID` dan `R2_SECRET_ACCESS_KEY` di Supabase (Edge Functions, Secrets), uji satu unggahan, baru cabut token lama.
- **Cadangan catatan produksi:** tab "Catatan produksi" punya Ekspor CSV dan JSON; unduh JSON sesekali. Video sendiri ada di R2 dan di perangkat.
