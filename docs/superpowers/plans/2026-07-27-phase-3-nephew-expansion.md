# Purple Cougar — Phase 3: Nephew Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> or superpowers:executing-plans to implement task-by-task. Read `CLAUDE.md` in full
> before touching anything — the camera gotcha, the billboard/rig split, and the
> WebAudio-only rule all apply here.

## Status (2026-07-27)

Not yet started via SDD — this plan was drafted and saved, then execution was
paused to conserve usage. Read this section first; it corrects/narrows the
phase text below based on what's actually in the repo right now.

- **Phase 2 is partially done already.** Commit `d3af173` (pushed to
  `phase-1` before this plan existed as a file) already implemented four of
  Phase 2's five ball checklist items in `src/ballView.ts`: matte
  dusty-orange ball material, wobbly hand-painted-style olive stripes, a
  bent-wire torus grommet/loop, and a semi-rigid coiled-wire cord (replacing
  the old floppy-rope cord). **Only the cuff item remains**: `src/cougar/quadruped.ts`
  (~line 553-566) and `src/cougar/materials.ts` (~line 38-39, `CUFF_RED =
  0xb5342a`) still use a plain red torus strap and reuse the eye-pupil
  material for velcro — neither matches the plan's brick-red fabric
  (`#8B2635`) + matte-black fuzzy velcro (`#161616`) + threaded ring spec.
  **When resuming: scope the Phase 2 SDD task to the cuff only**, not the
  full five-item list, to avoid re-doing/colliding with `d3af173`.
- **Reference photos are now in the repo at `docs/reference/`** (added
  2026-07-27, replacing the missing `IMG_3267.jpeg` reference): 
  - `ball-cord-cuff.jpeg` — the actual physical toy, matches what `d3af173`
    was tuned against. Use for the remaining cuff work (Phase 2) — note the
    cord in this photo also shows a small dark **knot at the cuff end**
    where the wire threads through, not just at the ball end.
  - `lake-sunset.jpeg`, `lake-path.jpeg`, `pond.jpeg`, `daisies-lake.jpeg`,
    `waterfall.jpeg` — Lake Lure–style water/mountain reference for the
    Phase 4 lake work (ROADMAP.md item 1) and general "bluff looking down at
    water" composition target.
  - `rhododendron.jpeg`, `knockout-roses.jpeg`, `garden-ref.jpeg` — garden
    bloom density/layering reference for Phase 4's garden-depth item.
  Point implementer/reviewer subagents at these files directly (paths, not
  descriptions) when their task touches ball/cuff, lake, or garden. Full,
  growing index with per-photo notes: `docs/reference/README.md`. Per
  `CLAUDE.md`, this reference bar now applies project-wide, not just to
  this plan.
- **No SDD workspace exists yet for this plan.** When resuming, use
  superpowers:subagent-driven-development, one task per phase (Phases 1-4;
  Phase 5 is a decision checkpoint for the owner, not a dispatched task —
  see that section below).

**Goal:** Deepen the existing Bouncing Ball Meadow for the actual audience — the
owner's nephew, who loves dinosaurs, snakes, puppies, animals generally, and this
purple cougar specifically, wants her roar loud and proud rather than soft, and
wants tapping the ball to escalate into something genuinely exciting, up to and
including fireworks. This is not a rebuild of what's working; it's five additions
layered onto the proven loop.

**Status of the base:** Per `ROADMAP.md`, the Meadow loop is real and verified —
wake → invite → tap/drag/fling → three bounces → ramp → bell → celebrate → free
play, at 1280×800 and 390×700, `npm run validate` green. This plan does not touch
that state machine's shape. It adds detail, a reward ladder, and world content on
top of it.

**Audience correction (explicit, from the owner):** earlier docs in this repo
(`docs/PRODUCT_VISION.md`, the rev-2 spec) were written for a generic "gentle,
never frightening" 3-year-old. The actual player is the owner's nephew, and the
brief has changed: he likes dinosaurs, snakes, and "scary stuff." **The roar
should be loud, proud, and a little fierce — not softened.** Where this plan
conflicts with the older gentleness language, this plan wins; the older docs
should eventually be reconciled but that's a docs cleanup, not blocking.

---

## The one real tension in this plan — decide before Phase 2 starts

`CLAUDE.md` is explicit: the hero character is **not** a rigged 3D mesh. It's
`heroBillboard.ts` — a camera-facing billboard image
(`purple-cougar-hero.webp`) deformed per-vertex to fake motion, with a tiny
invisible `quadruped.ts`/`behavior.ts` rig underneath driving physics/cuff
contracts only. There is no mouth/jaw mask and no second pose texture today.

"More realistic motion" (this request) and "an open-mouth roar frame" (needed
for a louder, prouder roar to actually *look* like it's roaring, not just
*sound* like it) both push against that ceiling. Three honest paths:

1. **Stay billboard, add frames.** Paint 2–3 additional deformable pose
   textures (open-mouth roar, mid-leap/pounce, alert-ears) and extend
   `heroBillboard.ts`'s reaction union past `'happy' | 'surprised' | 'roar'`.
   Cheap, on-brand with the existing visual language, bounded scope. Ceiling:
   she will never turn her body relative to camera; every pose is a flat
   deformation.
2. **Full articulated rig.** Replace the billboard with real skinned geometry
   driven by `quadruped.ts`'s joint hierarchy (which is already invisible
   plumbing today — the bones exist, they're just not rendered). This is the
   "real 3D motion" answer and the only path to a genuine pounce/leap arc or
   turning to face a flung ball. It is also a framework-scale rewrite of the
   character, explicitly the kind of decision `ROADMAP.md`'s parking-lot rule
   says needs owner sign-off before starting.
3. **Hybrid:** keep the billboard as the default idle/tracking pose (it reads
   well and is cheap), but swap to a small number of authored 3D pose shots
   for the highest-value beats only — the roar and the celebration pounce.
   Middle cost, middle ceiling.

**This plan assumes path 1 for Phase 1 below** (bounded, ships fast, unblocks
the roar-realism ask immediately) **and treats path 2/3 as a separate future
decision**, not started here. Flag it back to the owner once Phase 1–3 below
are live and felt in Chrome — the fireworks/combo system and ball realism will
change what "the motion feels flat" actually means in practice, and that's the
right moment to decide if the rig rewrite earns its cost.

---

## Phase 1 — Roar: loud, proud, and seen

**Files:** `src/audio.ts`, `src/cougar/heroBillboard.ts`, `src/cougar/behavior.ts`

- [ ] Re-tune the existing synthesized roar (`audio.ts` already has detuned
      oscillator stack, pitch-arc attack, formants, growl tremolo, convolution
      reverb — per `ROADMAP.md` this is real, not a placeholder). Push
      amplitude, lower the formant center slightly, and lengthen the growl
      tremolo tail so it reads as *proud*, not cute. Keep it non-startling —
      "fierce and thrilling" is the target, not actually scary; the owner
      wants excitement, not distress.
- [ ] Paint one open-mouth roar pose texture and wire it into
      `heroBillboard.ts`'s existing reaction union (already has `'roar'` as a
      state — today it likely reuses the closed-mouth base pose; give it its
      own texture/deformation). Update `assertReaction()` and `behavior.ts` in
      the same pass — `CLAUDE.md` calls out this union is duplicated across
      both files and both need touching together.
- [ ] Add a camera micro-punch (brief FOV pull or dolly-in, <300ms, eased) on
      roar trigger so it reads as a moment, not a sound effect layered over an
      idle pose.
- [ ] Verify: trigger via `window.__pc.roar()`, screenshot mid-roar at both
      viewports per the `CLAUDE.md` verification loop (the timing note about
      `browser_run_code_unsafe` for one-shot triggers applies directly here).

## Phase 2 — Ball and cord: match the physical toy

Full detail spec already written (from the reference photo,
`IMG_3267.jpeg`) — implement it as follows. **Files:** `src/constants.ts`,
`src/physics.ts`, `src/ballView.ts`, `public/assets/`.

- [ ] **Ball material:** matte-to-semi-gloss orange (`#E27B3A`–`#E58045`, not
      saturated cartoon orange), soft specular highlight via
      `MeshStandardMaterial` roughness/metalness tuning — stay inside the
      project's `flatShading: true` low-poly language per `CLAUDE.md`; this is
      a color/roughness correction, not a shading-model change.
- [ ] **Stripes:** 3 thin dark-olive stripes (`#4F6B2E` range) with
      hand-painted asymmetry — wandering paths, uneven width, not perfect
      procedural meridians. Bake as a texture, not a shader-generated pattern,
      so the asymmetry is authored once and stays deterministic (matches the
      project's `makeRng(seed)` determinism rule).
- [ ] **Grommet:** small real geometry (bent torus/hook) at the top pole where
      the cord exits — currently likely a flat decal per the reference photo
      comparison; needs actual silhouette geometry since it's visible at most
      play-camera angles.
- [ ] **Cord — the highest-value fix.** The reference cord is semi-rigid
      coated wire, not floppy rope: it holds open loops and a tight spiral
      even lying slack. If `ballView.ts`'s slack-state cord is currently a
      simple catenary/spline between two points (check before assuming), that
      reads wrong next to the photo. Replace with either a stored rest-curl
      spline blended against the taut state, or enough control points to fake
      a persistent kink. This interacts with `physics.ts`'s existing
      slack/taut constraint (already real position-based dynamics per
      `constants.ts` — `CORD_LENGTH`, `CONSTRAINT_ITERATIONS`, etc.) — the
      physics doesn't change, only how the slack cord is drawn.
- [ ] **Cuff:** brick-red fabric (`#8B2635`) with a matte black velcro patch
      (`#161616`, fuzzy-edged loop texture, not flat plastic) and a small
      threaded ring where the cord knots through. Skip the partial logo/text
      visible in the reference photo — not worth replicating, risks reading as
      a real brand mark.
- [ ] Verify: isolate ball+cuff+cord at `ballView.ts`'s default camera
      distance, screenshot, compare side-by-side against `IMG_3267.jpeg`
      before touching anything else.

## Phase 3 — Escalating excitement: combo ladder and fireworks

**Files:** `src/playDirector.ts`, `src/counter.ts`, `src/audio.ts`, new
`src/worlds/fireworks.ts`.

The existing loop already has "three bounces → ramp → bell → celebrate" as a
fixed sequence. This phase adds a *replayable* excitement ladder on top of
free play, using the same typed-event pattern `playDirector.ts` already emits
— not a new state machine, an extension of the existing one.

- [ ] Define a streak counter (consecutive clean ball hits/bounces without a
      miss/bonk, decaying after an idle gap) alongside the existing cumulative
      lifetime counter in `counter.ts`. Cumulative total still never resets —
      that product rule stays; the streak is a separate, resettable value.
- [ ] Tiered reactions on streak thresholds (exact numbers are a tuning pass,
      first cut: 3 / 6 / 10):
  - Low tier: existing happy reaction + particle burst, louder each step.
  - Mid tier: roar (Phase 1's proud version) + camera punch.
  - High tier: **fireworks** — a new `src/worlds/fireworks.ts` following the
    existing world-module contract (`{ root, update, dispose }`,
    `makeRng(seed)` for launch timing/spread, no `Math.random()`). Particle
    bursts in the sky above the Meadow, synthesized crackle/boom via
    `audio.ts` (WebAudio only — no audio files, per `CLAUDE.md`), 2–4 seconds,
    then dispose cleanly.
- [ ] A miss/bonk does not reset the lifetime counter (unchanged) and only
      partially decays the streak rather than zeroing it outright — matches
      the existing "no fail state" rule; a miss should feel like a beat, not a
      penalty, especially for a kid who explicitly likes intensity, not
      punishment.
- [ ] Verify via `window.__pc.stepPhysics()`/`fling()` to drive a scripted
      streak in a QA hook, screenshot the fireworks burst at both viewports,
      confirm no console errors on rapid repeated triggers (mashing must not
      stack fireworks instances — reuse/pool, don't spawn unbounded).

## Phase 4 — World: garden, weather, and animal life

This phase **extends, and partly reorders, `ROADMAP.md`'s existing "Focus
now" list** (lake → white squirrel → garden → scenery → sunset) rather than
replacing it. Do not duplicate work already scoped there.

- [ ] **Garden depth** (already item 3 on the roadmap) — proceed as specified
      there: more layering, living detail (bee, hummingbird, butterflies tied
      to specific blooms), a small reachable vegetable/fruit bed. Keep every
      new plant on the `plants[]` array with real species + common name — the
      teaching-accuracy rule in `CLAUDE.md` is a hard constraint, not a nice-
      to-have.
- [ ] **New real-animal cameos, in the same spirit as the white squirrel:** a
      garter snake sunning on the stone path (real to WNC, satisfies "loves
      snakes" without inventing anything), a rabbit or box turtle in the
      garden bed, birds already scoped under roadmap item 4. A puppy/dog
      friend is plausible as a companion character (real, ownable, teachable)
      but is a bigger scope item — new rig or billboard, new behavior file —
      flag as its own future plan rather than folding it in here.
- [ ] **Wind:** cheap and high-value — the garden/meadow plant sway likely
      already has some procedural motion (verify in `wncGarden.ts`); extend it
      to a shared wind direction/gust system so trees, grass, and the ball's
      idle cord all respond to one coordinated force rather than independent
      per-module noise. This also gives the cord's slack state (Phase 2)
      something to react to at rest.
- [ ] **Rain:** scope as a second weather state behind a simple toggle, not a
      live simulation — a particle-sheet shader plus wet-look material swap on
      ground/leaves, paired eventually with the sunset work (roadmap item 5)
      as "time and weather variants" of the same golden-hour scene rather than
      two unrelated systems.
- [ ] **Dinosaur — flag, don't build yet.** The nephew loves dinosaurs, but
      `CLAUDE.md`'s entire garden/scenery identity is built on *real* WNC
      species and places as a teaching tool — a literal dinosaur in the
      Meadow breaks that internal logic (there have been no dinosaurs in
      Brevard for about 66 million years). Two honest options: (a) a dinosaur
      **toy** as a set-dressing prop near the play area — in-world object, not
      a living creature, keeps the real-nature rule intact — or (b) treat
      "dinosaur" as a separate future zone/fantasy pocket, explicitly outside
      the WNC-realism contract, the way the parking lot already treats Splash
      Pool/Vehicle Yard as future zones. Don't default into either without the
      owner picking.

## Phase 5 — Motion realism decision point

Revisit the billboard-vs-rig tension flagged at the top of this plan, now
that Phases 1–4 are live and felt in Chrome. Specifically decide:

- Does the roar pose texture (Phase 1) and the fireworks/combo excitement
  (Phase 3) close enough of the "feels flat" gap that the billboard approach
  is good enough for now?
- Or does the ball's new physical fidelity (Phase 2) make the cougar's flat
  reaction to it more obviously wrong by contrast, justifying the rig
  rewrite?

This is a real go/no-go conversation, not a task — don't pre-decide it here.

---

## Global constraints (unchanged, restated because they bind every phase)

- **Boyd controls all pushes.** Commit freely; never `git push` without being
  asked.
- **Chrome-verified, not source-inspected.** Every phase above ends with a
  live screenshot at 1280×800 and 390×700 per `CLAUDE.md`'s verification loop,
  not a claim based on reading the diff.
- **WebAudio synthesis only** — no audio files, ever, for the roar retune or
  the fireworks crackle/boom.
- **Determinism** — any new randomness (stripe wander, wind gusts, firework
  spread) goes through `makeRng(seed)`, never raw `Math.random()`.
- **One polished system at a time** — the phases above are ordered by
  dependency and cost, not by importance; don't start Phase 3 before Phase 1
  is verified in Chrome, per the project's own operating rule.
- **Species/place accuracy stays non-negotiable** for anything added to
  `plants[]` or presented as "real" — the dinosaur flag in Phase 4 exists
  because of this rule, not despite it.

## Done when

- Each phase has its own Chrome evidence (screenshots at both viewports,
  console clean, `npm run validate` green) before the next phase starts.
- The roar is loud, proud, and has a visible open-mouth beat, not just a
  louder version of the same flat pose.
- The ball, cuff, and cord read as the same object as `IMG_3267.jpeg` at a
  glance, not just "the right colors."
- Tapping the ball has a felt ladder — a kid can tell the difference between
  hit #1 and hit #10 without being told, and fireworks feel earned, not
  random.
- The billboard-vs-rig decision in Phase 5 has been made explicitly, not
  drifted into.

## Not in this plan

- The full articulated rig rewrite (Phase 5 decides *whether*, not *how*; a
  yes gets its own plan).
- The puppy/dog companion character (flagged in Phase 4 as its own future
  scope).
- Splash Pool, Vehicle Yard, Train ride, or any zone-selector UI — still
  explicitly out per `ROADMAP.md`'s parking lot.
- Reconciling `docs/PRODUCT_VISION.md`'s "never frightening" language against
  the audience correction at the top of this plan — worth a docs pass
  eventually, not blocking implementation.
