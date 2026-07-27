# Purple Cougar

Purple Cougar is a touch-first 3D play experience for a child a little over
three. The finished product is a small, joyful animated feature set in the
**Purple Cougar Adventure Park**, centred on a lovable female purple cougar and
her tethered ball. It is not a score-chasing game, an ad surface, or a generic
physics demo.

The first production milestone is deliberately much smaller:
**“Purple Cougar and the Bouncing Ball,”** a polished Meadow experience. The
Meadow must earn expansion into the park; pool, vehicles, train, and animal
areas are not parallel prototypes.

## Product status

This repository is an early technical/art foundation, not a production-ready
child experience. The distinction matters: source-level capabilities below are
not claims about rendered quality, animation feel, mobile performance, or
Chrome behavior.

| Area | Current repository reality (static audit) | Product target |
| --- | --- | --- |
| Runtime | Vite, TypeScript, and vanilla three.js. | Keep this stack and evolve it; do not rewrite frameworks without a demonstrated need. |
| Cougar | src/cougar/quadruped.ts builds a procedural, lofted four-legged cougar with a tail and a cuff anchor. src/cougar/fur.ts and materials.ts generate procedural coat maps. | A final-quality, expressive female cougar with a production rig, facial controls, stable deformation, authored animations, and subtle procedural secondary motion. |
| Ball and tether | src/physics.ts contains a fixed-step tethered-particle simulation. src/ballView.ts draws the orange/green striped ball, black sagging cord, and knot. | Stable ball interaction across grass, pavement, ramps, water, and safe obstacles; it must feel like a playful second character. |
| Input and game loop | src/main.ts now wires an in-progress BouncingBallDirector through wake, invitation, ball play, ramp/bell, celebration, and train tease. It accepts pointer/keyboard input, runs a fixed-step accumulator, and currently gates “ball tap” by story phase rather than a rendered-ball hit test. | Child-safe wake, ball, movement, and object interactions with immediate visual/audio feedback; character-led reactions, generous visible hit areas, and bounded impulses. |
| World | src/scene.ts supplies a sky, ground, lights, and post-processing. src/worlds/meadowSlice.ts now supplies an in-progress Meadow/ramp/bell/train-tease slice; src/worlds/world.ts defines a future zone contract. | A connected Adventure Park that begins with one exceptional Meadow, then adds the pool, vehicle yard, train loop, and animal area. |
| Tests and capture | Unit tests cover counter, core ball physics, cougar behavior, and the story director. A Playwright configuration and capture harness exist; no end-to-end spec was found in this static audit. | Repeatable browser tests plus direct Chrome visual review at desktop, tablet, and phone dimensions. |

The approved rev-2 toy specification remains the detailed source for the real
orange ball with thin green stripes, black floppy cord, red cuff, black Velcro
patch, and ball knot/grommet. The master production brief supplies the broader
character, Meadow-first, and Adventure Park direction. Where they require a
new product decision, this documentation marks it rather than silently treating
one as implemented.

## First milestone: Purple Cougar and the Bouncing Ball

The first playable is a five-minute Meadow story, not a park hub. Its director,
Meadow slice, camera controller, play UI, and procedural behavior layer are
present in source but have **not** passed Chrome visual or product-quality
review:

1. A polished transition opens on Purple Cougar resting in the Meadow.
2. A child wakes her with a generous tap; she stretches, notices the child, and
   makes a warm sound.
3. Her tethered ball wiggles as the visual invitation.
4. A tap, drag, or flick produces a safe, legible ball response; she tracks,
   reacts to, and paws at it.
5. Three celebratory bounces create spoken/countable feedback, particles, and
   a nearby ramp activation.
6. The ball reaches the ramp and rings a bell; Purple Cougar celebrates.
7. A distant train offers a visual promise of the later Adventure Park, then
   free play begins.

No additional zone may begin implementation until this complete story passes
the quality gates in [ROADMAP.md](ROADMAP.md).

## Chrome visual baseline — pending / unavailable

The required initial visual baseline is **not recorded**. Google Chrome is the
only approved browser for visual verification; the Chrome automation extension
was unavailable while this brief was authored. Therefore this repository makes
no claim that the current cougar, lighting, camera, or controls have been
visually reviewed in Chrome.

When Chrome access is restored, capture the baseline before using visual
language such as “cute,” “polished,” “readable,” or “smooth.” Record the commit,
viewport, device scale, screenshot/video path, console errors, and notable
input/physics behavior. Do not substitute Brave, a guessed description, or a
source-code inspection for that review.

## Development commands

These commands document the available scripts; they are not a claim that this
brief ran them.

    npm run dev
    npm run validate
    npm run build
    npm run e2e

npm run validate runs TypeScript checking and Vitest. npm run e2e is configured
for Playwright and should become a release gate once end-to-end specifications
are added. On macOS, the existing Playwright/capture setup uses
--use-angle=metal to avoid the slow SwiftShader fallback.

## Product rules

- The child does not need to read, aim precisely, compete, wait through a
  timer, or recover from a failure state.
- The normal play view has no persistent unexplained score. The current
  lifetime numeral is prototype behavior, not approved final UI.
- No advertising, purchases, chat, external links, or child data collection.
- Use only repository-authored or owner-supplied assets with documented rights.
  Do not download or ship unlicensed models, textures, sound, animation, or
  character likenesses.
- Audio begins only after a real user gesture and respects stored settings.
- Visual and interaction work closes only after source gates **and** direct
  Chrome review; automated checks do not establish delight or composition.

## Documentation map

- [Product vision](docs/PRODUCT_VISION.md) — player promise, interaction rules,
  Meadow story, and later park.
- [Art direction](docs/ART_DIRECTION.md) — hero, toy, world, camera, and visual
  review standards.
- [Technical plan](docs/TECHNICAL_PLAN.md) — current architecture, target seams,
  physics, performance, and verification plan.
- [Asset pipeline](docs/ASSET_PIPELINE.md) — original/properly licensed asset
  policy and production pipeline.
- [Roadmap](ROADMAP.md) — sequencing, gates, and explicit out-of-scope work.
