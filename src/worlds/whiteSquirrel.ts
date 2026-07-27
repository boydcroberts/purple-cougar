/**
 * The Brevard white squirrel — the rare local celebrity, used here as an
 * easter egg rather than scenery. It is invisible almost all of the time and
 * then bounds across the far edge of the meadow in about a second, which is
 * honestly how a child meets a real one: you only ever catch the tail.
 *
 * Render only. No physics, no input, no audio. `onDashStart` exists so a
 * caller can fire a chitter without this module knowing anything about sound.
 */
import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'
import { makeRng } from './world'

const TWO_PI = Math.PI * 2
const DEFAULT_SEED = 0x53515254

/** The play camera's ground position (scene.ts camera.position x/z). */
const CAMERA_FLAT_X = 1.7
const CAMERA_FLAT_Z = 1.84
/** Straight away from the camera, through the origin — the far rim. */
const AWAY_ANGLE = Math.atan2(-CAMERA_FLAT_Z, -CAMERA_FLAT_X)

/** The mown play disc. Nothing here may ever enter it. */
const PLAY_CLEARANCE = 2.4
/**
 * Half the run length. The camera sits 2.5 from the origin and the nearest
 * legal lane a further 2.6 beyond it, so the run happens 5-8m out where the
 * 42° fov is already several metres wide. Measured by projecting the run
 * against the real play camera over 100+ dashes, 5.8 is the value that pushes
 * both ends past |ndcX| = 1 on 4:3 and 16:9 — the squirrel has to enter and
 * leave off-frame, never blink into being mid-shot.
 */
const RUN_HALF_SPAN = 5.8

/** Pitch pivot height: the hip, not the feet, or the head dives on takeoff. */
const HIP_Y = 0.09

const TAIL_CURL: readonly number[] = [0.55, 0.4, 0.36, 0.34, 0.3, 0.26]
const TAIL_PUFF: readonly number[] = [0.04, 0.052, 0.06, 0.062, 0.055, 0.042]
const TAIL_BONE_LENGTH = 0.044

/** Short enough that a child sees one before losing interest in watching. */
const FIRST_DELAY_MIN = 6
const FIRST_DELAY_SPAN = 4
const DASH_GAP_MIN = 12
const DASH_GAP_SPAN = 8

export interface WhiteSquirrelOptions {
  /** Stable dash schedule and lane choice; omit for the shipped sequence. */
  readonly seed?: number
  /** Suppresses every dash — this creature is nothing but sudden motion. */
  readonly reducedMotion?: boolean
}

export interface WhiteSquirrel {
  /** Add this group to the stage scene. The factory never adds it itself. */
  readonly root: Group
  /** Advance only visual motion. Both inputs are seconds. */
  update(elapsedSeconds: number, deltaSeconds: number): void
  /** True while a crossing is in flight. */
  isDashing(): boolean
  /** One listener, fired at the start of every dash. A second call replaces. */
  onDashStart(callback: () => void): void
  /** Force a crossing now, for QA capture and tests. */
  dashNow(): void
  /** Release every geometry and material created by this factory. Idempotent. */
  dispose(): void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function part(
  parent: Group,
  geometry: SphereGeometry,
  material: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
): void {
  const mesh = new Mesh(geometry, material)
  mesh.position.set(x, y, z)
  mesh.scale.set(scaleX, scaleY, scaleZ)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
}

/**
 * Creates the white squirrel. It never adds itself to a scene, so the caller
 * keeps scene ownership and lifecycle explicit.
 */
export function createWhiteSquirrel(options: WhiteSquirrelOptions = {}): WhiteSquirrel {
  const root = new Group()
  root.name = 'Brevard White Squirrel'
  root.userData.kind = 'white-squirrel'

  const random = makeRng(options.seed ?? DEFAULT_SEED)

  const standard = (color: number, roughness: number) =>
    new MeshStandardMaterial({ color, roughness, flatShading: true })
  const materials = {
    // A Brevard white squirrel is not paper-white; it is cream shading to
    // buff, and under golden-hour light a true white would blow out to a hole
    // in the frame under the ACES rolloff.
    fur: standard(0xf7efdc, 0.88),
    furShade: standard(0xe3d5ba, 0.9),
    plume: standard(0xfffaf0, 0.95),
    pink: standard(0xeda6a9, 0.62),
    eye: standard(0x241d1a, 0.42),
  }

  // Two shared unit spheres carry all 21 parts; every mesh is a scale of one
  // of them, which keeps an easter egg from costing the iPad any real budget.
  const blobGeometry = new SphereGeometry(1, 9, 7)
  const beadGeometry = new SphereGeometry(1, 6, 4)

  const squirrel = new Group()
  squirrel.name = 'White squirrel'
  squirrel.visible = false
  root.add(squirrel)

  const lean = new Group()
  lean.position.y = HIP_Y
  squirrel.add(lean)

  const body = new Group()
  body.position.y = -HIP_Y
  lean.add(body)

  part(body, blobGeometry, materials.fur, 0, 0.085, -0.055, 0.062, 0.066, 0.062)
  part(body, blobGeometry, materials.fur, 0, 0.088, 0.035, 0.055, 0.056, 0.075)
  part(body, blobGeometry, materials.fur, 0, 0.128, 0.105, 0.046, 0.045, 0.045)
  part(body, blobGeometry, materials.fur, 0, 0.118, 0.142, 0.026, 0.024, 0.03)
  part(body, beadGeometry, materials.pink, 0, 0.121, 0.168, 0.011, 0.01, 0.01)

  for (const side of [-1, 1]) {
    part(body, beadGeometry, materials.eye, side * 0.03, 0.14, 0.126, 0.01, 0.011, 0.01)
    // Small and round, set well back on the skull — a tall or pointed ear
    // instantly reads as a rabbit or a fox instead.
    part(body, blobGeometry, materials.fur, side * 0.026, 0.168, 0.096, 0.021, 0.026, 0.009)
    part(body, blobGeometry, materials.pink, side * 0.026, 0.166, 0.1, 0.013, 0.017, 0.006)
    part(body, blobGeometry, materials.furShade, side * 0.03, 0.045, 0.072, 0.014, 0.04, 0.016)
    part(body, blobGeometry, materials.furShade, side * 0.036, 0.045, -0.048, 0.018, 0.042, 0.026)
  }

  const tailRoot = new Group()
  tailRoot.name = 'Plume tail'
  tailRoot.position.set(0, 0.115, -0.105)
  body.add(tailRoot)

  // A bone chain rather than an authored curve: the whole signature of the
  // animal is that this plume keeps arcing over the back while it bounces, and
  // a chain gives that for six group rotations a frame.
  const tailBones: Group[] = []
  let tailParent: Group = tailRoot
  for (let index = 0; index < TAIL_CURL.length; index++) {
    const bone = new Group()
    bone.position.z = index === 0 ? 0 : -TAIL_BONE_LENGTH
    bone.rotation.x = TAIL_CURL[index]!
    tailParent.add(bone)
    const puff = TAIL_PUFF[index]!
    part(
      bone,
      blobGeometry,
      materials.plume,
      0,
      0,
      -TAIL_BONE_LENGTH * 0.5,
      puff * 0.86,
      puff,
      puff * 1.16,
    )
    tailBones.push(bone)
    tailParent = bone
  }

  let disposed = false
  let dashing = false
  let dashTime = 0
  let dashCount = 0
  let idleTime = 0
  let nextDelay = FIRST_DELAY_MIN + random() * FIRST_DELAY_SPAN
  let lastElapsed = 0
  let listener: (() => void) | null = null

  let laneX = 0
  let laneZ = 0
  let headingX = 0
  let headingZ = 1
  let duration = 1.25
  let hops = 5
  let hopHeight = 0.2

  function startDash(): void {
    // The run is a chord perpendicular to `normal` at distance `lane` from the
    // origin, so every point on it is exactly `lane` out: the play disc cannot
    // be clipped no matter how long the run gets.
    const lane = PLAY_CLEARANCE + 0.2 + random() * 0.85
    // Small jitter only: swinging the chord's normal also swings the run off
    // the view axis, and past ~6° one end of it stops clearing the frame.
    const normal = AWAY_ANGLE + (random() - 0.5) * 0.22
    laneX = Math.cos(normal) * lane
    laneZ = Math.sin(normal) * lane

    const towardRight = dashCount % 2 === 0 ? 1 : -1
    headingX = -Math.sin(normal) * towardRight
    headingZ = Math.cos(normal) * towardRight

    duration = 1 + random() * 0.5
    hops = 4 + Math.floor(random() * 3)
    // Arc height tracks bound length, near the ~1:7 rise-to-reach of a real
    // bounding squirrel. A fixed height turns the long bounds into a slide.
    hopHeight = 0.09 + ((RUN_HALF_SPAN * 2) / hops) * 0.085

    squirrel.rotation.y = Math.atan2(headingX, headingZ)
    squirrel.visible = true
    dashTime = 0
    dashing = true
    dashCount++

    if (listener) {
      try {
        listener()
      } catch {
        // A caller's sound failing must never take the render loop with it.
      }
    }
  }

  function endDash(): void {
    dashing = false
    squirrel.visible = false
    idleTime = 0
    nextDelay = DASH_GAP_MIN + random() * DASH_GAP_SPAN
  }

  function update(elapsedSeconds: number, deltaSeconds: number): void {
    if (disposed) return
    const elapsed = finite(elapsedSeconds)
    const delta = clamp(finite(deltaSeconds), 0, 0.08)
    if (elapsed < lastElapsed) {
      // A rewound clock means a restarted scene. Re-arm instead of firing the
      // instant the world reappears.
      dashing = false
      squirrel.visible = false
      idleTime = 0
      nextDelay = FIRST_DELAY_MIN + random() * FIRST_DELAY_SPAN
    }
    lastElapsed = elapsed

    if (options.reducedMotion) {
      squirrel.visible = false
      return
    }

    if (!dashing) {
      idleTime += delta
      if (idleTime < nextDelay) return
      startDash()
    }

    dashTime += delta
    const progress = dashTime / duration
    if (progress >= 1) {
      endDash()
      return
    }

    const hopPhase = progress * hops
    const frac = hopPhase - Math.floor(hopPhase)
    const arc = Math.sin(Math.PI * frac)

    // A small surge out of each push-off. The amplitude stays under the linear
    // term's slope so travel remains monotonic — a squirrel never reverses.
    const travel = (progress + Math.sin(TWO_PI * frac) * 0.012) * 2 - 1
    squirrel.position.set(
      laneX + headingX * RUN_HALF_SPAN * travel,
      arc * hopHeight,
      laneZ + headingZ * RUN_HALF_SPAN * travel,
    )

    // A hard forward lunge at the push-off that decays into velocity-aligned
    // pitch: nose up through the climb, level at the apex, nose down into the
    // landing. Following the arc alone looks like a thrown toy.
    const lunge = Math.exp(-frac * 9)
    lean.rotation.x = 0.34 * lunge - 0.3 * Math.cos(Math.PI * frac) * (1 - lunge)

    // Insurance for viewports wider than the 16:9 the run was measured
    // against: on an ultrawide the ends of the chord can still land inside the
    // frame, and growing in over three frames never reads as a pop.
    squirrel.scale.setScalar(clamp(Math.min(progress, 1 - progress) / 0.04, 0, 1))

    const squash = (1 - arc) * (1 - arc) * (1 - arc)
    lean.scale.set(
      1 + squash * 0.1 - arc * 0.04,
      1 - squash * 0.16 + arc * 0.05,
      1 + squash * 0.06 + arc * 0.12,
    )

    const wave = dashTime * 26
    for (let index = 0; index < tailBones.length; index++) {
      // The plume flattens back at speed and each bone whips a beat behind the
      // one ahead of it, which is what sells fur instead of a rigid prop.
      const bone = tailBones[index]!
      bone.rotation.x = TAIL_CURL[index]! * (0.58 + arc * 0.22) + Math.sin(wave - index * 0.9) * 0.11
      bone.rotation.y = Math.sin(wave * 0.7 - index * 0.7) * 0.06
    }
  }

  function isDashing(): boolean {
    return dashing
  }

  function onDashStart(callback: () => void): void {
    listener = callback
  }

  function dashNow(): void {
    // reducedMotion is a promise that this creature never moves, and a QA hook
    // is not grounds for breaking it.
    if (disposed || options.reducedMotion) return
    idleTime = 0
    startDash()
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    root.removeFromParent()

    const geometries = new Set<BufferGeometry>()
    const ownedMaterials = new Set<Material>()
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return
      geometries.add(node.geometry)
      const meshMaterials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of meshMaterials) ownedMaterials.add(material)
    })
    for (const geometry of geometries) geometry.dispose()
    for (const material of ownedMaterials) material.dispose()
  }

  return { root, update, isDashing, onDashStart, dashNow, dispose }
}
