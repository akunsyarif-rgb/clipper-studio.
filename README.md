# Clipper Studio

Mobile-first video clipping workspace built with Next.js App Router.

## Current UI
- Two source paths: upload a local video or paste a YouTube URL.
- Browser-local video preview and YouTube embed preview.
- Clip start/end fields, aspect-ratio selection, and output-resolution selection.
- Responsive layout for iPhone/iPad Safari.

## Limitations
This is an interface prototype. It does not yet process, download, or export video. A separate authorized media-processing worker using FFmpeg is required.

Public YouTube availability does not automatically grant permission to download or reuse a video. Any future URL workflow must respect rights, platform terms, and applicable law. Prefer authorized sources or user-provided files.

## Development
```sh
npm install
npm run dev
```

## Planned architecture
- Next.js frontend hosted on Vercel.
- Separate FFmpeg worker for processing.
- Optional temporary object storage.
- Expiring job/result links and automatic cleanup.
- Both source paths feed the same processing pipeline.
