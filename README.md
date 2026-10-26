# Clipper Studio

Mobile-first, local-first video clipping MVP for Safari on iPhone and iPad.

## What works

1. **Pick a local video** (MP4/MOV/WebM/M4V, up to 1 GB and 60 minutes). It plays in the page and the duration is read automatically.
2. **Choose the range**: type the start/end (`hh:mm:ss`, `mm:ss` or seconds, decimals allowed) or take them from the player position. Invalid ranges are explained before anything runs. One clip can be up to 5 minutes. Up to 5 ranges can be kept in a work list.
3. **Choose the format**: 9:16, 16:9 or 1:1 at 1080p, 720p (default) or 480p, with a black background, a blurred background, or cropping to fill the frame.
4. **Export**: FFmpeg (WebAssembly) cuts and re-encodes the clip in the browser to MP4 (H.264 + AAC, 30 fps, `faststart`). The page shows progress, lets you cancel, and offers a retry of the last export after a failure or cancel.
5. **Save**: download the MP4, play it in the page, or use the share sheet (iPhone/iPad: "Save Video" to Photos).

A YouTube link can be opened in a **preview-only** embed to note timestamps. The app does not download YouTube videos. To export, use a file you own or have permission to use.

## Architecture

- Processing happens entirely in the browser. The source video is never uploaded, and no server function, storage, database, account or API key is needed. Vercel only serves static files.
- The FFmpeg core (`@ffmpeg/core`, ~32 MB) is copied from `node_modules` into `public/ffmpeg/` by `scripts/copy-ffmpeg-core.mjs` before `dev`/`build`. It is served from our own origin (no CDN dependency) and downloaded once per session on the first export.
- The source file is mounted read-only into the FFmpeg worker (WORKERFS) instead of being copied into WebAssembly memory. It falls back to an in-memory copy if mounting is not available.
- Pure logic (time parsing, validation, output sizes, FFmpeg arguments, error messages) lives in `lib/clip.ts` and is unit-tested. The browser engine wrapper is in `lib/engine.ts`.

Why not Vercel Functions? Request bodies are limited to a few MB and execution time is limited, so uploading and transcoding up to 1 GB server-side would fail or need paid storage plus a worker. Browser processing costs nothing and keeps the video private. The trade-off is speed: it depends on the device, and long 1080p clips are slow on phones.

## Limitations

- ffmpeg.wasm runs single-threaded. On iPhone/iPad, expect roughly real-time or slower at 720p and noticeably slower at 1080p. Keep the tab in the foreground; Safari may suspend background tabs.
- Very large or unusual sources (for example HEVC 4K) can exceed browser memory or codec support. The app reports this and suggests a shorter clip or lower resolution.
- Hook/subtitle fields are notes only and are not burned into the video.
- Automated tests run in Chromium (desktop and phone-sized viewport). They have not been run on a real iPhone/iPad Safari; test on target devices before relying on it.
- Not included: AI highlight detection, automatic transcription, downloading from YouTube or other platforms.

## Develop

```sh
npm ci
npm run dev          # copies the FFmpeg core, starts Next.js
npm run lint
npm run typecheck
npm test             # unit tests; also renders every format with native ffmpeg if it is installed
npm run build
npm run test:e2e     # after build: real export in headless Chromium, verified with ffprobe (needs ffmpeg + Playwright)
```

## Privacy

The selected video stays on the device. The page loads Google Fonts and, only if you use the YouTube preview, an embed from youtube-nocookie.com. There is no analytics, no upload, and no AI or transcription API.
