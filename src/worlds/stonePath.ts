/**
 * The garden walkway: a winding course of hand-laid stone pavers that sweeps
 * behind and around the meadow play disc.
 *
 * It is deliberately render-only — no physics, no input, no story state. Its
 * one job is composition: a real Lake Lure garden path is the strongest
 * leading line available at golden hour, and this one enters at the near right
 * of the play camera, curves around the back of the play space, and recedes to
 * the left toward the ridgelines so the eye is walked out to the mountains.
 *
 * Every stone is placed from `makeRng`, so a seed reproduces the exact same
 * walkway on every load.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Group,
  IcosahedronGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import { makeRng } from './world'

const DEFAULT_SEED = 0x50415448

/** Half-width of the paved surface, before the soldier course. */
const PAVED_HALF_WIDTH = 0.45
/** Lateral centre of the edging stones. */
const EDGE_OFFSET = 0.515
/** Half-width of the earth bed the stones are set into. */
const BED_HALF_WIDTH = 0.66
/** The meadow play disc a child throws inside of; scenery must clear it. */
const PLAY_CLEARANCE = 2.4
/**
 * Nothing this module emits may reach into the play space, so the centreline
 * itself is held at least a full bed-width outside it. Custom control points
 * are pushed out to this radius rather than rejected.
 */
const MIN_CENTRE_RADIUS = PLAY_CLEARANCE + BED_HALF_WIDTH
/** Spacing between courses; also the nominal stone length along the path. */
const ROW_STEP = 0.36
/** Caps the walkway at 157 pavers even if a caller hands in a huge curve. */
const MAX_ROWS = 45

/** A point on the walkway's centreline. `y` is always the ground plane. */
export interface StonePathPoint {
  readonly x: number
  readonly z: number
}

export interface StonePathOptions {
  /** Stable layout seed. Omit it for the shipped walkway. */
  readonly seed?: number
  /**
   * Accepted for symmetry with the other scene modules. Stone does not move,
   * so this changes nothing — it exists so a caller can pass one options bag
   * to every module without special-casing this one.
   */
  readonly reducedMotion?: boolean
  /**
   * Centreline control points, in world units relative to the returned root.
   * Two or more are interpolated as a centripetal Catmull-Rom spline; fewer
   * falls back to the authored S-curve.
   */
  readonly controlPoints?: ReadonlyArray<StonePathPoint>
}

export interface StonePath {
  /** Add this group to the stage scene. The factory never adds it itself. */
  readonly root: Group
  /** Present for contract parity with the animated modules; a no-op. */
  update(elapsedSeconds: number, deltaSeconds: number): void
  /** Release every geometry and material created here. Idempotent. */
  dispose(): void
}

/**
 * The authored walkway. Three inflections rather than one long arc: a single
 * curve reads as a driveway, while a path that changes its mind twice reads as
 * something a gardener laid around what was already growing.
 *
 * Every point clears the play disc by at least 0.9 units, and the tail stops
 * short of z = -4 so the walkway never fouls the meadow's trestle piers or
 * disappears into the backdrop hills.
 */
const DEFAULT_CONTROL_POINTS: ReadonlyArray<StonePathPoint> = [
  { x: 4.75, z: 1.85 },
  { x: 3.55, z: 0.05 },
  { x: 2.8, z: -2.15 },
  { x: 0.75, z: -3.55 },
  { x: -1.55, z: -3.35 },
  // The tail is held north of z = -3.6 to skirt the meadow's left storybook
  // tree at (-3.05, -4.45) — close enough that its crown overhangs the stones,
  // far enough that no edging stone grows out of the trunk.
  { x: -3.45, z: -3.55 },
  { x: -5.5, z: -2.85 },
]

/**
 * Running bond, held to a straight edge: full courses are three stones wide,
 * and the offset courses gain two half stones at the verges so the joints
 * stagger without the path's outline going ragged. Entries are
 * `[lateral offset, stone width]`.
 */
const FULL_COURSE: ReadonlyArray<readonly [number, number]> = [
  [-0.3, 0.27],
  [0, 0.27],
  [0.3, 0.27],
]
const OFFSET_COURSE: ReadonlyArray<readonly [number, number]> = [
  [-0.3825, 0.12],
  [-0.15, 0.27],
  [0.15, 0.27],
  [0.3825, 0.12],
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function makeStone(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.88, flatShading: true })
}

/**
 * Builds the walkway. It never adds itself to a scene, so the caller keeps
 * placement and lifecycle explicit.
 */
export function createStonePath(options: StonePathOptions = {}): StonePath {
  const root = new Group()
  root.name = 'Winding Garden Stone Path'
  root.userData.kind = 'stone-path'

  const random = makeRng(options.seed ?? DEFAULT_SEED)

  // A small shared pool instead of a material per stone: 140 pavers with 140
  // materials is 140 shader-uniform uploads a frame for a colour spread a
  // child cannot resolve anyway. Five weathered tans read as a quarry lot.
  const paverMaterials = [
    makeStone(0xc4b69c),
    makeStone(0xb9a98e),
    makeStone(0xcec2a6),
    makeStone(0xaea089),
    makeStone(0xc0ac91),
  ]
  const edgeMaterials = [makeStone(0x8f8069), makeStone(0x7f7160)]
  const bedMaterial = makeStone(0x6f6049)
  const mossMaterial = makeStone(0x6c9a4c)

  const source =
    options.controlPoints && options.controlPoints.length >= 2
      ? options.controlPoints
      : DEFAULT_CONTROL_POINTS
  const curve = new CatmullRomCurve3(
    source.map((point) => new Vector3(point.x, 0, point.z)),
    false,
    'centripetal',
    0.5,
  )

  const rows = clamp(Math.round(curve.getLength() / ROW_STEP), 8, MAX_ROWS - 1)
  const centres = curve.getSpacedPoints(rows)
  for (const centre of centres) {
    const radius = Math.hypot(centre.x, centre.z)
    if (radius >= MIN_CENTRE_RADIUS) continue
    // A supplied curve that cuts through the play space is nudged outward
    // rather than dropped: the caller still gets their shape, just held off
    // the ball court.
    if (radius < 1e-4) {
      centre.set(MIN_CENTRE_RADIUS, 0, 0)
      continue
    }
    const push = MIN_CENTRE_RADIUS / radius
    centre.x *= push
    centre.z *= push
  }

  // Headings come from the neighbouring samples, not from the spline, so the
  // stones stay square to the path even where a point was pushed outward.
  const headings = new Float32Array(centres.length)
  const normalX = new Float32Array(centres.length)
  const normalZ = new Float32Array(centres.length)
  for (let row = 0; row < centres.length; row++) {
    const back = centres[Math.max(0, row - 1)]!
    const ahead = centres[Math.min(centres.length - 1, row + 1)]!
    const dx = ahead.x - back.x
    const dz = ahead.z - back.z
    const span = Math.hypot(dx, dz) || 1
    const tangentX = dx / span
    const tangentZ = dz / span
    headings[row] = Math.atan2(tangentX, tangentZ)
    normalX[row] = tangentZ
    normalZ[row] = -tangentX
  }

  // The bed is one stitched ribbon rather than a plane per course: it is the
  // damp soil showing through every joint, so it must follow the curve exactly
  // while costing a single draw call.
  const bedPositions = new Float32Array(centres.length * 6)
  const bedIndices: number[] = []
  for (let row = 0; row < centres.length; row++) {
    const centre = centres[row]!
    // Hand-dug edges wander, and both ends taper so the walkway fades into the
    // grass instead of stopping at a mown rectangle.
    const taper = clamp(Math.min(row, rows - row) / 2.2, 0.42, 1)
    const half = BED_HALF_WIDTH * (0.94 + random() * 0.1) * taper
    const offsetX = normalX[row]! * half
    const offsetZ = normalZ[row]! * half
    const base = row * 6
    bedPositions[base] = centre.x + offsetX
    bedPositions[base + 1] = 0.003
    bedPositions[base + 2] = centre.z + offsetZ
    bedPositions[base + 3] = centre.x - offsetX
    bedPositions[base + 4] = 0.003
    bedPositions[base + 5] = centre.z - offsetZ
    if (row === 0) continue
    const left = (row - 1) * 2
    bedIndices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2)
  }
  const bedGeometry = new BufferGeometry()
  bedGeometry.setAttribute('position', new BufferAttribute(bedPositions, 3))
  bedGeometry.setIndex(bedIndices)
  bedGeometry.computeVertexNormals()
  const bed = new Mesh(bedGeometry, bedMaterial)
  bed.name = 'Path earth bed'
  bed.receiveShadow = true
  root.add(bed)

  const paving = new Group()
  paving.name = 'Stone pavers'
  root.add(paving)

  const edging = new Group()
  edging.name = 'Soldier course edging'
  root.add(edging)

  // One unit box, scaled per stone. Every paver and every edge stone shares
  // it, which is what keeps 220 meshes affordable on an iPad.
  const stoneGeometry = new BoxGeometry(1, 1, 1)

  for (let row = 0; row < centres.length; row++) {
    const centre = centres[row]!
    const heading = headings[row]!
    const nx = normalX[row]!
    const nz = normalZ[row]!
    const course = row % 2 === 1 ? OFFSET_COURSE : FULL_COURSE

    for (const [lateral, cellWidth] of course) {
      const thickness = 0.022 + random() * 0.008
      const drift = lateral + (random() - 0.5) * 0.022
      const along = (random() - 0.5) * 0.032
      const paver = new Mesh(
        stoneGeometry,
        paverMaterials[Math.floor(random() * paverMaterials.length)]!,
      )
      paver.name = 'Stone paver'
      paver.scale.set(
        cellWidth * (0.93 + random() * 0.09),
        thickness,
        0.3 * (0.9 + random() * 0.16),
      )
      paver.position.set(
        centre.x + nx * drift + Math.sin(heading) * along,
        0.004 + thickness * 0.5,
        centre.z + nz * drift + Math.cos(heading) * along,
      )
      // Yaw wander is what separates flagstone from bathroom tile; the pitch
      // and roll are a fraction of it, enough to catch the low sun on one
      // stone and not its neighbour.
      paver.rotation.set(
        (random() - 0.5) * 0.03,
        heading + (random() - 0.5) * 0.13,
        (random() - 0.5) * 0.03,
      )
      // Shadow casting is off on purpose: a 25mm slab lying on the ground
      // contributes nothing to the shadow map but would double the walkway's
      // per-frame draw count.
      paver.receiveShadow = true
      paving.add(paver)
    }

    for (const side of [-1, 1]) {
      const height = 0.05 + random() * 0.012
      const edge = new Mesh(
        stoneGeometry,
        edgeMaterials[Math.floor(random() * edgeMaterials.length)]!,
      )
      edge.name = 'Edging stone'
      edge.scale.set(0.1, height, 0.27 * (0.9 + random() * 0.15))
      edge.position.set(
        centre.x + nx * side * (EDGE_OFFSET + (random() - 0.5) * 0.014),
        0.004 + height * 0.5,
        centre.z + nz * side * (EDGE_OFFSET + (random() - 0.5) * 0.014),
      )
      edge.rotation.set(0, heading + (random() - 0.5) * 0.08, (random() - 0.5) * 0.05)
      edge.receiveShadow = true
      edging.add(edge)
    }
  }

  // Creeping moss in the verge joints. Nine cushions, evenly spread and then
  // jogged, because the one thing a swept new patio has that an old garden
  // path does not is perfectly clean joints.
  const mossGeometry = new IcosahedronGeometry(0.07, 0)
  for (let cushion = 0; cushion < 9; cushion++) {
    const row = clamp(
      Math.round(((cushion + 0.5) / 9) * rows + (random() - 0.5) * 3),
      1,
      rows - 1,
    )
    const centre = centres[row]!
    const side = random() < 0.5 ? -1 : 1
    const lateral = side * (PAVED_HALF_WIDTH * 0.62 + random() * 0.11)
    const moss = new Mesh(mossGeometry, mossMaterial)
    moss.name = 'Moss cushion'
    moss.position.set(
      centre.x + normalX[row]! * lateral,
      0.012,
      centre.z + normalZ[row]! * lateral,
    )
    moss.scale.set(0.9 + random() * 0.5, 0.35, 0.9 + random() * 0.5)
    moss.rotation.y = random() * Math.PI
    moss.receiveShadow = true
    root.add(moss)
  }

  let disposed = false

  function update(_elapsedSeconds: number, _deltaSeconds: number): void {
    // Stone does not move. The signature exists so the caller can drive every
    // scene module from one uniform frame loop.
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    root.removeFromParent()

    const ownedGeometries = new Set<BufferGeometry>()
    const ownedMaterials = new Set<Material>()
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return
      ownedGeometries.add(node.geometry)
      const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of nodeMaterials) ownedMaterials.add(material)
    })
    // The shared pools are disposed explicitly too. A colour that no stone
    // happened to draw is still a live GPU material, and the shared box and
    // icosahedron would survive a caller that disposes before anything is laid.
    ownedGeometries.add(stoneGeometry)
    ownedGeometries.add(mossGeometry)
    ownedGeometries.add(bedGeometry)
    for (const material of paverMaterials) ownedMaterials.add(material)
    for (const material of edgeMaterials) ownedMaterials.add(material)
    ownedMaterials.add(bedMaterial)
    ownedMaterials.add(mossMaterial)
    for (const geometry of ownedGeometries) geometry.dispose()
    for (const material of ownedMaterials) material.dispose()
  }

  return { root, update, dispose }
}
