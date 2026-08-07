/**
 * High-fidelity desktop hero presentation.
 *
 * A lightweight compatible quadruped remains the source of truth for behavior
 * and physics. This camera-facing cutout supplies the visible character, so
 * the cuff, tethered ball, deterministic controller, and 3D debug fallbacks
 * keep their existing contracts.
 */
import {
  BufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  type Raycaster,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import { createContactShadow, type ContactShadow } from '../contactShadow'
import { applyHeroGrade } from './heroGrade'
import type { Quadruped } from './quadruped'

const DEFAULT_HERO_URL = '/assets/purple-cougar-cub-hero-v1.webp'

// EVERY constant below is pixel-measured against that exact plate: a 676x972
// canvas whose matted cub occupies x 31..645, y 44..928. Changing the hero
// image without re-measuring them animates the wrong fur — ear flicks land on
// a shoulder and the tether leaves mid-flank. Re-cut with
// tools/subject-cutout.swift and re-read the anchors before touching the URL.
const HERO_PIXEL_WIDTH = 676
const HERO_PIXEL_HEIGHT = 972
const HERO_SUBJECT_LEFT = 31
const HERO_SUBJECT_TOP = 44
const HERO_SUBJECT_WIDTH = 614
const HERO_SUBJECT_HEIGHT = 884

// The cub faces the camera, so her plate is tall and narrow where the previous
// side-on adult was wide. Height is chosen so the painted body stands ~1.16
// world units — shorter and rounder than the adult, which is the whole point.
const PLANE_HEIGHT = 1.28
const PLANE_WIDTH = PLANE_HEIGHT * (HERO_PIXEL_WIDTH / HERO_PIXEL_HEIGHT)
// Puts the painted front paws on y=0 so she stands on the path, not above it.
const PLANE_CENTER_Y =
  ((HERO_SUBJECT_TOP + HERO_SUBJECT_HEIGHT) / HERO_PIXEL_HEIGHT - 0.5) *
  PLANE_HEIGHT

// Darkness of the hero's grounding blob while all four paws are down.
const HERO_SHADOW_STRENGTH = 0.9

// The plate paints a short cord stub leaving the hind ankle. Anchoring the
// real tether at the top of that stub is what makes the painted and simulated
// halves read as one cord instead of two.
const CUFF_SOURCE_U = 0.658
const CUFF_SOURCE_Y = 0.738
const CUFF_LOCAL_X = (CUFF_SOURCE_U - 0.5) * PLANE_WIDTH
const CUFF_LOCAL_Y = (0.5 - CUFF_SOURCE_Y) * PLANE_HEIGHT
// Pixel-measured nontransparent trim of the authored WebP. This cheap first
// pass rejects the transparent margin before the generous hero hit test can
// consume a ball or world-discovery tap.
const HERO_ALPHA_MIN_U = HERO_SUBJECT_LEFT / HERO_PIXEL_WIDTH
const HERO_ALPHA_MAX_U =
  (HERO_SUBJECT_LEFT + HERO_SUBJECT_WIDTH) / HERO_PIXEL_WIDTH
const HERO_ALPHA_MIN_SOURCE_Y = HERO_SUBJECT_TOP / HERO_PIXEL_HEIGHT
const HERO_ALPHA_MAX_SOURCE_Y =
  (HERO_SUBJECT_TOP + HERO_SUBJECT_HEIGHT) / HERO_PIXEL_HEIGHT
// The cub's tail leaves her right haunch and curls up over her back. Points
// are (u, v) with v measured from the image bottom, like a Three UV.
const TAIL_CENTERLINE = [
  [0.775, 0.655],
  [0.800, 0.710],
  [0.845, 0.757],
  [0.898, 0.786],
  [0.937, 0.762],
  [0.928, 0.722],
] as const
// Half-width of the bendable tail band, as a fraction of plate width so a
// future re-plate at a different resolution keeps the same feathering.
const TAIL_BAND_INNER = HERO_PIXEL_WIDTH * 0.02
const TAIL_BAND_OUTER = HERO_PIXEL_WIDTH * 0.044

export type HeroReaction = 'happy' | 'surprised' | 'roar'

/** One readable piece of idle charm, layered over the ambient breathing. */
export interface HeroIdleBeat {
  /** Curious head cock, -1 (her left) to 1 (her right). */
  readonly headTilt: number
  /** Snappy tail swish, -1 to 1. */
  readonly tailFlick: number
  /** Both ears up at once, 0 to 1. */
  readonly earPerk: number
  /** Delighted little haunch wiggle, -1 to 1. */
  readonly wiggle: number
}

const IDLE_BEAT_PERIOD = 5.5
const IDLE_BEAT_DURATION = 1.5
const NO_IDLE_BEAT: HeroIdleBeat = { headTilt: 0, tailFlick: 0, earPerk: 0, wiggle: 0 }

/**
 * Ambient breathing alone keeps a cutout from looking dead, but it never makes
 * her look *cute* — that comes from occasional, readable beats a child can
 * actually notice: a head cock, a tail swish, both ears popping up, a wiggle.
 *
 * Deterministic in elapsed time (no RNG) so the whole hero presentation stays
 * reproducible frame-for-frame, and pure so the cadence is testable.
 */
export function sampleHeroIdleBeat(elapsedSeconds: number): HeroIdleBeat {
  const time = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0)
  const cycle = Math.floor(time / IDLE_BEAT_PERIOD)
  const phase = (time % IDLE_BEAT_PERIOD) / IDLE_BEAT_DURATION
  // Each beat occupies only the first IDLE_BEAT_DURATION of its cycle; the
  // rest is calm, which is what makes the next one register.
  if (phase >= 1) return NO_IDLE_BEAT

  // A half-sine envelope means every beat eases in and out of the ambient
  // motion instead of snapping on at the cycle boundary.
  const envelope = Math.sin(phase * Math.PI)
  switch (cycle % 4) {
    case 0:
      // Alternate which way she cocks her head so it never looks like a tic.
      return { ...NO_IDLE_BEAT, headTilt: envelope * (cycle % 8 === 0 ? 1 : -1) }
    case 1:
      return { ...NO_IDLE_BEAT, tailFlick: Math.sin(phase * Math.PI * 3) * envelope }
    case 2:
      return { ...NO_IDLE_BEAT, earPerk: envelope }
    default:
      return { ...NO_IDLE_BEAT, wiggle: Math.sin(phase * Math.PI * 4) * envelope }
  }
}

export interface HeroDeformationPose {
  /** Signed inhale/exhale amount in the range -1...1. */
  breath: number
  /** A small shoulder-to-haunch weight transfer, normalized to -1...1. */
  torsoSway?: number
  /** A gentle raised-shoulder motion, normalized to -1...1. */
  shoulderLift?: number
  /** World-space translation of the painted head region. */
  headShiftX: number
  headLift: number
  /** Signed rotation in radians around the painted neck. */
  headRoll: number
  /** Signed bend in radians around the painted tail base. */
  tailSwing: number
  /** A smaller counter-bend through the curled half of the tail. */
  tailCurl?: number
  /** Independent ear rotations keep the face from reading as a still photo. */
  leftEarFlick: number
  rightEarFlick: number
}

export interface MutableHeroPoint {
  x: number
  y: number
}

export interface HeroBillboard {
  root: Group
  react(reaction: HeroReaction, intensity?: number): void
  update(
    deltaSeconds: number,
    camera: PerspectiveCamera,
    rigRoot: Object3D,
  ): void
  syncCuff(target: Vector3): void
  /** Generous child-friendly test: does this pointer ray touch the hero card? */
  hitTest(raycaster: Raycaster): boolean
  dispose(): void
}

/** Reject the known transparent border around the authored hero image. */
export function isHeroHitUv(u: number, v: number): boolean {
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) return false
  const sourceY = 1 - v
  return (
    u >= HERO_ALPHA_MIN_U &&
    u <= HERO_ALPHA_MAX_U &&
    sourceY >= HERO_ALPHA_MIN_SOURCE_Y &&
    sourceY <= HERO_ALPHA_MAX_SOURCE_Y
  )
}

/**
 * The image presentation needs transforms, not a second 2.9 MB visible model.
 * This tiny compatible rig keeps behavior and physics contracts intact while
 * the billboard supplies the authored pixels and cuff position.
 */
export function createHeroDriverQuadruped(): Quadruped {
  const root = new Group()
  root.name = 'cougar'

  const neck = new Group()
  neck.name = 'neck'
  neck.position.set(0, 0.62, 0.34)
  root.add(neck)

  const head = new Group()
  head.name = 'head'
  neck.add(head)

  const tail = new Group()
  tail.name = 'tail'
  tail.position.set(0, 0.61, -0.75)
  root.add(tail)

  const makeLeg = (name: string): Group => {
    const leg = new Group()
    leg.name = name
    root.add(leg)
    return leg
  }
  const legFL = makeLeg('legFL')
  const legFR = makeLeg('legFR')
  const legHL = makeLeg('legHL')
  const legHR = makeLeg('legHR')

  const cuffAnchor = new Object3D()
  cuffAnchor.name = 'cuffAnchor'
  cuffAnchor.position.set(0.31, 0.22, -0.23)
  root.add(cuffAnchor)

  const cuffWorld = new Vector3()
  function syncCuff(): void {
    root.updateMatrixWorld(true)
    cuffAnchor.getWorldPosition(cuffWorld)
  }

  const result: Quadruped = {
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
  syncCuff()
  return result
}

interface ActiveReaction {
  kind: HeroReaction
  age: number
  duration: number
  intensity: number
}

const HERO_NEUTRAL_POSE: HeroDeformationPose = {
  breath: 0,
  torsoSway: 0,
  shoulderLift: 0,
  headShiftX: 0,
  headLift: 0,
  headRoll: 0,
  tailSwing: 0,
  tailCurl: 0,
  leftEarFlick: 0,
  rightEarFlick: 0,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function ellipseMask(
  u: number,
  v: number,
  centerU: number,
  centerV: number,
  radiusU: number,
  radiusV: number,
): number {
  const x = (u - centerU) / radiusU
  const y = (v - centerV) / radiusV
  return 1 - smoothstep(0.72, 1.08, Math.hypot(x, y))
}

function tailMask(u: number, v: number): number {
  let closestDistance = Number.POSITIVE_INFINITY
  let closestProgress = 0
  const segmentCount = TAIL_CENTERLINE.length - 1

  for (let index = 0; index < segmentCount; index += 1) {
    const start = TAIL_CENTERLINE[index]!
    const end = TAIL_CENTERLINE[index + 1]!
    const segmentX = (end[0] - start[0]) * HERO_PIXEL_WIDTH
    const segmentY = (end[1] - start[1]) * HERO_PIXEL_HEIGHT
    const pointX = (u - start[0]) * HERO_PIXEL_WIDTH
    const pointY = (v - start[1]) * HERO_PIXEL_HEIGHT
    const lengthSquared = segmentX * segmentX + segmentY * segmentY
    const segmentProgress = clamp(
      (pointX * segmentX + pointY * segmentY) / lengthSquared,
      0,
      1,
    )
    const dx = pointX - segmentX * segmentProgress
    const dy = pointY - segmentY * segmentProgress
    const distance = Math.hypot(dx, dy)

    if (distance < closestDistance) {
      closestDistance = distance
      closestProgress = (index + segmentProgress) / segmentCount
    }
  }

  const contourWeight =
    1 - smoothstep(TAIL_BAND_INNER, TAIL_BAND_OUTER, closestDistance)
  const rootWeight = smoothstep(0.035, 0.2, closestProgress)
  return contourWeight * rootWeight
}

function finitePoseValue(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function rotateMasked(
  point: MutableHeroPoint,
  pivotU: number,
  pivotV: number,
  angle: number,
  weight: number,
): void {
  if (Math.abs(angle) < 1e-7 || weight <= 0) return
  const pivotX = (pivotU - 0.5) * PLANE_WIDTH
  const pivotY = (pivotV - 0.5) * PLANE_HEIGHT
  const dx = point.x - pivotX
  const dy = point.y - pivotY
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const rotatedX = pivotX + dx * cosine - dy * sine
  const rotatedY = pivotY + dx * sine + dy * cosine
  point.x += (rotatedX - point.x) * weight
  point.y += (rotatedY - point.y) * weight
}

/**
 * Deforms one point of the subdivided hero card. All masks feather across
 * painted fur, so motion has no cut seams. The lower paws and rear cuff live
 * outside every mask and therefore stay locked to the world and tether.
 */
export function deformHeroPoint(
  baseX: number,
  baseY: number,
  u: number,
  v: number,
  pose: Readonly<HeroDeformationPose>,
  target: MutableHeroPoint,
): void {
  target.x = baseX
  target.y = baseY

  // The ribcage expands above the planted legs instead of scaling the whole
  // photograph. That small distinction is what prevents "breathing" paws.
  // v=0.36 is the cub's belly line. The mask must start above it: her hind
  // cuff sits at v=0.262, and any breathing that reaches it drags the tether
  // anchor off her ankle.
  const bodyMask =
    smoothstep(0.16, 0.28, u) *
    (1 - smoothstep(0.82, 0.92, u)) *
    smoothstep(0.36, 0.48, v) *
    (1 - smoothstep(0.58, 0.72, v))
  const bodyHeight = smoothstep(0.36, 0.60, v)
  const bodyPivotX = (0.5 - 0.5) * PLANE_WIDTH
  target.x +=
    (baseX - bodyPivotX) * pose.breath * bodyMask * bodyHeight * 0.006
  target.y += pose.breath * bodyMask * bodyHeight * 0.0085

  // A slow weight transfer gives the planted cat a living center of gravity
  // without moving either pair of paws. The mask is deliberately limited to
  // the torso; carrying it onto the foreleg would make the cutout skate.
  const torsoSway = finitePoseValue(pose.torsoSway)
  target.x += torsoSway * bodyMask * 0.0065

  // The chest/shoulder shelf under her chin is the most readable place for a
  // small inhale, perk, or delighted bounce. Keeping it above the elbows
  // preserves the planted front paws and the chunky cub silhouette.
  const shoulderMask = ellipseMask(u, v, 0.45, 0.47, 0.17, 0.11)
  target.y += finitePoseValue(pose.shoulderLift) * shoulderMask * 0.012

  // Ears move first so the head transform naturally carries them along.
  const leftEarMask = ellipseMask(u, v, 0.160, 0.845, 0.098, 0.105)
  const rightEarMask = ellipseMask(u, v, 0.555, 0.850, 0.088, 0.100)
  rotateMasked(
    target,
    0.200,
    0.740,
    pose.leftEarFlick,
    leftEarMask,
  )
  rotateMasked(
    target,
    0.510,
    0.750,
    pose.rightEarFlick,
    rightEarMask,
  )

  // Her head is centred and nearly as wide as her body, so the old
  // left-quadrant mask would have rolled half her torso with it.
  const headMask =
    (1 - smoothstep(0.62, 0.76, u)) * smoothstep(0.48, 0.62, v)
  rotateMasked(target, 0.370, 0.500, pose.headRoll, headMask)
  target.x += pose.headShiftX * headMask
  target.y += pose.headLift * headMask

  // Only the exposed tail arc bends. The haunch and cuffed rear leg remain
  // untouched even though they share the same broad image quadrant.
  const exposedTailMask = tailMask(u, v)
  rotateMasked(target, 0.775, 0.655, pose.tailSwing, exposedTailMask)
  // A second, much smaller bend lands in the curled half of the tail. This
  // avoids a rigid windshield-wiper wag while leaving the root attached to
  // the haunch and the image's recognizable curl intact.
  const tailTipMask = ellipseMask(u, v, 0.912, 0.775, 0.070, 0.085)
  rotateMasked(
    target,
    0.845,
    0.757,
    finitePoseValue(pose.tailCurl),
    exposedTailMask * tailTipMask,
  )
}

/**
 * A four-legged animal standing on stone casts one connected pool, not a neat
 * oval centred on her belly. The cub faces the camera, so her footprint is
 * nearly square where the side-on adult's ran 2.6x deep; it still leans deeper
 * than wide to survive the shallow follow-camera angle, which foreshortens a
 * flat ground plane hard.
 */
function createHeroContactShadow(): ContactShadow {
  const shadow = createContactShadow({
    length: 1.55,
    width: 1.05,
    strength: HERO_SHADOW_STRENGTH,
  })
  shadow.mesh.name = 'purpleCougarHeroShadow'
  shadow.setGroundPosition(0.02, -0.03)
  return shadow
}

function hideRigMeshes(root: Object3D): Map<Mesh, boolean> {
  const previous = new Map<Mesh, boolean>()
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return
    previous.set(node, node.visible)
    node.visible = false
  })
  return previous
}

export async function loadHeroBillboard(
  rigRoot: Object3D,
  assetUrl = DEFAULT_HERO_URL,
): Promise<HeroBillboard> {
  const texture = await new TextureLoader().loadAsync(assetUrl)
  texture.colorSpace = SRGBColorSpace

  const root = new Group()
  root.name = 'purpleCougarHeroPresentation'

  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.015,
    depthTest: true,
    depthWrite: true,
    side: DoubleSide,
    toneMapped: false,
  })
  // Sit her inside the plate's golden hour instead of on top of it.
  applyHeroGrade(material, texture)

  const geometry = new PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT, 64, 52)
  const plane = new Mesh(
    geometry,
    material,
  )
  plane.name = 'purpleCougarHeroImage'
  plane.position.y = PLANE_CENTER_Y
  // The deformations stay well inside the original card bounds, and one
  // always-visible hero is cheaper than recomputing a bounding sphere at 60Hz.
  plane.frustumCulled = false
  plane.renderOrder = 1
  root.add(plane)

  const cuffAnchor = new Object3D()
  cuffAnchor.name = 'purpleCougarHeroCuffAnchor'
  cuffAnchor.position.set(CUFF_LOCAL_X, CUFF_LOCAL_Y, 0.006)
  plane.add(cuffAnchor)

  const shadow = createHeroContactShadow()
  root.add(shadow.mesh)

  // Hide only after the replacement texture loaded successfully. A network or
  // decode failure therefore leaves the authored 3D character intact.
  const previousMeshVisibility = hideRigMeshes(rigRoot)
  const rigPosition = new Vector3()
  const rigScale = new Vector3()
  const cameraPosition = new Vector3()
  const positionAttribute = geometry.getAttribute('position') as BufferAttribute
  positionAttribute.setUsage(DynamicDrawUsage)
  const uvAttribute = geometry.getAttribute('uv') as BufferAttribute
  const restPositions = new Float32Array(positionAttribute.array)
  const deformedPoint: MutableHeroPoint = { x: 0, y: 0 }
  const deformationPose: HeroDeformationPose = { ...HERO_NEUTRAL_POSE }
  let headPose: Object3D | null = null
  let neckPose: Object3D | null = null
  let tailPose: Object3D | null = null
  let elapsed = 0
  let reaction: ActiveReaction | null = null

  function update(
    deltaSeconds: number,
    camera: PerspectiveCamera,
    currentRigRoot: Object3D,
  ): void {
    const dt = Math.max(0, Math.min(deltaSeconds, 0.05))
    elapsed += dt

    currentRigRoot.updateMatrixWorld(true)
    currentRigRoot.getWorldPosition(rigPosition)
    currentRigRoot.getWorldScale(rigScale)
    camera.getWorldPosition(cameraPosition)

    root.position.copy(rigPosition)
    root.scale.set(rigScale.x, rigScale.y, rigScale.z)

    // Yaw-only billboarding keeps every paw planted on the world ground. A
    // full lookAt would pitch the image toward the elevated camera and make
    // the rear paws float.
    plane.rotation.y = Math.atan2(
      cameraPosition.x - root.position.x,
      cameraPosition.z - root.position.z,
    )

    headPose ??=
      currentRigRoot.getObjectByName('cougar headBehaviorPivot') ?? null
    neckPose ??=
      currentRigRoot.getObjectByName('cougar neckBehaviorPivot') ?? null
    tailPose ??=
      currentRigRoot.getObjectByName('cougar tailBehaviorPivot') ?? null

    // The driver already owns world behavior. These tiny asynchronous rhythms
    // merely stop its single approved picture from reading as a still card:
    // inhale, settle into the paws, listen, then glance back toward the ball.
    const breath = Math.sin(elapsed * Math.PI * 1.04)
    const bodySway = Math.sin(elapsed * 0.72 + 0.5)
    const shoulderPulse = Math.sin(elapsed * 1.04 + 0.28)
    const curiousNod = Math.sin(elapsed * 0.47 + 1.1)
    const tailCounterWave = Math.sin(elapsed * 0.63 + 0.7)
    const combinedHeadYaw =
      (headPose?.rotation.y ?? 0) + (neckPose?.rotation.y ?? 0)
    const combinedHeadPitch =
      (headPose?.rotation.x ?? 0) + (neckPose?.rotation.x ?? 0)
    const combinedHeadRoll =
      (headPose?.rotation.z ?? 0) + (neckPose?.rotation.z ?? 0)

    // Ambient rhythm keeps her alive; the beat is what makes her cute.
    const idle = sampleHeroIdleBeat(elapsed)

    deformationPose.breath = breath
    deformationPose.torsoSway = clamp(
      bodySway * 0.36 + currentRigRoot.rotation.z * 4.8 + idle.wiggle * 0.34,
      -0.75,
      0.75,
    )
    deformationPose.shoulderLift = clamp(
      breath * 0.38 + shoulderPulse * 0.12 + Math.abs(idle.wiggle) * 0.22,
      -0.75,
      0.75,
    )
    deformationPose.headShiftX = clamp(
      combinedHeadYaw * 0.03 +
        Math.sin(elapsed * 0.47 + 0.3) * 0.0028 +
        idle.headTilt * 0.004,
      -0.016,
      0.016,
    )
    deformationPose.headLift = clamp(
      -combinedHeadPitch * 0.018 + curiousNod * 0.0025 + idle.earPerk * 0.0035,
      -0.006,
      0.012,
    )
    // A head cock is worth roughly 9 degrees. The old ±1.1-degree ceiling was
    // invisible at play distance, which is why she read as a posed photograph.
    deformationPose.headRoll = clamp(
      combinedHeadRoll * 0.32 +
        Math.sin(elapsed * 0.83 + 0.9) * 0.0045 +
        idle.headTilt * 0.155,
      -0.19,
      0.19,
    )
    deformationPose.tailSwing = clamp(
      (tailPose?.rotation.y ?? Math.sin(elapsed * 1.7) * 0.08) * 0.14 +
        tailCounterWave * 0.018 +
        idle.tailFlick * 0.2,
      -0.28,
      0.28,
    )
    deformationPose.tailCurl = tailCounterWave * 0.028 - idle.tailFlick * 0.05

    // Narrow deterministic pulses read as independent ear flicks rather than
    // both ears mechanically rocking forever. The perk beat overrides that and
    // pops both ears up together.
    const leftFlick = Math.max(0, Math.sin(elapsed * 1.19 + 0.4) - 0.94) / 0.06
    const rightFlick = Math.max(0, Math.sin(elapsed * 0.91 + 2.1) - 0.955) / 0.045
    deformationPose.leftEarFlick = leftFlick * leftFlick * 0.045 + idle.earPerk * 0.055
    deformationPose.rightEarFlick =
      -rightFlick * rightFlick * 0.038 - idle.earPerk * 0.055

    let lift = 0
    let roll = Math.sin(elapsed * 0.9) * 0.0015 + currentRigRoot.rotation.z * 0.6

    if (reaction) {
      reaction.age = Math.min(reaction.duration, reaction.age + dt)
      const progress = reaction.age / reaction.duration
      const envelope = Math.sin(progress * Math.PI) * reaction.intensity

      if (reaction.kind === 'happy') {
        const wag = Math.sin(progress * Math.PI * 6) * envelope
        const bounce = Math.sin(progress * Math.PI * 3) * envelope
        lift += envelope * 0.012
        roll += wag * 0.008
        deformationPose.torsoSway = finitePoseValue(deformationPose.torsoSway) + wag * 0.42
        deformationPose.shoulderLift = finitePoseValue(deformationPose.shoulderLift) + bounce * 0.42
        deformationPose.headRoll += wag * 0.022
        deformationPose.tailSwing += wag * 0.08
        deformationPose.tailCurl = finitePoseValue(deformationPose.tailCurl) - wag * 0.04
        deformationPose.leftEarFlick += envelope * 0.018
        deformationPose.rightEarFlick -= envelope * 0.018
      } else if (reaction.kind === 'roar') {
        // The big roar on the painted hero. The envelope is re-shaped rather
        // than used raw: a hard PUNCH in the first 12% to match the audio's
        // attack, then a long held plateau that only releases at the very end.
        // A plain sine envelope over 1.9s reads as a slow stretch, not a roar.
        const attack = Math.min(1, progress / 0.12)
        const release = 1 - Math.max(0, (progress - 0.72) / 0.28)
        const punch = Math.min(attack, release) * reaction.intensity
        // Fast shudder through the body while the call is held.
        const tremble = Math.sin(progress * Math.PI * 26) * 0.16
        lift += punch * 0.052
        deformationPose.breath += punch * (1.5 + tremble)
        deformationPose.torsoSway =
          finitePoseValue(deformationPose.torsoSway) + tremble * punch * 0.24
        deformationPose.shoulderLift =
          finitePoseValue(deformationPose.shoulderLift) + punch * 0.68
        deformationPose.headLift += punch * 0.011
        deformationPose.headRoll += tremble * punch * 0.02
        deformationPose.tailSwing += punch * 0.075
        deformationPose.tailCurl =
          finitePoseValue(deformationPose.tailCurl) - tremble * punch * 0.028
        deformationPose.leftEarFlick -= punch * 0.045
        deformationPose.rightEarFlick += punch * 0.045
      } else {
        const pop = Math.sin(Math.min(progress / 0.34, 1) * Math.PI * 0.5) *
          (1 - progress * 0.35)
        const amount = pop * reaction.intensity
        lift += envelope * 0.028
        deformationPose.torsoSway = finitePoseValue(deformationPose.torsoSway) - amount * 0.22
        deformationPose.shoulderLift = finitePoseValue(deformationPose.shoulderLift) + amount * 0.58
        deformationPose.headLift += envelope * 0.018
        deformationPose.headRoll -= envelope * 0.008
        deformationPose.tailSwing += envelope * 0.045
        deformationPose.tailCurl = finitePoseValue(deformationPose.tailCurl) - amount * 0.03
        deformationPose.leftEarFlick -= envelope * 0.045
        deformationPose.rightEarFlick += envelope * 0.045
      }

      deformationPose.breath = clamp(deformationPose.breath, -1, 2)
      deformationPose.headRoll = clamp(
        deformationPose.headRoll,
        -0.026,
        0.026,
      )
      deformationPose.headLift = clamp(
        deformationPose.headLift,
        -0.007,
        0.009,
      )
      deformationPose.tailSwing = clamp(
        deformationPose.tailSwing,
        -0.06,
        0.06,
      )
      deformationPose.tailCurl = clamp(
        finitePoseValue(deformationPose.tailCurl),
        -0.045,
        0.045,
      )
      deformationPose.torsoSway = clamp(
        finitePoseValue(deformationPose.torsoSway),
        -0.7,
        0.7,
      )
      deformationPose.shoulderLift = clamp(
        finitePoseValue(deformationPose.shoulderLift),
        -0.7,
        0.7,
      )
      deformationPose.leftEarFlick = clamp(
        deformationPose.leftEarFlick,
        -0.045,
        0.045,
      )
      deformationPose.rightEarFlick = clamp(
        deformationPose.rightEarFlick,
        -0.045,
        0.045,
      )
      if (reaction.age >= reaction.duration) reaction = null
    }

    plane.position.y = PLANE_CENTER_Y + lift
    plane.rotation.z = roll
    plane.scale.set(1, 1, 1)
    // A hop lifts her off the ground: the pool tightens and lightens with her.
    shadow.mesh.scale.set(1 - lift * 0.42, 1 - lift * 0.42, 1)
    shadow.material.opacity = HERO_SHADOW_STRENGTH * Math.max(0, 1 - lift * 1.6)

    for (let index = 0; index < positionAttribute.count; index += 1) {
      const offset = index * 3
      deformHeroPoint(
        restPositions[offset]!,
        restPositions[offset + 1]!,
        uvAttribute.getX(index),
        uvAttribute.getY(index),
        deformationPose,
        deformedPoint,
      )
      positionAttribute.setXYZ(
        index,
        deformedPoint.x,
        deformedPoint.y,
        restPositions[offset + 2]!,
      )
    }
    positionAttribute.needsUpdate = true
    root.updateMatrixWorld(true)
  }

  return {
    root,
    react(kind, intensity = 1) {
      reaction = {
        kind,
        age: 0,
        duration: kind === 'happy' ? 0.9 : kind === 'roar' ? 1.9 : 0.64,
        intensity: Math.max(0, Math.min(1.5, intensity)),
      }
    },
    update,
    syncCuff(target) {
      cuffAnchor.getWorldPosition(target)
    },
    hitTest(raycaster) {
      const hit = raycaster.intersectObject(plane, false)[0]
      return hit?.uv !== undefined && isHeroHitUv(hit.uv.x, hit.uv.y)
    },
    dispose() {
      for (const [mesh, visible] of previousMeshVisibility) {
        mesh.visible = visible
      }
      geometry.dispose()
      material.dispose()
      texture.dispose()
      shadow.dispose()
      root.removeFromParent()
    },
  }
}
