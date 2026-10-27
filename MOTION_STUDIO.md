# Motion Graphics Studio (Remotion)

The script-to-video studio is at `/motion`.

## Workflow

1. **Script**: write the narration text. Each line or sentence becomes a scene. Very long sentences are split at commas/words, and one-word fragments are merged into the previous scene. Limits: 3,000 characters, 20 scenes, 180 seconds.
2. **Title, style, palette**: opening text (max 48 characters); Hybrid / Kinetic typography / Pop-up / Cinematic; Violet-Cyan / Midnight-Gold / Pearl-Black / Forest-Sage / Obsidian-Electric. Forest-Sage suits calm, nature and Islamic-reflection videos; Obsidian-Electric suits technology, AI and business explainers.
   - Cinematic style adds a lightweight ambient particle layer generated from deterministic CSS-positioned elements. It uses no external images, random state or new package; other styles do not render this layer.
   - In a source-video edit the particle layer is not drawn, so the speaker stays clear.
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

## Content presets (Motion Visual Pack)

The studio offers six reusable starting presets in the **Template konten** selector. Presets only set the existing animation style and colour palette; users can still adjust both manually, and the script, audio, scene overrides, preview and local MP4 renderer remain the same.

| Preset | Style | Palette | Intended use |
|---|---|---|---|
| Cinematic Motivation | Cinematic | Midnight / Gold | Motivation, reflective voiceover |
| Kinetic Social | Kinetic typography | Violet / Cyan | Fast hooks and short-form social videos |
| Education / Explainer | Hybrid | Pearl / Black | Lessons and clear explanations |
| Business / Tech | Kinetic typography | Obsidian / Electric | AI, software and digital business |
| Islamic Reflection | Cinematic | Forest / Sage | Islamic reminders and calm reflection |
| Storytelling | Cinematic | Violet / Cyan | Narrative-led videos |

The presets are starting points, not separate rendering engines. They add no dependencies, API calls, subscriptions, or server-side render costs. Kinetic typography uses staggered word entrances with a subtle alternating rotation/scale and a glow on the active or emphasised word; the existing narration-timed word reveal is preserved.

## Smart visuals (icons, templates, emphasis)

Every scene gets a visual that matches its text. Detection is automatic and works for Indonesian and English (`lib/visuals.ts`), and each scene can be corrected by hand. Semantic phrase rules take priority for Quran/ayat, prayer, mosque, faith, AI/technology, data/research, business, education, growth, challenges, solutions and video creation, then fall back to the existing bilingual keyword matcher.

| Text pattern | Template | On screen |
|---|---|---|
| "Pertama/Kedua…", "First/Second…", "Terakhir/Finally", "Langkah 3", "2)" | Langkah | Numbered ring badge (✓ for the last step) |
| Ends with `?` | Tanya | Big wobbling question mark |
| `80%`, `Rp 50.000`, `$1,200`, `3x`, "5 cara", "three tips" | Angka | Number counting up, progress bar, unit label |
| "X, bukan Y", "bukan X tapi Y", "X lebih baik dari Y", "X beats Y", "X instead of Y", "X vs Y" | ✗/✓ | Two cards: crossed-out ✗ and highlighted ✓ (neutral for "vs") |
| "Follow/ikuti/klik/coba/start now/mulai sekarang…" | Ajakan | Pulsing button with the action word, plus a cursor |
| Text in quotes | Kutipan | Large quotation mark |
| Anything else | Ikon | Concept icon |

- **Icons**: there are about 95 bilingual concepts (time, money, growth, idea, target, start, discipline, health, learning, team, shopping, …), drawn with Lucide line icons (ISC licence). Each icon is drawn stroke by stroke and then floats. Matching handles Indonesian affixes ("mulai" → "memulai", "main" → "bermain") without false hits ("idea" ≠ "ideal", "main" ≠ "remain").
- **Emphasis**: the word that triggered the icon, and any number, is shown in the accent colour with an underline that grows once the word is spoken. Wrap words in `*asterisks*` in the script to choose the emphasis yourself. The asterisks are not shown and not spoken.
- **Manual correction**: each scene in the timeline has two pickers, *Tampilan* (template) and *Ikon*. Both show what *Otomatis* detected. Corrections are kept per sentence, so editing other sentences does not reset them.

## Numbers

- **On screen**: a number keeps its digits ("17.000", "Rp 50.000", "80%"). A "." between two digits is a separator, so a sentence is never split there. A four-digit year (1000–2100) is shown plainly and does not count up. The counter is sized from its final text and stays on one line.
- **In the voice**: digits are converted to words before synthesis (`lib/tts/numbers.ts`), because the model otherwise reads "1.300" as "satu 300". Indonesian: 17.000 → "tujuh belas ribu", 1.300 → "seribu tiga ratus", 1945 → "seribu sembilan ratus empat puluh lima", 4,5 → "empat koma lima", Rp 50.000 → "lima puluh ribu rupiah", 80% → "delapan puluh persen", 3x → "tiga kali". English: 1,300 → "one thousand three hundred", $1,200 → "one thousand two hundred dollars", 3.5 → "three point five". Indonesian uses "." for thousands and "," for decimals; English the opposite. Ranges ("2020-2024") become "sampai"/"to"; numbers with a leading zero are read digit by digit.

## Automatic voice over

- **Model**: Supertonic 3 by Supertone Inc. It is multilingual (31 languages; the app exposes Indonesian and English) and was released as an ONNX export by sherpa-onnx. Model weights are under OpenRAIL-M: commercial use is allowed, but the use restrictions apply (no impersonation without consent, no deceptive or harmful content, disclose that the voice is AI-generated). See `public/supertonic/NOTICE.txt` after a build.
- **Engine**: `lib/tts/supertonic.ts` ports Supertone's MIT web helper (duration predictor → text encoder → 8 flow-matching steps → vocoder) to onnxruntime-web 1.30 (WASM, single thread). `lib/tts/browser.ts` loads it.
- **Assets**: `scripts/copy-tts-assets.mjs` runs before dev, build and test.
  - It reassembles the model from the pinned `@3sln/donki-lle-voice-multi*` npm packages, which store it as base64 data. The data is parsed as text and never executed, and every file is verified against a SHA-256.
  - It writes the model to `public/supertonic/` (~145 MB) as ≤16 MB parts plus `manifest.json`, so every static file stays small for any host or CDN limit; the browser joins the parts. The ORT runtime goes to `public/ort/` (~14 MB). Both are served by Vercel as static files.
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

## Auto transcript & captions (from the clipper)

On the clipper page (`/`), after choosing a video, **Transkrip otomatis** turns the speech of the selected range into timed text.

- **Engine**: Whisper (`Xenova/whisper-base`, or `whisper-tiny` for speed) via Transformers.js + onnxruntime-web (WebAssembly), in a Web Worker. Indonesian and English. Free, no API key, nothing is uploaded: the audio is extracted on the device with the existing FFmpeg WASM (`lib/engine.ts` → `extractAudio`, 16 kHz mono) and recognised on the device. The model (~80 MB / ~40 MB, 8-bit) is downloaded once from the Hugging Face Hub and cached by the browser. The WebAssembly runtime is self-hosted at `public/ort-asr` (copied by `scripts/copy-ffmpeg-core.mjs`).
- **Timing**: per word when the model returns word timestamps; otherwise per segment (words are then spread evenly inside the segment and the panel says so). `lib/transcript.ts` cleans the timestamps (monotonic, clamped), groups words into segments (pause, sentence end, ≤140 characters, ≤10 s, ≥1.2 s) and writes SRT.
- **Limits**: the selected range must be ≤ 3 minutes (same as the motion studio) and the video keeps the existing 1 GB / 60 minute source limits. Nothing was raised.
- **Editing**: each segment is an editable box. Word timing is kept if the word count is unchanged; otherwise the new words are spread over the segment. Emptying a box removes the segment.
- **Captions follow the original audio**: the preview under the video highlights the spoken word while the original video plays. No audio is added or changed; the exported MP4 is not touched (subtitles are not burned into the clipper export).
- **Motion graphics**: *Kirim ke Motion Graphics* stores the transcript in `sessionStorage` (same tab, not uploaded). On `/motion`, *Impor ke naskah* fills the script (one segment = one scene) and switches to *Rekam / unggah*. While the script still has exactly the transcript words, scene lengths and the highlighted caption word follow the transcript timing (`sceneTimings`, `Scene.wordStarts`). Upload the original audio of the clip as the narration so voice and captions agree; an audio of a different length (>1 s) falls back to the normal proportional timing, and so does an edited script. Icons, numbers, templates and emphasis are detected from the transcript text exactly as for a typed script, so keyword visuals never change the subtitle words.

## Edit a source video (video + motion graphics)

On `/motion`, **Video sumber** → make a transcript → *Pakai transkrip untuk naskah & subtitle* turns the page into an edit of that video:

- The uploaded video is the base layer and keeps its **own audio** (no second narration track). Rendering it needs WebCodecs like any other render.
- Scenes follow the transcript timing. A scene either shows the speaker with a big word-by-word caption (3 words at a time, spoken word highlighted), or **cuts away** to a graphic scene (icon, number, list, question, comparison, call to action) while the video underneath keeps playing.
- The plan is automatic (`autoCuts` in `lib/visuals.ts`): the first scene is always the speaker, a scene with a recognised concept/number/template becomes a graphic, and two graphics never follow each other. Each scene has a **Layar** picker (*Otomatis / Video + subtitle / Grafis*) plus the existing *Tampilan* and *Ikon* pickers.
- The Pearl palette is selected by default for the light cutaways; change it freely.
- Models: *Akurat* (base) is the default; *Paling akurat* (small, ~250 MB) is clearly better for Indonesian but slower and needs more memory (iPad: try base first).

## Quiet Editorial Motion (composition families)

Each scene is drawn by one of five composition families, picked by `chooseFamily` (`lib/composition.ts`) from the scene's narrative role/strategy and its detected visual. The choice is shown in the scene list.

| Family | Chosen when | Layout |
|---|---|---|
| Editorial | hook, continuation, resolution, question, quote | centred headline, one drawn rule, generous space |
| Kinetic type | tension, reveal | words brighten as they are spoken; at most two focus words take the accent |
| Explainer | numbered step, cause → effect (`diagram`), explanation, application | step marker or icon label; "A karena B" is split into two blocks with an arrow |
| Comparison | a detected "bukan X, tapi Y" / "X vs Y" | stacked cards; the rejected option is struck through, the better one arrives when the narration reaches it |
| Data / product | a statistic (not a year), a call to action | the figure or action is the hero, the sentence is its context |

- **Safe areas** (`lib/layout.ts`): content stays inside 110 px side margins, 220 px from the top and 380 px from the bottom (platform UI). Burned-in captions sit just above the bottom safe edge and the content box shrinks to make room for them.
- **Text fitting**: `fitText` picks the largest font size at which the words wrap, at word boundaries, inside the box. The composition measures words with a canvas in the font the browser actually renders, and draws the computed lines itself, so the render matches what was checked. If text is too long it goes below the preferred minimum size instead of being cropped.
- **Quiet editorial style + Ivory / Forest palette**: calm springs, no blur, particles or rotating ring. Preset *Quiet Editorial*.
- A manually chosen icon (`iconPinned`) is shown in every family. Automatic icons appear only in the explainer, to keep a single focus.
- All motion is computed from the frame; there are no timers and no randomness.

## Subtitle export (.srt)

After a render with captions on (script videos), *Unduh subtitle (.srt)* saves the captions as an SRT file next to the MP4. `lib/srt.ts` uses the same phrase chunks and word timing as the burned-in captions, so the file matches the video, and the last cue never runs past the video. Idea taken from MoneyPrinterTurbo (MIT) after reviewing its subtitle pipeline; no code was copied.

## Pause tags (`[jeda]`)

Write `[jeda]`, `[jeda 1.5s]`, `[jeda 500ms]` or `[pause 2]` (round brackets work too) in the script to leave silence after a sentence. The tag is never shown, spoken or captioned; it adds 0.1–10 s (default 1 s) at the end of the scene it follows. A tag in the middle of a sentence pauses after the whole scene; a tag before any speech is ignored; invalid values are ignored; several tags in a row add up (capped at 10 s).

- **Automatic voice**: the silence is added to the narration track and the scene length (`assembleNarration`). Changing a pause makes the voice stale, and regenerating reuses the cached sentences.
- **Other modes**: the pause is exact and the rest of the duration is shared by reading weight.
- **Captions and SRT** spread the words over the spoken part only (`Scene.pauseFrames`, `spokenFrames`).
- With a transcribed source video the tags are ignored: the audio is already fixed.

## Edited scripts keep transcript timing

When a script comes from a transcript and is edited afterwards, `sceneTimings` first matches words one to one (same word count). If the count changed (words added, dropped, merged or split) it aligns the script to the transcript with a word-level edit-distance alignment (`alignWords`) and spreads new words between their neighbours. It is used only when at least 75% of the words still match; otherwise the studio falls back to its normal timing. A notice tells the creator that caption timing was aligned, not measured. Idea from MoneyPrinterTurbo's subtitle correction (MIT); the implementation is original.

## Clips from the same video (source-video edits)

In a source-video edit each scene can show the speaker, a graphic, or **another part of the same video** ("Potongan lain dari video"). The speaker's audio keeps playing without a break; only the picture changes, like a cutaway to b-roll.

- Pick the scene's start in the scene list: scrub the source player, choose *Potongan lain dari video* (it starts where the player is) and use *Pakai posisi pemutar* to change it; *Lihat* jumps the player to the chosen start.
- A clip plays muted from that second for the length of the scene, at most 4 s (`MAX_CLIP_FRAMES`), and never past the end of the video (`clipPlan`: the start is clamped so the whole clip exists).
- A dark gradient behind the caption band keeps captions readable on any footage. The cut fades in and out over 5 frames.
- Projects keep `cut: "clip"` and `clipFrom` (seconds) per scene; older projects are unaffected. Replacing the source video clears the cuts and clip starts.
- Verified with a CLI render of a synthetic source (a different colour every 3 s): the clip scene shows the chosen part, a start too close to the end is clamped, and the audio stays the speaker's single track. Not yet verified on Safari/iPad: two simultaneous decodes of one file can be heavy on small devices; if a render fails there, report the technical details shown by the studio.

## Transcription speed and progress

- **The speech model stays ready between transcriptions.** One worker is shared, so a second transcription in the same session skips loading the model (the slowest step on a tablet). It is released after 2 minutes idle, when a run is cancelled or fails, when leaving the page, and before an MP4 render or clip export, so its memory goes to the encoder instead.
- **Real progress**: the bar follows finished 30-second windows of audio ("bagian 2 dari 5") with a time estimate. Before that the panel says whether it is loading, downloading (only the first time) or preparing the model.
- **Where the time went** is shown after each run, e.g. "model dimuat 41 dtk; transkripsi 63 dtk untuk 45 dtk audio (1.4× durasi)". If the *small* model ran slower than the audio, the panel suggests *base*.
- On devices without SharedArrayBuffer (iPad Safari) the model runs on one WebAssembly thread, so *small* with word timestamps is slow by nature; *base* is the practical choice there.
