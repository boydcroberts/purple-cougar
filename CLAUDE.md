# Purple Cougar — Project Instructions

## Mission

Purple Cougar is a touch-first 3D play world for a child a little over three,
set in a lovingly detailed **Western North Carolina** landscape: layered Blue
Ridge mountains at golden hour, a mountain lake, and a lakeside garden in full
bloom. The star is a lovable purple cougar and her tethered ball.

This is not generic cartoon scenery. The owner lives in WNC, loves nature, and
wants to use this world to teach his nephew to recognize real things: real
mountains, a real lake, real native plants (Shasta daisy, Knock Out rose,
Catawba rhododendron, mountain laurel, Christmas fern), and a real regional
in-joke (the white squirrels of Brevard, NC). Beauty and botanical/geographic
accuracy are both product requirements, not polish to add later. When in
doubt, prefer the real WNC reference over an invented shape.

It is not a score-chasing game, an ad surface, or a tech demo. See
[ROADMAP.md](ROADMAP.md) for what's built and what's next.

**The bar for nature/scenery/beauty is high, everywhere, always** — not just
where a plan explicitly calls it out. [docs/reference/](docs/reference/) has
the owner's real WNC photos (lake, sky, garden, an animal cameo) as the
visual target; it grows over time. When tuning or reviewing any scenery,
lighting, water, or garden work, check it against those photos before
calling it done, not against taste alone.

## Stack and commands

Vite + TypeScript + vanilla three.js (~0.185). No framework, no state
library, no build tool changes without a demonstrated need.

    npm run dev         # http://localhost:5183
    npm run validate    # tsc --noEmit + vitest — run before calling anything done
    npm run build
    npm run e2e          # Playwright config exists; e2e/ has no specs yet

## Architecture

- `src/main.ts` — the frame loop, input, story wiring. Owns scene composition:
  it directly instantiates and adds every world module (there is no generic
  world manager — see Gotchas).
- `src/cougar/` — the character. `heroBillboard.ts` is a camera-facing
  billboard image (`public/assets/purple-cougar-hero.webp`) deformed
  per-vertex to fake 3D motion; `quadruped.ts`/`behavior.ts` are a tiny
  invisible rig underneath that drives physics/cuff/behavior contracts. There
  is no mouth/jaw mask and no second pose texture — an open-mouth roar frame
  would need one.
- `src/worlds/` — render-only scene modules (meadow, backdrop, trees, garden,
  stone path, white squirrel). Every module follows the same contract:
  `{ root: Group, update(elapsedSeconds, deltaSeconds), dispose() }`. `root` is
  never added to the scene by the factory — the caller (`main.ts`) owns
  placement and lifecycle.
- `src/audio.ts` — **100% WebAudio synthesis, zero sound assets.** Every sfx is
  built from oscillators/noise/filters/convolution at runtime. Follow this
  pattern for new sounds; do not introduce audio files.
- `src/playDirector.ts` — the story state machine (sleeping → waking → invite
  → playing → ramp-ready → celebrating → free-play). Emits typed `PlayEvent`s
  that `main.ts` turns into behavior/sound/UI.

## Gotchas (read before touching scenery or the character)

- **The follow camera does not sit where you'd guess.** It rests near
  `(1.7, 0.95, 1.84)` at runtime, not the authored `(2.35, 1.02, 3.05)` in
  `scene.ts`. Positioning new landmarks against the authored constants places
  them wrong. Use the `window.__pc.project(x, y, z)` QA hook (returns NDC
  `[-1..1, -1..1]`) to measure real screen position before placing anything,
  and `window.__pc.cameraPos()` to read the live camera. This cost an entire
  session of trial and error before it was built — don't skip it.
- **`World` interface is a decoy.** `src/worlds/world.ts` defines a `World`
  contract (`WorldId`, `WorldPhysics`, etc.) that **nothing implements**.
  `main.ts` hardcodes every module directly. The roadmap wants ONE connected
  park, never a world-selector menu — don't build zone-switching UI.
- **Determinism:** every world module uses `makeRng(seed)` from `world.ts` for
  layout randomness. Never call `Math.random()` in a world module — same seed
  must produce the same layout.
- **Dispose must be real and idempotent:** traverse `root`, collect
  geometries/materials into `Set`s, dispose each once, guard re-entry with a
  `disposed` flag. Copy the pattern in `meadowSlice.ts`/`wncGarden.ts`.
- **Reaction kinds are a closed union** (`'happy' | 'surprised' | 'roar'`)
  duplicated across `behavior.ts` (procedural rig) and `heroBillboard.ts`
  (billboard). Adding a fourth reaction means touching both, plus
  `assertReaction()`.
- **Low-poly, `flatShading: true` MeshStandardMaterial** is the whole-project
  visual language — golden-hour warm palette, charming but not crude. Match
  it; don't introduce photoreal materials or a different shading model in one
  module.
- Style: comment only to explain a non-obvious WHY (a measured value, a bug
  that was fixed, a constraint). Never narrate what the next line does.

## Verification loop

There is no Chrome-extension blocker anymore — verify visually every time:

1. `npm run validate` first (typecheck + 33 vitest tests).
2. Playwright MCP: navigate to `http://localhost:5183`, screenshot at
   **1280×800** (desktop) and **390×700** (phone/portrait).
3. For anything timed (roar, train crossing, squirrel dash), use
   `browser_run_code_unsafe` to trigger it and wait inside one Playwright call
   — separate tool calls have enough latency to miss the window entirely.
4. `window.__pc` is the QA hook surface (see `main.ts` for the full list):
   `tap()`, `roar()`, `squirrelDash()`, `project()`, `cameraPos()`,
   `phase()`, `stepPhysics()`, `fling()`, `setCameraAzimuth()`.
5. Never claim a visual change is "fixed" or "looks great" without reading the
   actual screenshot back.

## Product rules (carried forward from the original brief)

- The child does not need to read, aim precisely, compete, wait through a
  timer, or recover from a failure state.
- No advertising, purchases, chat, external links, or child data collection.
- Only repository-authored assets. No downloaded/unlicensed models, textures,
  sound, or character likenesses.
- Audio begins only after a real user gesture; respects the stored mute
  setting.
- Species/place names used for teaching (garden `plants[]`, mountain names,
  etc.) must be botanically/geographically real — this is a teaching tool for
  a real WNC kid, accuracy is part of the charm.
