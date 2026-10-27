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
- **Real progress**: the bar follows the seconds of speech already transcribed ("12 dari 38 dtk ucapan") with a time estimate. Before that the panel says whether it is loading, downloading (only the first time) or preparing the model.
- **Where the time went** is shown after each run, e.g. "model dimuat 41 dtk; transkripsi 63 dtk untuk 45 dtk audio (1.4× durasi)". If the *small* model ran slower than the audio, the panel suggests *base*.
- On devices without SharedArrayBuffer (iPad Safari) the model runs on one WebAssembly thread, so *small* with word timestamps is slow by nature; *base* is the practical choice there.

## Remembered on this device (refresh does not start over)

The studio saves your work in the browser's own storage (IndexedDB) on this device. Nothing is uploaded.

- **Session**: script, title, style, palette, per-scene corrections and cuts, clip starts, caption offset, the applied transcript and the voice settings are saved about a second after each change, together with the **uploaded source video** (saved once). After a refresh the studio offers *Lanjutkan* / *Mulai baru*; nothing is applied until you choose, and an untouched sample script is never offered back. *Mulai baru* deletes the saved session and video.
- **Transcripts**: a finished transcript is kept per video part, model and language (the 8 most recent). Making it again, or reopening the same video, shows the saved text at once without extracting audio or running the model.
- A transcription that is still running when the page is refreshed cannot be resumed (the model runs inside the page); start it again, then it is saved when it finishes.
- The storage can be cleared by the browser (Safari clears site data after a period without visits, or when space is low); the studio then simply starts fresh. A full disk or private mode only means nothing is remembered.
- Voice recordings, generated voice and music are not kept: they are regenerated or re-added.

## Animations over the speaker (source-video edits)

Each scene of a source-video edit has a *Layar* choice:

| Choice | What shows |
|---|---|
| Video + subtitle | the speaker and the caption |
| **Video + animasi** | the speaker **with the animation drawn over the picture**: a counter for a number, a step badge, a question mark, a ✗/✓ pair for a comparison, a call-to-action button, an icon with the featured word, or the featured word alone |
| Grafis penuh (ganti layar) | a full-screen graphic replaces the picture for up to 4 s (the speaker's audio keeps playing) |
| Potongan lain dari video | another part of the same video (see above) |

- **Default**: a scene in which the studio finds something (a number, step, question, comparison, call to action, a concept icon or a *emphasised* word) gets *Video + animasi*; plain statements stay *Video + subtitle*. Full-screen graphics and clips are never chosen automatically.
- **Position** (*Posisi animasi di atas video*): *Atas* uses the empty space above the head (inside the safe area, below the app's status bar); *Bawah* sits just above the captions. Neither touches the caption band. An animation lasts at most 4 s of the scene and fades in and out.
- A dark veil behind the animation and white text keep it readable on any footage; the accent colour is the palette's own when it is readable on the veil, otherwise the palette's light tone (light palettes such as Pearl and Ivory).
- **Timing**: an animation does not start with its scene. It appears about 0.13 s before the word it is about is spoken (the number, the name, the call to action, the emphasised word, the "bukan"/"tapi" of a comparison) using the transcript's word timing, stays for at most 4 s, and never runs past the next animation or over a scene that takes over the whole picture (`overlayWindows`). A long scene therefore no longer shows its animation seconds before the speaker says it. In a comparison the rejected option arrives with "bukan" and the better one with "tapi"; names pop in one by one as each is said.
- Preview and render use the same composition, so what the player shows is what the MP4 contains. Verified with CLI renders of a synthetic source (all animation kinds, both positions, light and dark palettes) and a browser test that checks the animation element in the live preview; not yet seen on a real iPad.

## Memory on tablets (transcription)

- On iPad, iPhone and Android the transcription model starts as **Akurat (base)**; computers keep *small*. Choosing *small* on a tablet shows a memory warning.
- The video engine (FFmpeg) is released once the audio is extracted, and the saved source video is written to storage only when no transcription or render is running.
- If the page died during a transcription (usually Safari closing the tab for memory), the next visit says so and moves one model lighter automatically.

## Transcript quality (Indonesian and English)

Whisper invents text on silence, room noise and music: the typical sign is a phrase repeated dozens of times ("Yang mana? Yang mana? …"). The studio now guards against it in three layers (`lib/asr/speech.ts`, `lib/asr/run.ts`, `lib/transcript.ts`):

1. **Only speech reaches the model.** The recording is levelled (a quiet recording is raised, gain-limited) and the spoken parts are found from the loudness of each 30 ms (the threshold follows the recording's own noise floor and speech level). Silence, clicks shorter than a word and steady noise are skipped, pauses under 0.6 s stay inside a region, regions are padded 0.25 s and cut at their quietest moment before 27.5 s. This also makes long recordings faster; the result line says how much was skipped.
2. **A region whose text loops is run once more** with a repetition penalty and a ban on repeating three-word sequences.
3. **What still repeats is folded.** A phrase of 2–8 words repeated three times in a row, or a single word four times in a row, is reduced to its first occurrence (timing kept). Natural repetition such as "tidak, tidak, tidak" is untouched.

Saved transcripts from the older method are not reused (`ASR_PIPELINE_VERSION`), so one video may need to be transcribed again once. Accuracy of individual words still depends on the model: *small* is clearly better than *base* for Indonesian but too heavy for most tablets; the text can be corrected by hand in the list.

## Icons that follow the sentence, not just a word

The visual detector (`lib/visuals.ts`, `lib/sense.ts`) reads each sentence in its context:

- **Senses**: "I like it / you'll like this / would like to" is the verb (thumbs-up, shown as *LIKE*); "looks like", "just like", "like a …" and a filler "so, like," are ignored. "Good morning / good night" name the morning or night icon with the whole phrase on screen; "good job / great job / well done" is praise; plain "good" is no longer an icon.
- **Calls to action** need an ask: "like and subscribe", "hit the like button", "save this video", "try it now", "follow me" are buttons; "I like this idea", "save money", "I try to", "follow these steps" are not (same for *simpan*, *coba*, *ikuti*, *daftar*, *komentar*).
- **A content word beats a generic verb**: "Do you like coffee?" shows coffee.
- **The whole script as context** (`sceneTopics`): generic words ("move", "see", "day", "work", …) trigger an icon only when a neighbouring scene (two either side) is about the same thing; otherwise the scene gets no icon rather than a wrong one.
- On-screen keywords show the whole emphasised phrase (up to three words), not only its first word.

## Why the model is downloaded again (and how to avoid it)

Browser storage belongs to **one web address**. The speech model (in Cache Storage) and the saved session (IndexedDB) are therefore kept per address, and every Vercel *preview deployment* has its own address (`…-4f684f9yx-team.vercel.app`): to the browser, a new version is a new website with empty storage.

- **Use an address that stays the same**: the branch address (`clipper-studio-git-<branch>-<team>.vercel.app`, always the newest version of the branch) or the main domain. Open the app there, transcribe once, and the model stays on the device for every later version.
- The transcript panel shows whether the chosen model is already stored for the current address, and warns when the address is one that belongs to a single deployment (known exactly from the deployment's own host name, `VERCEL_URL`, set at build time in `next.config.mjs`).
- The studio asks the browser to keep its storage (`navigator.storage.persist()`) when a transcription starts. Safari may still clear data of a site that is not visited for a week, or when space is low; adding the page to the Home Screen avoids the weekly clearing.

## Popular names (YouTube, TikTok, …)

When a sentence names a popular service it gets that service's icon, **and its own small animated scene**, ahead of every generic icon (`lib/brands.ts`, `lib/brand-style.ts`, `remotion/BrandStage.tsx`). Each scene runs from the moment the name is said, in the service's own colour (kept light enough to read on the dark veil):

| Name | Scene |
|---|---|
| YouTube | a player with a growing progress bar, then a SUBSCRIBE button that is pressed and rings the bell |
| TikTok | an equalizer with floating music notes |
| Instagram | a heart that pops with a burst of rings, sparkles and small hearts floating away |
| Facebook | a thumbs-up, then reactions (heart, smile, flame) bouncing in |
| WhatsApp | a message arrives, a reply with double ticks, the other person typing |
| Telegram | a paper plane flying along a curve with a dotted trail, then "TERKIRIM" |
| Google | a search bar typed into, then suggestions |
| Netflix | the N drawing itself, then a row of thumbnails sliding in |
| Spotify | an equalizer with a progress bar |
| Podcast | a microphone with sound rings and a waveform |
| Shopee, Tokopedia, Lazada, … | a shopping bag bouncing with tags and sparkles |
| Gojek, Uber, "naik Grab" | a car driving in along the road, a pin dropping at the destination |
| ChatGPT, Gemini, Copilot, … | twinkling sparkles and an answer being typed |
| LinkedIn, GitHub | nodes connecting into a network |
| Twitch, online meetings | a LIVE badge, viewers and chat lines scrolling up |
| X / Twitter | the X drawn stroke by stroke, then posts with hearts |
| CapCut, Canva, Discord, Pinterest, Snapchat, Gmail, drives, office files, e-wallets (GoPay, OVO, QRIS, …), banking apps, popular games | the icon with rings and small copies floating away |

- **Names recognised** include YouTube (*YT*, *Shorts*), TikTok (*FYP*), Instagram (*IG*, *reels*), Facebook (*FB*), WhatsApp (*WA*), X/Twitter, Telegram, LinkedIn, Spotify, Google, Netflix, Twitch, podcasts, online shops, ride apps, AI assistants, CapCut, Canva, Zoom meetings and Google Meet, Discord, Pinterest, Snapchat, GitHub/GitLab, Gmail, Google Drive/Dropbox/iCloud, Excel/PowerPoint/Word, e-wallets and games such as Roblox, Minecraft, Free Fire and PUBG.
- **One name** gets its icon, its label and its scene; **two or three names** are shown side by side as icons, each popping in when it is said.
- Ordinary words are not taken for names: "grab attention" stays a verb ("naik Grab" is the ride app), "zoom in" is not a meeting, "dana" is still a word for funds. A phrase claims its words: "Google Drive" is the drive, not Google as well.
- The glyphs are simple line drawings made for this studio (a play badge, a note, a camera, …): they hint at the service and are not its official logo.
- A call to action ("subscribe ke YouTube") keeps its button and shows the name above it. Choosing an icon by hand replaces the detected names.
- Everything is a function of the frame number, so preview and render match. Adding a name is one entry in `BRANDS` plus one in `BRAND_STYLE`; tests check that every name has an icon, a colour readable on the veil and a kind of scene.

## Which sentences get an animation

Animating every sentence is noise, so the studio judges each one (`lib/importance.ts`) and animates only the strongest. The score comes from what the sentence says, and the reasons are written in the scene list ("Animasi: angka uang, pembuka (skor 1.00)" or "Tanpa animasi: kurang penting (skor 0.20, konsep inti naskah)"):

| What it says | Score |
|---|---|
| a popular name (YouTube, TikTok, …), or a word you marked with `*stars*` | 0.9 / 0.85, never penalised |
| an amount of money, or a new amount next to one ("5 juta … itu tiga bulan hidup") | 0.9 (+0.1 for several amounts) |
| another quantity, a percentage | 0.8 |
| a sentence that names three or more concepts ("uang, energi dan waktu") | 0.75 |
| a comparison ("bukan X, tapi Y") | 0.75 |
| a call to action | 0.7 |
| the first mention of an idea the whole script keeps returning to | 0.65 |
| steps ("pertama", "langkah 2") | 0.6 |
| a question, a single concept icon, a keyword | 0.35 / 0.3 / 0.15 |

A little is added for the opening scene. The score is lowered for a very short sentence, one that is mostly filler ("gue", "lu", "ya", "kok", "sih", …), one shorter than 1.5 s, the same icon as a scene a moment ago, and an amount that was already shown. Then the strongest are chosen with a minimum distance and a limit on how much of the video animations may cover:

| *Berapa banyak animasi* | bar | apart | covers at most |
|---|---|---|---|
| Sedikit | 0.8 | 8 s | 18 % |
| **Seimbang** (default) | 0.6 | 5 s | 30 % |
| Banyak | 0.3 | 3 s | 45 % |

On a real 16-sentence transcript about money, the old rule animated 14 sentences; *Seimbang* animates 5 or 6 (the amounts and the sentence that lists money, energy and time) and leaves the filler alone. Whatever the plan says, each scene's *Layar* choice overrides it ("Diatur manual").

**Popular names** have two styles (*Gaya animasi istilah populer*): *Sederhana (elegan)* is the default, an icon and its name with one soft ring; *Lengkap (meriah)* adds the small scene of each service, now more compact (TikTok: five slim bars and two notes).

Words are read with care: a keyword counts at the start of a word or after an Indonesian prefix ("memulai" is *mulai*), not in the middle ("ceritanya" is not *tanya*, "sebenarnya" is not *benar*), and "5 jutaan", "miliar" and "triliun" are read as amounts.

## Cleaning up a transcript with Claude

A recogniser's slips ("Aplun", "mikro" for "mikir") are best fixed with the whole text in view. In the transcript list, *Salin untuk dirapikan Claude* copies a ready request plus the transcript, one line per segment. Paste it into a chat with Claude, then paste the corrected lines into the *Naskah* field: the words are aligned to the speech again, so captions and animations keep following what is said.

## Rapikan transkrip dengan Gemini (opsional)

Langkah 1 dari bantuan Gemini. Whisper tetap mendengar suara dan memberi waktu kata; Gemini hanya memperbaiki **teks** (salah dengar, nama merek, ejaan, tanda baca).

- **Kunci milik pengguna (BYOK).** Dimasukkan di panel transkrip (bagian "Rapikan transkrip dengan Gemini"), disimpan hanya di `localStorage` browser perangkat ini (`clipper:gemini:v1`), dikirim lewat header `x-goog-api-key` (tidak pernah di alamat URL, tidak pernah ditampilkan ulang selain sebagian). Jangan menempelkan kunci di obrolan. Pakai kunci yang dibatasi dan berkuota rendah.
- **Yang dikirim.** Hanya teks segmen transkrip ke `generativelanguage.googleapis.com`; audio dan video tidak. Perlu persetujuan eksplisit sebelum kunci tersimpan.
- **Aman dari perubahan diam-diam.** Hasil ditampilkan sebelum/sesudah per segmen; perubahan besar (kemiripan kata < 50%) tidak dicentang secara bawaan. Tidak ada yang berubah sampai "Terapkan" ditekan.
- **Waktu dipertahankan.** Jumlah kata sama → tiap kata memakai waktu kata lamanya; jumlah beda → disejajarkan (`alignWords`), dan sebagai cadangan dibagi rata dalam segmen.
- **Galat dijelaskan** (kunci salah, model tidak ada, kuota, diblokir, jaringan, waktu habis, format) tanpa memuat kunci. Jumlah baris salah dicoba ulang sekali.
- **Kode:** `lib/gemini.ts` (klien, pengaturan, diff, penerapan), `app/GeminiCleanup.tsx`. Diuji dengan fetch palsu (`lib/gemini.test.ts`) dan e2e dengan endpoint Gemini dipalsukan; panggilan nyata ke Google tidak bisa diuji dari sandbox.

### Fase 2: Gemini ikut mendengarkan audio

- Tombol **"Rapikan sambil mendengarkan audio"** (aktif hanya setelah kotak izin audio dicentang, tiap sesi): audio bagian terpilih diekstrak lagi di perangkat, dikodekan WAV 16 kHz mono, lalu dilampirkan (`inlineData`) bersama baris transkrip dan detik mulai tiap baris.
- Gemini tidak membuat transkrip baru: ia memperbaiki baris yang sudah ada dengan mendengar suaranya (jumlah baris sama), sehingga **waktu kata Whisper tetap dipakai** lewat jalur tinjau-dan-terapkan yang sama dengan fase 1. Cocok untuk nama, istilah, dan angka.
- Batas: maksimal 6 menit per permintaan (`MAX_AUDIO_SECONDS`, muatan inline ±20 MB). Audio dikirim ke Google hanya saat tombol ini dipakai.

### Fase 3: pendapat kedua Gemini untuk pemilihan animasi

- Di Motion Studio (mode edit video), tombol **"Nilai dengan Gemini"** mengirim teks kalimat (tanpa audio/video) dan menerima skor 0–1 serta alasan singkat per kalimat.
- Skor digabung dengan skor aturan (`blendAi`, bobot sama, rata-rata): Gemini bisa menaikkan atau menurunkan, tetapi tidak memutuskan sendiri. Yang ditandai manual (`*kata*`) dan istilah populer tetap sesuai aturan; kalimat yang tidak punya apa pun untuk ditampilkan (skor aturan 0) tidak bisa dinaikkan. Kepadatan animasi, jarak minimal, dan batas cakupan tetap berlaku.
- Alasan Gemini tampil di daftar adegan ("Gemini 0.05: basa-basi"). "Pakai aturan saja" menghapus penilaiannya. Penilaian hanya berlaku selama kunjungan itu (tidak ikut disimpan di sesi).
- Kode: `judgeScenesWithGemini`, `parseScores` di `lib/gemini.ts`; `blendAi` di `lib/importance.ts`; `app/GeminiJudge.tsx`.

## Sinkron antar perangkat (Supabase)

Backend hanya menyimpan **data teks kecil**: sesi kerja (naskah, gaya, pilihan adegan, transkrip yang dipakai) dan transkrip hasil Whisper. **Video, audio, dan hasil render tidak pernah diunggah.**

- **Proyek:** `clipper-studio` (Supabase, Singapura, paket Free). Tabel `app_sessions` (satu baris `current` per pengguna) dan `app_transcripts` (kunci sama dengan cache transkrip di perangkat). RLS: tiap baris hanya bisa dibaca/ditulis pemiliknya (`auth.uid() = user_id`). Batas ukuran 2 MB per baris.
- **Login:** email + kata sandi. Tombol "Masuk untuk sinkron antar perangkat" di halaman utama dan Motion Studio. Tanpa login, app tidak mengirim satu permintaan pun ke layanan ini.
- **Mode pribadi:** trigger `only_first_user` di `auth.users` menolak pendaftaran akun kedua. **Hapus trigger ini sebelum aplikasi dibuka untuk umum** (`drop trigger only_first_user on auth.users;`).
- **Alur:** sesi didorong ke akun setiap kali tersimpan otomatis (≈1 detik setelah perubahan). Saat masuk di perangkat lain, sesi akun yang lebih baru ditawarkan lewat banner "Lanjutkan" (pilih lagi videonya, karena video tetap di perangkat; transkripnya ikut, jadi tidak perlu transkripsi ulang). Transkrip yang belum ada di perangkat diambil dari akun lebih dulu sebelum memproses ulang.
- **Konflik:** yang terbaru menang (`savedAt`); tidak ada penggabungan. Satu pengguna, satu perangkat aktif pada satu waktu sudah cukup untuk pemakaian pribadi.
- **Kode:** `lib/cloud.ts` (klien `fetch` tanpa SDK, penyegaran token otomatis, gagal dengan tenang), `app/CloudAccount.tsx`, pengait di `lib/session-store.ts` dan `app/motion/page.tsx`. URL proyek dan kunci *publishable* bersifat publik; `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_KEY` bisa menimpa bawaannya.
- **Pengaturan di dashboard Supabase (tidak bisa lewat kode):** pada Authentication → Providers → Email, matikan **Confirm email** supaya pendaftaran pertama langsung masuk tanpa email konfirmasi.

### Kunci Gemini di server

- Setelah masuk, kunci Gemini disimpan di **server** (tabel `public.user_secrets`) dan semua panggilan Gemini lewat Edge Function `gemini`; perangkat tidak lagi memegang kunci. Tanpa login, kunci tetap disimpan di browser seperti sebelumnya.
- **Tabel tertutup:** RLS aktif tanpa kebijakan dan peran `anon`/`authenticated` tidak punya hak apa pun; hanya fungsi (service role) yang membaca/menulis. Pemeriksa keamanan Supabase menandainya INFO ("RLS tanpa kebijakan"): itu disengaja.
- **Fungsi `gemini`** (`supabase/functions/gemini/`, JWT wajib): `status` (ada kunci atau tidak, tidak pernah mengembalikan kunci), `save-key`, `forget`, `generate` (meneruskan isi permintaan ke Google dengan kunci tersimpan di header, dan mengembalikan jawaban serta status Google apa adanya). Hanya untuk pengguna yang masuk dan hanya untuk kuncinya sendiri. Logika ada di `handler.ts` (murni, diuji di `lib/gemini-function.test.ts`); `index.ts` hanya menjalankannya di Deno.
- **Di app:** panel Gemini menawarkan "Simpan di akun (server)" bila sudah masuk, "Pindahkan kunci ke akun (server)" bila kunci lama masih di browser, dan "Hapus kunci" (menghapus di server). `lib/gemini-access.ts` memilih sumber kunci; `lib/gemini.ts` memakai `transport` bila kunci ada di server.
- **Model Gemini yang berganti:** Google menghentikan model lama (mis. `gemini-2.5-flash`), jadi app tidak mempercayai satu nama tetap. Bawaannya `gemini-flash-latest`; tombol **"Cari model yang tersedia"** menanyakan ke Google model apa yang bisa dipakai kunci itu (hanya model teks/audio: bukan gambar, TTS, embedding, live), lalu memilih yang terbaik bila model terpilih tidak ada. Galat "Model tidak ditemukan" memicu pencarian ini otomatis. Fungsi punya aksi `list-models` (boleh dengan kunci yang baru diketik, tanpa menyimpannya) dan `set-model`.
- **Penyedia lain (OpenRouter, Flatkey, dan sejenisnya):** setelah masuk, panel Gemini punya pilihan **Layanan**: Google Gemini langsung, atau router berformat OpenAI (alamat dasar siap pakai: OpenRouter `https://openrouter.ai/api/v1` (bawaan), Flatkey, atau ketik sendiri; nama model bebas seperti `google/gemini-2.5-flash-lite`). OpenRouter mendokumentasikan audio sebagai bagian `input_audio` berformat base64 pada `/chat/completions`, sama dengan yang dikirim app. Kunci, alamat, dan model disimpan di `user_secrets` (kolom `provider`, `base_url`). Fungsi memanggil `{alamat}/chat/completions` dengan `Authorization: Bearer`, menambahkan `model` di sisi server, dan `{alamat}/models` untuk daftar model. Aplikasi mengubah permintaan Gemini ke format OpenAI (teks biasa sebagai string, audio sebagai bagian `input_audio` WAV, mode JSON) dan membaca `choices[0].message.content`. Alamat dasar divalidasi di server (https publik saja: tanpa IP, localhost, nama internal, kredensial, port, atau query). Router berformat OpenAI hanya bisa dipakai setelah masuk (kunci harus di server; panggilan langsung dari browser tidak didukung). **Belum teruji terhadap Flatkey asli** (sandbox tidak bisa menjangkaunya): alamat dasar berasal dari satu tulisan pihak ketiga, dan dukungan audio bergantung pada router.
- **Deploy ulang fungsi:** ubah `handler.ts`/`index.ts`, lalu deploy lewat dashboard atau `supabase functions deploy gemini`.
- **Belum ada:** batas pemakaian per akun (cukup untuk satu pemilik; perlu ditambah sebelum dipasarkan), dan "Leaked password protection" Supabase (fitur berbayar).

## Saran AI untuk Clipper (momen terbaik, judul, tagar, rapikan otomatis)

Memakai kunci AI yang sama (Google atau router seperti OpenRouter). Semuanya **saran saja**: tidak ada yang dipotong atau diubah sampai Anda memilihnya. Hanya teks transkrip yang dikirim.

- **Cari momen terbaik** (`lib/clip-assist.ts`, `app/ClipAssist.tsx`): AI menerima baris transkrip bernomor dengan detik mulai/selesai dan memilih 3–6 potongan yang berdiri sendiri (8–90 detik, tidak tumpang tindih). Jawaban divalidasi: nomor baris harus sah, potongan terlalu panjang dipangkas di batas baris, terlalu pendek dibuang. Di halaman Clipper, **"Pakai rentang ini"** mengisi waktu mulai/selesai (dalam waktu video, sudah ditambah awal bagian yang ditranskripsi) dan memutar dari sana.
  - Clipper hanya mentranskripsi **bagian yang dipilih (maks. 5 menit)**, jadi momen dicari di dalam bagian itu. Untuk video panjang, transkripsikan per bagian.
- **Judul, deskripsi, dan tagar:** untuk seluruh transkrip atau satu momen. Judul ≤ 60 karakter (dibatasi 100), deskripsi 1–2 kalimat, 5–10 tagar yang dibersihkan (diawali `#`, tanpa spasi/tanda baca, tanpa duplikat). Ada tombol salin per bagian dan "Salin semuanya".
- **Rapikan otomatis setelah transkripsi:** kotak centang di panel Gemini (disimpan di perangkat ini). Begitu transkripsi baru selesai, daftar perbaikan (hanya teks, tanpa audio) muncul untuk ditinjau; tidak diterapkan sendiri. Tidak berjalan untuk transkrip yang dimuat dari penyimpanan.
- **Pengujian:** logika di `lib/clip-assist.test.ts`; e2e memverifikasi judul/tagar dan kasus "tidak ada momen yang layak" dengan AI palsu. Alur "momen valid → Pakai rentang ini" dan rapikan otomatis belum punya e2e (transkrip uji terlalu pendek, dan model suara tidak bisa diunduh di sandbox).

## Clipper: dari video panjang ke klip pilihan (alur AI)

Alur utama halaman Clipper sekarang: **pilih video → "Analisis video & sarankan klip" → periksa dan setujui → daftar klip → ekspor atau "Kirim ke Motion".**

- **AI mendengarkan seluruh video** (`lib/ai-transcribe.ts`, `app/ClipFlow.tsx`): audio dipotong FFmpeg di perangkat menjadi bagian ±4 menit berupa MP3 mono 32 kbps (±1 MB per bagian), dikirim ke layanan AI (2 permintaan paralel), dan baris-barisnya diletakkan di garis waktu video. Video 19 menit ≈ 5 bagian, biaya beberapa sen. Hanya audio yang dikirim, dan hanya setelah Anda mencentang persetujuan. Transkrip disimpan (dan ikut tersinkron saat masuk) sehingga analisis ulang tidak mendengarkan lagi.
  - Waktu per baris berasal dari AI: cukup untuk memilih dan memotong momen, tetapi tidak seteliti waktu kata Whisper. Karena itu klip bisa disesuaikan ±2 detik di pratinjau.
- **Saran klip** (`lib/clip-assist.ts`): 3–10 klip (menurut panjang video), tiap klip **20–180 detik (maks. 3 menit, batas Motion Graphics)**, tidak tumpang tindih, dengan judul dan alasan. Setiap saran bisa **diputar** langsung di pemutar video, disesuaikan, dicentang, lalu ditambahkan ke daftar klip. Tidak ada yang dipotong sebelum Anda menyetujui.
- **Daftar klip** maksimal 10. Tiap klip menyimpan judul dan **subtitlenya sendiri** (potongan transkrip, waktu dimulai dari 0).
- **Kirim ke Motion:** memotong klip (selalu 9:16), memeriksa bahwa hasilnya bisa diputar (`checkedVideo`: bila gagal diputar, file disalin ulang lalu dicoba lagi; bila tetap gagal, pesan memuat detail pemutar), lalu membuka Motion Graphics yang langsung memuat video, judul, dan naskah/subtitle dalam mode edit video. File dititipkan **di memori** (perpindahan halaman di dalam app tidak memuat ulang apa pun, jadi file yang sama utuh sampai ke Motion); penyimpanan IndexedDB hanya cadangan untuk tab baru atau muat ulang, karena Safari di iPad bisa mengembalikan file besar yang rusak/terpotong dari IndexedDB (FFmpeg: "moov atom not found"). Dipakai sekali (kedaluwarsa 1 jam), dan didahulukan atas sesi lama. Bila Motion tidak bisa memutar klip yang diterima, pesannya jelas dan videonya tidak dipasang. Bila waktu per kalimat dari AI kurang pas, buat ulang transkrip lokal di panel Transkrip Motion.
- **Cara manual** (Whisper di perangkat + saran AI untuk bagian terpilih) tetap ada: terbuka bila belum ada kunci AI, terlipat bila sudah ada.
- **Link YouTube** (tahap 2): lihat bagian berikutnya.
- **Pengujian:** `e2e/clipflow.mjs` (FFmpeg asli memotong MP3, AI palsu, pratinjau, penyesuaian, persetujuan, ekspor 9:16, serah-terima ke Motion).

### Dari link YouTube (tanpa mengunduh apa pun)

Panel "Mulai dari link YouTube: AI mencari klip terbaik" (terbuka selama belum ada file). Alurnya: **link → teks video → saran klip AI → setujui → pilih file video yang sama → klip ditambahkan otomatis.**

- **Teks video** punya dua jalur:
  1. **Ambil teks otomatis:** fungsi server `youtube` (`supabase/functions/youtube/`, JWT wajib) membaca caption lewat endpoint pemutar tidak resmi YouTube dan mengembalikan judul, durasi, bahasa, dan baris teks berwaktu (dua format XML, entitas HTML dua lapis, hanya alamat caption `*.youtube.com`). **Ini upaya terbaik:** YouTube sering menolak permintaan dari server (kode `BLOCKED`), bisa mengubah cara kerjanya kapan saja, dan video tanpa caption tidak bisa dibaca. Sandbox pengembangan tidak bisa menjangkau YouTube, jadi **belum teruji terhadap YouTube asli** (hanya terhadap jawaban palsu).
  2. **Tempel transkrip** (cadangan yang selalu bisa dipakai): salin dari YouTube (⋯ → Tampilkan transkrip) atau teks SRT/VTT; `parsePastedTranscript` membacanya, termasuk format "0:00 teks" sebaris dan jam `1:02:03`.
- **Saran klip:** baris caption (sering hanya 2–4 detik) digabung jadi ±8 detik per baris (`mergeCaptionLines`), lalu AI memilih momen dengan batas yang sama seperti alur file (20–180 detik, maks. 3 menit). Tiap saran punya tautan **"Buka di YouTube"** pada detik awalnya untuk diperiksa, dan bisa disesuaikan ±2 detik. Daftar saran dipakai bersama alur file (`app/SuggestionList.tsx`).
- **Pilih file:** setelah "Lanjut", app membuka pemilih file. Klip menunggu sampai file dipilih, lalu ditambahkan otomatis ke daftar klip (dengan subtitle dari caption). Bila **durasi file tidak cocok** dengan video YouTube (selisih lebih dari 15 detik atau 10%), file ditolak dengan pesan jelas dan klip tetap menunggu, supaya klip tidak dipotong dari video yang salah.
- **Soal YouTube:** app tidak mengunduh video, hanya membaca teks dan waktunya. Pakai video milik Anda atau yang Anda punya izinnya. Mengambil caption lewat endpoint tidak resmi berada di wilayah abu-abu ketentuan YouTube; jalur tempel transkrip tidak punya masalah itu.
- **Pengujian:** `lib/youtube.test.ts`, `lib/youtube-function.test.ts`, dan `e2e/clipflow.mjs` (server palsu menolak, tempel transkrip, saran AI, tautan YouTube, file salah ditolak, klip ditambahkan, serah-terima ke Motion).
