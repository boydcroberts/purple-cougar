/**
 * A stylized-realistic cougar on four legs, built entirely from lofted
 * surfaces (see loft.ts) rather than assembled primitives.
 *
 * Anatomy notes that make it read as a cat rather than a generic animal:
 *  - Long, low body: length is roughly twice the shoulder height.
 *  - Deep chest, a clear tuck-up at the waist, heavy haunches behind it.
 *  - Shoulder blades sit ABOVE the spine line on a walking cat.
 *  - Hind legs bend backwards at the hock. This is the single strongest
 *    four-legged-cat cue in a silhouette.
 *  - Tail is long, thick, and low-set — about three-quarters of body length,
 *    carried low with a slight upward kink near the base.
 *  - Small rounded head, short muzzle, small ears set wide.
 *
 * Local space: +Z is forward (the way he faces), +Y up, +X his right.
 */
import { Group, Mesh, type Material, type MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { blob, loft } from './loft'
import type { Palette } from './materials'

const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z)

export interface Quadruped {
  root: Group
  /** Shoulder-to-paw chains, for posing later. */
  legFL: Group
  legFR: Group
  legHL: Group
  legHR: Group
  neck: Group
  head: Group
  tail: Group
  /** Child of the right hind paw; the cord cuffs here. */
  cuffAnchor: Object3D
  /** World position of the cuff. Mutated in place, same object every frame. */
  cuffWorld: Vector3
  syncCuff(): void
}

/** Shoulder height at rest. Everything else is proportioned from this. */
const SHOULDER_H = 0.74

function mesh(geo: ReturnType<typeof loft>, mat: Material): Mesh {
  const m = new Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * One leg as a single continuous loft through its joints, so knee and hock
 * read as bends in one limb rather than two tubes meeting at a ball.
 */
function buildLeg(
  points: Vector3[],
  profile: number[],
  mat: MeshStandardMaterial,
): Group {
  const g = new Group()
  g.add(mesh(loft({ path: points, profile, segments: 40, radial: 16 }), mat))
  return g
}

/** A rounded paw with four toes suggested along the front edge. */
function buildPaw(mat: MeshStandardMaterial, dark: MeshStandardMaterial): Group {
  const paw = new Group()

  const pad = mesh(blob(0.062, 0.042, 0.075), mat)
  pad.position.z = 0.012
  paw.add(pad)

  for (const x of [-0.036, -0.012, 0.012, 0.036]) {
    const toe = mesh(blob(0.016, 0.014, 0.02), dark)
    toe.position.set(x, -0.012, 0.062)
    paw.add(toe)
  }

  return paw
}

function buildHead(palette: Palette): Group {
  const head = new Group()

  // Cranium — wider than tall, flat across the brow, the way a cat's is.
  const cranium = mesh(blob(0.105, 0.095, 0.105), palette.fur)
  head.add(cranium)

  // Muzzle: short and blunt on a cougar, sweeping down and forward.
  const muzzle = mesh(
    loft({
      path: [V(0, -0.005, 0.05), V(0, -0.022, 0.11), V(0, -0.034, 0.155)],
      profile: [0.078, 0.062, 0.045],
      segments: 20,
      radial: 16,
      capEnd: true,
    }),
    palette.fur,
  )
  head.add(muzzle)

  // Cream muzzle patch and chin.
  const chin = mesh(blob(0.052, 0.03, 0.05), palette.cream)
  chin.position.set(0, -0.048, 0.115)
  head.add(chin)

  // Nose leather at the tip.
  const nose = mesh(blob(0.021, 0.016, 0.014), palette.nose)
  nose.position.set(0, -0.018, 0.163)
  head.add(nose)

  for (const side of [1, -1]) {
    // Eyes set forward and fairly high — forward-facing, like a predator.
    // Set INTO the skull, not on it. A cat shows almost no sclera — the iris
    // fills nearly the whole opening. Big white eyeballs sitting proud of the
    // head is the single thing that turns a real animal into a cartoon.
    const eye = new Group()
    eye.position.set(side * 0.049, 0.022, 0.07)
    eye.rotation.y = side * 0.32
    head.add(eye)

    const sclera = mesh(blob(0.0225, 0.019, 0.018), palette.eyeWhite)
    eye.add(sclera)

    const iris = mesh(blob(0.019, 0.0175, 0.014), palette.iris)
    iris.position.z = 0.008
    eye.add(iris)

    const pupil = mesh(blob(0.0065, 0.0135, 0.008), palette.pupil)
    pupil.position.z = 0.016
    eye.add(pupil)

    // Highlight — large enough to actually read at play distance.
    const hl = mesh(blob(0.0072, 0.0072, 0.006), palette.highlight)
    hl.position.set(-side * 0.0075, 0.008, 0.021)
    eye.add(hl)

    // Upper lid: a fur hood over the top of the eye, which is what stops it
    // reading as a bare ball stuck to the face.
    const lid = mesh(blob(0.026, 0.018, 0.022), palette.fur)
    lid.position.set(side * 0.049, 0.038, 0.062)
    head.add(lid)

    // Brow ridge over each eye.
    const brow = mesh(blob(0.032, 0.011, 0.02), palette.furDark)
    brow.position.set(side * 0.053, 0.052, 0.063)
    head.add(brow)

    // Ears: small, rounded, set wide — a cougar's are not tall triangles.
    const ear = new Group()
    ear.position.set(side * 0.072, 0.088, -0.012)
    ear.rotation.z = side * 0.42
    ear.rotation.x = -0.18
    head.add(ear)

    const outer = mesh(blob(0.042, 0.05, 0.018), palette.fur)
    ear.add(outer)
    const inner = mesh(blob(0.028, 0.034, 0.012), palette.earInner)
    inner.position.z = 0.014
    ear.add(inner)

    // Cheek ruff, which is what makes a cougar's face read as broad.
    const cheek = mesh(blob(0.045, 0.045, 0.04), palette.fur)
    cheek.position.set(side * 0.072, -0.022, 0.05)
    head.add(cheek)

    // Whiskers.
    for (let i = 0; i < 3; i++) {
      const droop = -0.012 * i
      const whisker = mesh(
        loft({
          path: [
            V(side * 0.05, -0.02 + droop, 0.13),
            V(side * 0.12, -0.016 + droop, 0.14),
            V(side * 0.2, -0.03 + droop, 0.13),
          ],
          profile: [0.0025, 0.0018, 0.0009],
          segments: 10,
          radial: 5,
          capEnd: true,
        }),
        palette.whisker,
      )
      head.add(whisker)
    }
  }

  return head
}

export function createQuadruped(palette: Palette): Quadruped {
  const root = new Group()
  root.name = 'cougar'

  // --- Body: rump -> waist tuck -> deep chest -> shoulders.
  const body = mesh(
    loft({
      path: [
        V(0, SHOULDER_H - 0.10, -0.74),
        V(0, SHOULDER_H - 0.04, -0.46),
        V(0, SHOULDER_H - 0.05, -0.12),
        V(0, SHOULDER_H - 0.02, 0.24),
        V(0, SHOULDER_H + 0.0, 0.5),
      ],
      // Heavy haunch, tuck at the waist, deepest at the chest, narrowing
      // into the shoulders.
      profile: [0.168, 0.238, 0.166, 0.228, 0.148],
      segments: 64,
      radial: 24,
    }),
    palette.fur,
  )
  root.add(body)

  // Rump cap. The loft is deliberately left OPEN at the tail end: capping it
  // collapses every ring to a single vertex, so all the UVs converge there and
  // the fur texture renders as a starburst fan. A blob has sane UVs and hides
  // the opening.
  const rump = mesh(blob(0.172, 0.166, 0.14), palette.fur)
  rump.position.set(0, SHOULDER_H - 0.1, -0.73)
  root.add(rump)

  // No separate shoulder/haunch blobs. Adding muscle as extra ellipsoids on
  // top of the body puts a seam where they meet it, and better lighting only
  // made those seams more obvious — they read as lumps stuck on his back. The
  // volume belongs IN the body loft's own radius profile, where it is one
  // continuous surface by construction.

  // Cream underside running the length of the belly.
  const belly = mesh(
    loft({
      path: [
        V(0, SHOULDER_H - 0.175, -0.46),
        V(0, SHOULDER_H - 0.195, -0.1),
        V(0, SHOULDER_H - 0.175, 0.26),
      ],
      profile: [0.062, 0.072, 0.066],
      segments: 28,
      radial: 16,
      capStart: true,
      capEnd: true,
    }),
    palette.cream,
  )
  root.add(belly)

  // --- Neck, carried low and forward as a stalking cat does.
  const neck = new Group()
  root.add(neck)
  neck.add(
    mesh(
      loft({
        path: [V(0, SHOULDER_H + 0.0, 0.46), V(0, SHOULDER_H + 0.06, 0.62), V(0, SHOULDER_H + 0.1, 0.74)],
        profile: [0.145, 0.125, 0.105],
        segments: 24,
        radial: 18,
      }),
      palette.fur,
    ),
  )

  const head = buildHead(palette)
  head.position.set(0, SHOULDER_H + 0.13, 0.8)
  neck.add(head)

  // --- Legs. Front legs are near-straight; hind legs bend back at the hock.
  const legProfile = [0.072, 0.055, 0.04, 0.036]
  const hindProfile = [0.098, 0.07, 0.042, 0.038]

  const legFR = buildLeg(
    [V(0.115, SHOULDER_H - 0.04, 0.28), V(0.12, 0.44, 0.25), V(0.125, 0.2, 0.28), V(0.125, 0.05, 0.3)],
    legProfile,
    palette.fur,
  )
  const legFL = buildLeg(
    [V(-0.115, SHOULDER_H - 0.04, 0.28), V(-0.12, 0.44, 0.25), V(-0.125, 0.2, 0.28), V(-0.125, 0.05, 0.3)],
    legProfile,
    palette.fur,
  )
  // The hock: the shin runs BACKWARD from the knee before dropping to the paw.
  const legHR = buildLeg(
    [V(0.105, SHOULDER_H - 0.12, -0.52), V(0.115, 0.42, -0.44), V(0.12, 0.22, -0.58), V(0.12, 0.05, -0.5)],
    hindProfile,
    palette.fur,
  )
  const legHL = buildLeg(
    [V(-0.105, SHOULDER_H - 0.12, -0.52), V(-0.115, 0.42, -0.44), V(-0.12, 0.22, -0.58), V(-0.12, 0.05, -0.5)],
    hindProfile,
    palette.fur,
  )
  root.add(legFR, legFL, legHR, legHL)

  const pawPositions: Array<[Group, number, number]> = [
    [legFR, 0.125, 0.3],
    [legFL, -0.125, 0.3],
    [legHR, 0.12, -0.5],
    [legHL, -0.12, -0.5],
  ]
  for (const [leg, x, z] of pawPositions) {
    const paw = buildPaw(palette.fur, palette.furDark)
    paw.position.set(x, 0.042, z)
    leg.add(paw)
  }

  // --- Tail: long, thick, low-set, with a kink up near the base.
  const tail = new Group()
  root.add(tail)
  tail.add(
    mesh(
      loft({
        path: [
          V(0, SHOULDER_H - 0.12, -0.74),
          V(0.02, SHOULDER_H - 0.05, -0.98),
          V(0.05, SHOULDER_H - 0.08, -1.24),
          V(0.07, SHOULDER_H - 0.22, -1.45),
          V(0.08, SHOULDER_H - 0.36, -1.58),
        ],
        profile: [0.062, 0.056, 0.05, 0.044, 0.036],
        segments: 48,
        radial: 14,
      }),
      palette.fur,
    ),
  )
  const tailTip = mesh(
    loft({
      path: [V(0.08, SHOULDER_H - 0.36, -1.58), V(0.085, SHOULDER_H - 0.44, -1.64)],
      profile: [0.036, 0.028],
      segments: 10,
      radial: 12,
      capEnd: true,
    }),
    palette.furDark,
  )
  tail.add(tailTip)

  // --- The cuff, on the right hind paw, matching the real toy: a red strap
  // with a black velcro patch.
  const cuff = new Group()
  cuff.position.set(0.12, 0.1, -0.5)
  legHR.add(cuff)
  const strap = mesh(blob(0.055, 0.022, 0.055), palette.cuff)
  cuff.add(strap)
  const velcro = mesh(blob(0.026, 0.016, 0.02), palette.pupil)
  velcro.position.set(0, 0.004, 0.045)
  cuff.add(velcro)

  const cuffAnchor = new Object3D()
  cuffAnchor.name = 'cuffAnchor'
  cuffAnchor.position.set(0, -0.01, 0.04)
  cuff.add(cuffAnchor)

  const cuffWorld = new Vector3()
  function syncCuff(): void {
    root.updateMatrixWorld(true)
    cuffWorld.setFromMatrixPosition(cuffAnchor.matrixWorld)
  }
  syncCuff()

  return {
    root,
    legFL,
    legFR,
    legHL,
    legHR,
    neck,
    head,
    tail,
    cuffAnchor,
    cuffWorld,
    syncCuff,
  }
}
