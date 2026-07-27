# Purple Cougar Roadmap

## Next up (owner direction, 2026-07-27, supersedes Phase 3 for now)

The owner's next focus is **the background/scenery/backdrop** — current
verdict was blunt: "amazing looking cougar but a childish looking fake
background." This takes priority over the Phase 3 plan below until it's
addressed. Scope is exactly ROADMAP's existing "Focus now" list further
down (lake, squirrel, garden, scenery, sunset) — nothing new to invent, just
finally executed well.

**A same-session attempt on 2026-07-27 was fully reverted** — read this
before touching scenery code again:
- Softer painterly clouds (canvas-gradient billboards replacing the old
  hard-edged dodecahedron puffs) and a mottled ground texture (replacing the
  flat single-colour plane) both looked like real improvements when actually
  checked in a screenshot — that part of the approach is sound, worth
  re-attempting.
- Moving the lake closer to fix ROADMAP's own "24px sliver" diagnosis (using
  `parkBackdrop.ts`'s `placeInView(screenLeft, depth)` helper, confirmed live
  via `window.__pc.project()` that local X = -screenLeft and local Z = 13.794
  - depth exactly) **put the water inside the WNC garden crescent's own
  footprint** (`bedOuterRadius()` in `wncGarden.ts` reaches 5.5 world units
  from origin; the relocated lake center landed at radius ~3.4) — flowers
  rendered through the water. Any future lake-visibility fix must check
  world-space overlap against the garden crescent (and the meadow's own
  `PLAY_RADIUS`) BEFORE picking coordinates, not after.
- **Screenshots stopped working partway through** — Playwright's built-in
  `browser_take_screenshot` started timing out (5s) because this MCP's Chrome
  runs on `--enable-unsafe-swiftshader` (software WebGL, not real GPU); added
  scene complexity pushed per-frame render time past the timeout. Workaround:
  `browser_evaluate` a canvas `toDataURL()` read after an explicit `setTimeout`
  wait, rather than the screenshot tool, when the scene is heavy.
- **The real lesson:** several further guesses (moving the garden inward,
  clamping its `back` placement parameter) were made blind, without ever
  getting a working screenshot of the lake fix first, compounding the
  mistake instead of catching it. Get one working, verified screenshot after
  the FIRST change before layering on more.

## Active plan

**[Phase 3: Nephew Expansion](docs/superpowers/plans/2026-07-27-phase-3-nephew-expansion.md)**
is drafted and not yet started. It re-targets the whole experience at the
owner's actual nephew (dinosaurs/snakes/"scary stuff" welcome, roar should be
loud and proud not soft) and adds: a louder roar with an open-mouth pose
(Phase 1), finishing the ball/cord/**cuff** match to the physical reference
toy (Phase 2 — ball/stripes/grommet/cord already shipped in `d3af173`, cuff
still open), a streak/combo ladder up to fireworks (Phase 3), and more garden
life + a garter snake/rabbit/turtle + wind/rain (Phase 4). It deliberately
**reorders** the "Focus now" list below — read the plan's own reasoning
before assuming the lake/squirrel items are next. **Read that plan's Status
section before resuming** — it has corrections against what's actually in
the repo (partial Phase 2 completion, real reference photos now saved at
`docs/reference/`) that aren't in the plan's original task text.

## Operating rule

One polished system at a time, verified live in Chrome (Playwright MCP), not
by source inspection. See [CLAUDE.md](CLAUDE.md) for the verification loop and
architecture gotchas before starting any item below.

## Done

The Bouncing Ball Meadow is a real, playable five-minute loop: wake → ball
invite → tap/drag/fling → three bounces → ramp → bell → celebration → free
play. Built and verified at 1280×800 and 390×700, `npm run validate` green.

- **Cougar & ball:** billboard hero character with procedural idle/reaction
  motion (`happy`, `surprised`, `roar`); ball and cuff match the approved toy
  reference (matte orange, green stripes, black cord, red cuff).
- **The roar:** a real synthesized cinematic vocal (detuned oscillator stack,
  pitch-arc attack, vocal-tract formants, growl tremolo, convolution reverb) —
  not a placeholder beep. Triggered by tapping her directly and at
  celebrations.
- **Train:** continuous one-way crossing on a fixed track, wheels rolling
  correctly, whistle-ready.
- **World bones:** six-layer Blue Ridge ridgeline (fractal, haze-graded),
  golden-hour sky with a sun disc, windmill, framing native trees (white pine,
  hemlock, dogwood, red maple), a stone garden path, and a first-pass lakeside
  garden bed (Shasta daisy, Knock Out rose, Catawba rhododendron, mountain
  laurel, boxwood, Christmas fern — all carrying real species names on a
  `plants[]` array for a future tap-to-learn feature).
- **White squirrel module exists and is wired in**, but is unproven — see
  below.

## Focus now — five things, in this order

### 1. The lake

Currently in code but **not actually visible**: from the play camera's low,
flat-ground eye level it compresses to a ~24px sliver. This is the single
biggest gap between what's built and what the reference photos promise.

Needs a real composition change, not a bigger plane:
- A bluff/terrace read — the meadow sits above the water, looking down at it,
  the way the Lake Lure reference photos do. That likely means raising the
  play pad's apparent vantage or adding a foreground drop-off, not just
  moving the lake plane.
- Reflection of the golden-hour sky and ridgeline (a mirrored/rotated copy of
  the sky dome + ridges is the cheap version; a real reflective material is
  the better one if the frame budget allows).
- The gentle cross-swell shimmer already exists in `parkBackdrop.ts` — keep it,
  tune it once the lake is actually on screen.
- Measure every candidate composition with `window.__pc.project()` before
  committing to geometry changes.

### 2. White squirrel — make it a real easter egg

The Brevard white squirrel dash (`src/worlds/whiteSquirrel.ts`) is wired into
the frame loop and fires via `window.__pc.squirrelDash()` without errors, but
it has never been visually confirmed mid-dash and was not built with the
"funny, delightful, kids-notice-and-wait-for-it" bar in mind. Treat it as
unproven until:
- Captured live, mid-bound, at both viewports.
- The bounding hop motion and tail read clearly at play-camera distance and
  speed — not just in isolation.
- The timing (12–20s) and chitter cue feel like a surprise worth watching for,
  not a glitch. Tune by feel once seen, not by code review.
- Consider a bigger "tell" (a chitter that starts a beat before it appears, a
  quick specific camera-independent flash) so a distracted three-year-old
  doesn't miss it every time.

### 3. Upgrade the garden further

The first pass is real species, not a placeholder — now make it worthy of
"breathtaking":
- More layering and depth (the reference photos are dense — the garden should
  feel like you could get lost in it, not like a single tidy row).
- Small living detail: a bee or two, a hummingbird near a bloom, more
  butterflies tied to specific flowers rather than wandering generically.
- Consider a couple of teachable vegetables/fruits somewhere reachable (the
  owner explicitly wants fruit/veg alongside flowers/trees/animals) — a small
  raised bed or vine, not a whole farm.
- Keep every new plant on the `plants[]` array with a real species + common
  name.

### 4. Scenery, more generally

Beyond the garden specifically: more ambient life and depth in the meadow and
mid-ground — birds, more insects, more grass/ground variety, maybe a second
small water feature (creek/spring) distinct from the lake. Treat this as
"keep making the world feel alive," not a fixed checklist — use taste and the
WNC reference, and check each addition against the camera the same way as
everything else.

### 5. Sunset

Only sunrise/golden-morning has been built (six-stop warm gradient, low sun
over the ridge). A sunset variant — different sky palette (deeper orange/rose/
purple), sun low on the *opposite* side or setting behind the ridge, warmer
rim light on the cougar — would let the world eventually support a full
day cycle. Scope as a second sky configuration first; a live time-of-day
transition is a bigger, separate decision.

## Parking lot

The owner has more ideas beyond this list. Don't invent scope to fill it in —
ask before starting anything not named above once these five are done.

## Explicitly not in scope right now

- Splash Pool / Vehicle Yard / Animal Area as separate zones, or any
  zone-selector UI (`src/worlds/world.ts`'s `World` contract stays unused —
  see CLAUDE.md gotchas). The lake above is scenery, not a new interactive
  zone, until it's proven and the owner asks for pool-style interaction.
- A framework rewrite or new physics engine.
- Third-party/unlicensed art, sound, or character content.
