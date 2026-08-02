/**
 * The lakeside garden that frames the Meadow, taken from a real Lake Lure bed
 * at golden hour: a deep crescent of mulched beds wrapping the play space from
 * behind and around both sides, layered front-to-back the way a gardener
 * actually plants it — boxwood edging, drifts of Shasta daisy, Knock Out roses
 * in two colour masses, then rhododendron and mountain laurel as the backbone,
 * with ferns tucked into the shade along the back edge.
 *
 * Every species is real and locally correct, because the point of this module
 * is that a child can be taught to name them. `plants` carries the botanical
 * and common name of each individual so a later tap-to-learn layer can answer
 * a hit test without this module knowing anything about input.
 *
 * Render-only and deterministic: no physics, no input, no DOM, no audio, and
 * no Math.random — the same seed produces the same garden every load.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import type { Material } from 'three'
import { makeRng } from './world'

const TWO_PI = Math.PI * 2
const DEFAULT_SEED = 0x57_4e_43_47

/** Ground bearing of the play camera. The crescent opens toward it. */
const CAMERA_BEARING = Math.atan2(1.84, 1.7)
/**
 * Angular width of the planting. 246° leaves a ~114° wedge open on the camera
 * side, which is exactly the gap the child looks through at the cougar.
 */
const CRESCENT_SPAN = 4.3
/** Play space. Nothing this module builds may reach inside it. */
const PLAY_RADIUS = 2.4

type Triple = readonly [number, number, number]

/** A plant a future "what is this called?" tap can resolve to a real name. */
export interface GardenPlant {
  node: Object3D
  species: string
  commonName: string
}

export interface WncGardenOptions {
  /** Stable layout seed. Omit it for the shipped garden composition. */
  readonly seed?: number
  /** Leaves the planting fully built while freezing the breeze. */
  readonly reducedMotion?: boolean
}

export interface WncGarden {
  /** Add this group to the stage scene. The factory never adds it itself. */
  readonly root: Group
  /** Every individual plant, with its botanical and common name. */
  readonly plants: ReadonlyArray<GardenPlant>
  /** Advance only visual motion. Both inputs are seconds. */
  update(elapsedSeconds: number, deltaSeconds: number): void
  /** Release every geometry and material created by this factory. Idempotent. */
  dispose(): void
}

interface SwayNode {
  readonly node: Object3D
  /** Preserved because sway writes all three Euler components each frame. */
  readonly yaw: number
  readonly phase: number
  readonly amount: number
  readonly speed: number
}

interface GardenMaterials {
  readonly mulch: MeshStandardMaterial
  readonly mulchDeep: MeshStandardMaterial
  readonly stone: MeshStandardMaterial
  readonly daisyLeaf: MeshStandardMaterial
  readonly daisyPetal: MeshStandardMaterial
  readonly daisyEye: MeshStandardMaterial
  readonly roseFoliage: MeshStandardMaterial
  readonly roseHotPink: MeshStandardMaterial
  readonly roseDeepRed: MeshStandardMaterial
  readonly rhodoFoliage: MeshStandardMaterial
  readonly rhodoLeaf: MeshStandardMaterial
  readonly rhodoBloom: MeshStandardMaterial
  readonly laurelFoliage: MeshStandardMaterial
  readonly laurelLeaf: MeshStandardMaterial
  readonly laurelBloom: MeshStandardMaterial
  readonly boxwood: MeshStandardMaterial
  readonly fern: MeshStandardMaterial
}

/** A shrub built from one mound geometry, one leaf shell, one blossom shell. */
interface ShrubSpec {
  readonly blob: BufferGeometry
  readonly leaves: BufferGeometry
  readonly trusses: BufferGeometry
  readonly shell: number
  readonly foliage: MeshStandardMaterial
  readonly leaf: MeshStandardMaterial
  readonly bloom: MeshStandardMaterial
  readonly species: string
  readonly commonName: string
}

interface RoseSpec {
  readonly blob: BufferGeometry
  readonly blooms: BufferGeometry
  readonly foliage: MeshStandardMaterial
  readonly bloom: MeshStandardMaterial
  readonly species: string
  readonly commonName: string
}

interface Bed {
  readonly u0: number
  readonly u1: number
  readonly inner: number
  readonly outer: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

/** Position along the crescent, 0 and 1 being its two tips. */
function crescentAngle(u: number): number {
  return CAMERA_BEARING + Math.PI + (u - 0.5) * CRESCENT_SPAN
}

/**
 * The beds are deep straight behind the meadow and shallow at the tips: the
 * tips sit almost beside the camera, so a bed of full depth there would run
 * off past the lens instead of reading as garden.
 */
function bedOuterRadius(u: number): number {
  return 3.45 + 2.05 * Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.75)
}

function pushTriangle(positions: number[], indices: number[], a: Triple, b: Triple, c: Triple): void {
  const base = positions.length / 3
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  indices.push(base, base + 1, base + 2)
}

function pushQuad(
  positions: number[],
  indices: number[],
  a: Triple,
  b: Triple,
  c: Triple,
  d: Triple,
): void {
  const base = positions.length / 3
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2])
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

/**
 * Assembles one BufferGeometry from a shared vertex buffer plus one index list
 * per material. Multi-part geometry is how a whole sprig of daisies — stems,
 * white rays, gold discs — becomes a single draw instead of three per bloom.
 */
function buildGeometry(
  positions: readonly number[],
  parts: ReadonlyArray<readonly number[]>,
): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))

  const indices: number[] = []
  let start = 0
  for (let part = 0; part < parts.length; part++) {
    const source = parts[part]!
    for (const index of source) indices.push(index)
    if (parts.length > 1) geometry.addGroup(start, source.length, part)
    start += source.length
  }
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Two unit vectors spanning the plane perpendicular to `normal`. */
function orthonormalBasis(normal: Triple): readonly [Triple, Triple] {
  const [nx, ny, nz] = normal
  // Choosing the reference axis least aligned with the normal keeps the first
  // cross product away from zero length, which is where petals collapse.
  const ref: Triple = Math.abs(ny) < 0.88 ? [0, 1, 0] : [1, 0, 0]
  let tx = ref[1] * nz - ref[2] * ny
  let ty = ref[2] * nx - ref[0] * nz
  let tz = ref[0] * ny - ref[1] * nx
  const length = Math.hypot(tx, ty, tz) || 1
  tx /= length
  ty /= length
  tz /= length
  return [
    [tx, ty, tz],
    [ny * tz - nz * ty, nz * tx - nx * tz, nx * ty - ny * tx],
  ]
}

/**
 * One small many-petalled bloom facing along `normal`. Roses and rhododendron
 * trusses share it at different radii; the alternating petal reach is what
 * makes a five-triangle fan read as layered rather than as a pinwheel.
 */
function pushRosette(
  positions: number[],
  indices: number[],
  center: Triple,
  normal: Triple,
  radius: number,
  petals: number,
  cup: number,
  random: () => number,
): void {
  const [tangent, bitangent] = orthonormalBasis(normal)
  const spin = random() * TWO_PI
  const apex: Triple = [
    center[0] - normal[0] * cup,
    center[1] - normal[1] * cup,
    center[2] - normal[2] * cup,
  ]

  const rim: Triple[] = []
  for (let petal = 0; petal < petals; petal++) {
    const angle = (petal / petals) * TWO_PI + spin
    const reach = radius * (petal % 2 === 0 ? 1 : 0.72)
    const lift = (random() - 0.5) * radius * 0.4
    const across = Math.cos(angle) * reach
    const along = Math.sin(angle) * reach
    rim.push([
      center[0] + tangent[0] * across + bitangent[0] * along + normal[0] * lift,
      center[1] + tangent[1] * across + bitangent[1] * along + normal[1] * lift,
      center[2] + tangent[2] * across + bitangent[2] * along + normal[2] * lift,
    ])
  }

  for (let petal = 0; petal < petals; petal++) {
    pushTriangle(positions, indices, apex, rim[petal]!, rim[(petal + 1) % petals]!)
  }
}

/**
 * A clump of five Shasta daisies as one mesh with three material groups.
 * Shasta daisies grow in clumps, so a clump is the natural unit — and baking a
 * whole clump into one draw is what lets the beds carry hundreds of blooms on
 * an iPad instead of three meshes per flower.
 */
function makeDaisySprigGeometry(random: () => number): BufferGeometry {
  const positions: number[] = []
  const green: number[] = []
  const rays: number[] = []
  const discs: number[] = []

  for (let bloom = 0; bloom < 5; bloom++) {
    const baseX = (random() - 0.5) * 0.14
    const baseZ = (random() - 0.5) * 0.14
    const height = 0.3 + random() * 0.14
    const leanAngle = random() * TWO_PI
    const lean = 0.025 + random() * 0.05
    const topX = baseX + Math.cos(leanAngle) * lean
    const topZ = baseZ + Math.sin(leanAngle) * lean

    // A three-sided prism rather than a cylinder: at flat shading it gives the
    // stem three distinctly lit facets for six triangles.
    const lower = 0.0085
    const upper = 0.0055
    for (let side = 0; side < 3; side++) {
      const a0 = (side / 3) * TWO_PI
      const a1 = ((side + 1) / 3) * TWO_PI
      pushQuad(
        positions,
        green,
        [baseX + Math.cos(a0) * lower, 0, baseZ + Math.sin(a0) * lower],
        [topX + Math.cos(a0) * upper, height, topZ + Math.sin(a0) * upper],
        [topX + Math.cos(a1) * upper, height, topZ + Math.sin(a1) * upper],
        [baseX + Math.cos(a1) * lower, 0, baseZ + Math.sin(a1) * lower],
      )
    }

    const discY = height + 0.006
    const petals = 11
    for (let petal = 0; petal < petals; petal++) {
      const angle = (petal / petals) * TWO_PI + random() * 0.09
      const dx = Math.cos(angle)
      const dz = Math.sin(angle)
      const sx = -dz
      const sz = dx
      const inner = 0.015
      const outer = 0.049 + random() * 0.013
      // Ray florets held flat and very slightly reflexed. Cupping them upward
      // turns the flower into a buttercup; this is the daisy silhouette.
      const droop = -0.003 - random() * 0.005
      pushQuad(
        positions,
        rays,
        [topX + dx * inner - sx * 0.006, discY, topZ + dz * inner - sz * 0.006],
        [topX + dx * inner + sx * 0.006, discY, topZ + dz * inner + sz * 0.006],
        [topX + dx * outer + sx * 0.0105, discY + droop, topZ + dz * outer + sz * 0.0105],
        [topX + dx * outer - sx * 0.0105, discY + droop, topZ + dz * outer - sz * 0.0105],
      )
    }

    const discRadius = 0.019
    const apex: Triple = [topX, height + 0.018, topZ]
    for (let wedge = 0; wedge < 8; wedge++) {
      const a0 = (wedge / 8) * TWO_PI
      const a1 = ((wedge + 1) / 8) * TWO_PI
      pushTriangle(
        positions,
        discs,
        apex,
        [topX + Math.cos(a1) * discRadius, height + 0.008, topZ + Math.sin(a1) * discRadius],
        [topX + Math.cos(a0) * discRadius, height + 0.008, topZ + Math.sin(a0) * discRadius],
      )
    }
  }

  // The basal rosette matters: without it the stems read as wire stuck in mud.
  for (let leaf = 0; leaf < 4; leaf++) {
    const angle = random() * TWO_PI
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    const sx = -dz
    const sz = dx
    const length = 0.08 + random() * 0.045
    pushQuad(
      positions,
      green,
      [0, 0.004, 0],
      [dx * length * 0.45 + sx * 0.017, 0.028, dz * length * 0.45 + sz * 0.017],
      [dx * length, 0.011, dz * length],
      [dx * length * 0.45 - sx * 0.017, 0.028, dz * length * 0.45 - sz * 0.017],
    )
  }

  return buildGeometry(positions, [green, rays, discs])
}

/** Every bloom on one Knock Out shrub, as a single shell of rosettes. */
function makeRoseBloomGeometry(
  random: () => number,
  count: number,
  shell: number,
  centerY: number,
): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (let bloom = 0; bloom < count; bloom++) {
    // Biased to the upper surface: a Knock Out flushes where the sun lands,
    // never on the shaded underside of the mound.
    const up = 0.1 + random() * 0.88
    const ring = Math.sqrt(Math.max(0, 1 - up * up))
    const around = random() * TWO_PI
    const normal: Triple = [Math.cos(around) * ring, up, Math.sin(around) * ring]
    const reach = shell + random() * 0.035
    pushRosette(
      positions,
      indices,
      [normal[0] * reach, centerY + normal[1] * reach * 0.88, normal[2] * reach],
      normal,
      0.034 + random() * 0.015,
      5,
      0.012,
      random,
    )
  }
  return buildGeometry(positions, [indices])
}

/** Broad lance leaves standing proud of a shrub mound of radius `shell`. */
function makeLeafShellGeometry(
  random: () => number,
  count: number,
  length: number,
  width: number,
  shell: number,
): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (let leaf = 0; leaf < count; leaf++) {
    const up = -0.15 + random() * 1.1
    const ring = Math.sqrt(Math.max(0, 1 - up * up))
    const around = random() * TWO_PI
    const nx = Math.cos(around) * ring
    const ny = up
    const nz = Math.sin(around) * ring
    const base: Triple = [nx * shell * 0.94, shell * 0.95 + ny * shell * 0.94, nz * shell * 0.94]

    // Rhododendron and laurel leaves hang outward and down off the branch tips.
    // Splaying them straight out along the surface normal reads as a hedgehog.
    let ax = nx * 0.92
    let ay = ny * 0.5 - 0.44
    let az = nz * 0.92
    const axisLength = Math.hypot(ax, ay, az) || 1
    ax /= axisLength
    ay /= axisLength
    az /= axisLength
    const axis: Triple = [ax, ay, az]
    const [side] = orthonormalBasis(axis)

    const at = (along: number, across: number): Triple => [
      base[0] + axis[0] * along + side[0] * across,
      base[1] + axis[1] * along + side[1] * across,
      base[2] + axis[2] * along + side[2] * across,
    ]
    const span = length * (0.8 + random() * 0.4)
    const half = width * 0.5
    pushTriangle(positions, indices, base, at(span * 0.26, half), at(span * 0.26, -half))
    pushQuad(
      positions,
      indices,
      at(span * 0.26, half),
      at(span * 0.72, half * 0.86),
      at(span * 0.72, -half * 0.86),
      at(span * 0.26, -half),
    )
    pushTriangle(positions, indices, at(span * 0.72, half * 0.86), at(span, 0), at(span * 0.72, -half * 0.86))
  }
  return buildGeometry(positions, [indices])
}

/**
 * Domed trusses of bell flowers over a shrub mound. Rhododendron blossom does
 * not scatter over the bush — it gathers into fist-sized heads, and that
 * clustering is most of what tells it apart from a rose at a glance.
 */
function makeTrussShellGeometry(
  random: () => number,
  trusses: number,
  blossoms: number,
  trussRadius: number,
  blossomRadius: number,
  shell: number,
): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (let truss = 0; truss < trusses; truss++) {
    const up = 0.22 + random() * 0.75
    const ring = Math.sqrt(Math.max(0, 1 - up * up))
    const around = random() * TWO_PI
    const normal: Triple = [Math.cos(around) * ring, up, Math.sin(around) * ring]
    const reach = shell + trussRadius * 0.7
    const center: Triple = [
      normal[0] * reach,
      shell * 0.95 + normal[1] * reach * 0.9,
      normal[2] * reach,
    ]
    const [tangent, bitangent] = orthonormalBasis(normal)

    for (let blossom = 0; blossom < blossoms; blossom++) {
      const across = (random() - 0.5) * 1.6
      const along = (random() - 0.5) * 1.6
      let bx = normal[0] + tangent[0] * across + bitangent[0] * along
      let by = normal[1] + tangent[1] * across + bitangent[1] * along
      let bz = normal[2] + tangent[2] * across + bitangent[2] * along
      const spread = Math.hypot(bx, by, bz) || 1
      bx /= spread
      by /= spread
      bz /= spread
      pushRosette(
        positions,
        indices,
        [
          center[0] + bx * trussRadius,
          center[1] + by * trussRadius,
          center[2] + bz * trussRadius,
        ],
        [bx, by, bz],
        blossomRadius,
        5,
        blossomRadius * 0.4,
        random,
      )
    }
  }
  return buildGeometry(positions, [indices])
}

/** A crown of arching fronds — the one silhouette here that is not a mound. */
function makeFernGeometry(random: () => number): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (let frond = 0; frond < 6; frond++) {
    const yaw = (frond / 6) * TWO_PI + random() * 0.42
    const dx = Math.cos(yaw)
    const dz = Math.sin(yaw)
    const sx = -dz
    const sz = dx
    const length = 0.3 + random() * 0.13
    const arch = 0.24 + random() * 0.11

    let px = 0
    let py = 0.02
    let pz = 0
    let prevHalf = 0.007
    for (let step = 1; step <= 9; step++) {
      const t = step / 9
      const cx = dx * t * length
      // Peaks around t = 0.59 and falls away again, so the frond tip nods over
      // instead of pointing at the sky like a blade of grass.
      const cy = 0.02 + arch * Math.sin(t * Math.PI * 0.85)
      const cz = dz * t * length
      const half = 0.007 * (1 - t * 0.75)
      pushQuad(
        positions,
        indices,
        [px - sx * prevHalf, py, pz - sz * prevHalf],
        [px + sx * prevHalf, py, pz + sz * prevHalf],
        [cx + sx * half, cy, cz + sz * half],
        [cx - sx * half, cy, cz - sz * half],
      )

      const pinna = 0.085 * Math.pow(Math.sin(t * Math.PI), 0.5) * (1 - t * 0.25)
      for (const side of [-1, 1] as const) {
        pushTriangle(
          positions,
          indices,
          [px, py, pz],
          [cx, cy, cz],
          [
            cx + sx * side * pinna + dx * pinna * 0.3,
            cy - 0.018 - pinna * 0.12,
            cz + sz * side * pinna + dz * pinna * 0.3,
          ],
        )
      }

      px = cx
      py = cy
      pz = cz
      prevHalf = half
    }
  }
  return buildGeometry(positions, [indices])
}

/** A flat, scallop-edged mulch bed hugging the ground under one planting. */
function makeBedGeometry(bed: Bed, random: () => number): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  const segments = 18
  const innerWave = random() * TWO_PI
  const outerWave = random() * TWO_PI

  for (let step = 0; step <= segments; step++) {
    const angle = crescentAngle(bed.u0 + (bed.u1 - bed.u0) * (step / segments))
    // A cut bed edge is scalloped; a perfect arc reads as a decal on the lawn.
    const inner = bed.inner + Math.sin(step * 0.9 + innerWave) * 0.045 + (random() - 0.5) * 0.03
    const outer = bed.outer + Math.sin(step * 0.55 + outerWave) * 0.16 + (random() - 0.5) * 0.1
    positions.push(Math.cos(angle) * inner, 0, Math.sin(angle) * inner)
    positions.push(Math.cos(angle) * outer, 0, Math.sin(angle) * outer)
  }
  for (let step = 0; step < segments; step++) {
    const corner = step * 2
    indices.push(corner, corner + 2, corner + 1, corner + 2, corner + 3, corner + 1)
  }
  return buildGeometry(positions, [indices])
}

function addRoseShrub(
  parent: Group,
  spec: RoseSpec,
  x: number,
  z: number,
  scale: number,
  yaw: number,
  random: () => number,
): { readonly group: Group; readonly blooms: Mesh } {
  const shrub = new Group()
  shrub.name = spec.commonName
  shrub.position.set(x, 0, z)
  shrub.rotation.y = yaw
  shrub.scale.setScalar(scale)

  const mounds: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [0, 0.24, 0, 0.3, 0.26, 0.29],
    [0.14, 0.17, 0.08, 0.2, 0.17, 0.19],
    [-0.13, 0.18, -0.07, 0.22, 0.19, 0.2],
  ]
  for (const [mx, my, mz, sx, sy, sz] of mounds) {
    const mound = new Mesh(spec.blob, spec.foliage)
    mound.position.set(mx, my, mz)
    mound.scale.set(sx, sy, sz)
    mound.rotation.set(random() * 0.5, random() * TWO_PI, random() * 0.5)
    shrub.add(mound)
  }

  const blooms = new Mesh(spec.blooms, spec.bloom)
  blooms.name = 'Knock Out rose blooms'
  blooms.rotation.y = random() * TWO_PI
  shrub.add(blooms)

  parent.add(shrub)
  return { group: shrub, blooms }
}

function addBackboneShrub(
  parent: Group,
  spec: ShrubSpec,
  x: number,
  z: number,
  scale: number,
  yaw: number,
  random: () => number,
): { readonly group: Group; readonly trusses: Mesh } {
  const shrub = new Group()
  shrub.name = spec.commonName
  shrub.position.set(x, 0, z)
  shrub.rotation.y = yaw
  shrub.scale.setScalar(scale)

  const shell = spec.shell
  const mounds: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, shell, 0, 1],
    [shell * 0.6, shell * 0.72, shell * 0.24, 0.68],
    [-shell * 0.52, shell * 0.78, -shell * 0.28, 0.72],
  ]
  for (const [mx, my, mz, spread] of mounds) {
    const mound = new Mesh(spec.blob, spec.foliage)
    mound.position.set(mx, my, mz)
    mound.scale.set(shell * spread * 1.06, shell * spread * 0.98, shell * spread)
    mound.rotation.set(random() * 0.5, random() * TWO_PI, random() * 0.5)
    shrub.add(mound)
  }

  const leaves = new Mesh(spec.leaves, spec.leaf)
  leaves.name = 'Evergreen leaves'
  leaves.rotation.y = random() * TWO_PI
  shrub.add(leaves)

  const trusses = new Mesh(spec.trusses, spec.bloom)
  trusses.name = 'Blossom trusses'
  trusses.rotation.y = random() * TWO_PI
  shrub.add(trusses)

  parent.add(shrub)
  return { group: shrub, trusses }
}

function makeMaterials(): GardenMaterials {
  // Petals, leaf blades and fronds are single sheets of triangles, so half of
  // every bloom would vanish under back-face culling as the camera orbits.
  // DoubleSide costs nothing at this on-screen size and fixes it outright.
  const leafy = (color: number, roughness = 0.86) =>
    new MeshStandardMaterial({ color, roughness, flatShading: true, side: DoubleSide })
  const solid = (color: number, roughness = 0.9) =>
    new MeshStandardMaterial({ color, roughness, flatShading: true })

  return {
    mulch: solid(0x3f2e20, 0.98),
    mulchDeep: solid(0x33251a, 0.98),
    stone: solid(0x9d9184),
    daisyLeaf: leafy(0x5c9642),
    daisyPetal: leafy(0xfff5e0, 0.7),
    daisyEye: leafy(0xf6b93b, 0.64),
    roseFoliage: solid(0x2c6236),
    roseHotPink: leafy(0xe33f8c, 0.68),
    roseDeepRed: leafy(0xa8172c, 0.7),
    rhodoFoliage: solid(0x24503a),
    rhodoLeaf: leafy(0x2d6144),
    rhodoBloom: leafy(0xf2c3d5, 0.7),
    laurelFoliage: solid(0x2f5c3c),
    laurelLeaf: leafy(0x3d7048),
    laurelBloom: leafy(0xfbe0e8, 0.7),
    boxwood: solid(0x5f9447),
    fern: leafy(0x4d8f49),
  }
}

/**
 * Builds the lakeside garden without adding anything to a scene. The caller
 * owns placement and frame scheduling; this module owns nothing but geometry.
 */
export function createWncGarden(options: WncGardenOptions = {}): WncGarden {
  const root = new Group()
  root.name = 'WNC Lakeside Garden'
  root.userData.kind = 'wnc-garden'

  const random = makeRng(options.seed ?? DEFAULT_SEED)
  const materials = makeMaterials()
  const swaying: SwayNode[] = []
  const plants: GardenPlant[] = []

  // Shared geometry pool. Roughly 180 meshes draw from ~15 geometries here,
  // which is the whole reason this stays inside an iPad's frame budget.
  const shrubBlob = new IcosahedronGeometry(1, 0)
  // A finer sphere for boxwood: the tighter facets are exactly how a clipped
  // box mound reads different from the coarse, leafy rhododendron beside it.
  const boxwoodBlob = new IcosahedronGeometry(1, 1)
  const stoneBlob = new DodecahedronGeometry(0.075, 0)
  const daisySprigs = [
    makeDaisySprigGeometry(random),
    makeDaisySprigGeometry(random),
    makeDaisySprigGeometry(random),
  ]
  const roseBloomShells = [
    makeRoseBloomGeometry(random, 20, 0.3, 0.25),
    makeRoseBloomGeometry(random, 22, 0.29, 0.24),
  ]
  const fernCrowns = [makeFernGeometry(random), makeFernGeometry(random)]

  const roseSpecs: readonly RoseSpec[] = [
    {
      blob: shrubBlob,
      blooms: roseBloomShells[0]!,
      foliage: materials.roseFoliage,
      bloom: materials.roseHotPink,
      species: "Rosa 'Radcon'",
      commonName: 'Pink Knock Out rose',
    },
    {
      blob: shrubBlob,
      blooms: roseBloomShells[1]!,
      foliage: materials.roseFoliage,
      bloom: materials.roseDeepRed,
      species: "Rosa 'Radrazz'",
      commonName: 'Red Knock Out rose',
    },
  ]

  const backboneSpecs: readonly ShrubSpec[] = [
    {
      blob: shrubBlob,
      leaves: makeLeafShellGeometry(random, 24, 0.2, 0.058, 0.42),
      trusses: makeTrussShellGeometry(random, 7, 7, 0.055, 0.03, 0.44),
      shell: 0.42,
      foliage: materials.rhodoFoliage,
      leaf: materials.rhodoLeaf,
      bloom: materials.rhodoBloom,
      species: 'Rhododendron catawbiense',
      commonName: 'Catawba rhododendron',
    },
    {
      blob: shrubBlob,
      leaves: makeLeafShellGeometry(random, 28, 0.115, 0.04, 0.34),
      trusses: makeTrussShellGeometry(random, 9, 6, 0.042, 0.021, 0.36),
      shell: 0.34,
      foliage: materials.laurelFoliage,
      leaf: materials.laurelLeaf,
      bloom: materials.laurelBloom,
      species: 'Kalmia latifolia',
      commonName: 'Mountain laurel',
    },
  ]

  const bedEdges: readonly number[] = [0, 0.17, 0.35, 0.5, 0.65, 0.83, 1]

  for (let index = 0; index < bedEdges.length - 1; index++) {
    // Neighbouring beds overlap slightly in u so the mulch reads as one
    // continuous sweep of garden rather than six separate islands.
    const u0 = clamp(bedEdges[index]! - 0.015, 0, 1)
    const u1 = clamp(bedEdges[index + 1]! + 0.015, 0, 1)
    const inner = 2.6 + random() * 0.12
    const outer = Math.max(inner + 0.85, bedOuterRadius((u0 + u1) * 0.5) + (random() - 0.5) * 0.3)
    const bed: Bed = { u0, u1, inner, outer }
    const depth = outer - inner

    const bedMesh = new Mesh(
      makeBedGeometry(bed, random),
      index % 2 === 0 ? materials.mulch : materials.mulchDeep,
    )
    bedMesh.name = 'Garden mulch bed'
    // Clear of the meadow pad and the mown ring beneath it, and far enough off
    // the ground plane that nothing z-fights at grazing angles.
    bedMesh.position.y = 0.012
    root.add(bedMesh)

    /** `across` runs along the bed, `back` runs from its front edge to its rear. */
    const place = (across: number, back: number): readonly [number, number] => {
      const angle = crescentAngle(bed.u0 + (bed.u1 - bed.u0) * clamp(across, 0, 1))
      const radius = Math.max(PLAY_RADIUS + 0.2, bed.inner + (bed.outer - bed.inner) * back)
      return [Math.cos(angle) * radius, Math.sin(angle) * radius]
    }

    const stones = 2 + Math.round(random() * 1.4)
    for (let stone = 0; stone < stones; stone++) {
      const [x, z] = place(random(), 0.01 + random() * 0.04)
      const rock = new Mesh(stoneBlob, materials.stone)
      rock.name = 'Bed edging stone'
      rock.position.set(x, 0.022, z)
      rock.scale.set(1.1 + random() * 0.6, 0.45 + random() * 0.2, 1 + random() * 0.5)
      rock.rotation.set(random() * 0.4, random() * TWO_PI, random() * 0.4)
      root.add(rock)
    }

    const boxwoods = 3 + Math.round(depth * 0.9)
    for (let box = 0; box < boxwoods; box++) {
      const [x, z] = place((box + 0.5) / boxwoods + (random() - 0.5) * 0.14, 0.05 + random() * 0.05)
      const spread = 0.17 + random() * 0.07
      const mound = new Mesh(boxwoodBlob, materials.boxwood)
      mound.name = 'Boxwood edging mound'
      mound.position.set(x, spread * 0.5, z)
      mound.scale.set(spread, spread * (0.6 + random() * 0.18), spread * (0.9 + random() * 0.16))
      mound.rotation.set(random() * 0.3, random() * TWO_PI, random() * 0.3)
      root.add(mound)
      plants.push({ node: mound, species: 'Buxus sempervirens', commonName: 'Common boxwood' })
    }

    // Daisies go in drifts, not a scatter: a mass of one thing reading as one
    // shape is how a real bed looks, and it is far easier for a child to name.
    // Counts scale with the bed's real depth. The deep beds behind the meadow
    // run 2.9 units front to back, and the old fixed-ish counts spread a dozen
    // clumps across all of that — which is exactly why the planting read as a
    // single tidy strip instead of something you could get lost in.
    const drifts = 2 + Math.round(depth * 1.45)
    for (let drift = 0; drift < drifts; drift++) {
      const driftAcross = (drift + 0.5) / drifts + (random() - 0.5) * 0.16
      // Reach the whole bed, not just its front 60%.
      const driftBack = 0.14 + random() * 0.66
      const sprigs = 5 + Math.round(depth * 2.2)
      for (let sprig = 0; sprig < sprigs; sprig++) {
        const [x, z] = place(
          driftAcross + (random() - 0.5) * 0.22,
          clamp(driftBack + (random() - 0.5) * 0.18, 0.1, 0.62),
        )
        const clump = new Mesh(daisySprigs[(drift + sprig) % daisySprigs.length]!, [
          materials.daisyLeaf,
          materials.daisyPetal,
          materials.daisyEye,
        ])
        clump.name = 'Shasta daisy clump'
        const yaw = random() * TWO_PI
        clump.position.set(x, 0, z)
        clump.rotation.y = yaw
        // Big blooms, deliberately NOT tall. The flower heads are horizontal
        // discs, so squashing the vertical axis costs almost no apparent bloom
        // size while keeping the drift from growing into a wall that hides the
        // lake behind it. Scaling uniformly did exactly that.
        const spread = 1.55 + random() * 0.95
        clump.scale.set(spread, spread * 0.62, spread)
        root.add(clump)
        swaying.push({
          node: clump,
          yaw,
          phase: random() * TWO_PI,
          amount: 0.05 + random() * 0.03,
          speed: 1.02 + random() * 0.42,
        })
        plants.push({
          node: clump,
          species: 'Leucanthemum x superbum',
          commonName: 'Shasta daisy',
        })
      }
    }

    // One colour group per half of the crescent. Alternating them plant by
    // plant would read as confetti instead of as two named varieties.
    const roseSpec = roseSpecs[index < 3 ? 0 : 1]!
    const roses = 1 + Math.round(depth * 1.15)
    for (let rose = 0; rose < roses; rose++) {
      const [x, z] = place((rose + 0.5) / roses + (random() - 0.5) * 0.22, 0.42 + random() * 0.16)
      const shrub = addRoseShrub(
        root,
        roseSpec,
        x,
        z,
        1.4 + random() * 0.5,
        random() * TWO_PI,
        random,
      )
      swaying.push({
        node: shrub.blooms,
        yaw: shrub.blooms.rotation.y,
        phase: random() * TWO_PI,
        amount: 0.018 + random() * 0.01,
        speed: 0.82 + random() * 0.3,
      })
      plants.push({
        node: shrub.group,
        species: roseSpec.species,
        commonName: roseSpec.commonName,
      })
    }

    const backbones = 1 + Math.round(depth * 0.8)
    for (let shrubIndex = 0; shrubIndex < backbones; shrubIndex++) {
      const spec = backboneSpecs[(index + shrubIndex) % 3 === 2 ? 1 : 0]!
      const [x, z] = place(
        (shrubIndex + 0.5) / backbones + (random() - 0.5) * 0.24,
        0.68 + random() * 0.16,
      )
      const shrub = addBackboneShrub(
        root,
        spec,
        x,
        z,
        1 + random() * 0.3,
        random() * TWO_PI,
        random,
      )
      swaying.push({
        node: shrub.trusses,
        yaw: shrub.trusses.rotation.y,
        phase: random() * TWO_PI,
        amount: 0.015 + random() * 0.01,
        speed: 0.68 + random() * 0.26,
      })
      plants.push({ node: shrub.group, species: spec.species, commonName: spec.commonName })
    }

    const ferns = depth > 1.2 ? 1 + Math.round(depth * 0.9) : 0
    for (let fern = 0; fern < ferns; fern++) {
      // Offset from the shrub band so the fronds show in the gaps rather than
      // disappearing behind a rhododendron the moment they are planted.
      const [x, z] = place((fern + 0.25) / Math.max(1, ferns) + 0.18, 0.88 + random() * 0.1)
      const crown = new Mesh(fernCrowns[fern % fernCrowns.length]!, materials.fern)
      crown.name = 'Christmas fern'
      const yaw = random() * TWO_PI
      crown.position.set(x, 0, z)
      crown.rotation.y = yaw
      crown.scale.setScalar(1 + random() * 0.4)
      root.add(crown)
      swaying.push({
        node: crown,
        yaw,
        phase: random() * TWO_PI,
        amount: 0.038 + random() * 0.022,
        speed: 0.88 + random() * 0.32,
      })
      plants.push({
        node: crown,
        species: 'Polystichum acrostichoides',
        commonName: 'Christmas fern',
      })
    }
  }

  // Nothing here casts or receives shadows on purpose: the sun's shadow camera
  // is a tight ±2.4 box around the cougar, so every garden mesh would be paid
  // for in the shadow pass and land outside the map anyway.

  let animationTime = 0
  let lastElapsed = 0
  let disposed = false

  function update(elapsedSeconds: number, deltaSeconds: number): void {
    if (disposed) return
    const elapsed = finite(elapsedSeconds)
    const delta = clamp(finite(deltaSeconds), 0, 0.08)
    // Advancing from a clamped delta means a suspended tab resumes into the
    // same calm breeze instead of snapping every plant to a new angle.
    if (elapsed < lastElapsed) animationTime = 0
    lastElapsed = elapsed
    animationTime += delta
    const time = options.reducedMotion ? 0 : animationTime

    for (const sway of swaying) {
      // Two incommensurate rates per plant: a single sine makes a whole bed
      // nod in lockstep, which reads as a mechanism rather than as wind.
      sway.node.rotation.set(
        Math.cos(time * sway.speed * 0.71 + sway.phase * 1.37) * sway.amount * 0.5,
        sway.yaw,
        Math.sin(time * sway.speed + sway.phase) * sway.amount,
      )
    }
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
      const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of nodeMaterials) ownedMaterials.add(material)
    })
    for (const geometry of geometries) geometry.dispose()
    for (const material of ownedMaterials) material.dispose()
  }

  return { root, plants, update, dispose }
}
