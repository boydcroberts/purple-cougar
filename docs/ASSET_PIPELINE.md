# Asset Pipeline

## Policy: original, owner-supplied, and rights-cleared only

Purple Cougar must never ship an unlicensed model, animation, texture, sound,
character likeness, font, or sample. The default for the Bouncing Ball Meadow
is repository-authored procedural/source-built content and original audio. Do
not add third-party downloads merely to make the prototype look more finished.

Any exception requires written owner approval before import and a manifest entry
that records source, creator, license/assignment, usage scope, modification
rights, attribution requirement, proof location, and expiry/review date. If
that evidence is absent, the asset is not eligible for the build.

There are no external runtime asset dependencies in the current static audit:
the cougar forms/materials, ball texture, cord, Meadow objects, and synthesized
audio are created in source. This is a code fact, not a claim that the generated
assets meet final visual or performance quality.

## Asset hierarchy

1. **Hero and ball:** Purple Cougar’s face, silhouette, rig/animations, cuff,
   ball, cord, and immediate interaction feedback receive the greatest quality
   and runtime budget.
2. **M1 affordances:** Meadow terrain/sky, plants/flowers, ramp, bell, blocks,
   puddle, distant train tease, particles, and original audio.
3. **Park systems:** pool/water, vehicle set, train, and animal friends are
   introduced only after the Meadow story passes its gates.
4. **Background dressing:** use instanced/procedural low-cost content and
   reduce it before compromising the hero or ball.

## Current state and target state

| Area | Current repository fact | Target production state |
| --- | --- | --- |
| Hero geometry | Procedural lofted geometry is built in src/cougar/. A procedural behavior layer now supplies limited mood/gaze/reaction motion. | A rights-cleared, animation-ready hero package with a real rig, attachment bone, face controls, stable skinning, LODs, and production material budget. |
| Coat | Canvas-generated deterministic fur maps/materials are created at runtime. | Authored/procedural hybrid material package validated for face readability and mobile frame/memory cost. |
| Ball/tether | Canvas ball texture and procedural cord mesh are created at runtime, with current invitation/celebration hooks. | The approved orange/green ball, knot, black floppy cord, and red/black cuff remain legible in all M1 states with pooled/reused runtime resources. |
| Meadow | Code constructs an in-progress Meadow, ramp, bell, and distant train tease. | A visually reviewed/budgeted first-slice environment with only the props needed for the story. |
| Audio | Web Audio creates synthesized effects/narration hooks; no sound asset library is present. | Original/rights-cleared music, calls, impacts, surface sounds, ambience, narration, and mix/volume metadata. |
| Worlds | A future World interface exists; no shipped pool, vehicle-yard, train-loop, or animal package exists. | Staged Meadow package first, then individually budgeted pool, vehicle, train, and animal packages. |

## M1 asset package: Bouncing Ball Meadow

The first slice needs only what its story can use. Every asset must support a
reaction, path, or emotional beat.

### Hero package

- Base mesh/skeleton with spine, chest, neck/head, jaw/tongue, independent
  ears, shoulder/hip structure, paws/toes, tail chain, facial controls, and a
  dedicated tether attachment bone.
- Original animations: sleep/rest, wake, stretch, calm/curious/excited idle,
  ball look/track, paw, surprise, short move/turn/stop where staging needs it,
  happy call, and celebration. Include transition/loop metadata.
- Material variants: purple/lavender/violet coat, cream contrast areas, eyes,
  nose/inner ear/paw detail, and a cautious wet-fur seam for later pool work.
- LOD and collision/interaction proxies appropriate for mobile and raycasting.

### Ball and effects package

- Orange matte ball with thin green meridians, knot/grommet, red cuff/black
  Velcro, and black flexible cord matching the approved toy reference.
- Roll/bounce/launch/tension/rest effect language: subtle particles, safe
  squash/anticipation where appropriate, original impact/tether sounds, and
  clear state changes.
- No effect may hide unstable physics. The ball must look stable when idle and
  recover visibly if it leaves a play area.

### Meadow package

- Low hills, grass, flowers, moving plants, sky/cloud/distant-scenery elements,
  gentle ambience, and a lighting/camera setup that keeps the hero dominant.
- Functional ramp, bell, soft blocks, puddle, and child-readable staging
  pieces. A tunnel, windmill, butterflies, or safe climbable shape may ship
  only if it improves the five-minute loop.
- Distant train silhouette/audio tease only; not a working train system.

### Audio/narration package

- First-gesture audio unlock and original/rights-cleared wake, ball, impact,
  tether, bell, happy call, celebration, Meadow ambience, and optional
  one-to-three counting/narration cues.
- Loudness, looping, ducking, language, and parent setting metadata are part of
  the asset—not an afterthought.
- Do not use a frightening roar, extremely loud transient, copyrighted sample,
  or generated voice without rights and disclosure appropriate to the project.

## Authoring and ingestion workflow

### 1. Brief and rights record

Before creating/importing an asset, write a small record with asset ID, purpose,
zone, interaction owner, target platforms, performance budget, source/creator,
rights, and review owner. Define whether it is source art, a derived optimized
runtime artifact, or a temporary prototype.

### 2. Author source assets

Use original source files under a controlled project directory. For 3D work,
preserve editable scene/rig/animation sources separately from optimized runtime
exports. For procedural assets, preserve deterministic seeds and source code;
do not commit unexplained binary outputs as the only source of truth.

### 3. Validate creative and technical contracts

- Hero: silhouette, face, deformation, attachment anchor, animation loops,
  transitions, LODs, and common-angle review.
- Props: scale, pivot, collision proxy, interaction affordance, safe color
  hierarchy, and no accidental copyrighted markings/likenesses.
- Audio: original/rights-cleared provenance, trim/loop points, loudness,
  browser decode/first-gesture behavior, and child-safe mix.
- Narrative: factual review, language keys, optional/interruptible playback,
  and no essential text-only meaning.

### 4. Optimize runtime artifacts

Use glTF/GLB for approved 3D runtime artifacts when an asset is ready for it;
use Meshopt or Draco only after measuring decode/download tradeoffs. Use
KTX2/Basis or a similarly documented compressed texture path when appropriate.
Generate LODs deliberately; do not lower face/eye/tether clarity to keep
unseen background props. Preload only the hero and Meadow, lazy-load later
park areas, and pool repeatedly used visual/audio resources.

### 5. Register and ship

Add every runtime asset to a versioned manifest (for example,
assets/manifest.json once an asset directory exists). CI/build validation
should reject missing source/rights metadata, unsupported formats, oversized
files, unexpected external URLs, and unreferenced duplicate variants. Release
notes should list material asset changes and their review evidence.

## Runtime budgets and performance gates

Set measured budgets before importing final assets; baseline targets are not a
license to guess. Track at minimum:

- hero mesh/skin/animation/texture memory across LODs;
- first-load and lazy-zone bytes/decode time;
- texture dimensions/formats/mip policy;
- draw calls, shadow casters, instanced environmental props, and particles;
- per-frame allocations (especially rope/curve/effect updates);
- audio decode/voice count and peak mix behavior;
- desktop and recent-tablet frame time through rest, ball launch, and ramp/bell
  celebration.

If an asset breaks the target frame budget, first reduce off-screen detail,
background density, shadow cost, effect count, or redundant resolution. Do not
silently replace Purple Cougar’s facial readability or the ball interaction
with a cheaper nonfunctional version.

## License and release gate

No asset is release-ready until all are true:

- Source or creator is recorded and rights are clear for the shipped use.
- It is original/owner-supplied or has explicit written approval and license
  evidence; no unknown provenance or scraped web content.
- Original source is retained or the procedural source/seed is reproducible.
- Runtime artifact, checksum/version, format, LOD/texture/audio variants, and
  budget are recorded.
- It has a defined visual/interaction purpose and common-angle Chrome review
  evidence when user-facing.
- It produces no console/load failure and passes mobile performance review.

## Deferred asset packages

Pool, vehicle, train, and animal asset packages stay deferred until the Meadow
passes M1. When they begin, create a package per zone rather than importing a
large uncurated bundle. A vehicle needs one or two legible actions; an animal
needs sound, animation, optional narration, and a response to Purple Cougar or
the ball. Neither may enter the park as static decorative inventory.

