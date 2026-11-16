# Pemberitahuan pihak ketiga

## youtube-agent-skill (skor kalimat pembuka dan lint judul)

`lib/hook-score.ts` dan `lib/title-lint.ts` mengikuti struktur, bobot, dan aturan dari alat `hookscore.py` dan `title.py` pada paket
**youtube-agent-skill** oleh Jake Schincariol (https://github.com/Jakeschincariol/youtube-agent-skill). Kode ditulis ulang dalam
TypeScript; daftar kata dan pola rumus pembuka ditulis ulang untuk bahasa Indonesia dan **bukan** daftar bahasa Inggris aslinya.
Skor dari modul ini adalah heuristik, bukan prediksi, dan belum dikalibrasi dengan hasil nyata berbahasa Indonesia.

Lisensi paket asli (MIT):

```
MIT License

Copyright (c) 2026 Jake Schincariol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
