/**
 * The joint hierarchy: a real skeleton of nested Groups, not a bag of loose
 * meshes. Poses (later tasks) are joint rotations applied to `Joint.group`.
 *
 * The cuffed ankle's world position is read off `cuffAnchor` via three's own
 * matrix math (`syncCuff`) — never hand-rolled. Phase 1 hand-rolled this exact
 * computation and got the transform order wrong (three composes T·R·S, so
 * translation applies after rotation), misplacing the ankle by 42% of the
 * cord length whenever the character rotated. `cuffWorld` is mutated in
 * place and keeps the same object identity forever, because the ball physics
 * (a later task) holds a permanent reference to it.
 */
import { Euler, Group, Object3D, Vector3 } from 'three'
import type { Palette } from './materials'
import {
  buildCuff,
  buildPaw,
  buildSkull,
  buildTailSegment,
  buildTorso,
  CHEST_LOCAL_Y,
  CHEST_RADIUS,
  limbSegment,
} from './body'

export interface Joint {
  group: Group
  /** Rotation this joint starts at and returns to via resetToRest(). */
  rest: Euler
}

export interface Rig {
  root: Group
  hips: Joint
  torso: Joint
  neck: Joint
  head: Joint
  shoulderL: Joint
  elbowL: Joint
  shoulderR: Joint
  elbowR: Joint
  hipL: Joint
  kneeL: Joint
  ankleL: Joint
  hipR: Joint
  kneeR: Joint
  ankleR: Joint
  /** Base -> tip, 5 segments. */
  tail: Joint[]
  /** Child of ankleR; the cord attaches here. */
  cuffAnchor: Object3D
  /** World position of the cuff. Mutated in place; same object every frame. */
  cuffWorld: Vector3
  /** Recompute cuffWorld from the current pose. Call after posing, before reading. */
  syncCuff(): void
  resetToRest(): void
}

// --- Proportions -----------------------------------------------------------
// A chunky plush cat standing upright. Tuned by eye against tools/capture.mjs
// — coordinates below are ground truth for the current render, not a formula
// derived from a real cougar's skeleton. Two hard-won corrections baked in
// after the first look:
//  - The head is NOT 40% of standing height (that produced a lollipop). It
//    is a little under a third, and it is never a bare sphere — a forward
//    "muzzle bump" gives Task 3 a face to build onto.
//  - Every limb bone is a capsule with barrel length clearly greater than
//    its radius (see limbSegment/buildTailSegment). A radius-dominant
//    capsule degenerates into a sphere and limbs read as a caterpillar of
//    stacked beads instead of a haunch, a shin, and a foot.

/** Ground -> top of head at rest, approximately (not enforced elsewhere). */
const STANDING_HEIGHT = 1.9
/** A little under a third of standing height — 40% produced a lollipop. */
const HEAD_RADIUS = STANDING_HEIGHT * 0.147

const PAW_RADIUS = 0.15
const ANKLE_Y = 0.15
const SHIN_LEN = 0.3
const SHIN_RADIUS = 0.075
const KNEE_Y = ANKLE_Y + SHIN_LEN
const THIGH_LEN = 0.36
/** Clearly thicker than SHIN_RADIUS — the haunch that reads as a cat. */
const THIGH_RADIUS = 0.145
const HIP_Y = KNEE_Y + THIGH_LEN
const LEG_X = 0.2
const HIPS_Y = HIP_Y + 0.08

const TORSO_Y = HIPS_Y + 0.08
const CHEST_CENTER_Y = TORSO_Y + CHEST_LOCAL_Y
const CHEST_TOP_Y = CHEST_CENTER_Y + CHEST_RADIUS
const NECK_LEN = 0.22
/** Clearly thinner than both the head and the chest — a real pinch, not a
 *  seamless dome-onto-chest blend. */
const NECK_RADIUS = 0.12
/**
 * The neck's bottom sits just above the chest's own top (a small overlap
 * for a seamless join, not buried inside it) — a first pass put the whole
 * neck mesh well within the chest sphere's vertical extent, where the
 * chest's cross-section is still far wider than the neck, so it rendered
 * completely hidden. Confirmed by checking chest-top vs neck-bottom
 * directly, not by re-guessing from the render.
 */
const NECK_TOP_Y = CHEST_TOP_Y + 0.02 + NECK_LEN
/**
 * The head sits well above the neck's own mount point (not just barely
 * above it) so a real span of neck is exposed below the head's bottom
 * curve — an ellipsoid tapers slowly near its pole, so even "the head's
 * bottom edge" is still wider than the neck unless the head is lifted
 * clear of the neck's lower two-thirds. Checked against the head's actual
 * scaled radius, not assumed.
 */
const HEAD_CENTER_Y = NECK_TOP_Y + 0.14

const SHOULDER_Y = CHEST_CENTER_Y + 0.02
/**
 * Chest radius is 0.29; a 0.27 shoulder mount (iteration 3) sat INSIDE that
 * sphere, so the whole upper arm rendered swallowed by the torso — confirmed
 * by a ground-truth position dump, not guessed from pixels. Mounted clearly
 * outside the chest here so the arm reads as its own hanging limb.
 */
const SHOULDER_X = 0.27
/** Noticeably shorter and thinner than the legs — arms, not haunches. */
const UPPER_ARM_LEN = 0.2
const UPPER_ARM_RADIUS = 0.065
const FOREARM_LEN = 0.16
const FOREARM_RADIUS = 0.055
const HAND_RADIUS = 0.09

/** Base -> tip: each segment a little shorter and thinner than the last. */
const TAIL_LEN = [0.26, 0.22, 0.19, 0.16, 0.13]
const TAIL_RADIUS = [0.105, 0.09, 0.078, 0.064, 0.05]
/**
 * Incremental pitch per segment (radians, local X, inside the yawed plane
 * the base sets up). Cumulative sum runs well past horizontal across the
 * chain, curving the tail out and up.
 */
const TAIL_PITCH = [-0.2, 0.2, 0.26, 0.3, 0.28]
/**
 * Yaw applied only at the base (radians, local Y). Swings the whole chain's
 * plane of curl out to one side — verified against the actual rendered
 * silhouette, not assumed from the rotation math, because iteration 1's
 * mild yaw with no sideways sweep left the tail fully hidden behind the
 * torso, and iteration 2's sign choice swung it to the SAME side as the
 * cuffed leg, tangling the two in silhouette. Positive here sweeps to -X,
 * the side opposite the cuff, confirmed by capture.
 */
const TAIL_BASE_YAW = 0.8

function joint(
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  name: string,
): Joint {
  const group = new Group()
  group.name = name
  group.position.set(x, y, z)
  group.rotation.set(rx, ry, rz)
  parent.add(group)
  return { group, rest: group.rotation.clone() }
}

export function createRig(palette: Palette): Rig {
  const root = new Group()
  root.name = 'cougarRoot'

  // --- Pelvis ---
  const hips = joint(root, 0, HIPS_Y, 0, 0, 0, 0, 'hips')

  // --- Right (cuffed) hind leg ---
  const hipR = joint(hips.group, LEG_X, HIP_Y - HIPS_Y, 0.02, 0.05, 0, 0, 'hipR')
  const kneeR = joint(hipR.group, 0, -THIGH_LEN, 0, -0.15, 0, 0, 'kneeR')
  const ankleR = joint(kneeR.group, 0, -SHIN_LEN, 0, 0, 0, 0, 'ankleR')
  hipR.group.add(limbSegment(THIGH_RADIUS, THIGH_LEN, palette.fur))
  kneeR.group.add(limbSegment(SHIN_RADIUS, SHIN_LEN, palette.fur))
  ankleR.group.add(buildPaw(PAW_RADIUS, palette))
  ankleR.group.add(buildCuff(palette))

  const cuffAnchor = new Object3D()
  cuffAnchor.name = 'cuffAnchor'
  // Slightly outside and forward of the ankle, where a cord clip would tie
  // onto the strap.
  cuffAnchor.position.set(0.09, 0.09, 0.05)
  ankleR.group.add(cuffAnchor)

  // --- Left (free) hind leg ---
  const hipL = joint(hips.group, -LEG_X, HIP_Y - HIPS_Y, 0.02, 0.05, 0, 0, 'hipL')
  const kneeL = joint(hipL.group, 0, -THIGH_LEN, 0, -0.15, 0, 0, 'kneeL')
  const ankleL = joint(kneeL.group, 0, -SHIN_LEN, 0, 0, 0, 0, 'ankleL')
  hipL.group.add(limbSegment(THIGH_RADIUS, THIGH_LEN, palette.fur))
  kneeL.group.add(limbSegment(SHIN_RADIUS, SHIN_LEN, palette.fur))
  ankleL.group.add(buildPaw(PAW_RADIUS, palette))

  // --- Torso, neck, head ---
  const torso = joint(hips.group, 0, TORSO_Y - HIPS_Y, 0.02, 0, 0, 0, 'torso')
  torso.group.add(buildTorso(palette))

  // neck.position is the TOP of the neck (where the head mounts); the neck
  // mesh (below) hangs down from there via the shared -Y bone convention,
  // filling the gap back to the chest.
  const neck = joint(torso.group, 0, NECK_TOP_Y - TORSO_Y, 0.04, 0.05, 0, 0, 'neck')
  neck.group.add(limbSegment(NECK_RADIUS, NECK_LEN, palette.fur))
  const head = joint(neck.group, 0, HEAD_CENTER_Y - NECK_TOP_Y, 0.06, -0.05, 0, 0, 'head')
  head.group.add(buildSkull(HEAD_RADIUS, palette))

  // --- Arms: noticeably shorter and thinner than the legs, hanging near
  // the sides. Kept close to the rest rotation (near zero) deliberately —
  // a larger shoulder kink in iteration 2 swung the whole arm up and out
  // until it read as a disconnected floating shape instead of a hanging
  // limb.
  const shoulderR = joint(torso.group, SHOULDER_X, SHOULDER_Y - TORSO_Y, 0.03, 0.05, 0, -0.1, 'shoulderR')
  const elbowR = joint(shoulderR.group, 0, -UPPER_ARM_LEN, 0, 0.15, 0, 0, 'elbowR')
  shoulderR.group.add(limbSegment(UPPER_ARM_RADIUS, UPPER_ARM_LEN, palette.fur))
  elbowR.group.add(limbSegment(FOREARM_RADIUS, FOREARM_LEN, palette.fur))
  const handR = buildPaw(HAND_RADIUS, palette)
  handR.position.y = -FOREARM_LEN
  elbowR.group.add(handR)

  const shoulderL = joint(torso.group, -SHOULDER_X, SHOULDER_Y - TORSO_Y, 0.03, 0.05, 0, 0.1, 'shoulderL')
  const elbowL = joint(shoulderL.group, 0, -UPPER_ARM_LEN, 0, 0.15, 0, 0, 'elbowL')
  shoulderL.group.add(limbSegment(UPPER_ARM_RADIUS, UPPER_ARM_LEN, palette.fur))
  elbowL.group.add(limbSegment(FOREARM_RADIUS, FOREARM_LEN, palette.fur))
  const handL = buildPaw(HAND_RADIUS, palette)
  handL.position.y = -FOREARM_LEN
  elbowL.group.add(handL)

  // --- Tail: 5 segments, base to tip, dark tip, swept clear of the body ---
  const tail: Joint[] = []
  let parent: Object3D = hips.group
  // Base of the spine, at the back of the pelvis — NOT up at chest height.
  // A +0.1 mount here put the tail root level with the shoulders, where it
  // read as a stubby antenna sprouting from a shoulder blade.
  let mountX = 0
  let mountY = -0.06
  let mountZ = -0.17
  for (let i = 0; i < TAIL_LEN.length; i++) {
    const length = TAIL_LEN[i]!
    const radius = TAIL_RADIUS[i]!
    const pitch = TAIL_PITCH[i]!
    const yaw = i === 0 ? TAIL_BASE_YAW : 0
    const seg = joint(parent, mountX, mountY, mountZ, pitch, yaw, 0, `tail${i}`)
    seg.group.add(buildTailSegment(radius, length, palette, i === TAIL_LEN.length - 1))
    tail.push(seg)
    parent = seg.group
    mountX = 0
    mountY = 0
    mountZ = -length
  }

  const cuffWorld = new Vector3()

  function syncCuff(): void {
    root.updateMatrixWorld(true)
    cuffWorld.setFromMatrixPosition(cuffAnchor.matrixWorld)
  }

  const allJoints: Joint[] = [
    hips,
    torso,
    neck,
    head,
    shoulderL,
    elbowL,
    shoulderR,
    elbowR,
    hipL,
    kneeL,
    ankleL,
    hipR,
    kneeR,
    ankleR,
    ...tail,
  ]

  function resetToRest(): void {
    for (const j of allJoints) j.group.rotation.copy(j.rest)
  }

  return {
    root,
    hips,
    torso,
    neck,
    head,
    shoulderL,
    elbowL,
    shoulderR,
    elbowR,
    hipL,
    kneeL,
    ankleL,
    hipR,
    kneeR,
    ankleR,
    tail,
    cuffAnchor,
    cuffWorld,
    syncCuff,
    resetToRest,
  }
}
