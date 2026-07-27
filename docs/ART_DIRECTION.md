# Art Direction

## Visual thesis

Purple Cougar should look like she belongs in a warm, modern animated family
feature while remaining original and web-appropriate. The visual priority is
not raw polygon count; it is a readable cougar silhouette, expressive face,
material softness, believable weight, thoughtful staging, and a ball/tether
relationship that feels playful and physical.

The first image a child sees must communicate all of this without written
instruction: **a friendly purple cougar, a fun ball, a beautiful Meadow, and a
clear invitation to touch.**

## Current visual evidence — pending / unavailable

The current repository contains source-level lighting, material, fur, camera,
Meadow, and post-processing code, but no approved Google Chrome visual baseline
was captured while the Chrome automation extension was unavailable. Therefore:

- Do not describe the current render as polished, ugly, cute, readable,
  feature-quality, or performant based on code alone.
- Do not use Brave as a replacement browser for product verification.
- Treat source observations as implementation facts only: the current hero is
  procedural quadruped geometry, the ball view is code-generated, and the scene
  has an in-progress Meadow foundation.
- Capture and review the real Chrome page before closing any art or UX task.

### Required Chrome visual record

For each review, record the date, commit, Chrome version, device/profile,
viewport, device pixel ratio, quality mode, screenshot/video location, console
errors, and action sequence. Capture at least:

1. Meadow rest/wake hero frame.
2. Ball invitation and tether slack.
3. Ball launch/taut tether and cougar reaction.
4. Three-bounce/ramp/bell celebration.
5. Desktop landscape, tablet portrait, and phone portrait framing.

Automated screenshots can prove reproducibility; a person must still judge
whether the face, pose, camera, and composition are inviting.

## Hero character direction

### Silhouette and proportion

- Female purple cougar, unmistakably feline: long tail, feline head/muzzle,
  shoulder/hip/spine structure, strong haunches, paws, and a low, graceful
  body line.
- Child-friendly stylized realism: large expressive eyes, a readable brow,
  rounded paws, gentle ears, and an approachable low centre of mass.
- She must not read as an inflatable toy, a metallic statue, a dog with a cat
  head, disconnected primitive pieces, or an unfinished modeling exercise.
- Her identity comes from movement and character performance, not gendered
  costumes or copied existing characters.

### Face and performance

- Eyes have depth, highlights, lids, brows, eye aim, and a clear gaze line.
- The muzzle is short but recognizably cougar; nose, mouth, whiskers, teeth,
  tongue, inner ears, paw pads, and claws are present at the fidelity required
  by common camera distances.
- Independent ear response, whisker secondary motion, breathing, head
  stabilization, tail motion, and weight shifts should support authored
  animation without causing jitter.
- The face must survive the default camera framing. If a detail only works at
  a close-up it is not a substitute for clear silhouette and expression.

### Coat, materials, and color

The coat is rich purple with lavender high points and deeper violet shadow,
balanced by a cream muzzle/chest/belly. It needs subtle directional/roughness
variation and soft edge sheen so it reads as fur rather than flat purple
plastic. Keep effects restrained:

- use normal/roughness/albedo variation and selected fur treatment where it
  improves the silhouette;
- reserve expensive fur cards/shell work for small, high-return regions such
  as cheeks, chest, ears, elbows, and tail;
- keep eye materials wet and alive without turning them into glass marbles;
- use ear translucency/subsurface approximation only when it fits the mobile
  budget;
- use contact shadows/AO to ground paws, chin, and overlapping forms rather
  than a grey wash over the whole scene.

The source currently generates procedural fur maps and physical materials. That
is a useful experimentation path, not proof that it meets final material or
performance quality. Final asset choices must pass the asset and Chrome gates.

## Ball and tether visual language

The ball is a co-star and must be readable even before it moves.

- Matte orange rubber ball with several thin, curving green meridian stripes.
- Small dark knot/grommet where the tether enters the top of the ball.
- Thin, black, visibly slack cord; it should droop or coil rather than read as
  a permanently straight rod.
- Red fabric cuff with a visible black Velcro patch at the attachment limb.
- Shape, rendering, and animation communicate soft/playful/safe. It must not
  look punitive, sharp, or like a trap.
- Motion sells material: rolling produces rotation, impact produces a small
  legible bounce/squash response, and tether tension has weight without
  violently jerking Purple Cougar.

## Meadow-first environment

The Bouncing Ball Meadow is a composed play space, not an empty plane with
props sprinkled onto it. Its visual hierarchy is:

1. **Purple Cougar and ball** — highest contrast, clearest face, greatest
   motion priority.
2. **The next playful affordance** — ball invitation, ramp, bell, or soft
   block, staged near her and visible without text.
3. **Meadow depth** — soft grass, flowers, moving plants, low hills, sky,
   distant scenery, clouds/butterflies/windmill/puddles as restrained ambience.
4. **Park promise** — a distant train only after the core Meadow story works.

Props have a reason: ramp directs the ball, bell rewards a path, blocks make
safe collision/play readable, plants add life. Avoid a noisy pile of unrelated
objects and avoid static set dressing that steals attention from the hero.

## Lighting, camera, and effects

- Warm key, cool gentle fill, and a controlled rim light should separate purple
  fur from green grass and blue sky.
- Contact shadow/AO should describe grounding and creases, not muddy the whole
  frame.
- Use a soft cinematic follow camera with damping, a stable horizon, child-safe
  FOV, limited rotation speed, terrain/subject obstruction handling, and no
  sudden flips.
- Keep the hero in a reliable frame through wake, stretch, ball action, and
  celebration. Camera response to a large bounce/call is subtle; avoid
  nauseating shake and aggressive motion blur.
- Provide reduced motion; communicate important feedback through animation,
  sound, and staging rather than shake alone.

## Park expansion art rules

Once the Meadow is proven, each area gets one strong visual identity while
remaining part of the same park: clear shallow aqua pool, friendly readable
vehicle shapes, train landmarks and silhouettes, and a small cast of animal
friends. Each new asset must have an interaction, animation, sound/narration
hook, and a place in the compositional hierarchy. A static vehicle or animal is
not an acceptable “completed” asset.

## Art acceptance checklist

Do not close a visual task until Chrome review confirms:

- cougar silhouette/face/paws/tail read at ordinary play distance;
- gaze tracks meaningful targets and joints/skin/rope do not visibly break;
- ball, cord, cuff, and knot remain recognizable during rest and action;
- grass, ramp, bell, and Meadow affordances read without labels;
- subject remains visible and camera does not clip or flip;
- common device orientations preserve hierarchy;
- every asset has documented original/owner-supplied rights and a mobile cost
  consistent with the performance budget.

