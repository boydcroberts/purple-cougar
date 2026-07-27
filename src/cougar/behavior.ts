/**
 * Expressive, procedural motion layered on top of the procedural quadruped.
 *
 * The controller deliberately owns only small, additive pivots around the
 * neck, head, tail, and ears. The inner Quadruped groups stay available for a
 * future authored walk, skip, or pounce pose, instead of competing with this
 * idle controller for the same transforms.
 */
import { Group, Object3D, Quaternion, Vector3 } from 'three'
import type { Quadruped } from './quadruped'

export type CougarMood = 'calm' | 'curious' | 'excited'
export type CougarReaction = 'happy' | 'surprised' | 'roar'

/** A world-space point; accepts both Three.Vector3 and the physics Vec3. */
export interface CougarBehaviorTarget {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Per-frame optional input. `lookAt` is normally the tethered ball position. */
export interface CougarBehaviorFrame {
  readonly lookAt?: Readonly<CougarBehaviorTarget> | null
}

export interface CougarBehaviorOptions {
  initialMood?: CougarMood
  /** Local pivots for compatible procedural-quadruped variants. */
  neckPivot?: Readonly<CougarBehaviorTarget>
  tailPivot?: Readonly<CougarBehaviorTarget>
  /** Override automatic ear discovery when a character supplies named ears. */
  ears?: readonly Object3D[]
}

export interface CougarBehavior {
  /** The selected idle; changes blend smoothly rather than popping. */
  readonly mood: CougarMood
  setMood(mood: CougarMood, transitionSeconds?: number): void
  setLookTarget(target: Readonly<CougarBehaviorTarget> | null): void
  react(reaction: CougarReaction, intensity?: number): void
  update(deltaSeconds: number, frame?: CougarBehaviorFrame): void
  /** Removes current procedural offsets but leaves the selected mood intact. */
  reset(): void
  /** Removes controller-owned pivots and leaves the visible current pose intact. */
  dispose(): void
}

interface MoodTuning {
  breathAmplitude: number
  breathHz: number
  scanYaw: number
  scanPitch: number
  headBob: number
  tailAmplitude: number
  tailHz: number
  tracking: number
  earFlick: number
  bodySway: number
}

interface MotionLayer {
  node: Object3D
  parent: Object3D
  pivot: Group
  restPosition: Vector3
}

interface EarLayer {
  layer: MotionLayer
  side: number
}

interface RootTransform {
  position: Vector3
  quaternion: Quaternion
  scale: Vector3
}

interface ReactionOffsets {
  headPitch: number
  headRoll: number
  headLift: number
  neckPitch: number
  tailYaw: number
  tailPitch: number
  earSplay: number
  earFlick: number
  rootRoll: number
}

interface ActiveReaction {
  kind: CougarReaction
  age: number
  duration: number
  intensity: number
}

const TAU = Math.PI * 2
const MAX_FRAME_DELTA = 0.1
const DEFAULT_MOOD_TRANSITION = 0.45
const DEFAULT_NECK_PIVOT: CougarBehaviorTarget = { x: 0, y: 0.74, z: 0.46 }
const DEFAULT_TAIL_PIVOT: CougarBehaviorTarget = { x: 0, y: 0.62, z: -0.74 }
const Z_AXIS = new Vector3(0, 0, 1)

const MOODS: Readonly<Record<CougarMood, MoodTuning>> = {
  calm: {
    breathAmplitude: 0.012,
    breathHz: 0.52,
    scanYaw: 0.035,
    scanPitch: 0.018,
    headBob: 0.003,
    tailAmplitude: 0.07,
    tailHz: 0.38,
    tracking: 0.44,
    earFlick: 0.025,
    bodySway: 0.004,
  },
  curious: {
    breathAmplitude: 0.017,
    breathHz: 0.72,
    scanYaw: 0.11,
    scanPitch: 0.045,
    headBob: 0.008,
    tailAmplitude: 0.13,
    tailHz: 0.72,
    tracking: 0.78,
    earFlick: 0.065,
    bodySway: 0.009,
  },
  excited: {
    breathAmplitude: 0.024,
    breathHz: 1.05,
    scanYaw: 0.065,
    scanPitch: 0.03,
    headBob: 0.014,
    tailAmplitude: 0.24,
    tailHz: 1.45,
    tracking: 0.94,
    earFlick: 0.1,
    bodySway: 0.015,
  },
}

const behaviorWrappedNodes = new WeakSet<Object3D>()

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function smoothingAlpha(sharpness: number, deltaSeconds: number): number {
  return 1 - Math.exp(-sharpness * deltaSeconds)
}

function smooth(current: number, target: number, sharpness: number, deltaSeconds: number): number {
  return current + (target - current) * smoothingAlpha(sharpness, deltaSeconds)
}

function finitePoint(target: Readonly<CougarBehaviorTarget>, label: string): void {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
    throw new TypeError(`${label} must have finite x, y, and z values`)
  }
}

function assertMood(mood: CougarMood): void {
  if (mood !== 'calm' && mood !== 'curious' && mood !== 'excited') {
    throw new RangeError(`Unknown cougar mood: ${String(mood)}`)
  }
}

function assertReaction(reaction: CougarReaction): void {
  if (reaction !== 'happy' && reaction !== 'surprised' && reaction !== 'roar') {
    throw new RangeError(`Unknown cougar reaction: ${String(reaction)}`)
  }
}

function copyTuning(source: MoodTuning): MoodTuning {
  return { ...source }
}

function resetLayer(layer: MotionLayer): void {
  layer.pivot.position.copy(layer.restPosition)
  layer.pivot.rotation.set(0, 0, 0)
  layer.pivot.scale.set(1, 1, 1)
}

/**
 * Places a new pivot in the current parent coordinate system. The original
 * node remains the inner pose layer, so other systems can still rotate it.
 */
function createMotionLayer(node: Object3D, pivotPoint: Readonly<CougarBehaviorTarget>, name: string): MotionLayer {
  if (behaviorWrappedNodes.has(node)) {
    throw new Error(`${name} is already controlled by a CougarBehavior instance`)
  }

  const parent = node.parent
  if (!parent) throw new Error(`${name} must be attached to the quadruped before creating behavior`)
  finitePoint(pivotPoint, `${name} pivot`)

  const pivot = new Group()
  pivot.name = `${name}BehaviorPivot`
  pivot.position.set(pivotPoint.x, pivotPoint.y, pivotPoint.z)

  // T(pivot) * T(node - pivot) preserves the current rendered rest pose.
  node.position.sub(pivot.position)
  parent.add(pivot)
  pivot.add(node)
  behaviorWrappedNodes.add(node)

  return {
    node,
    parent,
    pivot,
    restPosition: pivot.position.clone(),
  }
}

function detachLayer(layer: MotionLayer): void {
  layer.parent.attach(layer.node)
  layer.parent.remove(layer.pivot)
  behaviorWrappedNodes.delete(layer.node)
}

function findEarGroups(head: Object3D): Object3D[] {
  // Authored glTF assets carry an explicit rig-node contract. Prefer those
  // names because exported empty transforms load as Object3D, not Group.
  const named = ['leftEar', 'rightEar']
    .map((name) => head.getObjectByName(name))
    .filter((ear): ear is Object3D => Boolean(ear))
  if (named.length === 2) return named

  // Procedural fallback: ears are the only high, wide child Groups.
  return head.children
    .filter(
      (child) =>
        child instanceof Group &&
        child.children.length >= 2 &&
        Math.abs(child.position.x) > 0.045 &&
        child.position.y > 0.055,
    )
    .sort((a, b) => a.position.x - b.position.x)
    .slice(0, 2)
}

class CougarBehaviorController implements CougarBehavior {
  private readonly rootBase: RootTransform
  private readonly rootOffset = new Quaternion()
  private readonly neckLayer: MotionLayer
  private readonly headLayer: MotionLayer
  private readonly tailLayer: MotionLayer
  private readonly earLayers: EarLayer[]
  private readonly lookTarget = new Vector3()
  private readonly targetInHeadParent = new Vector3()
  private readonly reactionOffsets: ReactionOffsets = {
    headPitch: 0,
    headRoll: 0,
    headLift: 0,
    neckPitch: 0,
    tailYaw: 0,
    tailPitch: 0,
    earSplay: 0,
    earFlick: 0,
    rootRoll: 0,
  }
  private readonly tuning: MoodTuning
  private selectedMood: CougarMood
  private moodBlendSharpness = 5 / DEFAULT_MOOD_TRANSITION
  private hasLookTarget = false
  private lookYaw = 0
  private lookPitch = 0
  private elapsed = 0
  private reaction: ActiveReaction | null = null
  private disposed = false

  constructor(
    private readonly quadruped: Quadruped,
    options: CougarBehaviorOptions = {},
  ) {
    const initialMood = options.initialMood ?? 'calm'
    assertMood(initialMood)
    this.selectedMood = initialMood
    this.tuning = copyTuning(MOODS[initialMood])
    this.rootBase = {
      position: quadruped.root.position.clone(),
      quaternion: quadruped.root.quaternion.clone(),
      scale: quadruped.root.scale.clone(),
    }

    const neckPivot = options.neckPivot ?? DEFAULT_NECK_PIVOT
    const tailPivot = options.tailPivot ?? DEFAULT_TAIL_PIVOT
    this.neckLayer = createMotionLayer(quadruped.neck, neckPivot, 'cougar neck')
    this.headLayer = createMotionLayer(quadruped.head, quadruped.head.position, 'cougar head')
    this.tailLayer = createMotionLayer(quadruped.tail, tailPivot, 'cougar tail')

    const ears = options.ears ? [...new Set(options.ears)] : findEarGroups(quadruped.head)
    this.earLayers = ears.map((ear, index) => {
      const side = Math.sign(ear.position.x) || (index === 0 ? -1 : 1)
      return {
        layer: createMotionLayer(ear, ear.position, `cougar ear ${index + 1}`),
        side,
      }
    })
  }

  get mood(): CougarMood {
    return this.selectedMood
  }

  setMood(mood: CougarMood, transitionSeconds = DEFAULT_MOOD_TRANSITION): void {
    this.assertActive()
    assertMood(mood)
    if (!Number.isFinite(transitionSeconds) || transitionSeconds <= 0) {
      throw new RangeError('Mood transition seconds must be a positive finite number')
    }
    this.selectedMood = mood
    // Five time constants makes the requested duration read as a full blend.
    this.moodBlendSharpness = 5 / transitionSeconds
  }

  setLookTarget(target: Readonly<CougarBehaviorTarget> | null): void {
    this.assertActive()
    if (target === null) {
      this.hasLookTarget = false
      return
    }
    finitePoint(target, 'Cougar look target')
    this.lookTarget.set(target.x, target.y, target.z)
    this.hasLookTarget = true
  }

  react(reaction: CougarReaction, intensity = 1): void {
    this.assertActive()
    assertReaction(reaction)
    if (!Number.isFinite(intensity)) throw new TypeError('Reaction intensity must be finite')
    this.reaction = {
      kind: reaction,
      age: 0,
      duration: reaction === 'happy' ? 0.9 : reaction === 'roar' ? 1.9 : 0.7,
      intensity: clamp(intensity, 0, 1.5),
    }
  }

  update(deltaSeconds: number, frame?: CougarBehaviorFrame): void {
    this.assertActive()
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError('Behavior deltaSeconds must be a non-negative finite number')
    }
    if (frame?.lookAt !== undefined) this.setLookTarget(frame.lookAt)

    const dt = Math.min(deltaSeconds, MAX_FRAME_DELTA)
    this.elapsed += dt
    this.updateMood(dt)
    this.updateLook(dt)
    this.updateReaction(dt)
    this.applyPose()
  }

  reset(): void {
    this.assertActive()
    this.elapsed = 0
    this.lookYaw = 0
    this.lookPitch = 0
    this.hasLookTarget = false
    this.reaction = null
    Object.assign(this.tuning, MOODS[this.selectedMood])
    this.clearReactionOffsets()
    this.restoreRoot()
    resetLayer(this.neckLayer)
    resetLayer(this.headLayer)
    resetLayer(this.tailLayer)
    for (const ear of this.earLayers) resetLayer(ear.layer)
  }

  dispose(): void {
    if (this.disposed) return
    this.reset()
    // Ears must detach before their head parent, then nested head before neck.
    for (const ear of this.earLayers) detachLayer(ear.layer)
    detachLayer(this.headLayer)
    detachLayer(this.neckLayer)
    detachLayer(this.tailLayer)
    this.disposed = true
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('This CougarBehavior has already been disposed')
  }

  private updateMood(dt: number): void {
    const target = MOODS[this.selectedMood]
    for (const key of Object.keys(this.tuning) as Array<keyof MoodTuning>) {
      this.tuning[key] = smooth(this.tuning[key], target[key], this.moodBlendSharpness, dt)
    }
  }

  private updateLook(dt: number): void {
    let targetYaw = 0
    let targetPitch = 0

    if (this.hasLookTarget) {
      // The target is world-space while yaw/pitch are evaluated in the neck
      // coordinate frame, so a rotated cougar still looks in the right direction.
      this.quadruped.root.updateMatrixWorld(true)
      const parent = this.headLayer.pivot.parent
      if (parent) {
        this.targetInHeadParent.copy(this.lookTarget)
        parent.worldToLocal(this.targetInHeadParent)
        this.targetInHeadParent.sub(this.headLayer.pivot.position)
        const horizontal = Math.hypot(this.targetInHeadParent.x, this.targetInHeadParent.z)
        if (horizontal > 1e-4) {
          // Keep the hero face readable even when the tether ball rolls
          // behind a hind paw. The eyes and neck can acknowledge it without
          // turning the supplied three-quarter character pose into a profile.
          targetYaw = clamp(Math.atan2(this.targetInHeadParent.x, this.targetInHeadParent.z), -0.28, 0.28)
          // Three's +X rotation sends local +Z down, hence the negation.
          targetPitch = clamp(-Math.atan2(this.targetInHeadParent.y, horizontal), -0.34, 0.34)
        }
      }
    }

    const sharpness = 7 + this.tuning.tracking * 12
    this.lookYaw = smooth(this.lookYaw, targetYaw, sharpness, dt)
    this.lookPitch = smooth(this.lookPitch, targetPitch, sharpness, dt)
  }

  private updateReaction(dt: number): void {
    this.clearReactionOffsets()
    const reaction = this.reaction
    if (!reaction) return

    reaction.age = Math.min(reaction.duration, reaction.age + dt)
    const progress = reaction.age / reaction.duration
    const envelope = Math.sin(progress * Math.PI) * reaction.intensity

    if (reaction.kind === 'happy') {
      const wag = Math.sin(progress * Math.PI * 6) * envelope
      this.reactionOffsets.headPitch = Math.sin(progress * Math.PI * 4) * envelope * 0.09
      this.reactionOffsets.headRoll = wag * 0.055
      this.reactionOffsets.headLift = envelope * 0.016
      this.reactionOffsets.tailYaw = wag * 0.28
      this.reactionOffsets.earFlick = envelope * 0.07
      this.reactionOffsets.rootRoll = wag * 0.012
    } else if (reaction.kind === 'roar') {
      // The mighty friendly roar: chin sweeps up and holds while the chest
      // lifts, ears splay wide, and the tail rises — a proud call to the sky,
      // with a small tremble at the peak so the held pose stays alive.
      const tremble = Math.sin(progress * Math.PI * 9) * 0.12
      this.reactionOffsets.headPitch = -envelope * (0.26 + tremble * 0.3)
      this.reactionOffsets.headLift = envelope * 0.034
      this.reactionOffsets.neckPitch = -envelope * 0.09
      this.reactionOffsets.tailPitch = envelope * 0.22
      this.reactionOffsets.tailYaw = tremble * envelope * 0.5
      this.reactionOffsets.earSplay = envelope * 0.24
      this.reactionOffsets.earFlick = envelope * 0.05
      this.reactionOffsets.rootRoll = tremble * envelope * 0.02
    } else {
      // A short, readable recoil: ears perk, head lifts, tail tenses upward.
      const pop = Math.sin(Math.min(progress / 0.34, 1) * Math.PI * 0.5) * (1 - progress * 0.35)
      const amount = pop * reaction.intensity
      this.reactionOffsets.headPitch = -amount * 0.19
      this.reactionOffsets.headLift = amount * 0.025
      this.reactionOffsets.neckPitch = -amount * 0.055
      this.reactionOffsets.tailPitch = amount * 0.15
      this.reactionOffsets.earSplay = amount * 0.16
      this.reactionOffsets.earFlick = amount * 0.08
    }

    if (reaction.age >= reaction.duration) this.reaction = null
  }

  private applyPose(): void {
    const tuning = this.tuning
    const reaction = this.reactionOffsets
    const breath = Math.sin(this.elapsed * TAU * tuning.breathHz)
    const headMicro = Math.sin(this.elapsed * 3.7 + 0.8) * 0.012
    const scanYaw = Math.sin(this.elapsed * 0.78 + 0.45) * tuning.scanYaw
    const scanPitch = Math.sin(this.elapsed * 0.53 + 1.2) * tuning.scanPitch
    const totalYaw = scanYaw + this.lookYaw * tuning.tracking + headMicro
    const totalPitch = scanPitch + this.lookPitch * tuning.tracking

    this.restoreRoot()
    this.quadruped.root.position.y += breath * 0.003
    this.quadruped.root.scale.x *= 1 + breath * tuning.breathAmplitude * 0.38
    this.quadruped.root.scale.y *= 1 + breath * tuning.breathAmplitude * 0.18
    this.quadruped.root.scale.z *= 1 + breath * tuning.breathAmplitude
    this.rootOffset.setFromAxisAngle(
      Z_AXIS,
      Math.sin(this.elapsed * 0.67) * tuning.bodySway + reaction.rootRoll,
    )
    this.quadruped.root.quaternion.multiply(this.rootOffset)

    resetLayer(this.neckLayer)
    const neckPitch = totalPitch * 0.24 + breath * 0.012 + reaction.neckPitch
    const neckYaw = totalYaw * 0.28
    this.neckLayer.pivot.rotation.set(neckPitch, neckYaw, -headMicro * 0.18, 'YXZ')

    resetLayer(this.headLayer)
    this.headLayer.pivot.position.y += breath * 0.004 + Math.sin(this.elapsed * 1.43) * tuning.headBob + reaction.headLift
    this.headLayer.pivot.rotation.set(
      totalPitch - neckPitch + reaction.headPitch,
      totalYaw - neckYaw,
      headMicro * 0.45 + reaction.headRoll,
      'YXZ',
    )

    const tailPhase = this.elapsed * TAU * tuning.tailHz
    resetLayer(this.tailLayer)
    this.tailLayer.pivot.rotation.set(
      Math.sin(tailPhase * 0.57 + 0.7) * 0.045 + reaction.tailPitch,
      Math.sin(tailPhase) * tuning.tailAmplitude + reaction.tailYaw,
      Math.sin(tailPhase * 0.63 + 0.4) * 0.028,
      'YXZ',
    )

    for (const ear of this.earLayers) {
      resetLayer(ear.layer)
      const earPhase = this.elapsed * (1.25 + Math.abs(ear.side) * 0.14) + ear.side * 0.9
      const flick = Math.sin(earPhase * 2.7) * tuning.earFlick + reaction.earFlick
      ear.layer.pivot.rotation.set(
        flick * 0.45,
        ear.side * flick * 0.28,
        ear.side * (0.018 + reaction.earSplay),
        'YXZ',
      )
    }
  }

  private restoreRoot(): void {
    this.quadruped.root.position.copy(this.rootBase.position)
    this.quadruped.root.quaternion.copy(this.rootBase.quaternion)
    this.quadruped.root.scale.copy(this.rootBase.scale)
  }

  private clearReactionOffsets(): void {
    this.reactionOffsets.headPitch = 0
    this.reactionOffsets.headRoll = 0
    this.reactionOffsets.headLift = 0
    this.reactionOffsets.neckPitch = 0
    this.reactionOffsets.tailYaw = 0
    this.reactionOffsets.tailPitch = 0
    this.reactionOffsets.earSplay = 0
    this.reactionOffsets.earFlick = 0
    this.reactionOffsets.rootRoll = 0
  }
}

/**
 * Creates a deterministic, allocation-free-per-frame expressive controller.
 * Call `update` once per render frame, before syncing the cuff for physics.
 */
export function createCougarBehavior(
  quadruped: Quadruped,
  options?: CougarBehaviorOptions,
): CougarBehavior {
  return new CougarBehaviorController(quadruped, options)
}
