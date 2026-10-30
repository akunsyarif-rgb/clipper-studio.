# Motion Graphics Studio (Remotion)

The script-to-video studio is at `/motion`.

## Workflow

1. **Script**: write the narration text. Each line or sentence becomes a scene. Very long sentences are split at commas/words, and one-word fragments are merged into the previous scene. Limits: 3,000 characters and 180 seconds (there is no limit on the number of scenes; each needs at least 1.2 s when the length is shared out, so the length is what bounds them).
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

### Presisi subtitle dan panjang video setelah "Ke Motion" (perbaikan)

Gejala: subtitle kurang presisi, dan di akhir video gambar membeku sementara subtitle berjalan terus. Penyebab yang ditemukan dari `props.json` dan MP4 yang dilampirkan: durasi adegan **persis sama dengan jadwal perkiraan otomatis** (bukan waktu ucapan), total 52,6 detik padahal video sumber 40,2 detik (ucapan berhenti di 40,2 detik; 12,4 detik sisanya sunyi dan gambar membeku).

- **Waktu tidak lagi gugur karena adegan sangat pendek** (`sceneTimings`): dua adegan yang kata pertamanya jatuh di frame yang sama dulu membuat *seluruh* waktu transkrip dibuang (kembali ke perkiraan); sekarang tiap adegan dijamin minimal satu frame.
- **Adegan di bawah 1,2 detik digabung otomatis saat impor** (`mergeShortScenes`, `scriptFromTranscript`): titik di antara dua adegan yang digabung menjadi koma (tanda tanya/seru tidak diubah; adegan digabung ke tetangga lain), kata-katanya tidak berubah. Dulu adegan pendek diperpanjang, sehingga semua subtitle sesudahnya bergeser dan video jadi lebih panjang dari sumbernya.
- **Komposisi tidak pernah lebih panjang dari video sumber** (`fitScenesToVideo`): adegan yang mulai setelah video habis dibuang dan adegan terakhir dipendekkan. Berlaku untuk pratinjau, render MP4, dan `props.json`.
- **Waktu terlepas tidak lagi diam-diam:** bila naskah diedit sampai terlalu berbeda dari transkrip, muncul peringatan merah dengan tombol **"Kembalikan naskah dari transkrip"**; selama itu adegan dibentang tepat sepanjang video sumber.
- **Presisi tertinggi:** di panel Transkrip (di perangkat, Whisper) kini ada **"Pakai hanya waktunya (naskah saya tetap)"**: waktu kata diambil dari Whisper, teks AI tetap. Waktu AI (per kalimat, mudah meleset beberapa detik) cocok untuk memilih klip; untuk subtitle yang pas gunakan tombol ini.

## Gambar latar per scene (video faceless)

Tahap "aset visual" dalam alur produksi (naskah → storyboard → suara → **aset** → motion → ekspor). Sebelumnya scene hanya bisa berisi tipografi, ikon, dan diagram; gambar milik pembuat (foto produk, referensi dari Pinterest, dsb.) belum bisa dipasang.

- **Cara pakai:** di Timeline scene, ketuk **"+ Gambar latar"** di bawah scene, pilih gambar. **Ganti gambar** / **Hapus** ada di tempat yang sama. Hanya untuk mode tanpa video sumber (faceless); di mode edit video, layar tetap milik pembicara.
- **Gerak:** gambar memenuhi layar dengan Ken Burns pelan (`kenBurns` di `lib/scene-image.ts`): scene berselang-seling zoom masuk/keluar dan geser ke arah berlawanan, dengan easing di awal dan akhir, dan geseran tidak pernah memperlihatkan tepi gambar. Berbasis frame, jadi pratinjau sama dengan MP4.
- **Keterbacaan:** di atas gambar ada lapisan warna latar palet (lebih tipis di atas, lebih pekat di area teks), jadi warna teks palet tetap kontras di gambar apa pun, terang (Pearl/Ivory) maupun gelap. Diperiksa dengan gambar sangat ramai (mandelbrot) di palet Pearl dan Gold.
- **Memori iPad:** gambar diperkecil di perangkat menjadi JPEG maksimal 2200 px sisi terpanjang (`prepareImage`) sebelum dipakai. File yang bukan gambar atau lebih dari 25 MB ditolak dengan pesan jelas.
- **Privasi:** gambar tidak diunggah, tidak disinkron ke Supabase, dan tidak ikut tersimpan di sesi. Setelah memuat ulang halaman, pilih gambarnya lagi. `props.json` menyimpan nama file gambar seperti audio; untuk render CLI salin file gambarnya ke `public/`.
- **Hak cipta:** gambar dari internet (termasuk Pinterest) belum tentu boleh dipakai ulang; app mengingatkan ini di bawah timeline.
- **Pengujian:** `lib/scene-image.test.ts`; `e2e/motion.mjs` ("a scene picture moves behind its scene…": file bukan gambar ditolak, foto 4000×3000 diperkecil, pratinjau, render MP4, warna frame scene 1 berasal dari gambar dan scene 2 tetap latar palet, hapus gambar).

Perubahan kecil lain di rilis yang sama: label pengembang "CLIPPER / MOTION · 30 FPS" tidak lagi ikut terbakar di MP4, dan gerak drift scene serta bar data kini memakai easing (bukan linear).

## Sutradara AI (AI menyusun video, Anda memeriksa)

Panel di atas "Timeline scene" di halaman Motion, untuk mode faceless maupun edit di atas video. Memakai kunci AI Anda yang sudah tersimpan (OpenRouter di server setelah masuk akun, atau kunci di perangkat). Satu ketukan, satu permintaan AI.

- **Yang dikerjakan AI:** memilih **gaya, palet, tampilan tiap scene** (Ikon/Langkah/Tanya/Angka/✗✓/Ajakan/Kutipan), **ikon**, dan di mode edit video **potongan layar** (video / video + animasi / grafis penuh). Untuk faceless, AI juga memberi **ide gambar** per scene (2–4 kata kunci pencarian foto), supaya mencari aset tidak menebak-nebak.
- **Yang tidak pernah dilakukan AI:** mengubah, menambah, atau membuang teks naskah. AI hanya memilih di antara opsi yang dimiliki app; nilai di luar daftar dibuang (`parseDirector`), bukan ditebak.
- **Pagar pengaman** (`planToOverrides`): tampilan "Angka" tanpa angka di kalimat dan "✗/✓" tanpa dua sisi dibuang; ajakan (cta) tidak pernah membuka video; cta dan ✗/✓ tidak diberi ikon.
- **Panduan yang dipakai AI** (`PLAYBOOK` di `lib/director.ts`, ringkasan sendiri, bukan salinan): pembuka paling kuat dan bergerak dalam 1,5 detik pertama; satu fokus visual per scene dan tampilan dipilih dari isi kalimat; variasi dengan tujuan (maks. 2 scene berturut-turut sama, beri jeda tenang setelah dua scene padat); ikon hanya bila mewakili isi; satu warna dominan sesuai suasana topik; gaya sesuai tempo; di edit video, pembicara tetap utama dan layar penuh maks. 1 dari 3 scene (maks. 4 detik). Sumber: Remotion Agent Skills (`remotion-dev/skills`), `haidrrrry/claude-remotion-skill` (MIT), pack `tiktok-video-skills` dan `explainer-video-skills` dari `iart-ai` (MIT).
- **Anda tetap pengaudit:**
  1. Di tiap scene tampil **"Pilihan AI: …"** (alasan singkat) dan **"Ide gambar: …"**; ringkasan arah keseluruhan tampil di panel.
  2. Semua pilihan adalah pilihan biasa: ubah lewat menu **Tampilan / Ikon / Layar** seperti biasa. Alasan AI untuk scene itu hilang karena pilihannya sudah milik Anda.
  3. **Masukan:** tulis di kotak (mis. "lebih tenang, kurangi animasi, scene 3 pakai angka"), lalu **"Susun ulang dengan masukan"**. AI menerima masukan itu dan pilihan saat ini, jadi menyesuaikan, bukan mulai dari nol.
  4. **"Batalkan susunan AI"** mengembalikan gaya, palet, tampilan, ikon, dan potongan layar ke keadaan sebelum AI pertama kali dijalankan.
- **Privasi dan biaya:** hanya teks kalimat, durasinya, dan masukan Anda yang dikirim; kunci tidak pernah masuk ke permintaan atau pesan galat. Satu pass = satu permintaan teks kecil (biaya sangat rendah di OpenRouter). Kegagalan (kuota, jaringan, jawaban rusak) dijelaskan dan tidak mengubah apa pun.
- **Batas:** AI memilih dari tampilan yang ada; gerak dan tata letak tiap tampilan tetap dari app. Gambar tetap Anda pasang sendiri (lihat bagian gambar latar); AI belum mencari atau mengunduh gambar.
- **Pengujian:** `lib/director.test.ts` (14 tes: prompt, parser termasuk format OpenRouter, pagar pengaman, satu permintaan) dan `e2e/motion.mjs` ("the AI director…": AI palsu, gaya/palet/tampilan diterapkan, alasan per scene, pratinjau menampilkan tampilan pilihan, masukan terkirim bersama pilihan saat ini, ubah manual, batalkan, galat dijelaskan, pesan tanpa kunci). **Belum diuji dengan model sungguhan** dari sandbox ini; kualitas pilihannya perlu Anda nilai.

## Gambar otomatis dari Pexels

Melengkapi Sutradara AI untuk video faceless: AI memilih kata kunci, Pexels menyediakan foto, Anda memeriksa dan mengganti.

- **Sekali setup:** masuk ke akun, di panel **"Gambar otomatis (Pexels)"** tempel kunci API Pexels (gratis di pexels.com/api) lalu **Simpan**. Kunci diperiksa ke Pexels saat disimpan (kunci salah langsung ditolak) dan **disimpan di server akun** (tabel `user_pexels`, tertutup untuk semua klien, hanya fungsi `pexels` yang membacanya). Kunci tidak disimpan di perangkat atau halaman, tidak pernah ditampilkan lagi, dan bisa dihapus dengan **Hapus kunci Pexels**.
- **Otomatis semua scene:** jalankan **Sutradara AI** (ia memberi `imageQuery`, kata kunci bahasa Inggris 2–4 kata per scene, karena Pexels jauh lebih akurat dengan bahasa Inggris, dan `imageIdea` bahasa Indonesia untuk dibaca), lalu ketuk **"Cari gambar untuk N scene"**. Untuk tiap scene yang belum bergambar app mencari foto **vertikal** (portrait), memilih hasil terbaik yang belum dipakai di scene lain (supaya satu foto tidak berulang), mengambilnya, dan memasangnya seperti gambar unggahan (Ken Burns, lapisan warna palet). Ada progres dan tombol **Batal**; masalah kunci, kuota, atau login menghentikan proses dan dijelaskan, masalah satu scene hanya melewati scene itu.
- **Ganti manual:** di tiap scene ada **Cari di Pexels**: kotak pencarian terisi kata kunci AI (bisa diubah), 6 hasil dengan kredit fotografer; ketuk satu untuk memakainya.
- **Kredit dan lisensi:** foto Pexels gratis dipakai, termasuk komersial, dengan lisensi Pexels; kredit **"Foto: Nama di Pexels"** (tautan ke Pexels) tampil di bawah tiap scene dan ikut masuk ke Brief yang disalin. Aturan API Pexels meminta tautan ke Pexels dan kredit fotografer; keduanya ditampilkan. Kuota: 200 pencarian per jam (sisa ditampilkan di pemilih).
- **Bagaimana foto sampai ke video:** pencarian dan pengambilan foto lewat fungsi server `pexels` (bukan langsung dari browser), jadi kunci tidak pernah di browser dan app tidak bergantung pada izin lintas-origin Pexels. Foto diminta sudah dipotong 1080×1920 dan terkompres (sekitar ratusan KB), lalu diperkecil lagi di perangkat bila perlu. Hanya alamat `images.pexels.com` yang dibuka server, tanpa mengirim kunci ke sana.
- **Yang dikirim ke Pexels:** hanya kata kunci pencarian. Teks naskah Anda tidak dikirim.
- **Pasang di produksi (satu kali):** jalankan `supabase/migrations/20261028020000_user_pexels.sql` dan deploy fungsi `supabase/functions/pexels` (lihat `supabase/README.md`). Sebelum itu panel menampilkan "Fungsi pencarian gambar belum dipasang di server."
- **Batas yang diketahui:** gambar tidak tersimpan di sesi (pilih lagi setelah muat ulang; hanya kata kunci AI yang hilang juga); hasil Pexels bergantung kata kunci, jadi sebagian scene perlu diganti manual; **tes otomatis memakai Pexels palsu** (sandbox pengembangan tidak bisa menjangkau Pexels; format jawaban dibaca dari dokumentasi publiknya). Pemilik sudah mencobanya sendiri di iPad dengan kunci Pexels dan OpenRouter asli (28 Okt 2026) dan berjalan baik.
- **Pengujian:** `lib/pexels-function.test.ts` (16: keamanan alamat, kunci diperiksa sebelum disimpan, batas kuota, tidak ada kunci di jawaban, hanya host Pexels), `lib/pexels.test.ts` (13) dan `e2e/motion.mjs` (login palsu, kunci salah ditolak, kunci disimpan sekali dan tidak tampak di halaman, kata kunci AI dicari, foto dipasang di tiap scene dengan kredit, ganti manual, render MP4 dengan warna frame dari foto, hapus kunci).

## Mode konten affiliate (TikTok Shop, Shopee, dsb.)

Mode **Affiliate** di halaman Motion (saklar di bagian atas; lihat "Dua jenis konten" di bawah), untuk video tanpa video sumber. Tujuannya: naskah jualan yang dibuat cepat oleh AI **tanpa mengarang klaim**, dengan pemeriksa yang menunjuk kalimat berisiko.

**Alur**
1. Isi **data produk** yang benar: nama produk, harga dan promo (opsional, hanya yang nyata), 1–5 manfaat/fakta nyata (satu per baris), platform (TikTok Shop, Shopee, Tokopedia, Lazada, lainnya), gaya bicara, target penonton. Data disimpan **di perangkat ini saja** (localStorage), tidak dikirim ke server akun.
2. **Tulis naskah dengan AI:** AI (kunci OpenRouter Anda, satu permintaan) menulis 6–10 kalimat dengan struktur hook (maks. 12 kata, memakai satu manfaat/masalah nyata) → masalah → 2–3 manfaat → harga/promo (hanya bila Anda isi) → ajakan sesuai platform (mis. "Cek keranjang kuning" untuk TikTok Shop). Aturan keras di prompt: hanya memakai data yang Anda isi, tidak menambah angka, harga, promo, sertifikat, testimoni, atau perbandingan; tidak ada klaim kesehatan, "terbaik/nomor 1", "dijamin/pasti/100%", atau stok terbatas kecuali tertulis di data. Hanya data produk (bukan data lain) yang dikirim ke AI.
3. **Usulan naskah** tampil dulu, kalimat berisiko ditandai ⚠ beserta alasannya. Anda **Pakai naskah ini** (mengisi naskah dan judul), **Tulis ulang dengan masukan** ("lebih singkat, hook lebih kuat"), atau **Buang**.
4. **Pemeriksa klaim** memeriksa naskah yang sedang ada (juga yang Anda ketik sendiri) secara langsung, dan di tiap temuan ada **Hapus baris ini**.
5. **Pasang foto produk saya:** foto Anda dipasang sebagai gambar latar di scene yang menyebut produk (kata dari nama produk, 4+ huruf) dan scene terakhir (tempat ajakan beli). Scene lain bisa diisi foto stok Pexels (tombol "Cari gambar" mengisi hanya scene yang masih kosong). Hapus per scene bila perlu.
6. **Sutradara AI** tahu ini video jualan: hook menyebut manfaat nyata, kalimat harga/promo memakai tampilan Angka, ajakan membeli di scene terakhir (tampilan Ajakan, hanya di sana), kata kunci foto berupa kategori produk dan situasi pemakaian (bukan merek atau logo).

**Pemeriksa klaim** (`checkClaims` di `lib/affiliate.ts`) adalah daftar aturan yang dapat diprediksi, bukan AI: kata dan angka yang sering ditolak platform atau aturan perlindungan konsumen, **kecuali** data produk Anda sendiri memuat hal yang sama.
- **Selalu ditandai, tidak bisa dibebaskan lewat data:** klaim kesehatan/kecantikan (menyembuhkan, memutihkan, menurunkan berat badan, detoks, kolesterol, dll.). Butuh izin edar dan bukti, bukan sekadar kalimat.
- **Ditandai kecuali ada di data Anda:** "terbaik/nomor 1/paling…", janji/jaminan ("dijamin", "pasti", "100%", "garansi", "uang kembali"), stok/waktu terbatas, bukti sosial dan rekomendasi ahli ("ribuan orang", "viral", "terbukti", "kata dokter"), perbandingan dengan merek lain, sertifikat/izin (BPOM, halal, SNI), promo/bonus (diskon, gratis ongkir, cashback).
- **Angka:** angka (harga, persen, kg, hari, jumlah besar) yang tidak ada di data produk. Penulisan harga dibaca fleksibel ("Rp 89.000" = "Rp89.000" = "89 ribu"); hitungan kecil polos ("3 alasan") diabaikan.
- **Batas yang jujur:** ini daftar kata dan angka, bukan nasihat hukum. Ia bisa terlewat (klaim dengan kata lain) dan bisa salah menandai kalimat yang sebenarnya aman. Tidak menggantikan penilaian Anda, aturan tiap platform, maupun ketentuan BPOM. Pemeriksa tidak memblokir apa pun; ia menunjuk kalimat dan alasannya, keputusan tetap di Anda.
- **Pengingat:** di panel ada catatan bahwa banyak platform (mis. TikTok) meminta konten promosi/afiliasi ditandai sebagai iklan atau konten berbayar saat unggah.

**Belum ada:** pencarian data produk otomatis dari tautan toko (sengaja: data harus datang dari Anda agar benar); skor "kekuatan hook"; video affiliate di atas video sumber (mode edit video memakai transkrip, bukan data produk); AI belum diuji dengan model sungguhan dari lingkungan pengembangan, jadi mutu tulisan dan kepatuhannya pada aturan perlu Anda nilai.

**Pengujian:** `lib/affiliate.test.ts` (23: data produk, prompt hanya berisi fakta yang diisi, parser termasuk format OpenRouter, satu permintaan tanpa kunci, semua kategori klaim, pembebasan lewat data, format angka Indonesia, kata nama produk) dan `e2e/motion.mjs` ("affiliate mode…": naskah dari data, ditandai, tulis ulang dengan masukan, dipakai, temuan dihapus, foto produk di 2 scene, Sutradara AI mendapat aturan jualan, data diingat setelah muat ulang, pemeriksa jalan tanpa kunci AI).

## Dua jenis konten: Konten biasa dan Affiliate (saklar mode)

Halaman Motion dimulai dengan saklar **[ Konten biasa | Affiliate ]**. Mesinnya sama (naskah → scene → render); yang berbeda hanya titik mulai dan alat yang tampil, supaya layar tidak penuh.

| | **Konten biasa** (bawaan) | **Affiliate** |
|---|---|---|
| Langkah 1 | **Naskah**: video sumber dan transkrip, naskah, judul | **Produk dan naskah**: data produk, naskah AI, pemeriksa klaim, foto produk, naskah, judul |
| Tampil | video sumber dan semua pengaturan edit video | panel data produk dan pemeriksa klaim |
| Disembunyikan | panel data produk | video sumber dan transkrip (affiliate selalu tanpa video sumber) |
| Sutradara AI | aturan umum | aturan jualan (hook manfaat nyata, harga sebagai angka, ajakan di scene terakhir) |

- **Terhubung:** naskah, scene, gambar, gaya, palet, suara, dan musik adalah satu proyek yang sama; pindah mode tidak menghapus apa pun (bagian yang disembunyikan tetap aktif di belakang layar, mis. transkrip yang sedang berjalan tidak terputus). Data produk tetap tersimpan saat Anda kembali ke Konten biasa, tetapi aturan jualan Sutradara AI hanya dipakai di mode Affiliate.
- **Mode terakhir diingat** di perangkat ini (`clipper:motion:mode:v1`).
- **Video sumber berarti konten biasa:** saat mengedit di atas video (mis. klip dari Clipper), tombol Affiliate nonaktif dengan penjelasan, dan halaman terbuka sebagai Konten biasa walau mode terakhir Anda Affiliate. Setelah video dilepas ("Ganti video"), mode pilihan Anda kembali.
- **Langkah bernomor:** 1 Naskah (atau Produk dan naskah), 2 Tampilan, 3 Suara dan musik, 4 Render.
- **Pengaturan dilipat** (terbuka dengan satu ketukan, ringkasannya tampil di judulnya): **Tampilan** (template, gaya, palet; biasanya diatur Sutradara AI), **Backsound**, dan **Durasi dan subtitle**. Voice over tetap terlihat karena harus dibuat sebelum render. Tidak ada pengaturan yang dihapus.
- **Pengujian:** `e2e/motion.mjs` ("mode switch…": bawaan Konten biasa, tiap panel hanya di mode-nya, naskah dan pengaturan terbawa, aturan jualan hanya di Affiliate, mode diingat setelah muat ulang, lipatan tertutup dengan ringkasan dan tetap terbuka saat diedit) dan `e2e/clipflow.mjs` (klip dengan video membuka sebagai Konten biasa dan Affiliate nonaktif). Tes lain yang memakai pengaturan terlipat membukanya dulu lewat bantu `openFolds`.

## Riset produk otomatis untuk affiliate (dikerjakan app, bukan AI)

Di mode Affiliate, di bawah Nama produk ada **"Tautan halaman produk (opsional)"** dan tombol **"Cari info produk dengan AI"** (nama tombol mengikuti kebiasaan; yang mencari adalah app). Pembagian tugasnya sengaja tegas: **app mencari dan membaca, AI hanya merangkum apa yang sudah ditemukan.**

**Yang dikerjakan app (kode di server, tanpa AI)**
1. **Halaman yang Anda tempel dibaca** (toko resmi atau merek paling akurat).
2. **Pencarian web** dua kali (`<produk> spesifikasi resmi` dan `<produk> specifications`) lewat halaman HTML DuckDuckGo, tanpa kunci dan tanpa biaya.
3. **Memilih halaman** (`rankHits`): situs merek sendiri dan toko resmi lebih dulu, lalu marketplace; media sosial dan video (Pinterest, YouTube, dsb.) dibuang; halaman ulasan "terbaik/review" diturunkan; maks. 2 halaman per situs. Maks. 4 halaman dibaca (termasuk yang Anda tempel), tiga sekaligus.
4. **Membaca tiap halaman:** data terstruktur (schema.org Product: nama, merek, harga, bahan, warna, gambar, properti), **tabel spesifikasi dan daftar definisi** halaman, Open Graph, dan teks halaman yang terbaca.

**Yang dikerjakan AI (opsional, hanya merangkum)**
- Bila ada kunci AI, teks halaman diberikan ke model **biasa** Anda (bukan model pencari web, tanpa plugin pencarian). AI menulis fakta pendek berbahasa Indonesia tentang **informasi umum yang berguna bagi calon pembeli** (spesifikasi, fitur, isi paket, untuk siapa produk ini, garansi resmi, serta kelebihan atau kekurangan yang *ditulis halaman itu*, tanpa menilai sendiri), dan **setiap fakta wajib membawa kutipan persis dari halaman** serta nomor halamannya. Anda yang menilai hasilnya: hanya fakta yang Anda centang yang dipakai.
- Verifikasi oleh kode: fakta **dibuang** bila kutipannya tidak ditemukan di teks halaman yang disebut, atau bila angka di ringkasannya tidak ada di kutipan. Jumlah yang dibuang dilaporkan. Jadi AI tidak bisa menambah fakta dari ingatannya.
- Tanpa kunci AI, atau bila AI gagal (saldo habis, dsb.), spesifikasi yang tertulis di halaman tetap dipakai dan alasannya dilaporkan.

**Hasil riset** tampil dengan merek, daftar fakta (kotak centang, sumber, dan untuk hasil AI **kutipan halaman** agar bisa dibandingkan dengan aslinya), petunjuk harga, dan gambar:
- Spesifikasi yang ditulis halaman sendiri dan fakta berkutipan **tercentang** otomatis; urutannya spesifikasi halaman dulu, lalu fakta berkutipan.
- Fakta berkata promosi atau klaim (terbaik, nomor 1, klaim kesehatan, dan juga baris "Garansi: …" karena terbaca sebagai janji) **ditahan, tidak tercentang**, dengan peringatan; Anda tetap bisa mencentangnya bila memang benar.
- **Pakai N fakta yang dicentang** menambahkannya ke Manfaat dan fakta nyata (maks. 8, tanpa duplikat). Naskah AI dan pemeriksa klaim memakainya seperti biasa.
- **Harga hanya petunjuk** dengan sumbernya ("Rp 89.000"); tidak pernah terisi sendiri. "Pakai harga ini" memasukkannya setelah Anda periksa.
- **Gambar dari halaman produk** (yang dipakai halaman toko atau merek itu sendiri): ketuk satu, server mengambilnya, dan dipasang di scene yang menyebut produk dan scene terakhir. **Sumbernya tampil sebagai kredit di bawah scene** (tautan ke halamannya).

**Fungsi server `product`** (`supabase/functions/product/`, hanya untuk pengguna yang masuk, tanpa kunci atau tabel): aksi `search`, `page`, dan `image`. Pengaman: hanya alamat https publik (tanpa kredensial, port, IP, `localhost`, `.local`/`.internal`), setiap pengalihan diperiksa ulang (maks. 3), alamat hasil pencarian diperiksa sebelum dibuka, halaman maks. 1,5 MB, gambar maks. 12 MB dan hanya JPG/PNG/WebP. Sebelum dibuka untuk pengguna lain, tambahkan batas pemakaian per akun.

**Batas yang jujur**
- **Pencarian DuckDuckGo tidak resmi.** DuckDuckGo tidak punya API gratis; server membaca halaman hasilnya. DuckDuckGo bisa membatasi atau memblokir pencarian otomatis dari server kapan saja (tampil sebagai "Mesin pencari membatasi pencarian otomatis"). Bila itu terjadi, halaman yang Anda tempel tetap dibaca; dan penggantinya adalah mesin pencari berkunci (mis. Serper atau Brave), yang bisa ditambahkan tanpa mengubah bagian lain.
- **Marketplace sering menolak dibaca otomatis** (Shopee, Tokopedia, dsb.), dan banyak halaman toko dimuat lewat JavaScript sehingga tidak punya data yang bisa dibaca. App memberi tahu dan melanjutkan dengan sumber lain. Tautan toko resmi atau situs merek paling andal.
- **Akurasi:** spesifikasi yang ditulis halaman bisa saja keliru atau memuat produk lain; sumber dan kutipan ditampilkan agar Anda bisa memeriksa. Anda tetap penanggung jawab isi video.
- **Hak cipta gambar:** gambar produk milik toko atau merek. App mengingatkan dan mencantumkan sumbernya, tetapi hak pakainya Anda yang menilai (mis. materi dari program afiliasi atau penjual). Foto sendiri tetap pilihan paling aman.
- **Belum diuji terhadap DuckDuckGo atau situs toko sungguhan** dari lingkungan pengembangan (tidak terjangkau). Format halaman hasil DuckDuckGo dibaca dari pengetahuan umum tentang strukturnya (`result__a` dengan tautan pengalih `uddg`) dan diuji dengan contoh buatan; bila strukturnya berubah, pencarian akan mengembalikan nol hasil.
- **Pemasangan di produksi:** fungsi `product` harus di-deploy sekali (tanpa perubahan database). Sebelum itu muncul "Fungsi pembaca halaman produk belum dipasang di server."

**Pengujian:** `lib/product-function.test.ts` (26: keamanan alamat, pengalihan, batas ukuran, parser JSON-LD/tabel/Open Graph, hasil DuckDuckGo tanpa iklan dan alamat internal, mesin pencari yang membatasi), `lib/product.test.ts` (10), `lib/product-research.test.ts` (kualitas pemilihan halaman, kutipan yang harus ada, angka yang harus ada di kutipan, kegagalan sebagian) dan `e2e/motion.mjs` ("affiliate research…": dua pencarian oleh app, halaman ditempel dibaca pertama, media sosial dan halaman ganda tidak dibaca, AI hanya meringkas dengan model biasa, kutipan palsu dibuang dan dilaporkan, fakta berkutipan dan baris klaim, harga tidak terisi sendiri, gambar lewat server di 2 scene dengan kredit, AI gagal dan pencarian dibatasi tetap menyisakan fakta halaman).

## Tanpa batas jumlah scene, dan subtitle tepat sampai akhir (perbaikan)

- **Batas 20 scene dihapus.** Naskah dengan banyak kalimat (mis. klip 2–3 menit dari Clipper) kini diterima; yang membatasi hanya panjang total (maks. 180 detik) dan 3.000 karakter. Bila durasi dibagi otomatis, tiap scene tetap butuh minimal 1,2 detik, jadi pesan "durasi terlalu pendek untuk N scene" tetap muncul bila waktunya tidak cukup.
- **Penyebab subtitle dan animasi tidak presisi di akhir klip:** waktu scene dari transkrip dipaksa minimal 1,2 detik. Scene yang lebih pendek (mis. "Ya.", "Jadi begitu.") diperpanjang, sehingga *semua scene sesudahnya bergeser terlambat* dan selisihnya menumpuk makin ke akhir (dengan 7 scene pendek bisa lebih dari beberapa detik). Subtitle dan animasi di awal tampak benar, di akhir meleset.
- **Perbaikan:** waktu yang berasal dari transkrip kini dipakai **apa adanya** (`DurationMode` `scenes` dengan `exact`, minimal 1 frame), jadi setiap scene mulai tepat saat kata pertamanya diucapkan dan total video sama dengan panjang sumbernya. Suara otomatis (TTS) tetap memakai minimum 1,2 detik karena audionya memang diisi sampai panjang itu.
- **Scene sangat pendek:** teksnya tampil sebentar saja; peringatan kuning menawarkan menggabung barisnya (kata-kata tidak berubah). Scene di bawah 1 detik tidak pernah dipilih untuk animasi atau layar grafis (hanya akan berkedip) dan tetap di pembicara.
- **Yang tidak berubah:** ketepatan waktu *di dalam* sebuah kalimat bergantung pada sumber waktunya. Waktu dari AI (per kalimat) bisa meleset beberapa detik, terutama di video panjang; untuk ketepatan per kata gunakan "Pakai hanya waktunya" di panel Transkrip (Whisper di perangkat).
- **Pengujian:** `lib/script.test.ts` (banyak scene diterima, durasi eksak, tetap diperpanjang untuk suara otomatis), `lib/transcript.test.ts` (40 kalimat dengan kalimat pendek tersebar: setiap scene mulai di kata pertamanya dan total sama dengan sumber; versi lama terlambat lebih dari 1 detik), `lib/importance.test.ts` (scene di bawah 1 detik tidak dianimasikan) dan `e2e/motion.mjs` (60 scene diterima dan dimainkan).

### Presisikan waktu subtitle dengan satu ketukan

Klip dari Clipper datang dengan subtitle AI yang waktunya per kalimat. Selama itu masih berlaku, panel Transkrip menampilkan tombol utama **Presisikan waktu subtitle**. Satu ketukan menjalankan seluruh langkah: mengambil audio asli klip, membuat transkrip di perangkat (Whisper), lalu langsung memakai waktunya pada naskah Anda. Teks naskah tidak berubah. Bila hasil tersimpan dari proses sebelumnya ada, itu yang dipakai tanpa memproses ulang. Setelah waktu per kata terpasang, tombol hilang. Bila naskah terlalu berbeda dari ucapan, ada pesan yang jelas dan waktu lama tetap dipakai. Model diunduh sekali; di iPad bagian pendek lebih aman untuk memori.


## Script-First Visual Director

The scene plan now separates **narrative intent** from **visual treatment**. It is a deterministic, local heuristic—not an AI model and not a guarantee of the author's meaning. The scene list exposes its intent, visual cue, confidence level, reason, and continuity hint so the creator can review the recommendation before rendering. Topic continuity also follows a small set of explicit references such as “hal ini” and “cara tersebut”; this remains a conservative heuristic, not full coreference resolution.

Intent classes include question, contrast, cause/effect, process, evidence, insight, instruction, story, reflection, resolution, and statement. Composition selection can use distinct grammars for:
- **Process / cause → effect:** a connected flow; a real cause/effect split is shown only when the text contains a safe split.
- **Metaphor / reflection:** one symbolic focal point, restrained movement, and the original narration text.
- **Story beats:** a progress marker for the scene's position in the complete script, without inventing story details.
- Existing comparison, data, explainer, kinetic and editorial compositions remain available as fallbacks.

The planner never rewrites the narration. It does not require a paid API, network call, new dependency, or server-side render. Existing audio timing, captions, per-scene visual overrides, Remotion preview, and browser MP4 render remain the source of truth. Low-confidence recommendations should be treated as suggestions; users can still adjust the visual template and icon manually. The scene review also flags long beats for possible manual splitting, weak heuristic signals for manual review, and detected numerical evidence for source verification. These are review prompts, not proof that a claim is false or a scene is incorrect. Percentage detection is tested explicitly to avoid missing common formats such as `73%`.

Automated unit tests cover semantic classification and composition routing. Real-device Safari/iPad rendering still requires a manual smoke test; passing CI alone does not prove device memory and WebCodecs compatibility.

## AI Director: layouts, storyboard, revisions

- **Layout planner** (`lib/composition.ts` `planLayouts`): editorial scenes pick `impact` (hook / impact beats: oversized word-by-word type, no kicker), `quiet-center` or `quiet-offset` (calm beats; adjacent calm scenes alternate). Comparison and CTA keep their own families.
- **Storyboard** (`lib/storyboard.ts`): `buildStoryboard` turns the scenes into an inspectable plan (family, layout, assets, caption policy, timing, continuity); `validateStoryboard` flags empty/duplicate narration, production notes, too-short scenes, missing pictures, text that cannot fit, repeated composition and audio/scene length mismatch. Errors block rendering; the panel is under the preview. After rendering, `validateExport` checks file size, 1080×1920 and duration where the browser can report them.
- **Revisions** (`lib/revision.ts`): "scene 2 lebih dinamis", "ending lebih kuat", "scene 2-4 …" restrict the AI pass to those scenes (also enforced on the answer; style/palette are global-only). The script text is never sent for rewriting. Every revision is a version (20 kept) with undo and redo.
- Known gaps: version history lives in memory (lost on reload, not in the saved session); no per-scene lock UI (the API supports a locked set); no pixel-level frame inspection or Safari run in CI.

## Platform safe zone (1080×1920)

`lib/layout.ts` is the single source: top inset 220 px (tabs, logo), bottom 380 px (username, description, audio bar), side 130 px both sides (the right action rail needs 120–150; the left would need only 40–60 but equal insets keep centred layouts centred). Main content stays in a centred band of at most 1200 px (`ACTIVE_HEIGHT`). Burned-in captions over a source video end 520 px above the bottom edge (`CAPTION_BOTTOM`, 500–600 px), and "lower" overlays sit above them. Information that must survive a 1:1 crop belongs in the centred 1080×1080 square (`SQUARE_CROP`). The preview has a "panduan area aman" toggle that draws all of these; it is never part of the MP4.

## Watermark video

`lib/watermark.ts` holds the settings (on/off, text up to 32 characters, corner, size 3–9 % of the width, transparency 10–100 %) and the one geometry function `watermarkBox`. The Remotion layer (`remotion/Watermark.tsx`, preview and browser-rendered MP4) and the clipper export (`lib/watermark-canvas.ts` draws the same text and box into a PNG that FFmpeg lays over the frame) both use it, so preview and file agree. On 9:16 it keeps the safe-area insets (below the top tabs, above the description zone, clear of the right button rail); text scenes and top overlays shrink away from it, and bottom corners sit below the subtitle line. Off or empty text means nothing is drawn or baked in. Settings are kept in `sessionStorage` for the editing session and shared by the clipper and the motion studio. A clip handed from the clipper to the motion studio is exported without a watermark, so it is never drawn twice.

## Speech recognition on iPad Safari

"no available backend found / RangeError: Out of memory" came from the WebAssembly runtime failing to allocate while starting: the larger asyncify ONNX build was chosen on Safari 26+, the session used default memory arenas, and the model was never freed after a failure. Now the worker always uses the plain CPU build with low-memory session options, drops a failed model, and `transcribeResilient` retries automatically with the next lighter model (small → base → tiny), keeping Indonesian and timestamps; the panel shows what happened and offers "Coba lagi" / "Pakai model lebih ringan".

## Audio-only sources

Every source picker (the clipper, the motion studio's source, the file chosen for a YouTube link) accepts audio as well as video (`SOURCE_ACCEPT`, `isAudioFile` in `lib/clip.ts`). In the clipper an audio range is exported as an ordinary MP4: a plain dark frame of the output size (`AUDIO_ONLY_BACKDROP`) with the chosen sound and, if set, the watermark, so it plays everywhere and can go on to the motion studio. In the motion studio an audio source is played with `<Audio>` over the studio background (`video.audioOnly`), with its transcript, subtitles and animations; there is no footage, so "clip" cutaways are skipped. Voice-over upload already accepted audio.

## Story objects in the app (from the Story Motion Lab)

The lab's four objects are reusable, palette-aware accents (`remotion/StoryVisuals.tsx`; frame-driven CSS 3D, no WebGL, no text). `lib/story-visual.ts` picks one from the scene's job: hook / impact → floating focal point; a single ordered step → rising steps; a calm reflective beat → orbit; a resolution or the closing call to action → one converging point. Comparison, data figures, kinetic and cause → effect scenes keep their own composition; a scene with a picture or pinned icon, and anything over a source video, gets none. The object sits above the text inside the safe-area content box (the text gets the remaining height, and the object is skipped if too little is left). A "Objek visual 3D di atas teks" switch in the Tampilan section turns them off (kept in the saved session); the storyboard names the object per scene.

## SEO and distribution pack

Under the render area of the motion studio, "Paket SEO & distribusi" asks the creator's own AI (the same key as the Sutradara AI) to write the text a platform needs for the finished video: TikTok (hook text and voice-over hook, a 100-150 word search caption, up to 5 hashtags, thumbnail text, related search topics), Instagram Reels (hook and audio match, micro-blog caption with save/share call to action, exactly 3 topics, alt text, 3-5 tags), YouTube Shorts (title under 50 characters, 100-200 word description, thumbnail text, pin comment), X (hook tweet, alt text, at most 2 tags) and LinkedIn (two-line hook, problem-insight-takeaway body, 3 industry tags). `lib/seo.ts` builds the prompt from the topic, audience, the trend note the creator typed and the spoken script, then checks the answer against each platform's rules: noise tags such as #fyp and extra tags are dropped, tags are normalised, and every rule (title length, word counts, first Instagram line, number of topics...) becomes a visible check. Text is never silently cut. Every failed check lowers the displayed readiness score (8 points each, never above the AI's own score), and the card list has a copy button per element plus copy as text and as JSON.

Limits: the AI has no live trend data, so nothing is claimed to be "trending now" unless the creator typed it; the prompt forbids inventing facts, numbers or testimonials; the readiness score is the AI's judgement corrected by rule checks, not a measurement of real platform performance.

## Start from a trend

The first fold of the studio ("0 · Mulai dari tren", content mode only) puts distribution before the script. The creator picks the platform, types the niche and the trend or season they saw (one-tap chips add recurring moments such as Ramadan or payday), optionally the audience, and a goal (education, entertainment, opinion). `lib/trend.ts` asks the creator's own AI for three ideas with different angles; each has a title, a hook, one sentence on why it fits the creator's trend text, and a 6-9 line script. "Pakai ide ini" fills the script and title, and hands the same platform, niche, audience and trend text to the SEO pack, which opens with those fields filled (still editable). The fields are remembered on this device only.

Limits: the AI has no live trend data. The prompt says so and forbids "viral now" claims, view counts, account or song names and statistics that the creator did not write; the trend is only what the creator typed, and facts must be checked before posting. Only the typed fields are sent. Not available while editing over a source video or in affiliate mode.

### Radar tren (real signals for the trend step)

Inside "0 · Mulai dari tren", "Radar tren" scans public signals with no AI: Wikipedia's most-read pages (7-day surge), Hacker News and, when the creator saved a YouTube Data API key, the most-viewed YouTube videos of the last 30 days for the niche (or the most-popular chart without a niche). The `trends` Edge Function (`supabase/functions/trends`) ranks them by log(engagement) x freshness, normalised per source, merges the same story across sources and keeps 20; links are limited to YouTube, Wikipedia and Hacker News. It answers only to a signed-in user. The YouTube key is kept in `user_youtube_api` (closed to every client, read only by the function), checked once when saved (1 quota unit), and is never sent to the page or put in an answer. A niche scan costs about 101 YouTube quota units of the 10,000 per day; scans are cached on the device for 6 hours. Ticking up to 5 signals adds them (title, source, engagement) to the trend note, which can still be edited before the AI writes ideas. Reddit is not used because it blocks server addresses. A signal shows that something is being watched or read; it does not promise a video about it will do well. Setup: apply the migration, deploy the `trends` function, then paste the YouTube key in the radar (account required).

## Production history (Riwayat)

Page `/riwayat` (link "Riwayat" in the headers of the Clipper and the Motion studio) keeps, per video, everything that goes with it so making many videos and downloading them loses nothing: the script, the trend inputs it started from, the SEO & distribution pack per platform (with score and copy buttons), and a log of renders and downloads (file name, size, length, "diunduh" once the creator taps Simpan). Clipper exports are logged too (as "klip", without a script). `lib/history.ts` holds the pure logic (entries are keyed by the script's words, so spacing and `*marks*` do not matter; the same file rendered twice is one line; at most 150 entries, 20 files each) and `lib/history-store.ts` keeps the list in the device's IndexedDB, text only, one update at a time.

In the studio, the SEO panel is tied to the video being worked on: a pack is saved when it is made, another script (after a short pause) shows that video's own packs and never the previous video's, and going back to the first script brings its packs back. The history page searches title, script and SEO text, filters (downloaded / rendered but not downloaded / without SEO pack), exports CSV (one row per platform pack) and JSON, reopens a script in the studio ("Buka di studio"), deletes one entry or all.

Sync between devices: when the creator is signed in, the history is also kept in the `app_history` table (one row per video, row-level security per owner, text only, under 500 KB per row). `lib/history-sync.ts` merges the two copies field by field (newest title and script, the newest SEO pack per platform, every render/download line, a "downloaded" mark is never lost), and a deleted video is kept as a small "deleted" row so another device does not bring it back unless it is changed afterwards. It syncs when a page opens, when the creator signs in, and a few seconds after each change; the history page shows the state and a retry. Signed out, nothing is sent.

Limits: signed out, the history lives in this browser only (it is lost when the site's data is cleared), so export from time to time. Changing a script creates a new entry because the script identifies the video; the earlier entry stays in the history. Videos themselves are never stored.

## A chosen video is the base at once

Choosing a video or audio file in ordinary content (or receiving a clip from the Clipper) now makes it the base of the video immediately: it shows in the preview and the render uses its picture and sound, even before any transcript exists. With the untouched sample script (or an empty one) the script becomes a single line ("Video Anda" / "Audio Anda") with subtitles off, so the sample sentences are not drawn over the creator's video; making a transcript ("Pakai transkrip") replaces it with the spoken words and turns subtitles on. If the creator had already written their own script, it is kept and its lines are spread over the video (the timing is an estimate until a transcript is used). "Ganti video" removes the video and brings the sample script back when the placeholder was still there. Before this, the picture only appeared after "Pakai transkrip", which looked like the video had been ignored.

## Trim the start and end of the video

Under the source video, "Potong awal & akhir" (`app/TrimPanel.tsx`, `lib/trim.ts`) sets where the video starts and ends: two sliders, "Mulai/Selesai di posisi sekarang" (from the source player), "Tepatkan ke kata" (when there is a transcript), "Kembali ke potongan dari Clipper" and "Pakai seluruh video". Only the start and the end can move (no cut in the middle). The file is never changed, so the range can be moved again at any time; the preview, the transcript panel, subtitles and the render all use the range (the base video starts `trimStart` seconds into the file), it is saved with the session, and it is between 1 s and 3 minutes.

A clip sent from the Clipper now carries up to 3 s of footage before and after it (what exists in the video), and the Motion studio starts on the clip itself. Moving the start or end outward uses that footage, which is how a clip that began too late can be fixed. A transcript made for the clip is relative to the start of the range; when the range shrinks the transcript is cut to fit (and an unedited script is rebuilt from it), when it grows past what was transcribed the transcript is dropped and must be made again for the new range (the panel says so). "Tepatkan ke kata" moves the start to the first spoken word minus 0.15 s and the end to the last word plus 0.15 s, never into a neighbouring word. Clip cutaways ("Bagian lain video") still use the file's own time, and default to the start of the range. A file that is chosen directly in Motion has no footage around it, so there the trim can only shorten.
## Where an AI-suggested clip starts

The clipper's AI picks line numbers of the transcript, and a clip used to start exactly at the start of the chosen line, which could be a sentence that only continues the thought before it ("jadi...", "nah...", "karena itu..."). Now: (1) the prompt asks for the sentence that introduces the topic; (2) a rule in code (`lib/clip-assist.ts`) moves a start back one line, at most twice and never into the previous clip, while the first line begins with a continuation word (Indonesian and English lists), and says so under the clip; (3) a short lead-in (0.3 s, never reaching into the previous line) is kept before the first word; (4) under "Sesuaikan waktu" each suggestion (also the YouTube flow) has "Mulai/Selesai 1 kalimat lebih awal/lebih akhir" next to the 2-second steps, and shows what is said at the start and at the end. The end is left as it was because it is rarely a problem. Limits: a rule on words cannot know every case, and the transcript's own sentence timing from the AI is approximate, so the creator still checks the start in the preview.

## Editing profiles: music / rhythm and comedy

Over a source video the studio offers "Profil editing": **Standar** (unchanged behaviour), **Musik / ritme** and **Komedi**, chosen by the creator (`app/EditProfilePanel.tsx`, pure logic in `lib/edit-profile.ts`, drawing in `remotion/EditEffects.tsx`). Every edit is picture-only (zoom, a held frame, a small replay window, a flash) or caption emphasis: the original audio and the length of the video are never changed, so pauses, beats and timing stay exactly as recorded, and a failed or wrong analysis can at worst add an effect the creator switches off. Edits are listed for review (on/off, ±0.1 s, play from there, remove all), kept in file time so they survive a trim change, saved with the session, and only those inside the trim are rendered.

- **Music**: the audio of the file (at most 3 minutes in Motion) is decoded on the device (FFmpeg WASM, 16 kHz mono) and analysed without AI: onset envelope, tempo by autocorrelation (70-180 BPM), a beat grid followed forwards and backwards, downbeats, loudness per 0.5 s and clear energy rises; cuts in the footage are read from small frames of the video (optional). The plan: a short zoom pulse on downbeats in the louder half (at most every two bars, never within 0.3 s of a cut already in the footage; "Halus" 1.04, "Kuat" 1.08), and a flash on a clear energy rise moved onto a downbeat. "Tepatkan potongan ke ketukan" snaps the trim to the beat, and "Pilih momen musikal" picks the loudest 15-60 s stretch starting on a downbeat. A beat is used only when both the autocorrelation and the grid agree (confidence ≥ 0.3); noise, speech or silence give a clear message and no edits. Speed ramps are not offered: they would move the original audio.
- **Comedy**: needs the transcript's word timing (the profile says so and applies nothing without it). A punchline is a phrase followed by a pause of at least 0.6 s, scored by the pause, a loud non-speech sound in it (laughter, when the audio could be decoded), a twist word (ternyata, padahal, malah...) and a question just before it (setup); at most 6, at least 6 s apart. The plan: a punch-in (1.18) from the punchline's last word through the reaction (eased in and out), and the punchline's caption is emphasised. Optional and off by default: a 0.5 s freeze at the end of the punchline (the sound keeps playing), a small muted replay window during a long reaction, and a small "pop" sound. Pauses are never shortened.
- **Suggestion only**: after an analysis the panel may say which profile the material looks like (clear beat and few words → music; several punchlines in talk → comedy); it never switches by itself.

Limits: beat tracking is a light on-device method (good on music with clear hits, weaker on rubato or ambient music); scene cuts are read at 2 frames per second; punchlines are found from timing and words, not understood (the review is the safeguard). The profiles work on the Motion studio's source (up to 3 minutes); the Clipper's long videos (up to 60 minutes) are not analysed for beats, to stay within a tablet's memory.

### Cover-image prompt ("Prompt foto sampul")

Every SEO & distribution pack comes with a prompt for the cover picture; the picture itself is made by the creator in another tool. Two versions, always: (1) a **plain prompt built in code** from the content (`lib/cover-prompt.ts`: title/topic as subject, the opening line as context, a mood from the words of the script, one real person candidly or one concrete object or scene, the cover's shape per platform: 9:16 for TikTok, Reels and Shorts, 16:9 for X, 4:5 for LinkedIn, with the subject kept out of the app's top and bottom interface zones), shown in the SEO panel before and without any AI call, with a negative prompt and copy buttons (also under each video in the history); (2) an **AI version** that the pack asks for on every platform, which follows the script more closely and is shown as its own card (also in the copy-as-text and JSON exports and in the history).

The prompts aim at "not AI slop": a documentary / editorial photograph (35 or 50 mm lens, natural light, true-to-life colour, film grain, visible skin and fabric texture, small honest imperfections), one focal point on a simple background, empty space in the upper third for the headline, and **no text, letters or logos in the image** (the title is added in the video editor, because image models garble text). The AI is told not to use buzzwords that cause the generated look (ultra-detailed, 8k, masterpiece, hyperrealistic, cinematic lighting, glowing, epic, futuristic...); whatever it writes, the code removes them, adds the no-text rule when missing and completes the negative prompt with the standard terms (plastic skin, extra fingers, neon glow, CGI look, floating icons...). The cover prompt is not part of the SEO score or its rule checks. Limit: a prompt lowers the odds of the generated look, it cannot guarantee it; the creator should still check hands, faces and any stray text in the result.

## Long videos in the AI clip flow: parts, time limits and resuming

The AI clip flow listens to the video in parts (`lib/ai-transcribe.ts`). Parts are now **2 minutes** (they were 4) and each request may take up to **130 s** (it was 60 s, the default of a small question). The answer lists every line with its times and is written out slowly, so a 4-minute part with a slow model ran past 60 s on the first part even for a 20-minute video ("Bagian 1 dari 6: Gemini terlalu lama menjawab", the same for 20 and 40 minutes). A part that is too slow is **tried once more** automatically; the parts that finished are **kept for this video**, so after an error "Analisis video & sarankan klip" continues from them (only the failed parts are cut and sent again). A 20-minute video is 11 parts, 40 minutes 21, 60 minutes 31 (two requests at a time); the cost is about the same because the same audio is sent. The error names the part and says how many are kept.

## Clips a new viewer can follow, and sharper subtitle timing (AI clip flow)

**Genre and the reading test.** In the clip flow (and the YouTube flow) "Jenis video" is *Umum* or *Komedi / hiburan* (remembered on the device). For comedy the AI is asked for whole jokes: enough setup that a new viewer knows who, where and what the situation is, then the punchline, then the reaction, and not jokes that lean on other parts of the video ("tadi", "yang itu"). Then every suggestion gets a **reading test** (`lib/clip-assist.ts`, one more request for all candidates; more candidates are asked for so weak ones can be dropped): an AI "first-time viewer" is given only the clip (plus a few lines before and after as context that is not played) and says how well it is understood (1-10), what it takes from it, what is missing, and how many lines before or after would fix that. A clip lacking context is **extended** by those lines (up to 4 before, 3 after, never into a neighbouring clip, never past the length limit), a clip that stays incomprehensible is dropped when there are enough others, and the list shows "Mudah dipahami n/10" or "Konteks kurang n/10" with what was understood and what is missing; clips below 6 are not ticked by default. If the test fails or the service cannot do it, the suggestions are shown as before. The test is the AI's reading of the text, not a guarantee: the creator still watches the clip.

**Subtitle timing.** The AI's lines come with times that are often half a second or more off. Each 2-minute part's own audio is now decoded on the device and `lib/align.ts` snaps every line to where speech really starts and stops (the silence-to-speech edges within 1.2 s of what the AI said, never overlapping the neighbours or going below 0.3 s) and spreads the words over the time the voice is actually there, so a word never sits across a pause. Where the audio has no clear edge, or cannot be decoded, the AI's times are kept. This is sharper than before but still an estimate (granularity "segment"); for word-exact timing the studio's "Presisikan waktu subtitle" (on-device speech model) remains.

**Opening text and titles.** The reading test also writes an *opening text* (one short sentence, at most 70 characters) for a clip that lacks context, such as who the people are or what the situation is, and leaves it empty when the clip stands on its own (or when extending the start already fixes it). It is shown under the suggestion in an editable box ("Teks pembuka") and becomes the video's title in Motion (empty = the clip title). It may only say what the transcript says: `groundedIn` in `lib/clip-assist.ts` checks every number and every name against the lines before, in and after the clip and that most other content words appear there too; an opening that mentions something not in the transcript (an invented name, number or place) or is too long is not used, and the list says why. The AI also sees up to 8 lines before the clip for this, and must not reveal the punchline. The title, description and hashtag writer ("Judul & tagar untuk momen ini") now gets the lines before the clip as context, must make the title understandable to a viewer who has not seen the rest, and may state the missing context only with facts from that context or the clip. As always, the creator should read the opening text before using it.

## Typography, palettes, subtitle styles and backgrounds

- **Type packs** (`lib/fonts.ts`): eight looks (Klasik, Impact, Cinema, Modern, Editorial, Street, Friendly, Tech) built from open-licence fonts (SIL OFL 1.1: Anton, Bebas Neue, Montserrat, Plus Jakarta Sans, Space Grotesk, Inter, Playfair Display, DM Serif Display, Caveat, JetBrains Mono, Poppins). The Latin woff2 files and each licence text live in `public/fonts` (16 files, about 400 KB, no new dependency); nothing is fetched from a third party. `TYPE` in `lib/layout.ts` follows the active pack, display faces such as Anton and Bebas Neue are drawn in capitals, and text is fitted with the real font metrics after `remotion/fonts.ts` has loaded the faces (the frame waits for them; the browser render loads them first). Classic keeps the system fonts, so older projects look the same.
- **Palettes**: Sunset / Peach, Deep Ocean / Aqua, Noir / Crimson, Moss / Neon Lime, Mint / Evergreen, Lavender / Violet (all pass the contrast tests).
- **Subtitle styles** over a source video: Klasik, Pop (large outlined capitals, accent-coloured active word), Outline, Kotak sorot (the spoken word on an accent box).
- **Backgrounds** for text scenes: a moving colour "mesh" and a film grain. The browser MP4 renderer draws the page itself and supports only a centred radial gradient and `<canvas>`, not stacked or positioned gradients or CSS `url()` backgrounds; both effects are written for that, and the old top-right glow was rewritten the same way so the preview matches the file.
- The Sutradara AI can now choose type pack, palette, background, grain and subtitle style (whole-video looks, never in a scoped revision), with rhythm and typography rules in its playbook. The retention rules there are common short-form practice, not a guarantee.
- Reviewed for ideas while preparing this: video-shotcraft (Apache-2.0, product-promo recipes) was only read; video-talkcraft (PolyForm Noncommercial) was not used at all.

## Stickers and sound effects

- **Stickers** (`lib/stickers.ts`, `remotion/Stickers.tsx`): 54 Twemoji graphics (SVG, about 220 KB, self-hosted in `public/stickers`) chosen from what a sentence says, in Indonesian and English, on whole words and in catalogue order (specific meanings first). A sticker springs in above the text of a text scene and replaces that scene's accent object. At most 60% of the scenes carry one, the same sticker never appears in the next scene, and every scene can be changed in the scene list ("Tanpa stiker" or any sticker). Off by default. The artwork is CC-BY 4.0 and needs a credit: the panel shows the line and the brief text ("Salin brief teks") includes it when stickers are used; paste it into the video's description. Licence text and attribution are in `public/stickers`.
- **Sound effects** (`lib/sfx.ts`, `lib/sfx-synth.ts`): whoosh into each new scene (a few frames early, softer for calm scenes, firmer for impact), a pop when a sticker appears, a bell on the call to action or closing resolution, and in "Tegas" a low thud under an impact hook. They are synthesised on the device from plain maths (seeded noise, sine sweeps, a bell): no audio files, nothing to license, identical everywhere, one small mono WAV that plays in the preview and goes into the MP4 under the narration (volume 0.55). Over a source video only full-screen cutaways get a whoosh. Off by default.
- The Sutradara AI can choose the effect level, switch stickers on, and pick a sticker (or none) per scene; scoped revisions cannot change the whole-video settings.
- Not added: Lottie animations. They need a player dependency (lottie-web) and the browser MP4 renderer, which paints the page itself, has not been shown to draw them; each animation also has its own licence. The stickers use the same frame-driven approach as the rest of the studio instead.
