# Clipper Studio

Mobile-first, local-first video clipping MVP for Safari on iPhone and iPad.

## MVP scope

- Local video file selection (up to 1 GB and 60 minutes as a product guardrail).
- Browser preview and manual start/end timestamps.
- Save up to five clip ranges in the current session.
- Portrait 9:16 MP4 output with black or blurred background.
- No account, no server-side source-video upload, no API key in the browser.

## Implemented in this branch

- Mobile-first editing workspace.
- File selection, metadata/duration reading and input validation.
- Current-playhead shortcuts for start and end times.
- Up to five saved clip ranges.
- Lazy-loaded FFmpeg WebAssembly render pipeline for MP4 export.
- Download link for the resulting MP4.

## Not implemented yet

- AI highlight detection and suggested clips.
- Automatic transcription / subtitle generation.
- Burning hook text or subtitles into the final rendered video.
- YouTube or social-platform downloading.
- Automated browser/device compatibility tests.

The hook and transcript fields are reference/preview fields only in this build; they are not burned into the exported video.

## Important limitations

- The FFmpeg runtime is downloaded from unpkg on first export, so the first render requires an internet connection.
- Source video processing is intended to happen in the browser. The source video is not uploaded to a Clipper Studio server.
- Safari memory limits, device temperature, storage, codec support, and source file complexity can cause export failure. The 1 GB / 60 minute limits do not guarantee every device can process a file of that size.
- The output encoder and blurred-background filter need real-device testing on target iPad/iPhone models.
- Publicly accessible videos are not automatically permitted to download or reuse. This build intentionally accepts local files only.

## Run locally

```sh
npm install
npm run dev
```

Before deployment, run:

```sh
npm run typecheck
npm run build
```

## Privacy

The browser reads the selected video and passes it to a browser-local FFmpeg worker for rendering. The app currently has no backend video upload, user account, analytics, transcription API, or AI API. The FFmpeg runtime is fetched from a CDN on first export.
