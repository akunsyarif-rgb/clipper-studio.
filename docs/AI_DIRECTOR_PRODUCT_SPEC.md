# AI Director — Product Specification v1.0

Status: proposed product baseline  
Scope: configuration and behavior specification; not a code implementation  
Product: Clipper Studio, mobile-first and local-first video creation for iPad/iPhone Safari

## Product intent

AI Director turns a user's script and natural-language creative direction into an editable storyboard and a rendered video. The user defines the message and creative intent; AI plans scenes; the deterministic Scene Engine and Motion Engine execute that plan.

## Default configuration

- Goal: Education
- Visual style: Cinematic
- Motion: Dynamic, purposeful
- Narration: AI voice-over
- Primary format: vertical 9:16, 1080x1920, 30 fps
- Editing model: automatic first draft plus natural-language revision
- Rendering: browser-local when supported; report constraints and offer a compatible fallback
- Review: storyboard review optional; factual educational content should support source review
- Production safety: no direct changes to main or production deployment without review and approval

## Core user inputs

1. Script (required): preserve original wording unless the user authorizes rewriting.
2. Creative prompt (optional): mood, audience, visual direction, pace, references, and constraints.
3. Supporting assets (optional): user-owned/permitted footage, images, logos, fonts, audio, and source documents.
4. Output settings: aspect ratio, resolution, duration target, language, voice, and caption preference.

If non-critical details are missing, use visible defaults. Ask for clarification when missing information affects factual accuracy, rights, or the core creative intent.

## AI Director responsibilities

- Analyze topic, audience, learning objective, key concepts, terminology, and narrative structure.
- Plan hook, explanation, example, comparison/process, summary, and CTA only when appropriate.
- Assign a visual intent to each scene, not merely a template name.
- Specify composition, assets, typography, motion, timing, transitions, narration, and continuity.
- Use available components and assets only; never claim an unavailable asset was used.
- Return a structured plan that can be inspected, revised, saved, and deterministically rendered.
- Explain unsupported instructions and offer alternatives instead of silently ignoring them.

## Scene plan contract (conceptual)

Every scene should specify:
- id and order
- narrationText (the spoken words; exclude production notes and storyboard labels)
- narrativeRole and learningPurpose
- compositionFamily and layout
- visualAssets (with source/availability/rights metadata where relevant)
- typography (headline, emphasis, caption policy, safe area)
- motion (entrance, emphasis, hold, exit)
- timing (duration, narration alignment, pauses)
- transitionIn and transitionOut
- audio (voice segment, music behavior, ducking)
- continuity (elements inherited, changed, or intentionally reset)
- validation expectations

Do not mix narration with internal directions, production notes, test instructions, or scene headings. These belong in storyboard metadata, never in spoken text or rendered captions unless explicitly requested.

## Visual direction standards

- Hook: one strong focal point, readable headline, decisive entrance.
- Explanation: visual evidence or a clear metaphor that helps understanding.
- Steps/process: ordered reveal with persistent spatial relationships.
- Comparison: genuinely distinct and labeled sides; don't rely only on color changes.
- Summary: coherent recap and a clear ending; CTA only if appropriate.
- Each scene's composition must serve its semantic purpose.
- Adjacent scenes should have intentional continuity or an intentional visual reset.
- Avoid a repeated template for every sentence unless requested.
- Never add decorative motion that reduces legibility or misrepresents meaning.

## Dynamic motion standards

Supported motion vocabulary may include reveal, push-in, parallax, kinetic typography, sequential motion, match transition, impact transition, and hold/settle. Motion is selected by meaning and pacing, not applied uniformly.

- Keep text readable and within safe areas.
- Avoid gratuitous transitions.
- No accidental empty or overly dim frames between contiguous scenes.
- Fade behavior must account for sequential (non-overlapping) scenes.
- Use reduced-motion preferences where feasible.

## AI voice-over and audio

- Voice, language, pronunciation, pace, and pauses must fit the content.
- Narration is the timing source of truth when audio exists.
- When voice duration changes, adjust scene timing rather than abruptly truncating speech.
- Music should support the narration; duck music during speech when enabled.
- Detect failed or missing audio and present a clear recovery path.
- Avoid captions that duplicate a persistent headline without a clear reason.

## Caption policy

- Distinguish headline, supporting on-screen text, and synchronized spoken captions.
- If a composition already displays the complete narration as a dominant headline, do not automatically duplicate the same sentence in a second caption bar.
- For longer speech, use concise synchronized phrase captions when they add value; otherwise allow captions to be disabled.
- Captions must have contrast, appropriate line breaks, safe margins, and timing aligned to speech.

## Natural-language revision

Users may request changes such as:
- "Make scene 2 more dynamic."
- "Change all backgrounds to dark blue."
- "Improve subtitle readability."
- "Keep the narration unchanged."
- "Make the ending stronger."

Each revision must define its scope (selected scene, selected range, or global), summarize changes, preserve the previous version, and support undo. Global changes must not unintentionally alter locked content.

## Quality gate

Before export, validate where technically possible:
- empty/dim unintended frames
- text clipping and safe areas
- narration/caption timing
- duplicate headline/caption content
- missing or unavailable assets
- composition variation and continuity
- audio clipping and music masking
- total duration and output dimensions
- render errors and browser/device constraints

A successful plan is not proof of a successful render. The actual rendered output must be inspected or validated before being marked ready.

## Privacy, rights, and reliability

- Tell users when script/assets will be sent to an external AI service.
- Respect source/asset licensing and user-provided usage constraints.
- Preserve educational source references where provided; flag unsupported claims for review.
- Save draft/storyboard versions and recover work after tab closure or rendering failure where feasible.
- Prefer local processing, but communicate when browser memory or codec limitations require a fallback.

## Acceptance criteria for v1

1. A script plus creative prompt yields an editable, structured storyboard.
2. Scene composition follows narrative purpose; changes are not limited to color or text.
3. Production notes and scene labels never become narration by accident.
4. Headline/caption duplication is avoided unless intentionally configured.
5. Audio timing changes propagate to scene timing.
6. Revisions can target one scene or the whole project and can be undone.
7. Missing assets, unsupported requests, and render failures are reported clearly.
8. Actual preview/export is checked for legibility, timing, transitions, audio, and dimensions.
9. iPad/iPhone Safari is included in validation.
10. Main and production deployments remain untouched until reviewed and explicitly approved.

## Recommended delivery order

1. Stabilize scene data contract and visual mapping.
2. Fix caption duplication and transition gaps.
3. Add deterministic scene-plan preview and validation.
4. Add prompt-to-storyboard AI planning.
5. Add scoped AI revisions and version/undo.
6. Improve asset selection, voice-over timing, and export validation.
