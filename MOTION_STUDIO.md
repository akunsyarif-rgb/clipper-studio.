# Motion Graphics Studio

The prompt-led motion graphics interface is available at `/motion`.

## Current capabilities
- Edit the creative brief and opening headline.
- Choose motion style, palette, duration and music intent.
- Preview a visual direction and five-beat storyboard.
- Copy a production brief or export the brief as JSON.
- A Remotion composition is included at `remotion/Video.tsx`.

## Render locally
Install dependencies, then run:

```sh
npm install
npm run remotion:studio
```

To render the sample composition to MP4:

```sh
npm run render:motion
```

The sample composition is 1080x1920, 30fps, 900 frames (30 seconds). It is a starting template and currently does not include music audio. Add a properly licensed local audio file and an Audio component before producing a music-backed final export.

The Next.js app deployed on Vercel is the prompt/brief interface. MP4 rendering is not performed by the Vercel page. It requires a compatible Node.js, Chromium and FFmpeg rendering environment. No paid render or external video service is triggered by this project.
