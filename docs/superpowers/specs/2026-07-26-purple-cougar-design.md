# Purple Cougar — Design (rev 2)

**Date:** 2026-07-26
**Status:** Approved, supersedes rev 1 (in git history at `dc41547`)

## What it is

A 3D web toy for a 3-year-old boy. A detailed, cute purple cougar stands upright
with a skip-ball cuffed to one ankle, modelled on the real toy he owns and plays with.

Tap anywhere and he does one skip: the cuffed leg swings and drives the ball, the
free leg hops the cord. Tap in rhythm and the ball winds up faster and wider. Stop
and it loses energy, droops, and scrapes along the grass. Drag and fling to throw it
out; the cord catches it and reels it back.

He loves dinosaurs, balls, swimming, pools, and race cars. The toy is built out of
those things.

## What changed in rev 2, and why

Rev 1 modelled the ball as a fixed-radius orbit advancing at constant angular speed
— explicitly *not* physics — with a closed-form clear/bonk timing window.

The project owner's direction on 2026-07-26 was that the ball must behave like the
real object his son plays with and loves: kickable, throwable, fluid, and it comes
back. And that the cougar needs far more detail than the primitive stub.

Two consequences, both structural:

- The orbit sim and the closed-form timing rule are replaced by a **tethered-particle
  simulation**. `skipball.ts` and `hop.ts` are retired; the clear/bonk half of
  `gameplay.ts` is reworked.
- The stub cougar is replaced by an **articulated, detailed character**.

What survives unchanged: `scene.ts`, `ui.ts`, `audio.ts`, `counter.ts`, the striped
ball texture and cord mesh, and the *shape* of the state machine — phases, the
never-resetting counter, and mash absorption.

This change also resolves a concern raised at the start of rev 1: precise timing is
hard at three. Rhythm is not.

## Audience constraints

Unchanged from rev 1. Hard requirements, not preferences.

- **He cannot read.** No text carries meaning. All affordances are pictures, motion, or sound.
- **He cannot lose.** No game over, no score reset, no fail state, no timer.
- **He will mash the screen.** Mashing must feel good and must never be punished.
- **His aim is bad.** The primary control is the entire screen.
- **He will get bored.** Things must move and react constantly.

## Core loop

1. Tap anywhere → one **skip cycle**: the cuffed leg swings through an arc while the
   free leg hops.
2. The swinging ankle drags the ball through the cord. That is the *only* way energy
   enters the system on a tap — the ball is never pushed directly.
3. Tap roughly in phase with the ball's swing and energy accumulates, exactly like
   pumping a playground swing: the orbit widens, speeds up, and lifts.
4. Stop tapping and drag, gravity, and ground friction bleed it off. The ball droops,
   drops, and scrapes along the grass.
5. Drag and release anywhere → **fling**: an impulse in the swipe direction. The ball
   arcs away, the cord snaps taut, and it swings back around.

The counter increments once per skip and is a cumulative lifetime total persisted to
`localStorage`. **It never resets.**

## The real toy — match it

The owner photographed the actual toy on 2026-07-26. Match it, because a 3-year-old
recognising *his own ball* is worth more than any styling choice we would invent.

| Part | Reality | Note |
|---|---|---|
| Ball | Matte **orange**, hollow rubber, with several **thin green stripes** curving around it like meridians | Rev 1 specced blue stripes from an early verbal description. The photo supersedes it. |
| Cord | **Thin black** cord, long and very floppy — photographed lying in loose slack coils | Not white, not rigid. The slack is the toy's most characteristic look. |
| Cuff | A **red fabric strap** with a **black velcro patch** across it | Not a teal ring. |
| Attachment | A visible knot/grommet where the cord enters the **top of the ball** | Small but it is what sells it as the real object. |

The cord's floppiness in the photo is direct evidence for the slack/taut treatment
below: a permanently straight cord would read as fake immediately.

## Ball physics

The central idea: **the ball is never pushed directly.** The ankle is a moving anchor,
the cord is an inextensible constraint, and swinging the leg drags the ball along.
That is how the real toy works, and it is what makes the motion feel right rather than
scripted.

Per fixed timestep, in order:

1. **Gravity** — `vel.y -= G * dt`
2. **Drag** — `vel *= exp(-DRAG * dt)` (frame-rate independent; never a raw `1 - k*dt`)
3. **Integrate** — `pos += vel * dt`
4. **Cord constraint** — position-based. If `|pos - anchor| > CORD_LENGTH`, project
   `pos` back onto the sphere of that radius around the anchor and remove the outward
   radial component of `vel`. Below that distance the cord is **slack** and does
   nothing — the ball is in free flight.
5. **Ground** — if `pos.y < BALL_RADIUS`, clamp it, reflect `vel.y` with restitution,
   and apply friction to the horizontal components.

The anchor is the cuffed ankle's world position, which the character rig updates every
frame. Energy therefore enters the system through limb motion, and the whole
wind-up/decay behaviour is emergent rather than authored.

**Fixed timestep.** The sim runs at a fixed 1/120 s internally with an accumulator,
regardless of display refresh rate. A constraint solver stepped at variable `dt` is
not reproducible, and Task-level tests plus screenshot QA both depend on
reproducibility.

**Determinism.** Given the same anchor path and the same taps, the ball must follow
the same trajectory every run. No `Math.random()` anywhere in the sim.

## The skip cycle

One tap runs a single cycle, roughly 0.5 s:

| Beat | Cuffed leg | Free leg |
|---|---|---|
| Wind | rotates back at the hip | plants |
| Drive | sweeps forward and through | pushes off |
| Float | follows through | tucked up, clearing the cord |
| Land | returns under the body | plants, small squash |

The hop is part of the cycle, not a separate skill — the free foot is up during
Float by construction, so he clears the cord as a matter of animation rather than
player timing.

**Mashing.** A tap during an active cycle is absorbed, except within a buffer window
of the end, which queues the next cycle so held rhythm stays responsive.

## Trips

He trips only when the ball has gone slack and low — when its energy has fallen below
a threshold and the cord is dragging on the ground as he skips. He tumbles over,
lies there, shakes it off, and gets up. The ball rolls to a stop nearby.

The counter is untouched. A trip is the natural consequence of having stopped playing,
and it reads as comedy, not punishment. It is also the strongest possible invitation
to tap again.

## The cougar

Cute and unmistakably a cougar. Kawaii proportions — big head, big eyes, chunky paws —
but every species cue present and readable. Never realistic. (Same direction as
MenuCritter's critters.)

**Detail that must be present:**

- Big expressive eyes with pupils and specular highlights, and brow ridges that can tilt
- A proper muzzle with a pink nose and whiskers
- Rounded ears with inner-ear colour
- Cream muzzle, chest, and belly against the purple
- A long tail with a dark tip, built as a segmented chain so it can sway and curl
- Chunky paws with visible toes
- A cuff on the right ankle where the cord anchors

**Articulation.** A real joint hierarchy of nested groups, not a bag of loose meshes:
`root → hips → torso → neck → head`, with `shoulder → upperArm → foreArm → paw` and
`hip → thigh → shin → paw` chains on each side, plus a tail chain. Poses are joint
rotations. The kick and hop must actually bend at the hip and knee.

The cuffed ankle's world position is read off the rig each frame and handed to the
physics as the anchor. That coupling is the whole design: **the rig drives the ball.**

## The world

A pleasant meadow, not an empty plane: rolling hills on the horizon, drifting clouds,
scattered flowers and grass tufts, warm key light with a cool fill and a rim light to
separate him from the background.

The camera must keep him framed through a tumble. Rev 1 rotated him about his feet and
he slid out of the bottom-left corner — the camera either follows or the tumble pivots
about his body centre.

## Explicitly deferred

Unchanged from rev 1. Neither is built until he has played this.

**Word teaching and voice.** A voice counting skips, and a spotlight beat naming
objects in the scene. Seams that exist for it: `NamedObject` tags on set pieces, and a
camera push-in.

**Three worlds** — dino jungle, pool, race track — behind a `World` interface, with
big picture buttons.

**A scary beat.** Tone stays sunny.

## Stack

Unchanged. Vite + TypeScript, three.js, vitest + playwright, iPad touch-first,
full-bleed, click and spacebar kept alive for Mac QA, GitHub → Vercel.

```
purple-cougar/
  src/
    main.ts          bootstrap, rAF loop, fixed-step accumulator, input
    constants.ts     every tunable
    physics.ts       tethered-particle sim          [replaces skipball.ts]
    gameplay.ts      skip-cycle state machine, counter, trips
    counter.ts       lifetime total, persistence
    cougar/
      rig.ts         joint hierarchy + pose API
      head.ts        face, eyes, muzzle, ears, whiskers
      body.ts        torso, limbs, paws, tail
      pose.ts        skip cycle, idle, tumble
    ballView.ts      ball mesh, slack/taut cord, roll from velocity
    scene.ts         renderer, camera, lights
    world.ts         hills, clouds, flowers
    ui.ts            counter overlay
    audio.ts         synthesized sfx
  tools/  capture.mjs
  test/   e2e/
```

## Testing

The physics sim is pure and is the highest-value unit-test target: cord slack vs taut,
energy decay monotonicity under no input, ground restitution and friction, determinism
across identical inputs, and the invariant that the ball can never end a step further
than `CORD_LENGTH` from the anchor.

The rig is testable too, headlessly: joint chains resolve, and the cuffed ankle's world
position is where the pose says it should be.

E2E and screenshot QA as before, via `tools/capture.mjs` with its own browser and
`--use-angle=metal` on darwin.

## Deploy

GitHub `boydcroberts/purple-cougar` → Vercel. **Boyd controls all pushes.**

## Open

All physics constants are guesses until he plays it. Gravity, drag, restitution,
cord length, and the energy threshold for tripping are expected to be retuned
together, since they interact.
