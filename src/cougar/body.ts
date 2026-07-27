/**
 * Visual geometry for the cougar: torso, limbs, paws, tail segments, and the
 * ankle cuff. `rig.ts` owns the joint hierarchy and proportions; this module
 * just knows how to build the mesh that dresses each joint, given a size.
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import type { Palette } from './materials'

/**
 * A limb bone: a capsule whose long axis runs along local -Y, from the
 * owning joint's origin down to `length`, where the next joint sits. Always
 * kept clearly longer than it is wide — a limb must read as a sausage, not
 * a ball. (Iteration 1 let radius dominate on the thigh and it rendered as
 * a stacked sphere instead of a haunch.)
 */
export function limbSegment(
  radius: number,
  length: number,
  material: MeshStandardMaterial,
): Mesh {
  const barrel = Math.max(length - radius * 2, radius * 0.5)
  const mesh = new Mesh(new CapsuleGeometry(radius, barrel, 4, 10), material)
  mesh.position.y = -length / 2
  mesh.castShadow = true
  return mesh
}

/**
 * A rounded oval paw: a flattened, forward-pointing pad with 3 small toe
 * bumps sitting on its front-top edge. Toes on the front of a foot, not a
 * cluster on a stick.
 */
export function buildPaw(radius: number, palette: Palette): Group {
  const paw = new Group()

  const padLen = radius * 1.3
  const padRadius = radius * 0.62
  const barrel = Math.max(padLen - padRadius * 2, padRadius * 0.3)
  const pad = new Mesh(new CapsuleGeometry(padRadius, barrel, 4, 8), palette.fur)
  pad.rotation.x = Math.PI / 2 // long axis: +Y -> +Z, pointing forward
  pad.scale.y = 0.55
  pad.position.z = padLen * 0.26
  pad.castShadow = true
  paw.add(pad)

  const toeRadius = radius * 0.24
  const toeZ = padLen * 0.52
  const toeY = radius * 0.3
  for (const toeX of [-radius * 0.4, 0, radius * 0.4]) {
    const toe = new Mesh(new SphereGeometry(toeRadius, 10, 8), palette.furDark)
    toe.position.set(toeX, toeY, toeZ)
    toe.castShadow = true
    paw.add(toe)
  }

  return paw
}

/**
 * One segment of the 5-part tail. Long axis runs along local -Z (the tail
 * leaves the rear of the hips, not straight down like a limb), from the
 * joint's origin to `length`, where the next segment mounts. `tip` swaps in
 * the dark palette colour for the last segment.
 */
export function buildTailSegment(
  radius: number,
  length: number,
  palette: Palette,
  tip: boolean,
): Mesh {
  const barrel = Math.max(length - radius * 2, radius * 0.6)
  const mesh = new Mesh(
    new CapsuleGeometry(radius, barrel, 6, 8),
    tip ? palette.furDark : palette.fur,
  )
  mesh.rotation.x = -Math.PI / 2 // long axis: +Y -> -Z
  mesh.position.z = -length / 2
  mesh.castShadow = true
  return mesh
}

/**
 * Chest sphere size and torso-local height. Exported so rig.ts can place the
 * neck clearly ABOVE the chest's silhouette — a neck that overlaps the
 * chest sphere's vertical extent is entirely hidden behind it, since the
 * chest's cross-section is far wider than the neck even near its own top.
 */
export const CHEST_RADIUS = 0.24
export const CHEST_LOCAL_Y = 0.2

/**
 * Torso: a broad chest tapering to a narrower waist immediately above the
 * haunches, plus a cream chest-and-belly patch running down the front as
 * one broad panel. Sized to read as roughly the same visual mass as the
 * head, per the "substantial torso" direction.
 */
export function buildTorso(palette: Palette): Group {
  const torso = new Group()

  const chest = new Mesh(new SphereGeometry(CHEST_RADIUS, 20, 16), palette.fur)
  chest.position.set(0, CHEST_LOCAL_Y, 0)
  chest.castShadow = true
  torso.add(chest)

  const waist = new Mesh(new SphereGeometry(0.21, 18, 14), palette.fur)
  waist.position.set(0, -0.08, -0.01)
  waist.castShadow = true
  torso.add(waist)

  // A broad cream panel down the chest and belly — not a small oval.
  const belly = new Mesh(new SphereGeometry(0.34, 18, 14), palette.cream)
  belly.position.set(0, 0.08, 0.23)
  belly.scale.set(0.62, 1.15, 0.42)
  torso.add(belly)

  return torso
}

/**
 * The skull: a flattened, wider-than-tall main mass plus a smaller forward
 * "muzzle bump" pushed toward the face direction — never a bare sphere.
 * Still plain purple; Task 3 adds the cream muzzle patch, nose, eyes, and
 * ears as a face assembly on top of this same shape, sized to fully cover
 * the bump beneath it.
 */
export function buildSkull(radius: number, palette: Palette): Group {
  const skull = new Group()

  const main = new Mesh(new SphereGeometry(radius, 22, 16), palette.fur)
  main.scale.set(1.12, 0.86, 1.0)
  main.castShadow = true
  skull.add(main)

  const muzzle = new Mesh(new SphereGeometry(radius * 0.6, 16, 12), palette.fur)
  muzzle.position.set(0, -radius * 0.32, radius * 0.68)
  muzzle.scale.set(0.92, 0.8, 1.05)
  muzzle.castShadow = true
  skull.add(muzzle)

  return skull
}

/**
 * The real toy's cuff: a red fabric strap around the ankle plus a black
 * velcro patch across it — not a plain ring.
 */
export function buildCuff(palette: Palette): Group {
  const cuff = new Group()

  const band = new Mesh(new TorusGeometry(0.115, 0.034, 8, 16), palette.cuff)
  band.rotation.x = Math.PI / 2
  band.position.set(0, 0.08, 0.01)
  band.castShadow = true
  cuff.add(band)

  // Centred on the band's front-most point and facing the camera flat-on.
  const velcro = new Mesh(new BoxGeometry(0.09, 0.062, 0.022), palette.pupil)
  velcro.position.set(0, 0.08, 0.15)
  cuff.add(velcro)

  return cuff
}
