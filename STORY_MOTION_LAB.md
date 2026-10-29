# Story Motion Lab (isolated prototype)

This is an isolated Remotion composition for proving that a fixed script can drive visibly different visual storytelling.

## Preview

From the repository root:

```bash
npm ci
npm run remotion:studio
```

Open the `StoryMotionLab` composition in Remotion Studio. The prototype uses the same four-beat sample script already present in the default ScriptVideo:
1. “Jangan tunggu semangat datang.” — floating, tilted 3D-style focal object.
2. “Mulailah, meski langkahmu kecil.” — sequential rising steps.
3. “Disiplin membuatmu tetap bergerak.” — rotating orbit system.
4. “Mulai sekarang.” — elements converge into a single focal point.

## Current scope

- 1080 × 1920, 30 fps, 12 seconds.
- Every animation is driven by `useCurrentFrame()`, `interpolate()`, or `spring()`; no CSS animation loops or randomness.
- The prototype uses CSS perspective and 3D transforms to avoid introducing a new dependency before the visual direction is validated.
- This is **not yet a real Three.js/WebGL scene**. It is a low-risk motion prototype to compare visual storytelling first.
- It is not wired into the production ScriptVideo renderer. It is only registered as a separate Remotion Studio composition.
- No audio, script planner changes, automatic scene mapping, package changes, merge, or deployment are included.

## Next validation gate

1. Inspect key frames at 0, 45, 90, 135, 180, 225, 270, and 330.
2. Confirm the four beats look materially different while the narration text stays unchanged.
3. Check type scale, text clipping, transition seams, frame determinism, and browser memory.
4. If the art direction succeeds, evaluate a true 3D implementation with Remotion's Three.js support on a separate experiment branch and test the exact browser renderer used by Motion Studio before integrating it.

## Reference guidance

- Remotion animation must be frame-driven; CSS keyframe animations and timers do not render deterministically in the normal Remotion pipeline.
- Keep composition size and scene duration explicit, and inspect rendered frames rather than relying only on type-checking.
- A real WebGL/Three.js path has a different compatibility/performance profile from CSS 3D and must be verified separately for iPad Safari.
