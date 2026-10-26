# Motion Graphics Studio (Remotion)

The script-to-video studio is at `/motion`.

## Workflow

1. **Script**: write the narration text. Each line or sentence becomes a scene. Very long sentences are split at commas/words, and one-word fragments are merged into the previous scene. Limits: 3,000 characters, 20 scenes, 180 seconds.
2. **Title, style, palette**: opening text (max 48 characters); Hybrid / Kinetic typography / Pop-up / Cinematic; Violet-Cyan / Midnight-Gold / Pearl-Black.
3. **Narration audio (optional)**: upload MP3/M4A/WAV/OGG (max 50 MB).
   - With audio, the video length equals the audio length.
   - Scene durations are spread over the audio in proportion to the words in each scene (minimum 1.2 s per scene).
   - Subtitles highlight words at each scene's average pace.
   - Without audio, choose *Automatic* (estimated reading speed, about 2.5 words/second) or a fixed 15/30/45/60 seconds.
4. **Preview**: `@remotion/player` plays the same composition (`remotion/ScriptVideo.tsx`) with the same props that are rendered. Click a scene in the timeline to jump to it.
5. **Render MP4**: `@remotion/web-renderer` renders 1080×1920, 30 fps, H.264 (+ AAC when audio is present) in the browser using WebCodecs. Rendering can be cancelled. When it finishes, *Save MP4* downloads the file.

Clear messages are shown for: an empty or too-long script, too many scenes, audio that is not audio, unreadable or too long/short for the script, a browser without WebCodecs, and render failures (with technical details).

## Architecture and cost

- **Rendering runs in the visitor's browser.** Vercel only serves the static page. No Vercel Function, Remotion Lambda, storage or database is used, so there is no per-render cost. The script and audio are never uploaded.
- Why not render on Vercel: server-side Remotion needs Chromium + FFmpeg and minutes of CPU per video. That exceeds the practical memory, duration and bundle-size limits of Vercel Functions and would need Remotion Lambda (AWS, paid) or a dedicated worker.
- Trade-offs: speed depends on the device (headless Chromium in CI renders 6 s in about 9 s). It needs WebCodecs H.264 support: current Chrome/Edge; Safari 17+ should work but has not been tested on a real device. For older browsers, use the CLI path below.

## Remotion license

Remotion is free for individuals and companies with up to 3 employees; larger companies need a company license (https://remotion.dev/license).

- Set `NEXT_PUBLIC_REMOTION_LICENSE_KEY` in Vercel to your license key, or to `free-license` if you qualify for the free license. Without it, the browser console shows a reminder.
- The web renderer reports a usage event (site origin and success flag, no video content) to `remotion.pro`. If that host is blocked (ad blocker, firewall), an unhandled "Failed to fetch" may appear in the console. The rendered file is not affected.

## AI voice generator

Not integrated. It needs a TTS provider and an API key kept on a server, and no provider or key is configured for this project. Upload a recorded narration instead. Adding one later means a small server route that returns audio, guarded against abuse, plus the provider's key in Vercel environment variables.

## Render with the CLI (fallback / batch)

```sh
npm ci
# In /motion click "Proyek JSON", save it as props.json in the project root.
# If it has narration, copy the audio file into public/ (the JSON refers to it by file name).
npm run render:script          # → out/script-video.mp4
npm run remotion:studio        # Remotion Studio for editing compositions
npm run render:motion          # the original 30 s MotionGraphics30 template
```

The CLI needs Chromium and FFmpeg. Remotion downloads them on first use.

## Tests

```sh
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e   # after build: renders MP4s in headless Chromium and checks them with ffprobe (needs ffmpeg + Playwright)
```
