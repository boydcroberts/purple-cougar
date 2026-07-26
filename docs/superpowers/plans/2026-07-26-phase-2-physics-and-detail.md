# Purple Cougar — Phase 2: Real Physics and a Detailed Cougar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scripted ball orbit with a real tethered-particle simulation driven by the cougar's own leg swing, and replace the primitive stub character with a detailed, articulated, unmistakably-cougar cougar.

**Architecture:** The physics is pure TypeScript over a plain `Vec3` interface with zero three.js imports, stepped at a fixed 1/120 s via an accumulator, using position-based dynamics. The character is a real joint hierarchy of nested `Group`s whose cuffed ankle position is handed to the physics as its anchor each frame. **The rig drives the ball** — nothing ever pushes the ball directly.

**Tech Stack:** Vite 8, TypeScript 7, three 0.185, vitest 4, playwright.

**Spec:** `docs/superpowers/specs/2026-07-26-purple-cougar-design.md` (rev 2)

**Supersedes:** `docs/superpowers/plans/2026-07-26-phase-1-playable-toy.md`. That plan is complete and merged; this one reworks its ball and character.

## Why the capture harness is Task 1

Rev 1 built the entire character blind and shipped something that read as an eyeless
teddy bear. Nobody looked at it until eight tasks in. That is the defect this ordering
fixes: the screenshot tool comes first, and **every visual task after it must capture
its own output and iterate on what it sees before reporting DONE.** For visual work,
a look-adjust-look loop beats a more precise up-front spec.

## Global Constraints

- **Target: iPad, touch-first.** Full-bleed, portrait and landscape. Click and spacebar stay wired for Mac QA.
- **No text carries meaning.** The player is 3 and cannot read. The counter is a numeral only.
- **No fail state.** The lifetime counter is cumulative, persisted, and never resets.
- **The ball is never pushed directly.** Energy enters only through the moving anchor, except for an explicit fling impulse.
- **Physics runs at a fixed 1/120 s timestep** via an accumulator, independent of display refresh rate.
- **No `Math.random()` in the sim.** Given the same anchor path and taps, the trajectory must be identical every run.
- **Pure modules import nothing from three:** `constants.ts`, `physics.ts`, `gameplay.ts`, `counter.ts`. They must run in bare node vitest.
- **All tunables live in `src/constants.ts`.** Character-composition and view-local geometry stay in their own modules; gameplay and physics numbers do not.
- **Playwright on darwin requires `--use-angle=metal`**, or headless Chromium falls back to SwiftShader at ~3fps.
- **Chrome only.** Brave's Shields block WebGL.
- **Screenshots go to `~/agents/screenshots/purple-cougar/`.** Never to the repo, never to `~/`, never to `~/.playwright-mcp/`.
- **Never `git push`.** Commit locally only.
- **Match the real toy.** The owner photographed it; these are fixed requirements, not
  styling choices, because the player recognising his own ball matters more than
  anything we would invent:
  - Ball: matte **orange** with several **thin green stripes** curving around it like meridians. (An early verbal description said blue stripes; the photo supersedes that.)
  - Cord: **thin black**, long, and visibly floppy.
  - Cuff: a **red fabric strap** with a **black velcro patch** across it.
  - A visible knot/grommet where the cord enters the **top of the ball**.

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `tools/capture.mjs` | Screenshot harness with its own browser | **new, Task 1** |
| `playwright.config.ts` | e2e config with the metal flag | **new, Task 1** |
| `src/cougar/rig.ts` | Joint hierarchy, pose API, ankle world position | **new** |
| `src/cougar/body.ts` | Torso, limbs, paws, segmented tail | **new** |
| `src/cougar/head.ts` | Skull, muzzle, nose, eyes, ears, whiskers, brows | **new** |
| `src/cougar/pose.ts` | Skip cycle, idle, tumble poses | **new** |
| `src/cougar/materials.ts` | Shared palette and materials | **new** |
| `src/world.ts` | Hills, clouds, flowers, grass tufts | **new** |
| `src/physics.ts` | Tethered-particle sim | **new**, replaces `skipball.ts` |
| `src/gameplay.ts` | Skip-cycle state machine, counter, trips | **reworked** |
| `src/ballView.ts` | Ball mesh, slack/taut cord, roll from velocity | **reworked** |
| `src/scene.ts` | Renderer, camera, three-point lighting, framing | **modified** |
| `src/main.ts` | Bootstrap, fixed-step accumulator, input, fling | **reworked** |
| `src/constants.ts` | All tunables | **modified** |
| `src/skipball.ts`, `src/hop.ts` | Orbit math, closed-form timing | **deleted** |
| `src/cougarStub.ts` | Primitive stub | **deleted** |
| `src/counter.ts`, `src/ui.ts`, `src/audio.ts` | — | **unchanged** |

---

### Task 1: Capture harness

The enabling tool. Every visual task after this uses it.

**Files:**
- Create: `tools/capture.mjs`, `playwright.config.ts`

**Interfaces:**
- Consumes: `window.__pc` (exists today from Phase 1's `main.ts`)
- Produces: a CLI that drives the running dev server and writes PNGs

- [ ] **Step 1: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

// Without --use-angle=metal, headless Chromium on darwin silently falls back to
// SwiftShader at ~3fps and every rAF-driven wait times out.
const darwinGpuArgs = process.platform === 'darwin' ? ['--use-angle=metal'] : []

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5183',
    ...devices['Desktop Chrome'],
    launchOptions: { args: darwinGpuArgs },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
```

- [ ] **Step 2: Write `tools/capture.mjs`**

```js
#!/usr/bin/env node
/**
 * Screenshot QA harness.
 *
 * Launches its OWN headless Chrome rather than reusing a shared playwright-mcp
 * profile, which locks when another session holds the browser. Never kill the
 * other session's Chrome — use this instead.
 *
 * Usage:
 *   node tools/capture.mjs <prefix> "reset:1,wait:0.5,shot:idle"
 *
 * Commands, comma separated, run in order:
 *   reset:1         reload the page and wait for the QA hook (clears all state)
 *   wait:<seconds>  let the real frame loop run
 *   tap:<n>         tap n times, spaced by the current skip duration
 *   fling:<x>,<y>   NOT comma-safe; use flingx:<x> then flingy:<y> then fling:1
 *   step:<n>        advance n fixed physics steps without rendering time
 *   eval:<expr>     evaluate and log
 *   shot:<name>     write <prefix>-<name>.png
 *   angle:<deg>     orbit the camera azimuth to <deg> for the next shots
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const OUT = join(homedir(), 'agents', 'screenshots', 'purple-cougar')
const URL = process.env.PC_URL ?? 'http://localhost:5183'

const [prefix = 'shot', script = 'wait:1,shot:default'] = process.argv.slice(2)

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[console.error]', m.text())
})
page.on('pageerror', (e) => console.error('[pageerror]', e.message))

async function boot() {
  await page.goto(URL)
  await page.waitForFunction(() => Boolean(window.__pc))
  await page.waitForTimeout(400)
}

await boot()

let flingX = 0
let flingY = 0

for (const raw of script.split(',')) {
  const [cmd, arg = ''] = raw.trim().split(':')
  switch (cmd) {
    case 'reset':
      await boot()
      break
    case 'wait':
      await page.waitForTimeout(Number(arg) * 1000)
      break
    case 'tap': {
      const n = Number(arg)
      for (let i = 0; i < n; i++) {
        await page.evaluate(() => window.__pc.tap())
        await page.waitForTimeout(500)
      }
      break
    }
    case 'flingx':
      flingX = Number(arg)
      break
    case 'flingy':
      flingY = Number(arg)
      break
    case 'fling':
      await page.evaluate(
        ([x, y]) => window.__pc.fling(x, y),
        [flingX, flingY],
      )
      break
    case 'step':
      await page.evaluate((n) => {
        for (let i = 0; i < n; i++) window.__pc.stepPhysics()
      }, Number(arg))
      break
    case 'angle':
      await page.evaluate((d) => window.__pc.setCameraAzimuth?.(d), Number(arg))
      break
    case 'eval':
      console.log(arg, '=>', JSON.stringify(await page.evaluate(arg)))
      break
    case 'shot': {
      const path = join(OUT, `${prefix}-${arg}.png`)
      await page.screenshot({ path })
      console.log('wrote', path)
      break
    }
    default:
      console.warn('unknown command:', raw)
  }
}

await browser.close()
```

- [ ] **Step 3: Prove it works against the current build**

Run:

```bash
npx playwright install chromium
npm run dev &
sleep 3
node tools/capture.mjs smoke "wait:1,shot:before"
```

Expected: `~/agents/screenshots/purple-cougar/smoke-before.png` exists and shows the
current stub cougar. Open it and confirm you can actually see the scene — a blank or
black image means the GPU flag is not working and everything downstream is blind.

Some commands reference hooks (`fling`, `stepPhysics`, `setCameraAzimuth`) that later
tasks add. They will warn or no-op until then; that is expected. `wait` and `shot`
must work now.

- [ ] **Step 4: Commit**

```bash
git add tools/capture.mjs playwright.config.ts
git commit -m "tools: screenshot capture harness and playwright config"
```

---

### Task 2: Cougar rig, body, limbs, and tail

**Files:**
- Create: `src/cougar/materials.ts`, `src/cougar/rig.ts`, `src/cougar/body.ts`
- Test: `test/rig.test.ts`

**Interfaces:**
- Consumes: `constants.ts` (`ANKLE_LOCAL`)
- Produces:

```ts
// materials.ts
export interface Palette {
  fur: MeshStandardMaterial
  furDark: MeshStandardMaterial
  cream: MeshStandardMaterial
  nose: MeshStandardMaterial
  eyeWhite: MeshStandardMaterial
  pupil: MeshStandardMaterial
  highlight: MeshBasicMaterial
  cuff: MeshStandardMaterial
}
export function createPalette(): Palette

// rig.ts
export interface Joint {
  group: Group
  rest: Euler
}
export interface Rig {
  root: Group
  hips: Joint; torso: Joint; neck: Joint; head: Joint
  shoulderL: Joint; elbowL: Joint
  shoulderR: Joint; elbowR: Joint
  hipL: Joint; kneeL: Joint; ankleL: Joint
  hipR: Joint; kneeR: Joint; ankleR: Joint
  tail: Joint[]          // base → tip, 5 segments
  cuffAnchor: Object3D   // child of ankleR; the cord attaches here
  /** World position of the cuff. Mutated in place; same object every frame. */
  cuffWorld: Vector3
  /** Recompute cuffWorld from the current pose. Call after posing, before reading. */
  syncCuff(): void
  resetToRest(): void
}
export function createRig(palette: Palette): Rig
```

**The right leg is the cuffed one** (`hipR`/`kneeR`/`ankleR`), matching Phase 1 where
`ANKLE.x` was positive. The left leg is the free one that hops.

**Detail requirements — all of these must be present and visible from the default camera:**

- Upright, kawaii proportions: head roughly 40% of standing height, chunky limbs, low centre of mass
- Torso tapering to a narrower waist, with a **cream chest-and-belly patch** clearly distinct from the purple
- Haunches — thicker thighs than shins, so he reads as a cat rather than a bear
- Chunky paws with **visible toe bumps** (3 per paw)
- A **segmented tail of 5 joints** so it can curl, with a **dark tip** on the last segment, positioned so it is visible from the default camera and not hidden directly behind him
- A **cuff** ring on the right ankle, in a contrasting colour, where the cord attaches

- [ ] **Step 1: Write the failing test**

`test/rig.test.ts` — the rig is testable headlessly; three works fine in node as long as nothing touches WebGL.

```ts
import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createPalette } from '../src/cougar/materials'
import { createRig } from '../src/cougar/rig'

describe('rig structure', () => {
  it('parents every joint into one root', () => {
    const rig = createRig(createPalette())
    for (const j of [rig.hips, rig.torso, rig.neck, rig.head, rig.hipR, rig.kneeR, rig.ankleR]) {
      let n: import('three').Object3D | null = j.group
      let found = false
      while (n) {
        if (n === rig.root) { found = true; break }
        n = n.parent
      }
      expect(found, `${j.group.name} must descend from root`).toBe(true)
    }
  })

  it('chains the right leg hip -> knee -> ankle -> cuff', () => {
    const rig = createRig(createPalette())
    expect(rig.kneeR.group.parent).toBe(rig.hipR.group)
    expect(rig.ankleR.group.parent).toBe(rig.kneeR.group)
    expect(rig.cuffAnchor.parent).toBe(rig.ankleR.group)
  })

  it('builds a five-segment tail chained base to tip', () => {
    const rig = createRig(createPalette())
    expect(rig.tail).toHaveLength(5)
    for (let i = 1; i < rig.tail.length; i++) {
      expect(rig.tail[i]!.group.parent).toBe(rig.tail[i - 1]!.group)
    }
  })

  it('reports the cuff world position at rest', () => {
    const rig = createRig(createPalette())
    rig.syncCuff()
    const p = rig.cuffWorld
    expect(p.x).toBeGreaterThan(0)          // right side
    expect(p.y).toBeGreaterThan(0)          // above ground
    expect(p.y).toBeLessThan(0.6)           // near the ankle, not the hip
  })

  it('keeps cuffWorld identity stable across syncs', () => {
    const rig = createRig(createPalette())
    const ref = rig.cuffWorld
    rig.syncCuff()
    rig.hipR.group.rotation.x = 0.7
    rig.syncCuff()
    expect(rig.cuffWorld).toBe(ref)
  })

  it('moves the cuff when the hip rotates', () => {
    const rig = createRig(createPalette())
    rig.syncCuff()
    const before = rig.cuffWorld.clone()
    rig.hipR.group.rotation.x = 0.9
    rig.syncCuff()
    expect(rig.cuffWorld.distanceTo(before)).toBeGreaterThan(0.1)
  })

  it('restores the rest pose', () => {
    const rig = createRig(createPalette())
    rig.syncCuff()
    const rest = rig.cuffWorld.clone()
    rig.hipR.group.rotation.x = 1.2
    rig.kneeR.group.rotation.x = -0.8
    rig.resetToRest()
    rig.syncCuff()
    expect(rig.cuffWorld.distanceTo(rest)).toBeLessThan(1e-9)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/cougar/rig`

- [ ] **Step 3: Implement `materials.ts`, `rig.ts`, `body.ts`**

Build the joint hierarchy as nested `Group`s. Each `Joint` stores its rest `Euler` so
`resetToRest()` can restore it. `syncCuff()` calls `root.updateMatrixWorld(true)` then
`cuffWorld.setFromMatrixPosition(cuffAnchor.matrixWorld)` — mutating in place, never
reassigning, because the physics holds this reference.

Use `group.localToWorld`-equivalent semantics via the matrix, never hand-rolled
rotation math. Phase 1 lost half a cord length to exactly that mistake.

Palette (start here, adjust by eye in Step 5):

```ts
const PURPLE = 0x9b6ef3
const PURPLE_DARK = 0x6d3fd1
const CREAM = 0xffe9c4
const NOSE_PINK = 0xff8fa8
// From the photo of the real toy — not free choices.
const CUFF_RED = 0xc8202e
const VELCRO_BLACK = 0x1a1a1a
```

The cuff is a **red fabric strap with a black velcro patch** across it, per the owner's
photo. Build it as a band around the ankle plus a darker patch, not a plain ring.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run validate`
Expected: typecheck clean, rig tests PASS

- [ ] **Step 5: LOOK AT IT — mandatory iteration loop**

The stub character is still wired into `main.ts` at this point, so temporarily render
the rig to see it. Add a throwaway line in `main.ts` adding `rig.root` to the scene,
capture, look, adjust, repeat — then revert that line before committing.

```bash
npm run dev &
sleep 3
node tools/capture.mjs rig "wait:1,shot:front"
```

Open `~/agents/screenshots/purple-cougar/rig-front.png` and check, honestly:
- Does the silhouette read as a cat rather than a bear?
- Is the cream chest patch actually visible, or buried?
- Is the tail visible from the front camera, or hidden behind him?
- Are the paws and toes readable at this camera distance?
- Do the proportions look cute, or lumpy?

Fix what looks wrong and re-capture. **Iterate at least twice.** Do not proceed on the
first render. Record in your report what you changed between iterations and why.

- [ ] **Step 6: Commit**

```bash
git add src/cougar test/rig.test.ts
git commit -m "feat: articulated cougar rig with body, limbs, and tail"
```

---

### Task 3: Cougar head and face

The single biggest miss in rev 1 was that the character had no eyes at all. This task
is where the toy gets a face.

**Files:**
- Create: `src/cougar/head.ts`
- Modify: `src/cougar/rig.ts` (attach the head assembly to `rig.head.group`)
- Test: `test/head.test.ts`

**Interfaces:**
- Consumes: `materials.ts` (`Palette`), `rig.ts` (`Rig`)
- Produces:

```ts
export interface Face {
  group: Group
  /** -1 angry .. 0 neutral .. 1 surprised. Tilts the brows. */
  setBrow(v: number): void
  /** 0 open .. 1 fully shut. Scales the eyelids down over the eyes. */
  setBlink(v: number): void
  /** Pupil offset in local units, for looking toward the ball. */
  lookAt2D(x: number, y: number): void
}
export function createFace(palette: Palette): Face
```

**Detail requirements — every one of these must be present:**

- **Two large eyes**, each built as: white sclera sphere, dark pupil sphere in front of it, and a small bright **specular highlight** sphere offset up-and-left on both eyes (the highlight is what makes eyes read as alive — do not omit it)
- **Eyelids** — a purple cap above each eye that can scale down to blink
- **Brow ridges** above the eyes that tilt for expression
- A **muzzle**: a cream rounded mass below and in front of the eyes
- A **pink nose**, triangular-ish, at the front of the muzzle
- A **mouth line** — a subtle dark curve or a small dark wedge under the nose
- **Whiskers** — three per side, thin cylinders angled outward and slightly down
- **Ears** — rounded outer purple with a distinctly visible **inner-ear cream/pink**, angled outward, not flat bear circles

- [ ] **Step 1: Write the failing test**

`test/head.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createPalette } from '../src/cougar/materials'
import { createFace } from '../src/cougar/head'

function countMeshes(o: import('three').Object3D): number {
  let n = 0
  o.traverse((c) => {
    if ((c as { isMesh?: boolean }).isMesh) n++
  })
  return n
}

describe('face', () => {
  it('builds a face with real detail, not two blobs', () => {
    const face = createFace(createPalette())
    // sclera x2, pupil x2, highlight x2, lids x2, brows x2, muzzle, nose,
    // mouth, whiskers x6, ear outer x2, ear inner x2  => comfortably over 20
    expect(countMeshes(face.group)).toBeGreaterThanOrEqual(20)
  })

  it('blinks by shrinking, and restores', () => {
    const face = createFace(createPalette())
    const lid = face.group.getObjectByName('lidL')
    expect(lid, 'lidL must exist and be named').toBeDefined()
    const open = lid!.scale.y
    face.setBlink(1)
    expect(lid!.scale.y).not.toBe(open)
    face.setBlink(0)
    expect(lid!.scale.y).toBeCloseTo(open, 6)
  })

  it('tilts brows in opposite directions for expression', () => {
    const face = createFace(createPalette())
    const l = face.group.getObjectByName('browL')!
    const r = face.group.getObjectByName('browR')!
    face.setBrow(0)
    const lz = l.rotation.z
    const rz = r.rotation.z
    face.setBrow(1)
    expect(l.rotation.z).not.toBeCloseTo(lz, 6)
    expect(r.rotation.z).not.toBeCloseTo(rz, 6)
    // Mirrored: the two brows must not rotate the same way.
    expect(Math.sign(l.rotation.z - lz)).toBe(-Math.sign(r.rotation.z - rz))
  })

  it('moves both pupils together when looking', () => {
    const face = createFace(createPalette())
    const pl = face.group.getObjectByName('pupilL')!
    const pr = face.group.getObjectByName('pupilR')!
    const before = { l: pl.position.x, r: pr.position.x }
    face.lookAt2D(0.5, 0.2)
    expect(pl.position.x).not.toBeCloseTo(before.l, 6)
    expect(pr.position.x).not.toBeCloseTo(before.r, 6)
  })

  it('gives every eye a highlight', () => {
    const face = createFace(createPalette())
    expect(face.group.getObjectByName('highlightL')).toBeDefined()
    expect(face.group.getObjectByName('highlightR')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/cougar/head`

- [ ] **Step 3: Implement `head.ts` and attach it in `rig.ts`**

Name every addressable part (`lidL`, `lidR`, `browL`, `browR`, `pupilL`, `pupilR`,
`highlightL`, `highlightR`) — the tests and later animation address them by name.

Worked exemplar for one eye, as the pattern to follow for the rest:

```ts
function buildEye(side: 1 | -1, p: Palette): Group {
  const s = side === 1 ? 'R' : 'L'
  const eye = new Group()
  eye.position.set(side * 0.13, 0.06, 0.26)

  const sclera = new Mesh(new SphereGeometry(0.085, 20, 16), p.eyeWhite)
  eye.add(sclera)

  const pupil = new Mesh(new SphereGeometry(0.052, 16, 12), p.pupil)
  pupil.name = `pupil${s}`
  pupil.position.z = 0.045
  eye.add(pupil)

  // The highlight is what makes an eye read as alive. Never omit it.
  const hl = new Mesh(new SphereGeometry(0.019, 10, 8), p.highlight)
  hl.name = `highlight${s}`
  hl.position.set(-side * 0.022, 0.03, 0.085)
  eye.add(hl)

  const lid = new Mesh(new SphereGeometry(0.09, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), p.fur)
  lid.name = `lid${s}`
  lid.position.y = 0.005
  eye.add(lid)

  return eye
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run validate`
Expected: typecheck clean, all tests PASS

- [ ] **Step 5: LOOK AT IT — mandatory iteration loop**

```bash
node tools/capture.mjs face "wait:1,shot:front"
```

Open the PNG and judge honestly:
- Is he **cute**? That is the actual requirement, and it is a judgment you must make by looking.
- Do the eyes read as alive — are the highlights visible at this camera distance?
- Does he read as a **cougar**, or still as a bear? If a bear, the fix is usually the muzzle (longer, more forward) and the ears (more angled, more triangular).
- Are the whiskers visible, or lost against the background?
- Is the face readable at the default camera distance, or is everything too small?

**Iterate at least three times on this task.** The face is the whole character. Record
each iteration and what you changed in your report.

- [ ] **Step 6: Commit**

```bash
git add src/cougar test/head.test.ts
git commit -m "feat: detailed cougar face with eyes, muzzle, ears, and whiskers"
```

---

### Task 4: Materials, world, lighting, and camera framing — LOOK CHECKPOINT

Swaps the stub character out for the real rig, dresses the world, and fixes the two
composition faults from rev 1: the empty green plane, and the character sliding out of
frame when he tumbles.

**Files:**
- Create: `src/world.ts`
- Modify: `src/scene.ts`, `src/main.ts`
- Delete: `src/cougarStub.ts`

**Interfaces:**
- Produces:

```ts
// world.ts
export interface World { group: Group; update(t: number): void }
export function createWorld(): World

// scene.ts — additions to the existing Stage
export interface Stage {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  render(): void
  resize(): void
  /** Keeps a subject framed; call each frame with the subject's world position. */
  frame(subject: Vector3): void
  /** QA hook: orbit the camera azimuth, in degrees. */
  setAzimuth(deg: number): void
}
```

**Requirements:**

- **Hills** on the horizon — two or three overlapping low mounds in a slightly different green, so there is a skyline rather than a hard line
- **Clouds** — a handful of soft white puffs drifting slowly across the sky
- **Ground dressing** — flowers and grass tufts scattered with a **seeded RNG** (fixed seed, so screenshot QA is stable). No `Math.random()`.
- **Three-point lighting** — warm key from above-right, cool fill from the left, and a rim/back light to separate him from the sky. Rev 1 had a single directional light and read flat.
- **Camera framing** — `frame(subject)` keeps the subject in the middle-lower third with gentle damping. Prove a full tumble stays on screen.
- Shadow frustum tightened to the subject (rev 1's ±6 over a ~2.2-unit subject wasted the shadow map).

- [ ] **Step 1: Implement `world.ts`, extend `scene.ts`, rewire `main.ts`**

Replace `createCougar()` from `cougarStub.ts` with the new rig, delete
`src/cougarStub.ts`, and add `world.group` to the scene. Call `stage.frame(...)` each
frame with the rig's hip world position.

- [ ] **Step 2: Verify it builds and the suite is green**

Run: `npm run validate && npm run build`
Expected: both clean

- [ ] **Step 3: LOOK AT IT — the checkpoint that matters**

```bash
node tools/capture.mjs world "wait:1,shot:hero,angle:35,shot:threequarter,angle:0,wait:3,shot:settled"
```

Judge:
- Does the whole frame look like a place, or like a character floating on a green plane?
- Is he lit so he pops off the background, or does purple-on-green go muddy?
- Is the composition balanced — is he sitting somewhere pleasing in frame?

Iterate until it looks good. This is the checkpoint the project owner will see.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: meadow world, three-point lighting, camera framing; drop the stub cougar"
```

---

### Task 5: Tethered-particle physics

The heart of the rework. Pure, deterministic, heavily tested.

**Files:**
- Create: `src/physics.ts`
- Modify: `src/constants.ts`
- Delete: `src/skipball.ts`, `src/hop.ts`, `test/skipball.test.ts`, `test/hop.test.ts`
- Test: `test/physics.test.ts`

**Constants to add to `src/constants.ts`:**

```ts
// --- Ball physics ---
/** Fixed simulation timestep, seconds. Never varies with refresh rate. */
export const PHYS_DT = 1 / 120
/** Cartoon gravity. Real 9.81 reads as floaty at this scale. */
export const GRAVITY = 18
/** Air drag coefficient, applied as exp(-AIR_DRAG * dt). */
export const AIR_DRAG = 0.35
/** Bounce retained on hitting the grass, 0..1. */
export const GROUND_RESTITUTION = 0.42
/** Horizontal friction on the ground, applied as exp(-GROUND_FRICTION * dt). */
export const GROUND_FRICTION = 2.4
/** Ball radius, world units. */
export const BALL_RADIUS = 0.17
/** Cord length, world units. */
export const CORD_LENGTH = 1.15
/** Speed below which the ball counts as "dead" and he can trip on it. */
export const TRIP_SPEED = 1.1
/** Fling impulse scale, screen units to world velocity. */
export const FLING_SCALE = 9
/** Hard cap on ball speed, so a mashed fling cannot break the solver. */
export const MAX_BALL_SPEED = 26
```

**Interfaces:**

```ts
export interface Vec3 { x: number; y: number; z: number }
export interface BallPhysics {
  pos: Vec3
  vel: Vec3
  onGround: boolean
}
export function createBall(anchor: Vec3): BallPhysics
/** One FIXED step. Callers must not vary dt. */
export function stepBall(b: BallPhysics, anchor: Vec3, dt: number): void
export function fling(b: BallPhysics, vx: number, vy: number, vz: number): void
export function speed(b: BallPhysics): number
export function cordDistance(b: BallPhysics, anchor: Vec3): number
export function cordTaut(b: BallPhysics, anchor: Vec3): boolean
```

**The algorithm — position-based dynamics. Implement exactly this order:**

```ts
export function stepBall(b: BallPhysics, anchor: Vec3, dt: number): void {
  const px = b.pos.x, py = b.pos.y, pz = b.pos.z

  // 1. Gravity
  b.vel.y -= GRAVITY * dt

  // 2. Drag — exponential so it is timestep-independent
  const d = Math.exp(-AIR_DRAG * dt)
  b.vel.x *= d; b.vel.y *= d; b.vel.z *= d

  // 3. Predict
  b.pos.x += b.vel.x * dt
  b.pos.y += b.vel.y * dt
  b.pos.z += b.vel.z * dt

  // 4. Position constraints
  solveCord(b.pos, anchor)
  const hit = solveGround(b.pos)

  // 5. Velocity from the corrected position. THIS is what transfers the moving
  //    anchor's motion into the ball — the whole design depends on this line.
  b.vel.x = (b.pos.x - px) / dt
  b.vel.y = (b.pos.y - py) / dt
  b.vel.z = (b.pos.z - pz) / dt

  // 6. Ground response
  b.onGround = hit
  if (hit) {
    if (b.vel.y < 0) b.vel.y = -b.vel.y * GROUND_RESTITUTION
    const f = Math.exp(-GROUND_FRICTION * dt)
    b.vel.x *= f; b.vel.z *= f
  }

  clampSpeed(b)
}
```

`solveCord` projects the position back onto the sphere of radius `CORD_LENGTH` around
the anchor **only when it is outside**; inside, the cord is slack and does nothing.
`solveGround` clamps `pos.y` to at least `BALL_RADIUS` and reports whether it clamped.

- [ ] **Step 1: Write the failing test**

`test/physics.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  AIR_DRAG, BALL_RADIUS, CORD_LENGTH, MAX_BALL_SPEED, PHYS_DT,
} from '../src/constants'
import {
  cordDistance, cordTaut, createBall, fling, speed, stepBall,
  type BallPhysics, type Vec3,
} from '../src/physics'

const anchor = (x = 0.22, y = 0.28, z = 0): Vec3 => ({ x, y, z })

function run(b: BallPhysics, a: Vec3, steps: number): void {
  for (let i = 0; i < steps; i++) stepBall(b, a, PHYS_DT)
}

describe('createBall', () => {
  it('starts hanging below the anchor, at rest', () => {
    const a = anchor()
    const b = createBall(a)
    expect(speed(b)).toBeCloseTo(0, 9)
    expect(cordDistance(b, a)).toBeLessThanOrEqual(CORD_LENGTH + 1e-9)
    expect(b.pos.y).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-9)
  })
})

describe('the cord constraint', () => {
  it('never lets the ball end a step beyond the cord length', () => {
    const a = anchor()
    const b = createBall(a)
    fling(b, 20, 14, 9)
    for (let i = 0; i < 4000; i++) {
      stepBall(b, a, PHYS_DT)
      expect(cordDistance(b, a)).toBeLessThanOrEqual(CORD_LENGTH + 1e-6)
    }
  })

  it('does nothing at all while slack', () => {
    const a = anchor(0, 4, 0)          // high anchor, ball far below it
    const b = createBall(a)
    b.pos = { x: 0, y: 3.6, z: 0 }     // well inside the cord length
    b.vel = { x: 0, y: 0, z: 0 }
    expect(cordTaut(b, a)).toBe(false)
    const yBefore = b.pos.y
    stepBall(b, a, PHYS_DT)
    // Free fall: dropped by roughly g*dt*dt, unaffected by the cord.
    expect(b.pos.y).toBeLessThan(yBefore)
    expect(cordTaut(b, a)).toBe(false)
  })

  it('goes taut and stops outward motion', () => {
    const a = anchor()
    const b = createBall(a)
    fling(b, 25, 0, 0)
    run(b, a, 60)
    expect(cordTaut(b, a)).toBe(true)
  })
})

describe('the ground', () => {
  it('never lets the ball sink below its radius', () => {
    const a = anchor()
    const b = createBall(a)
    fling(b, 6, -20, 3)
    for (let i = 0; i < 2000; i++) {
      stepBall(b, a, PHYS_DT)
      expect(b.pos.y).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-6)
    }
  })

  it('bounces lower each time', () => {
    const a = anchor(0, 3, 0)
    const b = createBall(a)
    b.pos = { x: 0, y: 2.0, z: 0 }
    b.vel = { x: 0, y: 0, z: 0 }
    const peaks: number[] = []
    let rising = false
    let last = b.pos.y
    for (let i = 0; i < 3000; i++) {
      stepBall(b, a, PHYS_DT)
      if (b.pos.y > last) rising = true
      else if (rising) { peaks.push(last); rising = false }
      last = b.pos.y
    }
    expect(peaks.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]!).toBeLessThan(peaks[i - 1]!)
    }
  })
})

describe('energy decay', () => {
  it('runs down to almost nothing with a static anchor and no input', () => {
    const a = anchor()
    const b = createBall(a)
    fling(b, 12, 6, 0)
    run(b, a, 3600)                    // 30 seconds
    expect(speed(b)).toBeLessThan(1.0)
  })

  it('never spontaneously speeds up with a static anchor', () => {
    const a = anchor()
    const b = createBall(a)
    fling(b, 10, 2, 4)
    let peak = speed(b)
    for (let i = 0; i < 3600; i++) {
      stepBall(b, a, PHYS_DT)
      // Gravity can add speed on a downswing, so compare against the running
      // peak with a generous margin rather than requiring monotonicity.
      peak = Math.max(peak, speed(b))
    }
    expect(speed(b)).toBeLessThan(peak)
  })
})

describe('the moving anchor', () => {
  it('drives the ball — this is the whole design', () => {
    const b = createBall(anchor())
    run(b, anchor(), 240)              // let it settle at rest
    const still = speed(b)

    // Sweep the anchor through an arc, as a swinging leg does.
    for (let i = 0; i < 60; i++) {
      const t = i / 60
      const a = anchor(0.22 + Math.sin(t * Math.PI) * 0.55, 0.28, Math.cos(t * Math.PI) * 0.4)
      stepBall(b, a, PHYS_DT)
    }
    expect(speed(b)).toBeGreaterThan(still + 0.5)
  })
})

describe('determinism', () => {
  it('produces an identical trajectory for identical inputs', () => {
    function trace(): number[] {
      const a = anchor()
      const b = createBall(a)
      fling(b, 7, 5, 3)
      const out: number[] = []
      for (let i = 0; i < 600; i++) {
        stepBall(b, a, PHYS_DT)
        out.push(b.pos.x, b.pos.y, b.pos.z)
      }
      return out
    }
    expect(trace()).toEqual(trace())
  })
})

describe('safety', () => {
  it('clamps absurd fling speeds', () => {
    const a = anchor()
    const b = createBall(a)
    fling(b, 5000, 5000, 5000)
    expect(speed(b)).toBeLessThanOrEqual(MAX_BALL_SPEED + 1e-6)
  })

  it('survives a step with a zero-length cord vector without producing NaN', () => {
    const a = anchor()
    const b = createBall(a)
    b.pos = { ...a }                   // exactly on the anchor
    b.vel = { x: 0, y: 0, z: 0 }
    stepBall(b, a, PHYS_DT)
    expect(Number.isFinite(b.pos.x)).toBe(true)
    expect(Number.isFinite(b.pos.y)).toBe(true)
    expect(Number.isFinite(b.pos.z)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/physics`

- [ ] **Step 3: Implement `src/physics.ts`; delete `skipball.ts`, `hop.ts` and their tests**

`gameplay.ts` still imports the deleted modules at this point and will not compile.
That is expected and Task 6 fixes it — but you must still leave the tree in a state
where `npm test` runs the physics suite. If the broken `gameplay.ts` import blocks the
run, temporarily stub `gameplay.ts` to a compiling skeleton and note it in your report;
Task 6 replaces it wholesale.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/physics.test.ts`
Expected: all physics tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: tethered-particle ball physics; retire the orbit sim"
```

---

### Task 6: Skip-cycle gameplay

**Files:**
- Rewrite: `src/gameplay.ts`, `test/gameplay.test.ts`
- Modify: `src/constants.ts`

**Constants to add:**

```ts
// --- Skip cycle ---
export const SKIP_DUR = 0.5
/** Cycle-relative beat boundaries, 0..1. */
export const BEAT_WIND = 0.3
export const BEAT_DRIVE = 0.64
export const BEAT_FLOAT = 0.88
/** A tap this close to the end queues the next cycle. */
export const BUFFER_WINDOW = 0.15
/** Tumble beats, seconds. */
export const TUMBLE_DUR = 1.2
export const TUMBLE_PAUSE = 0.6
export const GETUP_DUR = 0.5
```

**Interfaces:**

```ts
export type Phase = 'idle' | 'skipping' | 'tumbling' | 'getup'
export type GameEvent =
  | { type: 'skip' }
  | { type: 'count'; total: number; streak: number }
  | { type: 'trip' }
  | { type: 'getup' }
  | { type: 'fling' }
export interface GameState {
  ball: BallPhysics
  phase: Phase
  phaseT: number
  buffered: boolean
  streak: number
  total: number
  events: GameEvent[]
  store: CounterStore | null
}
export function createGame(ball: BallPhysics, store?: CounterStore | null): GameState
export function tap(g: GameState): void
export function flingBall(g: GameState, vx: number, vy: number, vz: number): void
export function advance(g: GameState, dt: number): void
export function drainEvents(g: GameState): GameEvent[]
export function skipProgress(g: GameState): number
export function tumbleProgress(g: GameState): number
```

**Behavioural contract — the tests must pin every row:**

| Rule | Behaviour |
|---|---|
| Tap while `idle` | Enter `skipping`, emit `skip` |
| Tap mid-cycle, >`BUFFER_WINDOW` from the end | Absorbed entirely |
| Tap mid-cycle, ≤`BUFFER_WINDOW` from the end | Buffered; fires on completion |
| Tap while `tumbling`/`getup` | Absorbed |
| Cycle completes | `total++`, `streak++`, emit `count`, persist |
| Cycle completes with ball speed < `TRIP_SPEED` and ball on the ground | Enter `tumbling`, emit `trip`, `streak = 0`. **`total` untouched.** |
| `tumbling` → after `TUMBLE_DUR + TUMBLE_PAUSE` | Enter `getup`, emit `getup` |
| `getup` → after `GETUP_DUR` | Enter `idle` |
| `flingBall` while not tumbling | Apply impulse, emit `fling` |

**The counter never decreases under any path.** That is the single most important
test in this file.

- [ ] **Step 1: Write the failing test** covering every contract row above, plus a
      mash-resistance test that taps 500 times across random-free fixed steps and
      asserts `total` only ever increases and matches what was persisted.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Implement `src/gameplay.ts`**

`advance()` does NOT step the physics — `main.ts` owns the fixed-step accumulator and
steps the ball with the rig's current anchor. `gameplay.ts` only reads ball state to
decide trips. Keeping the sim out of the state machine is what lets both be tested
independently.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run validate`
Expected: typecheck clean, all tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: skip-cycle state machine with trips and no-fail counter"
```

---

### Task 7: Cougar poses

**Files:**
- Create: `src/cougar/pose.ts`
- Test: `test/pose.test.ts`

**Interfaces:**

```ts
export interface Poser {
  /** t = seconds, for idle breathing and tail sway. */
  idle(rig: Rig, t: number): void
  /** p = 0..1 through the skip cycle. */
  skip(rig: Rig, p: number): void
  /** p = 0..1 through tumble + pause. */
  tumble(rig: Rig, p: number): void
  /** p = 0..1 getting back up. */
  getup(rig: Rig, p: number): void
}
export function createPoser(): Poser
```

**The skip cycle, by beat** (boundaries from `constants.ts`):

| Beat | Cuffed right leg | Free left leg | Body |
|---|---|---|---|
| Wind (0 → `BEAT_WIND`) | hip rotates back, knee bends | plants, straight | slight crouch |
| Drive (→ `BEAT_DRIVE`) | hip sweeps forward fast, knee extends | pushes off | rises |
| Float (→ `BEAT_FLOAT`) | follows through high | **knee tucked up — this is what clears the cord** | airborne, small lift |
| Land (→ 1) | returns under the body | plants | squash on contact |

Tail counter-sways against the leg swing. Ears tilt back on the drive. The face looks
toward the ball (`face.lookAt2D`) throughout.

**Tumble** must pivot about the body centre, not the feet — rev 1 rotated about the
feet and he slid out of the bottom-left of frame.

- [ ] **Step 1: Write the failing test**

Pin the mechanics that matter and are checkable headlessly:
- during Float, the free knee is more bent than at rest (the cord-clearing pose)
- the cuffed hip angle at Drive differs from at Wind, and sweeps forward not back
- `skip(rig, 0)` and `skip(rig, 1)` leave the rig within a small tolerance of each other, so cycles chain without a visible pop
- `idle` is continuous — `idle(rig, t)` and `idle(rig, t + 0.001)` differ only slightly
- `tumble(rig, 1)` returns the rig to rest rotations so `getup` starts clean
- the cuff world position sweeps a meaningful distance across the cycle (it is what drives the ball) — assert the path length over a sampled cycle exceeds a threshold

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Implement `src/cougar/pose.ts`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run validate`

- [ ] **Step 5: LOOK AT IT — mandatory**

```bash
node tools/capture.mjs pose "wait:1,shot:idle,tap:1,shot:midskip,wait:4,shot:drooped"
```

Does the skip read as a skip? Does the leg genuinely swing through, or twitch? Iterate.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: skip, idle, tumble, and getup poses"
```

---

### Task 8: Ball view, wiring, and fling — PLAYABLE CHECKPOINT

**Files:**
- Rewrite: `src/ballView.ts`, `src/main.ts`

**Requirements:**

- **The ball must match the photo of the real toy:** matte orange with several thin
  green stripes curving around it like meridians, plus a small dark knot/grommet where
  the cord enters the top. Rev 1's canvas texture drew four thick blue bands — replace
  it. Thin green arcs on orange, and keep the material matte (high roughness); the real
  ball is rubber, not glossy plastic.
- Ball position comes from `physics.pos`. Roll comes from **velocity**: angular speed
  `|v| / BALL_RADIUS` about the axis perpendicular to travel. Physically correct, and
  it self-solves rev 1's frame-rate and freeze problems.
- **The cord is thin and black**, and **must show slack.** When
  `cordDistance < CORD_LENGTH` it hangs in a catenary-ish curve; when taut it is
  straight. Build it as a `TubeGeometry` over a `CatmullRomCurve3` whose midpoint
  droops in proportion to the slack, rebuilt or morphed each frame. The owner's photo
  shows the real cord lying in loose coils — a permanently straight white stick is the
  single biggest tell that the physics is fake, and it is what rev 1 shipped.
- **Fixed-step accumulator** in `main.ts`:

```ts
let acc = 0
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  acc += dt

  while (acc >= PHYS_DT) {
    poser.skip(...)            // pose first — the rig sets the anchor
    rig.syncCuff()
    stepBall(game.ball, rig.cuffWorld, PHYS_DT)
    advance(game, PHYS_DT)
    acc -= PHYS_DT
  }
  // ... drain events, update views, render
}
```

  **Pose before stepping.** The anchor must be current for the step, or the ball lags
  the leg by a frame and the drive feels mushy.
- **Fling:** `pointerdown` → record position and time; `pointerup` → if the drag
  exceeded a small threshold, convert screen delta to a world-space impulse and call
  `flingBall`; otherwise treat it as a tap. Screen-to-world uses the camera's right
  and up vectors, so a swipe goes where it looks like it should.
- **QA hooks** `window.__pc` must expose: `game`, `tap()`, `fling(x, y)`,
  `stepPhysics()`, `setCameraAzimuth(deg)`, and `rig`. `tools/capture.mjs` already
  calls all of these.
- Delete the now-unused `hopProgress`/`tumbleProgress` imports from the old API.

- [ ] **Step 1: Implement both files**

- [ ] **Step 2: Full gate**

Run: `npm run validate && npm run build`
Expected: both clean

- [ ] **Step 3: PLAY IT — capture the full story**

```bash
node tools/capture.mjs play "reset:1,wait:1,shot:rest,tap:1,shot:skip1,tap:1,tap:1,tap:1,shot:woundup,wait:6,shot:decayed,flingx:1,flingy:0.6,fling:1,wait:0.4,shot:flung"
```

Check every one:
- `rest` — he stands, ball hangs slack below the cuff
- `skip1` — leg mid-swing, ball being dragged, cord taut
- `woundup` — ball out wide and high after four rhythmic taps
- `decayed` — ball low and near the grass after six seconds untouched
- `flung` — ball arcing away with the cord stretched out

If any of these do not show what they claim, the physics or wiring is wrong. Fix and
re-capture before reporting DONE.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: physics-driven ball view, fixed-step wiring, and fling"
```

---

### Task 9: End-to-end suite

**Files:**
- Rewrite: `e2e/smoke.spec.ts`

**Requirements:**

- Boots with a clean console. **Note:** the browser requests `/favicon.ico` and a 404
  shows up as a console error — add an inline data-URI favicon link to `index.html` so
  the assertion is honest rather than filtering the error away.
- Canvas renders at a sensible size.
- A tap increments the counter; the counter survives a reload.
- The ball never ends a frame further than `CORD_LENGTH` from the cuff — assert it
  over a few hundred real frames through the live app.
- Rhythmic taps measurably increase ball speed; leaving it alone measurably decreases it.
- A real screen tap (not just the QA hook) drives a skip.
- Frame rate stays above 20fps — guards against the SwiftShader fallback.

- [ ] **Step 1: Add the favicon to `index.html`, write the suite**
- [ ] **Step 2: Run it**

Run: `npm run e2e`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: e2e suite for the physics toy"
```

---

## Done when

- `npm run validate && npm run build && npm run e2e` all green, with pasted output.
- The Task 8 capture set exists and each shot shows what it claims.
- He looks cute and reads as a cougar.
- Nothing pushed.

## Not in this plan

Word teaching and voice; the three worlds; the scary beat. All deferred per the spec,
all with seams already designed in.

Every physics constant is a guess until a real 3-year-old plays it. Gravity, drag,
restitution, cord length, and the trip threshold interact — expect to retune them
together, and expect that to be the last real work of this phase.
