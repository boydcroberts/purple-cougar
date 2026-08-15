# Technical Plan

## Decision: evolve the current stack

Retain the existing Vite + TypeScript + vanilla three.js architecture. The
repository already has a useful pure-physics seam and a lightweight renderer;
a React or engine rewrite would delay the hero, interaction, and Chrome quality
work without solving the current product gaps. Introduce new modules beside the
existing code, migrate one responsibility at a time, and delete obsolete
prototype paths only after replacement behavior is proven.

## Current technical audit (source-level)

| Concern | Current evidence | Implication |
| --- | --- | --- |
| Build/runtime | Vite 8, TypeScript 7, three.js 0.185; npm run validate, build, and e2e scripts are defined. | Preserve the toolchain unless a measured blocker appears. This document does not claim the commands passed during this audit. |
| Simulation | src/physics.ts is a pure tethered-particle simulation over plain objects. It uses fixed-step callers, gravity, exponential drag, cord/ground constraints, bounce, friction, speed cap, and rest state. | Keep physics independent of three.js and deterministic for a given input trace. |
| First-slice story | src/playDirector.ts now has a pure, no-fail BouncingBallDirector for sleep, wake, invitation, ball play, three bounces, ramp, bell, celebration, train tease, and free play. | This is an important unit-tested story seam; it is not proof of visual/audio quality. |
| Frame loop | src/main.ts owns a 1/120 s accumulator with a delta-time cap, story-event wiring, ball/ramp/bell plumbing, and a QA hook. | Preserve fixed-step simulation; add interpolation/explicit render state only if visual evidence justifies it. |
| Character | src/cougar/quadruped.ts procedurally creates an organic four-legged mesh grouping and exposes a cuff anchor/world position. src/cougar/behavior.ts adds procedural mood, gaze, tail/ear, and reaction layers. | Useful in-progress foundation, but not a demonstrated final rig, authored animation set, or final hero asset. |
| Rendering/camera | src/scene.ts has renderer/shadows, camera, ground, lights, and post-processing. src/cameraController.ts adds a gentle ball-aware follow-camera controller. | Do not infer quality or frame rate until Chrome visual/performance review. |
| Meadow | src/worlds/meadowSlice.ts provides an in-progress Meadow group, ramp, bell detection/animation, and distant train tease. | It supports M1 staging but does not make a final park or prove common-angle readability. |
| Ball view | src/ballView.ts creates a code-generated orange/green ball, knot, black sagging cord, and current invite/celebration presentation hooks. | Preserve the actual-toy visual contract while profiling per-frame allocation and geometry churn. |
| Input/UI/audio | src/main.ts gates the opening through the story director; the invited “ball tap” is currently story-phase input across the forgiving playfield rather than a ball raycast, and ball play uses bounded direct kick() impulses for tap/drag. src/playUi.ts provides temporary child-facing symbol/assistive feedback and sound toggle. src/audio.ts synthesizes effects/narration hooks. | Add a generous visible ball hit region with a no-fail fallback, then mature gesture semantics, visual language, settings, narration, and audio mix without returning to a giant score UI. |
| Worlds | src/worlds/world.ts defines future World, physics override, named-thing, and deterministic RNG contracts. | Evolve it into seamless connected zones rather than a text-heavy world picker. |
| Tests/QA | Unit tests now cover counter, core ball physics, cougar behavior, and the story director. Playwright config and tools/capture.mjs exist; no e2e spec was found in the static audit. | Add behavior/e2e/performance tests and direct Chrome evidence before release claims. |

## Product gaps that must not be disguised as polish

The new director, Meadow, behavior, and camera modules implement a coherent
first-slice path in source. They do not yet demonstrate final character
direction, authored animation quality, ball awareness under all outcomes,
navigation, parent settings, full park zones, device performance, or visual
delight. Treat these as systems to prove—not effects to layer over a demo.

In particular, the current “ball-tapped” story event is phase-gated rather than
the result of a rendered-ball hit test. That is an appropriate temporary
forgiving-input scaffold, but the M1 interaction must ultimately make the ball
the obvious visual invitation while preserving a generous miss/fallback path.

Likewise, the current procedural quadruped and generated fur are not declared
final simply because they are more detailed than a primitive stub. The final
hero needs a production-grade rig/animation pipeline, a visual and performance
budget, and direct Chrome review.

## Target runtime boundaries

Keep the following responsibilities separate. Names may differ, but the
boundaries must remain clear and testable.

    Input / Raycast / Gesture
              |
              v
    InteractionManager --- ActivityManager --- NarrationManager
              |                    |
              v                    v
    CharacterController -- AnimationStateMachine -- ProceduralLookController
              |                    |
              +---- kinematic tether anchor -------+
                                                    v
    PhysicsWorld / BallTetherSystem --- collisions / surface rules
                                                    |
                                                    v
    Renderer / CameraController / AudioManager / Effects
                                                    |
                                                    v
    WorldZoneManager / SaveSettings / AccessibilitySettings / PerformanceMonitor

- **CharacterController:** movement intent, stable attachment bone/anchor, foot
  placement constraints, recovery, and handoff to animation.
- **AnimationStateMachine:** authored idle/wake/stretch/walk/trot/run/turn/
  ball/pounce/celebrate/call/swim/etc. states and natural transitions. Keep
  foot speed matched to root motion to prevent sliding.
- **ProceduralLookController:** eye/head/ear/tail/breathing details layered on
  top of animation, never competing with or jittering it.
- **BallTetherSystem / PhysicsWorld:** fixed substeps, safe bounded impulses,
  tether max extension/damping, surface responses, collision/recovery, and
  stable bridge from animation anchor to physics.
- **InteractionManager:** generous raycast/hit areas, drag/flick velocity,
  input capture/cancellation, context rules, and immediate feedback.
- **CameraController:** follow target, damping, obstruction/terrain avoidance,
  stable horizon/FOV, reset, and reduced-motion behavior.
- **WorldZoneManager:** Meadow first; lazily load/activate later connected park
  areas, update surface physics, and prevent a new zone from stalling play.
- **SaveSettings / AccessibilitySettings:** local-only settings for sound,
  narration, prompts, reduced motion, session reminder, and future language;
  no child account or telemetry requirement.
- **PerformanceMonitor:** development-only counters for frame time, texture/
  geometry budgets, shader warm-up, allocation rate, and quality fallback.

## Physics and interaction contract

### Invariants

- Fixed physics timestep (1/120 s today), bounded catch-up, deterministic
  simulation input, and no randomness in the core simulation.
- No NaN/Infinity, explosive velocity, unbounded tether extension, permanent
  out-of-bounds ball, or violent character pull.
- Ball rests without visible jitter; rolls/spins/bounces consistently with its
  velocity and surface.
- Tether is attached to a stable character bone/kinematic anchor, not simply a
  visually animated mesh point.
- Input impulses are bounded and scale safely across touch/mouse devices.
- Tab hide/show and low frame rate recover safely without simulating minutes of
  delayed physics.

### Required reconciliation before M1-C close

The approved rev-2 toy specification says ordinary skip energy enters through
the moving cuff, while the master production brief calls for a child tapping the
ball to launch it. Current source uses direct bounded kick() impulses for the
ball-play path. The M1 target contract is:

1. **Wake/scene tap** triggers a character reaction, not an unbounded ball
   kick.
2. **Deliberate ball tap** may apply one small, capped upward/outward launch
   impulse plus spin and an immediate cougar reaction.
3. **Skip/locomotion energy** stays anchor-driven through character animation.
4. **Drag/flick** uses screen velocity through a camera-relative mapping and a
   cap; release has clear visual stretch feedback.
5. Both paths use the same recovery, collision, and tether safety rules.

Pin this in unit tests before closing the public interaction. Do not retain a
broad direct-kick path simply because it currently makes the story advance.

### Surface rules

The Meadow uses grass, ramp, bell, soft blocks, and puddles first. The current
ramp is an authored, bounded M1 assist so no child has to aim precisely at a
newly revealed target. It needs direct Chrome review to establish whether it
reads naturally. Later zones may provide measured overrides: grass rolls
slightly shorter, pavement rolls longer, ramps launch, water adds
buoyancy/drag/splash, and safe vehicles can block or carry the ball.
WorldPhysics already sketches an override seam; only turn it on when the owning
zone and tests exist.

## Character and asset implementation plan

1. Define a final hero asset contract: original/rights-cleared source, rig
   layout, attachment bone, facial controls, animation clips, LODs, materials,
   and texture budget.
2. Make the attachment anchor stable under authored animation and validate it
   under idle, walk, run, ball action, pounce, and recovery.
3. Add an animation controller and authored state transitions before broad
   procedural reactions. Apply look/ear/tail/breathing layers afterward.
4. Build the M1 animation subset first: rest/sleep, wake, stretch, curious/
   excited idle, ball look, paw, surprise, happy call, celebration, and
   necessary walk/turn/stop or constrained staging motion.
5. Add the broader park set only after M1 evidence: run, sit, lie, wake,
   pounce, chase, play bow, jump/land, stumble, sniff, drink, swim/paddle,
   nap, and related transitions.

See [ASSET_PIPELINE.md](ASSET_PIPELINE.md) for rights, source, compression, and
runtime delivery rules.

## Performance plan

The targets are 60 FPS on a modern desktop and stable 30–60 FPS on recent
tablets/phones, without persistent physics spikes or shader compilation stalls.
Protect face, eyes, silhouette, core ball response, and input latency before
reducing background detail.

- Preload the hero and Meadow only; lazy-load secondary park zones.
- Use LODs, instancing, frustum culling, pooled effects, limited shadow
  casters, and progressive texture/geometry budgets.
- Prefer authored/baked/environment-light solutions where they preserve the
  target look at lower runtime cost.
- Audit code that disposes/recreates geometry or allocates in a frame loop;
  replace it with reusable buffers/pooled resources where profiling warrants.
- Warm shaders/resources before the child’s first active interaction when
  possible, then test background/foreground recovery.
- Support adaptive quality and reduced motion without hiding a broken baseline.

## Verification plan

### Automated gates

- Typecheck, unit tests, production build, and relevant lint/format gate if
  introduced.
- Pure physics/property checks: determinism, cord length, resting, bounce,
  surface behavior, repeated input, bounds recovery, and no numerical failure.
- Character/animation checks: anchor stability, rig hierarchy, state
  transition continuity, animation/root-motion/foot-slide constraints where
  testable.
- Playwright e2e: clean boot, real pointer input, audio-unlock behavior,
  persisted settings, resizing, key QA path, ball bounds, no console errors,
  and reasonable frame-time regression thresholds.

### Direct Chrome gate — currently blocked

Google Chrome only is the visual authority. The required Chrome extension was
unavailable during this documentation pass, so no baseline or release visual
claim has been made. When available, run Chrome at desktop, tablet, and phone
dimensions; inspect rest, wake, ball flight, repeat input, ramp/bell,
celebration, orientation change, tab recovery, and reduced motion. Save
screenshots/short captures with metadata and distinguish browser/tooling
failures from product defects.

## Deployment

The current production target is GitHub Pages:
`https://boydcroberts.github.io/purple-cougar/`. The workflow at
`.github/workflows/deploy-pages.yml` runs validation, builds in
`github-pages` mode, uploads `dist`, and deploys from `main`. That mode applies
the `/purple-cougar/` Vite base path required by a GitHub project site without
changing the local development URL.

Vercel is retired as an active target because its account usage limit was
reached. Cloudflare Pages is the preferred fallback if the project later needs
more predictable static-asset delivery. Netlify remains compatible but is not
the first fallback because its free plan meters bandwidth, requests, and
production deploys through a shared credit allowance.

## Security, privacy, and resilience

- No external links, purchases, chat, ads, or child account flow in play.
- No runtime asset download from untrusted sources; validate/load only the
  shipped manifest and fail softly to a safe local fallback.
- Keep saved settings local, bounded, schema-validated, and failure tolerant.
- Do not expose secrets in client code. Keep deployment credentials out of the
  repository and client bundle.
- Treat user gestures, pointer velocity, stored settings, and asset metadata as
  untrusted input. Clamp and validate them before simulation/use.
