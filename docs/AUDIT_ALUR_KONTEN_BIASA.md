# Audit alur "Konten biasa" (`/motion`)

Tanggal: 2026-11-12. Cakupan: urutan langkah, relevansi isi tiap langkah, dan daftar tempat yang bisa memanjang. Dasarnya pembacaan kode (`app/motion/**`, `app/*.tsx`) dan percobaan langsung di browser (layar tablet 820 px dan iPhone 13) dengan API Pixabay dipalsukan.

## 1. Alur saat ini

Dari atas ke bawah pada halaman `/motion` (mode Konten biasa):

1. Pemilih mode (Konten biasa / Affiliate), masuk akun, **Siapkan AI** (tiga pilihan).
2. **QuickStart**, tiga tab: Tulis keinginan → Periksa rencana → Pratinjau dan render. Isian bawaannya: Jenis *Produk / peluncuran*, Produk, Kalimat utama (hook), Ajakan, Durasi.
3. **Pengaturan lanjutan** (terlipat), berisi lima langkah dan satu "langkah 0":
   - 0 · Mulai dari tren
   - 1 · **Naskah**: video sumber, naskah, judul, Cinematic Studio
   - 2 · **Gambar**: gambar & musik otomatis (Pixabay), ikon, Pexels, timeline scene
   - 3 · **Suara dan musik**: voice over, backsound, durasi & subtitle, efek & stiker
   - 4 · **Gaya**: gaya animasi & warna, posisi subtitle, tampilan & tema, **Sutradara AI**, watermark
   - 5 · **Render**: urutan adegan, daftar periksa, render, SEO
4. Kolom **Pratinjau** (di layar lebar menempel di kanan; di ponsel berada di paling bawah, setelah langkah 5).

## 2. Temuan urutan dan relevansi

| # | Temuan | Bukti di kode | Dampak |
|---|---|---|---|
| A1 | **Sutradara AI ada di langkah 4, padahal hasilnya dipakai langkah 2.** Kata kunci gambar bahasa Inggris dari Sutradara AI (`directorInfo.imageQuery`) adalah masukan panel **Pexels** dan **Ikon**. Panel Pexels sendiri menyuruh "Jalankan Sutradara AI dulu", tetapi tombolnya baru ada dua langkah kemudian. | `ImagesStep.tsx` (query dari `directorInfo`), `PexelsPanel.tsx` (pesan "Scene belum punya kata kunci"), `StyleStep.tsx` (`AiDirector`) | Pengguna mencari gambar tanpa kata kunci, atau harus bolak-balik antar langkah. |
| A2 | **Sutradara AI menimpa pilihan gaya yang baru dibuat.** `applyDirector` mengubah gaya, palet, tipografi, latar, grain, gaya subtitle, stiker, SFX dan override per scene. Ia berada di bawah pemilih gaya manual, jadi urutannya "atur manual → AI menimpa". | `useDirector.ts` (`directorSnap` memuat semua field itu) | Pekerjaan manual hilang; undo ada, tetapi urutannya membingungkan. |
| A3 | **Gambar dipilih sebelum gaya dan suara.** Warna dan selubung gambar mengikuti palet (langkah 4), dan durasi tiap scene baru pasti setelah suara dibuat (langkah 3). Gambar terikat teks scene sehingga tidak hilang, tetapi tampilannya berubah setelahnya. | `ScriptVideo.tsx` (`SceneImage` memakai `colors.bg1`), `useTimeline.ts` (`aiFresh` menentukan durasi) | Hasil gambar sering harus dicek ulang di akhir. |
| A4 | **Suara otomatis wajib dibuat, tetapi baru ketahuan di langkah 5.** Mode suara bawaan "Otomatis"; tanpa menekan *Buat suara otomatis*, `blocker` menolak render. Daftar periksa pra-render tidak punya tombol perbaikan untuk suara (`FixId` hanya `music`, `duration`, `cta`). | `useStoryboardChecks.ts` (`blocker`), `lib/prerender.ts` | Pengguna sampai di tombol Render lalu tertahan. |
| A5 | **Banyak pintu masuk untuk membuat naskah**: QuickStart, "0 · Mulai dari tren", kolom naskah, Cinematic Studio (di dalam langkah 1, dan *mengganti* naskah serta gaya), video sumber + transkrip. Tidak ada satu tempat yang bilang "mulai dari mana". | `StudioPanelHeader.tsx`, `ScriptStep.tsx`, `QuickStart.tsx` | Pengguna baru tidak tahu jalur mana yang utama. |
| A6 | **Dua alur sejajar** (QuickStart dan Pengaturan lanjutan), masing-masing punya pratinjau dan tombol render sendiri. | `page.tsx` (`QuickStart` + `advanced-settings`) | Tidak jelas mana yang "resmi"; status keduanya bisa terasa berbeda. |
| A7 | **Isian QuickStart bawaan berorientasi produk** (`EMPTY.genre = "produk"`: Produk, hook, Ajakan). Untuk konten biasa (motivasi, edukasi, cerita) tiga isian pertama tidak relevan. | `CinematicStudio.tsx` (`EMPTY`) | Konten biasa terasa seperti formulir iklan. |
| A8 | **Pratinjau terlalu jauh dari tempat bekerja** di ponsel: setelah memilih gambar di langkah 2, pratinjau berada sekitar 1.700 px di bawah layar. | Diukur di iPhone 13 (`.player-wrap` top 1698 px) | Pengguna tidak melihat hasil pilihannya, jadi merasa gambar "tidak muncul". |

## 3. Saran urutan

**Pilihan ringan (disarankan lebih dulu, tanpa mengubah nomor langkah):**

1. Pindahkan **Sutradara AI** ke atas langkah 2 (Gambar), atau tampilkan tombolnya di kedua langkah. Kata kunci gambar jadi tersedia tepat saat dibutuhkan (A1), dan AI berjalan sebelum pengguna mengatur gaya manual (A2).
2. Tambahkan tombol perbaikan **"Buat suara otomatis"** di daftar periksa pra-render dan pesan `blocker` (A4).
3. Ubah isian QuickStart bawaan mengikuti jenis konten terakhir yang dipakai, dan sembunyikan "Produk/Ajakan" bila jenisnya Cerita atau Edukasi (A7).
4. Beri satu judul "Mulai dari…" di langkah 1 yang merangkum: tulis sendiri · dari tren · dari ide (AI) · dari video (A5).

**Pilihan ideal (urutan baru, perlu menyesuaikan `data-testid` dan e2e):**

| Langkah | Isi | Alasan |
|---|---|---|
| 1 Naskah | Mulai dari…, naskah, judul | Semua yang lain bergantung pada teks. |
| 2 Suara | Voice over, durasi, subtitle, backsound | Suara menentukan durasi tiap scene. |
| 3 Sutradara & gaya | Sutradara AI, lalu penyesuaian gaya, palet, watermark | AI memberi titik awal; penyesuaian manual datang sesudahnya dan tidak tertimpa. |
| 4 Gambar & ikon | Pencarian gambar, video latar, ikon, daftar scene | Kata kunci, palet, dan durasi sudah final. |
| 5 Render | Daftar periksa, render, SEO, simpan | Tidak berubah. |

**Pratinjau (A8):** pertahankan tombol "Lihat di pratinjau" (sudah ditambahkan), dan pertimbangkan pratinjau mini yang menempel di ponsel pada langkah 4 (Gambar). Itu butuh uji sentuh di perangkat nyata, jadi belum dikerjakan.

## 4. Tempat yang bisa memanjang ke bawah

Diperiksa semua komponen yang merender daftar hasil:

| Tempat | Sebelumnya | Sekarang |
|---|---|---|
| Hasil Pexels (`ScenePhotoPicker`) | Grid 6 foto, selalu terbuka | Tombol Sembunyikan/Tampilkan; satu baris geser di ponsel |
| Hasil Pixabay foto (`PixabayPhotoPicker`) | Grid 8 gambar, selalu terbuka | Sama |
| Hasil Pixabay video (`PixabayVideoPicker`) | Grid 8 video, selalu terbuka | Sama |
| Hasil ikon (`IconifyPanel`) | 12 ikon, selalu terbuka | Tombol Sembunyikan/Tampilkan |
| Gambar halaman produk (`ProductResearch`) | Hingga 8 gambar | Tombol Sembunyikan/Tampilkan |
| Sinyal tren (`TrendRadar`) | Daftar panjang | Tombol Sembunyikan/Tampilkan |
| Daftar scene (`ImagesStep` / `SceneItem`) | Tiap scene memuat 4–6 baris analisis panjang | Analisis diringkas secara bawaan (tombol *Tampilkan detail analisis*); seluruh daftar bisa disembunyikan |
| Transkrip (`TranscriptPanel`) | Sudah dibatasi tinggi 340 px + gulir | Tidak diubah |
| Urutan adegan (`StoryboardFold`), Backsound/Durasi/Efek, Tampilan & tema | Sudah berupa lipatan | Tidak diubah |
| Pustaka Hub (`HubLibrary`), Riwayat (`HistoryPanel`) | Halaman daftar tersendiri | Tidak diubah: daftar adalah isi halaman, bukan hasil sementara |
| Ide tren (`TrendStart`), kartu SEO (`SeoPanel`), Cinematic (`CinematicStudio`) | Naskah tiap ide sudah di dalam lipatan | Tidak diubah |

## 5. Perbaikan yang sudah dikerjakan bersama audit ini

- **Video latar Pixabay tidak tampil di konten biasa.** `SceneView` hanya menggambar `scene.image`, bukan `scene.videoSrc`, sehingga *Cari video Pixabay* dan *Video latar* otomatis tidak menghasilkan apa pun di pratinjau maupun render. Sekarang tampil (dan stiker/objek 3D ikut menghindarinya seperti pada foto).
- **Foto terlalu gelap di pratinjau.** Selubung warna di atas foto sampai 90% pekat; dikurangi menjadi sekitar 20–80% agar foto terlihat dan teks tetap terbaca.
- **Pratinjau kosong saat scene dipilih.** Klik scene meloncat ke frame pertama scene (animasi masuk masih transparan); sekarang meloncat 10 frame ke dalam scene.
- **Baris kontrol gambar rusak di ponsel.** Input berkas tampil di tengah baris dan kredit foto terbelah jadi huruf bertumpuk; sekarang input disembunyikan dan kredit mendapat satu baris penuh.
- **Tombol "Lihat di pratinjau"** di tiap scene yang sudah bergambar: meloncat ke scene itu dan menggulir ke pratinjau.
- **Tombol Sembunyikan/Tampilkan** pada daftar hasil di atas (komponen `ResultsBar`), tanpa pencarian ulang saat ditampilkan kembali.
- Tes e2e baru `e2e/image-results.mjs` mengunci semua perilaku di atas pada layar ponsel.
