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
  CanvasTexture,
  DoubleSide,
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
import type { Quadruped } from './quadruped'

const DEFAULT_HERO_URL = '/assets/purple-cougar-hero.webp'

// The image has intentional transparent padding. These dimensions put the
// visible paws on y=0 while keeping the ear tips close to the authored rig.
const PLANE_HEIGHT = 1.48
const PLANE_WIDTH = PLANE_HEIGHT * (1402 / 1122)
const PLANE_CENTER_Y = 0.62

// Pixel-measured center of the rear ankle cuff in the generated hero image.
const CUFF_LOCAL_X = (0.722 - 0.5) * PLANE_WIDTH
const CUFF_LOCAL_Y = (0.5 - 0.761) * PLANE_HEIGHT
const HERO_PIXEL_WIDTH = 1402
const HERO_PIXEL_HEIGHT = 1122
const TAIL_CENTERLINE = [
  [0.745, 0.603],
  [0.785, 0.483],
  [0.856, 0.407],
  [0.927, 0.394],
  [0.963, 0.456],
  [0.942, 0.519],
] as const

export type HeroReaction = 'happy' | 'surprised' | 'roar'

export interface HeroDeformationPose {
  /** Signed inhale/exhale amount in the range -1...1. */
  breath: number
  /** World-space translation of the painted head region. */
  headShiftX: number
  headLift: number
  /** Signed rotation in radians around the painted neck. */
  headRoll: number
  /** Signed bend in radians around the painted tail base. */
  tailSwing: number
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
  headShiftX: 0,
  headLift: 0,
  headRoll: 0,
  tailSwing: 0,
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

  const contourWeight = 1 - smoothstep(28, 62, closestDistance)
  const rootWeight = smoothstep(0.035, 0.2, closestProgress)
  return contourWeight * rootWeight
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
  const bodyMask =
    smoothstep(0.2, 0.34, u) *
    (1 - smoothstep(0.73, 0.82, u)) *
    smoothstep(0.29, 0.43, v) *
    (1 - smoothstep(0.72, 0.82, v))
  const bodyHeight = smoothstep(0.31, 0.67, v)
  const bodyPivotX = (0.52 - 0.5) * PLANE_WIDTH
  target.x +=
    (baseX - bodyPivotX) * pose.breath * bodyMask * bodyHeight * 0.006
  target.y += pose.breath * bodyMask * bodyHeight * 0.0085

  // Ears move first so the head transform naturally carries them along.
  const leftEarMask = ellipseMask(u, v, 0.092, 0.842, 0.068, 0.125)
  const rightEarMask = ellipseMask(u, v, 0.267, 0.854, 0.075, 0.14)
  rotateMasked(
    target,
    0.114,
    0.795,
    pose.leftEarFlick,
    leftEarMask,
  )
  rotateMasked(
    target,
    0.253,
    0.8,
    pose.rightEarFlick,
    rightEarMask,
  )

  const headMask =
    (1 - smoothstep(0.3, 0.42, u)) * smoothstep(0.52, 0.65, v)
  rotateMasked(target, 0.285, 0.64, pose.headRoll, headMask)
  target.x += pose.headShiftX * headMask
  target.y += pose.headLift * headMask

  // Only the exposed tail arc bends. The haunch and cuffed rear leg remain
  // untouched even though they share the same broad image quadrant.
  rotateMasked(target, 0.745, 0.603, pose.tailSwing, tailMask(u, v))
}

function createContactShadow(): Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create Purple Cougar contact shadow')

  const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(35, 23, 48, 0.34)')
  gradient.addColorStop(0.46, 'rgba(35, 23, 48, 0.19)')
  gradient.addColorStop(1, 'rgba(35, 23, 48, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)

  const texture = new CanvasTexture(canvas)
  const shadow = new Mesh(
    new PlaneGeometry(1.48, 0.5),
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  shadow.name = 'purpleCougarHeroShadow'
  shadow.position.set(0.02, 0.008, -0.03)
  shadow.rotation.x = -Math.PI / 2
  shadow.renderOrder = 0
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

  const shadow = createContactShadow()
  root.add(shadow)

  // Hide only after the replacement texture loaded successfully. A network or
  // decode failure therefore leaves the authored 3D character intact.
  const previousMeshVisibility = hideRigMeshes(rigRoot)
  const rigPosition = new Vector3()
  const rigScale = new Vector3()
  const cameraPosition = new Vector3()
  const positionAttribute = geometry.getAttribute('position') as BufferAttribute
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
    root.scale.set(rigScale.x, rigScale.y, 1)

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

    const breath = Math.sin(elapsed * Math.PI * 1.04)
    const combinedHeadYaw =
      (headPose?.rotation.y ?? 0) + (neckPose?.rotation.y ?? 0)
    const combinedHeadPitch =
      (headPose?.rotation.x ?? 0) + (neckPose?.rotation.x ?? 0)
    const combinedHeadRoll =
      (headPose?.rotation.z ?? 0) + (neckPose?.rotation.z ?? 0)

    deformationPose.breath = breath
    deformationPose.headShiftX = clamp(combinedHeadYaw * 0.03, -0.0105, 0.0105)
    deformationPose.headLift = clamp(-combinedHeadPitch * 0.018, -0.006, 0.008)
    deformationPose.headRoll = clamp(combinedHeadRoll * 0.32, -0.02, 0.02)
    deformationPose.tailSwing = clamp(
      (tailPose?.rotation.y ?? Math.sin(elapsed * 1.7) * 0.08) * 0.14,
      -0.05,
      0.05,
    )

    // Narrow deterministic pulses read as independent ear flicks rather than
    // both ears mechanically rocking forever.
    const leftFlick = Math.max(0, Math.sin(elapsed * 1.19 + 0.4) - 0.94) / 0.06
    const rightFlick = Math.max(0, Math.sin(elapsed * 0.91 + 2.1) - 0.955) / 0.045
    deformationPose.leftEarFlick = leftFlick * leftFlick * 0.045
    deformationPose.rightEarFlick = -rightFlick * rightFlick * 0.038

    let lift = 0
    let roll = Math.sin(elapsed * 0.9) * 0.0015 + currentRigRoot.rotation.z * 0.6

    if (reaction) {
      reaction.age = Math.min(reaction.duration, reaction.age + dt)
      const progress = reaction.age / reaction.duration
      const envelope = Math.sin(progress * Math.PI) * reaction.intensity

      if (reaction.kind === 'happy') {
        const wag = Math.sin(progress * Math.PI * 6) * envelope
        lift += envelope * 0.012
        roll += wag * 0.008
        deformationPose.headRoll += wag * 0.022
        deformationPose.tailSwing += wag * 0.08
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
        deformationPose.headLift += punch * 0.011
        deformationPose.headRoll += tremble * punch * 0.02
        deformationPose.tailSwing += punch * 0.075
        deformationPose.leftEarFlick -= punch * 0.045
        deformationPose.rightEarFlick += punch * 0.045
      } else {
        lift += envelope * 0.028
        deformationPose.headLift += envelope * 0.018
        deformationPose.headRoll -= envelope * 0.008
        deformationPose.tailSwing += envelope * 0.045
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
    shadow.scale.set(1 - lift * 0.55, 1, 1)

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
      return raycaster.intersectObject(plane, false).length > 0
    },
    dispose() {
      for (const [mesh, visible] of previousMeshVisibility) {
        mesh.visible = visible
      }
      geometry.dispose()
      material.dispose()
      texture.dispose()
      shadow.geometry.dispose()
      const shadowMaterial = shadow.material
      if (Array.isArray(shadowMaterial)) {
        for (const entry of shadowMaterial) {
          if (entry instanceof MeshBasicMaterial) entry.map?.dispose()
          entry.dispose()
        }
      } else {
        if (shadowMaterial instanceof MeshBasicMaterial) {
          shadowMaterial.map?.dispose()
        }
        shadowMaterial.dispose()
      }
      root.removeFromParent()
    },
  }
}
