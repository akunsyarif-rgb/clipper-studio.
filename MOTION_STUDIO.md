# Motion Graphics Studio (Remotion)

The script-to-video studio is at `/motion`.

## Workflow

1. **Script**: write the narration text. Each line or sentence becomes a scene. Very long sentences are split at commas/words, and one-word fragments are merged into the previous scene. Limits: 3,000 characters, 20 scenes, 180 seconds.
2. **Title, style, palette**: opening text (max 48 characters); Hybrid / Kinetic typography / Pop-up / Cinematic; Violet-Cyan / Midnight-Gold / Pearl-Black.
3. **Voice over**: choose *Otomatis* (default), *Rekam / unggah*, or *Tanpa* (none).
   - **Otomatis (AI)**: text-to-speech in **Indonesian or English** with 10 voices (Wanita 1–5, Pria 1–5) and three speeds, generated **on the device**. Details are under "Automatic voice over" below.
     - Each scene is synthesised separately, so a scene lasts exactly as long as its speech (+0.15 s lead-in, +0.35 s pause), and subtitles and transitions follow the voice.
     - Generated sentences are cached, so after editing the script only the changed sentences are synthesised again.
     - Changing the script, language, voice or speed makes the voice stale, and the render waits until it is regenerated.
   - **Rekam** from the device microphone (iPad: allow microphone access for Safari). The recording is decoded and saved as a normalised mono WAV (max 180 s). Safari records AAC/MP4 and Chrome records Opus/WebM, so converting to WAV gives every browser and the renderer the same format with a known length.
   - **Unggah** MP3/M4A/WAV/OGG (max 50 MB).

   With a recorded or uploaded narration, the video length equals the narration length, and scene durations are spread over it in proportion to the words in each scene (minimum 1.2 s per scene). Without narration, choose *Automatic* (reading speed of about 2.5 words/second) or a fixed 15/30/45/60 seconds.
4. **Backsound (optional)**: *Tanpa* (none), *Otomatis* or *Unggah*.
   - **Otomatis**: music is synthesised on the device with Tone.js (`lib/backsound.ts`) from a deterministic plan (`backsoundPlan` in `lib/audio.ts`). There are three moods: Tenang (pads, 76 BPM), Semangat (arpeggio + light beat, 104 BPM) and Sinematik (drone + slow swells, 60 BPM). The default mood follows the animation style. The track is exactly as long as the video and is regenerated when the length changes. *Variasi lain* gives another variation. Nothing is downloaded and there is nothing to license. The WAV can be downloaded for CLI renders.
   - **Unggah**: your own music. It loops when shorter than the video and is cut when longer. Make sure you are allowed to use it.
   - Volume slider (default 35%), automatic 1 s fade-in and 1.5 s fade-out.
   - **Ducking**: the narration is analysed per frame (RMS gate with fast attack and slow release), and the music drops to 30% of its volume while someone speaks. A render check measured about −9 dB on the music while speaking, back to normal afterwards. If an uploaded narration cannot be analysed, the music is ducked for the whole video instead.
5. **Preview**: `@remotion/player` plays the same composition (`remotion/ScriptVideo.tsx`) with the same props that are rendered. Click a scene in the timeline to jump to it.
6. **Render MP4**: `@remotion/web-renderer` renders 1080×1920, 30 fps, H.264 (+ AAC when audio is present) in the browser using WebCodecs. Rendering can be cancelled. When it finishes, *Save MP4* downloads the file.

Clear messages are shown for: an empty or too-long script, too many scenes, audio that is not audio, unreadable or too long/short for the script, a browser without WebCodecs, and render failures (with technical details).

## Architecture and cost

- **Rendering runs in the visitor's browser.** Vercel only serves the static page. No Vercel Function, Remotion Lambda, storage or database is used, so there is no per-render cost. The script and audio are never uploaded.
- Why not render on Vercel: server-side Remotion needs Chromium + FFmpeg and minutes of CPU per video. That exceeds the practical memory, duration and bundle-size limits of Vercel Functions and would need Remotion Lambda (AWS, paid) or a dedicated worker.
- Trade-offs: speed depends on the device (headless Chromium in CI renders 6 s in about 9 s). It needs WebCodecs H.264 support: current Chrome/Edge; Safari 17+ should work but has not been tested on a real device. For older browsers, use the CLI path below.

## Remotion license

Remotion is free for individuals and companies with up to 3 employees; larger companies need a company license (https://remotion.dev/license).

- Set `NEXT_PUBLIC_REMOTION_LICENSE_KEY` in Vercel to your license key, or to `free-license` if you qualify for the free license. Without it, the browser console shows a reminder.
- The web renderer reports a usage event (site origin and success flag, no video content) to `remotion.pro`. If that host is blocked (ad blocker, firewall), an unhandled "Failed to fetch" may appear in the console. The rendered file is not affected.

## Automatic voice over

- **Model**: Supertonic 3 by Supertone Inc. It is multilingual (31 languages; the app exposes Indonesian and English) and was released as an ONNX export by sherpa-onnx. Model weights are under OpenRAIL-M: commercial use is allowed, but the use restrictions apply (no impersonation without consent, no deceptive or harmful content, disclose that the voice is AI-generated). See `public/supertonic/NOTICE.txt` after a build.
- **Engine**: `lib/tts/supertonic.ts` ports Supertone's MIT web helper (duration predictor → text encoder → 8 flow-matching steps → vocoder) to onnxruntime-web 1.30 (WASM, single thread). `lib/tts/browser.ts` loads it.
- **Assets**: `scripts/copy-tts-assets.mjs` runs before dev, build and test.
  - It reassembles the model from the pinned `@3sln/donki-lle-voice-multi*` npm packages, which store it as base64 data. The data is parsed as text and never executed, and every file is verified against a SHA-256.
  - It writes the model to `public/supertonic/` (~145 MB) and the ORT runtime to `public/ort/` (~14 MB). Both are served by Vercel as static files.
- **Download**: the first use downloads ~145 MB and keeps it in Cache Storage, so later uses on the same device work from the cache.
- **Performance**: one sentence takes roughly 2× its spoken length to synthesise on the CI machine (single-thread WASM), and the browser stays responsive between model steps. The iPad speed has to be checked on the device.
- **Bandwidth**: every new device downloads ~145 MB from the site. On Vercel Hobby (100 GB/month) that is roughly 700 first-time devices per month.
- **Voices**: the order in `voice.bin` was mapped to genders by measuring pitch: voices 0–4 are about 170–245 Hz, voices 5–9 about 90–150 Hz.

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
npm run test:e2e   # after build (runs e2e/clipper.mjs and e2e/motion.mjs): renders MP4s in headless Chromium and checks them with ffprobe (needs ffmpeg + Playwright)
```
