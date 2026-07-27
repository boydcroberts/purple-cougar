# Purple Cougar Roadmap

## Operating rule

Build one polished system at a time. The **Bouncing Ball Meadow** is the only
active product milestone until it provides a delightful, stable five-minute
experience in Google Chrome. A technically working prototype does not unlock
the full Adventure Park.

Status labels describe product readiness, not the existence of individual source
files. “Current” means a static repository audit at the time this roadmap was
written; visual behavior remains unverified until the Chrome baseline is
captured.

## Milestone map

| Milestone | Status | Outcome | Exit gate |
| --- | --- | --- | --- |
| 0. Audit and Chrome baseline | **Blocked — Chrome extension unavailable** | Record technical and visual baseline in Google Chrome only. | Chrome screenshots/video at desktop, tablet, and phone dimensions; console and input observations logged. |
| 1. Bouncing Ball Meadow | **In progress / sole build focus** | “Purple Cougar and the Bouncing Ball” is a cohesive, five-minute Meadow story. | All M1 gates below pass; direct child-play review says the loop is legible and delightful. |
| 2. Park movement foundation | Planned | Connected travel, camera, zone loading, and safe recovery without a menu maze. | Movement, camera, tether, and save/settings work together without frame spikes or lost child control. |
| 3. Splash Pool | Planned after M1 | Shallow pool, buoyant ball, splashes, and paddle/swim behavior. | Water feels safe and distinct from grass; ball cannot become trapped. |
| 4. Vehicle Yard | Planned after M1 | A small, highly polished set of child-friendly vehicles. | Each vehicle has one or two understandable reactions and does not compromise ball/cougar safety. |
| 5. Train Loop | Planned after M1 | A visible, audible train that connects park areas without a text menu. | Arrival, boarding, travel, and recovery are stable and comfortable. |
| 6. Animal Area | Planned after M1 | A few animated, nameable animal friends with sound and one memorable interaction each. | Every shipped animal is alive, responsive, and rights-cleared; none are static filler. |
| 7. Education, parent settings, and accessibility | Planned in parallel only where M1 needs it | Optional narration, reduced motion, volume, parent gate, and future language seam. | Play never blocks on a correct answer; settings are safe, understandable, and persisted. |
| 8. Release hardening | Planned | Reliable, performant production experience. | Build, automated checks, Chrome manual QA, asset/license manifest, performance, and regression evidence pass. |

## M1 — “Purple Cougar and the Bouncing Ball”

### Scope

One Meadow is enough. It contains soft grass, flowers and moving plants, small
hills, beautiful sky, clear lighting/contact shadows, a ball ramp, a bell,
large soft blocks, and a distant train tease. It does **not** contain a working
pool, vehicle yard, train ride, or animal area.

Current source has an in-progress story director, procedural cougar behavior,
follow camera, temporary child-facing UI, Meadow/ramp/bell sequence, and train
tease. This establishes a useful implementation path, but M1 remains open:
the Chrome baseline is blocked, no direct visual review is recorded, and the
full quality/performance gates below are not passed.

The intended story is:

1. A loading transition opens on Purple Cougar asleep or resting.
2. A generous child tap wakes her; she stretches, looks to the child, and makes
   a friendly sound.
3. The tethered ball wiggles to invite a touch.
4. A ball interaction makes it rise, bounce, swing, roll, or fly safely; the
   cougar tracks it and reacts with her whole body.
5. Three rewarding bounces produce countable spoken feedback, particles, and
   animation rather than a persistent abstract score.
6. A large bounce activates a nearby ramp. The ball rolls down it and rings a
   bell.
7. Purple Cougar makes a happy, non-frightening call and celebrates. A train is
   visible far away; then the child can freely replay the Meadow loop.

### Delivery sequence

| Slice | Build only after the previous slice is proven | Required proof |
| --- | --- | --- |
| M1-A: baseline and contract | Inventory current runtime; create the Chrome evidence log; pin device/quality budget. | Chrome baseline or a documented continuing blocker. No invented visual judgment. |
| M1-B: hero contract | Replace/prove the temporary hero direction: rig, face, tether attachment, idle/wake/stretch/look/ball reaction pose plan. | Common-angle Chrome capture and animation review once Chrome is available. |
| M1-C: ball contract | Stable rest, launch, tether tension/slack, bounce, roll, drag/flick, recovery, and non-explosive repeated input. | Unit/property checks plus Chrome capture of rest, launch, repeat input, and recovery. |
| M1-D: Meadow interaction | Ramp, bell, blocks, plant motion, lighting, camera framing, and particle feedback. | A child can discover the ramp/bell through staging rather than written instructions. |
| M1-E: emotional/audio loop | Wake, ball invitation, ball tracking, happy call, celebration, count/narration, first-gesture audio unlock. | Sound and animation synchronize; no harsh or scary response. |
| M1-F: hardening | Mouse/touch, resize/orientation, reduced motion, safe settings seam, performance, error recovery. | Build, test, Chrome desktop/tablet/phone checks, and a direct five-minute play-through pass. |

### M1 definition of done

All of the following are mandatory before any new park zone:

- The cougar is appealing and readable from common camera angles in Chrome;
  source inspection alone cannot pass this.
- Eyes, head, ears, and body react to the ball without abrupt pose pops or paw
  sliding.
- The tether remains stable, does not persistently cut through the character,
  and the ball neither jitters at rest nor permanently escapes.
- Every tap produces immediate, non-textual feedback. Broad/tolerant targeting
  protects a three-year-old’s imprecise aim.
- The child can discover the ball, ramp, and bell without being asked to read.
- Mouse and touch both work. Audio starts after the first real gesture.
- No console errors; the production build and relevant unit/e2e checks pass.
- Chrome evidence exists for desktop, tablet, and phone-sized viewports,
  including rest, launch, bounce/repeat input, ramp/bell, and completion.
- Assets are original or owner-supplied with rights documented in the asset
  manifest. No unlicensed or runtime-downloaded content is present.
- The result has been directly judged as delightful rather than merely
  functional.

## Adventure Park sequence after M1

The full product is one connected **Purple Cougar Adventure Park**, not a menu
of unfinished mini-levels. The Meadow is its entry/playground. Add the next
areas in this order so each reuses an already-proven tether, character,
camera, interaction, audio, and save foundation.

1. **Connected park foundation:** walking/trotting/running, follow camera,
   obstacle recovery, zone manager, train route placeholder, and lightweight
   quality settings. Preserve the Meadow loop while this is built.
2. **Splash Pool:** shallow, cheerful water, floating toys, duck/friend, slide,
   fountains, wet-fur variation only if it meets budget, buoyancy, and a safe
   paddle animation.
3. **Vehicle Yard:** start with a small car, one work truck, and one monster
   truck. Add additional named vehicles only when each existing one has a
   satisfying interaction (horn, dump bed, mixer, arm, lights, slow drive, or
   carrying the ball).
4. **Train Loop:** an ambient train first, then tap-to-whistle/arrival, then a
   safe ride that links established zones. The train replaces navigation text,
   not child freedom.
5. **Animal Area:** ship a few high-quality friends first; each needs a sound,
   animation, narration hook, and meaningful response to the cougar or ball.
6. **Broaden learning and free play:** optional narration, colors/shapes,
   numbers one through five, comparisons, and cause/effect. A wrong response
   always becomes encouragement or discovery, never a failure.

## Explicitly not in M1

- A full pool, vehicle fleet, working train ride, or animal collection.
- Dozens of scenery props or static animal/vehicle decoration.
- Advertising, purchases, external links, chat, accounts, child analytics, or
  a text-heavy tutorial.
- A framework rewrite, a large menu system, or a new physics engine without a
  measured reason.
- Third-party/unlicensed art, sound, animation, texture, or character content.

## Decision register

| Decision | Current direction | Owner check before implementation |
| --- | --- | --- |
| Tap launch versus anchor-driven skip | The rev-2 toy spec says the main skip energy enters through the moving cuff; the master brief also requires a tap on the ball to launch it. The current director gates launch by story phase, not a rendered-ball hit test. | Define one bounded ball-tap impulse contract while keeping ordinary skip energy anchor-driven. Test a generous ball hit region and a no-fail fallback; do not mistake the temporary phase gate for the final interaction. |
| Hero asset strategy | Current source is procedural quadruped geometry, not a final animation asset. | Select original authored/procedural production asset strategy with full rights and mobile budget before calling the hero final. |
| Counter/progress | Current prototype renders a persisted numeral. | Replace with contextual counting, particles, paw prints/stickers, and celebrations; no permanent unexplained score. |
| Park representation | src/worlds/world.ts has a three-world contract, while the master brief defines one connected park. | Keep the contract only if it supports seamless zones; do not expose it as a disruptive world-selector UI. |
