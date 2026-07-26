# Purple Cougar — Design

**Date:** 2026-07-26
**Status:** Approved, pre-implementation

## What it is

A 3D web toy for a 3-year-old boy. A purple cougar stands upright with a skip-ball
cuffed to one ankle — an orange ball with blue stripes on a cord. The ball swings
around him forever. Tap anywhere on the screen and he hops the cord.

He loves dinosaurs, balls, swimming, pools, and race cars. The toy is built out of
those things.

Siblings: `67cupcake` (Vite/TS, tested) and `Watermelonboy` (authored-GLB character
pipeline). This borrows the stack from the first and the character pipeline from the
second.

## Audience constraints

These are hard requirements, not preferences. Everything below follows from them.

- **He cannot read.** No text carries meaning. All affordances are pictures, motion, or sound.
- **He cannot lose.** No game over, no score reset, no fail state, no timer.
- **He will mash the screen.** Mashing must feel good and must never be punished.
- **His aim is bad.** The primary control is the entire screen. Secondary controls are
  giant icon buttons.
- **He will get bored.** The world changes on its own without him asking.

## Core loop

1. The ball orbits his ankle continuously. The cord sweeps low across the front once
   per revolution.
2. Tap anywhere → he hops.
3. Cord passes under him while he's airborne → **clear**: whoosh, the counter climbs,
   he grins.
4. Cord catches his foot → **bonk**: he tumbles over in a heap, the ball flops and
   rolls, he shakes it off, and the ball starts spinning again.

**The counter never resets.** It is a cumulative lifetime hop count persisted to
`localStorage`. It only ever goes up. This is the whole no-fail promise in one number.

Every 10 clears he travels to a different world with a cheer.

## Skip-ball model

Not rope physics. A cartoon orbit that is cheap, deterministic, and testable.

- He stands upright on his hind legs — anthropomorphic, cartoon-styled. A quadruped
  can't use a Skip-It, and a biped rig is far simpler to author.
- Cuff on the right ankle. Ball orbits at radius `L`, in a plane roughly parallel to
  the ground with a slight tilt so it reads in 3D.
- Orbit angle `θ` advances at `ω`. The cord is a tube from ankle to ball.
- The cord sweeps past the free (left) foot at a fixed angle `θ_pass`, in front of him.

### Hop resolution

```
tap at t_tap
  → hop begins, total duration HOP_DUR (0.45s)
  → free foot airborne over [t_tap + 0.10, t_tap + 0.35]

t_cross = next time θ reaches θ_pass

clear  if t_cross ∈ airborne window
bonk   otherwise
```

This is pure math over `(θ, ω, t_tap)` with no scene dependency, so it unit-tests
directly.

### Mash handling

- Taps during an active hop are ignored, except within the last 0.15s, which buffers
  the next hop so held rhythm feels responsive.
- Mashing therefore produces near-continuous hopping, which clears most passes by
  luck. That is the intended outcome, not a bug to fix.

### Speed

- Base period `T = 1.4s` per revolution — deliberately slow.
- Ramps gently with consecutive clears: `T -= 0.0225` per clear, floored at `0.95s`.
- Resets to base on a bonk.

### Bonk recovery

Tumble clip (~1.2s) → ball drops and rolls → 0.8s beat → ball respins from rest,
`ω` eases back to base over 0.6s. The counter is untouched. Streak resets, which
only affects speed.

### Tunables

Every number above lives in one exported constants block. The correct difficulty for
a 3-year-old is whatever we observe him actually landing, so all of it is expected
to change after the first real play session.

| Constant | Start | Note |
|---|---|---|
| `HOP_DUR` | 0.45s | full hop |
| `AIRBORNE` | [0.10, 0.35] | clear window |
| `BASE_PERIOD` | 1.4s | per revolution |
| `MIN_PERIOD` | 0.95s | speed floor |
| `RAMP_PER_CLEAR` | 0.0225s | speed ramp |
| `BUFFER_WINDOW` | 0.15s | late-tap buffer |
| `TRAVEL_EVERY` | 10 clears | world rotation |

## Character

Authored GLB, generated deterministically by `tools/build-character.mjs`
(`@gltf-transform`), validated by `npm run validate:character`. Same approach as
Watermelonboy, because a rigged hopping character is the hard part of this build and
hand-rolling one from three.js primitives is misery.

- **Rig:** root, spine, head, tail, two arms, two legs. Ankle cuff is a rig node so
  `skipball.ts` can attach the cord to it.
- **Clips:** `Idle`, `Hop`, `Land`, `Tumble`, `Cheer`, `Look`.
- **Look:** purple fur, big friendly eyes, cartoon proportions, toon-ish shading. Cute
  and funny, never menacing.
- **The ball and cord are procedural**, driven in code — only the ankle cuff is
  authored into the GLB.

Node names must avoid dots. (Watermelonboy hit a three r128 GLTFLoader bug that strips
them; modern three via npm doesn't, but the convention costs nothing.)

## Worlds

`World` is an interface so adding a fourth is a file, not a refactor:

```ts
interface World {
  id: string
  build(scene: Scene): void
  update(dt: number, state: GameState): void
  objects: NamedObject[]   // { slug, label, node }
  palette: Palette
  ambience: AudioCue
}
```

Three worlds ship in v1:

- **🦕 Dino jungle** — friendly cartoon dinosaurs bobbing and stomping behind him,
  ferns, warm green light.
- **🏊 Pool** — deck, floatie ring, bright blue water; every hop kicks up a splash.
- **🏎 Race track** — cars zooming past, checkered flags, tire stacks.

Travel happens automatically every 10 clears via a crossfade — he keeps hopping right
through it. Three giant icon buttons sit on screen the entire time so he can also just
pick. Set dressing uses a seeded RNG so every load is identical and screenshot QA is
stable.

### `NamedObject` — the seam

Every meaningful set piece is tagged `{ slug, label, node }`. Nothing in v1 reads
these. It is one line per object and it is what the deferred word layer needs, so it
goes in now.

## Explicitly deferred

Not in v1. Both have a clean seam already designed in; neither should be built until
he's actually played the toy.

**Word teaching.** The plan, when it happens: a voice counts every hop out loud, and
every 5th hop the action pauses ~2s while the camera pushes in on one real scene
object, which wiggles while its name appears large and is spoken twice. Naming things
that are actually in his world beats flashcards and needs no card art. Seams that
exist for it: `NamedObject` tags, and `camera.ts` push-in.

Voice would be `speechSynthesis` with a per-slug recorded-clip override
(`assets/voice/<slug>.mp3` wins if the file exists). Recording clips is a real chore
and is not worth it until the toy has proven itself. Note that voice is not severable
from word teaching — a non-reader gets nothing from a silent card.

**A scary beat.** Deliberately not built. Tone for v1 is sunny, cute, funny. If it
ever happens it slots into the spotlight system as a crouch → pounce → roar-that-
becomes-a-kitten-mew → flop, with a tunable 0–1 intensity.

## Stack

- Vite + TypeScript, three.js via npm
- vitest (unit) + playwright (e2e)
- iPad touch-first, full-bleed, portrait and landscape; click + spacebar stay wired for
  Mac QA
- GitHub → Vercel auto-deploy on `main`

```
purple-cougar/
  index.html
  src/
    main.ts          bootstrap, rAF loop, resize, input
    gameplay.ts      hop state machine, streak, counter, persistence
    skipball.ts      orbit sim, cord geometry, pass detection
    cougar.ts        GLB load, clip playback, rig access
    camera.ts        framing, shake, push-in
    named.ts         NamedObject tagging
    audio.ts         SFX bus
    ui.ts            counter + three world buttons
    worlds/
      world.ts       interface, registry, travel crossfade
      dino.ts  pool.ts  race.ts
  tools/
    build-character.mjs      authors assets/purple-cougar.glb
    validate-character.mjs   contract check
    capture.mjs              screenshot QA harness
  assets/purple-cougar.glb
  test/   e2e/
```

## Testing

**Unit (vitest)** — the hop math is the highest-value target and is pure:

- clear/bonk resolution across the full phase space of `(θ, ω, t_tap)`
- late-tap buffering behavior
- speed ramp and floor
- bonk recovery restores base period, leaves counter untouched
- counter persistence round-trip
- world rotation cadence

**E2E (playwright)** — boots without console errors; canvas renders; tap produces a
hop; counter increments; counter survives reload; world button switches world; auto
travel fires at 10.

**Visual** — `tools/capture.mjs`, standalone `playwright-core` with its own headless
Chrome, shots to `~/agents/screenshots/purple-cougar/`.

### Environment gotchas carried over from the sibling repos

- **`--use-angle=metal` is required** in `launchOptions.args` on darwin, or headless
  Chromium silently falls back to SwiftShader at ~3fps and every rAF-driven wait times
  out. This turned 67cupcake's entire e2e suite red once. Always check the pre-change
  baseline before blaming new work for e2e failures.
- **`capture.mjs` must launch its own browser**, not the shared `ms-playwright-mcp`
  profile, which locks when another Claude session holds it. Never kill the other
  session's Chrome.
- **Brave blocks WebGL** via Shields — the character won't render. Chrome only.
- Run implementers sequentially, or give each a worktree. Parallel agents committing
  to a non-worktree repo detached HEAD on 67cupcake.

## Deploy

GitHub `boydcroberts/purple-cougar` → Vercel, target `purplecougar.vercel.app`.
**Boyd controls all pushes.** Nothing is pushed without him saying so.

## Build order

Playable in his hands as early as possible.

1. **The toy.** Scene, skip-ball sim, tap-to-hop, clear/bonk, counter, rough primitive
   cougar. This is already the entire experience.
2. **The character.** Swap in the authored GLB with real Hop/Land/Tumble/Cheer clips.
3. **The worlds.** World interface, dino/pool/race, travel crossfade, icon buttons.
4. **The juice.** Audio, splashes, dust, camera shake, tumble comedy, landing squash.
5. **Deploy.**

Phase 1 is the gate that matters: if the hop doesn't feel good with a cube for a
cougar, no amount of art fixes it.

## Open

- Difficulty tunables are guesses until he plays. Expect to revise the whole table.
- Whether the word layer ever ships is a decision to make after watching him, not now.
