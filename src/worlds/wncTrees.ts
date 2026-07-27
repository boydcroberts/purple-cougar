/**
 * The tall Western North Carolina trees that frame the Lake Lure view.
 *
 * Four real species, chosen because each one has a silhouette a three-year-old
 * can learn to tell apart from across a room: the tiered white pine, the dense
 * nodding hemlock, the flat-shelved flowering dogwood, and one broad red maple.
 * At 5-16 units out no leaf is ever more than a pixel or two, so every species
 * cue lives in the outline — tier spacing, crown density, branch angle — rather
 * than in foliage detail nobody can resolve.
 *
 * Render only: no physics, no input, no story state, and no Math.random.
 */
import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import type { Material } from 'three'
import { makeRng } from './world'

const TWO_PI = Math.PI * 2
const DEFAULT_SEED = 0x574e4354

/** The play camera's resting ground position and the point it looks at. */
const CAMERA_FLAT_X = 1.7
const CAMERA_FLAT_Z = 1.84
const LOOK_FLAT_Z = -0.18
const CAMERA_BEARING = Math.atan2(CAMERA_FLAT_X, CAMERA_FLAT_Z - LOOK_FLAT_Z)

/** Reused during construction only — no per-frame allocation. */
const UP = new Vector3(0, 1, 0)
const AXIS = new Vector3()

export type WncTreeSpecies = 'white-pine' | 'hemlock' | 'dogwood' | 'red-maple'

export interface WncTreesOptions {
  /** Stable layout seed. Omit it for the authored framing composition. */
  readonly seed?: number
  /** Leaves the trees standing while freezing the wind. */
  readonly reducedMotion?: boolean
}

export interface WncTrees {
  /** Add this group to the stage scene. The factory never adds it itself. */
  readonly root: Group
  /**
   * Plant one more tree at a measured spot, in the root's local space.
   * Unknown species names fall back to the white pine.
   */
  add(x: number, z: number, species: string, scale?: number): void
  /** Advance only visual motion. Both inputs are seconds. */
  update(elapsedSeconds: number, deltaSeconds: number): void
  /** Release every geometry and material created by this factory. Idempotent. */
  dispose(): void
}

interface TreeGeometries {
  readonly trunkStraight: CylinderGeometry
  readonly trunkTapered: CylinderGeometry
  readonly limb: CylinderGeometry
  readonly bough: ConeGeometry
  readonly sprig: ConeGeometry
  readonly blob: DodecahedronGeometry
  readonly blossom: BufferGeometry
}

interface TreeMaterials {
  readonly barkPine: MeshStandardMaterial
  readonly barkDark: MeshStandardMaterial
  readonly barkGrey: MeshStandardMaterial
  readonly pineNeedle: MeshStandardMaterial
  readonly pineNeedleLit: MeshStandardMaterial
  readonly hemlockDark: MeshStandardMaterial
  readonly hemlockLit: MeshStandardMaterial
  readonly dogwoodLeaf: MeshStandardMaterial
  readonly dogwoodBlossom: MeshStandardMaterial
  readonly mapleRed: MeshStandardMaterial
  readonly mapleGreen: MeshStandardMaterial
}

interface TreeSway {
  readonly node: Group
  readonly phase: number
  readonly amount: number
  readonly speed: number
}

type TreeBuilder = (
  random: () => number,
  geometries: TreeGeometries,
  materials: TreeMaterials,
) => Group

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

/**
 * A tapered cylinder stretched between two points. Orienting by quaternion
 * keeps every branch a single mesh — nesting a pivot Group per limb tripled
 * the node count of the dogwoods for no visual gain.
 */
function addLimb(
  parent: Group,
  geometry: CylinderGeometry,
  material: MeshStandardMaterial,
  baseX: number,
  baseY: number,
  baseZ: number,
  tipX: number,
  tipY: number,
  tipZ: number,
  radius: number,
): void {
  AXIS.set(tipX - baseX, tipY - baseY, tipZ - baseZ)
  const length = AXIS.length()
  if (length < 1e-4) return
  AXIS.divideScalar(length)
  const limb = new Mesh(geometry, material)
  limb.quaternion.setFromUnitVectors(UP, AXIS)
  limb.scale.set(radius, length, radius)
  limb.position.set((baseX + tipX) / 2, (baseY + tipY) / 2, (baseZ + tipZ) / 2)
  parent.add(limb)
}

/** A cone whose base sits at the given point and whose apex follows `dir`. */
function addOrientedCone(
  parent: Group,
  geometry: ConeGeometry,
  material: MeshStandardMaterial,
  baseX: number,
  baseY: number,
  baseZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  radius: number,
  length: number,
): void {
  AXIS.set(dirX, dirY, dirZ)
  if (AXIS.lengthSq() < 1e-8) return
  AXIS.normalize()
  const cone = new Mesh(geometry, material)
  cone.quaternion.setFromUnitVectors(UP, AXIS)
  cone.scale.set(radius, length, radius)
  cone.position.set(
    baseX + AXIS.x * length * 0.5,
    baseY + AXIS.y * length * 0.5,
    baseZ + AXIS.z * length * 0.5,
  )
  parent.add(cone)
}

/**
 * One flowering-dogwood blossom: four bracts, each notched at the tip.
 *
 * The notch is the field mark that separates a dogwood from every other white
 * spring blossom, and it is the one detail that still reads when the whole
 * flower is a dozen pixels wide. Built once and shared by every bloom on every
 * dogwood in the scene.
 */
function makeBlossomGeometry(): BufferGeometry {
  const bract: ReadonlyArray<readonly [number, number, number]> = [
    [0.1, 0, 0],
    [0.45, 0.03, -0.26],
    [0.45, 0.03, 0.26],
    [0.98, 0.06, -0.13],
    [0.98, 0.06, 0.13],
    [0.82, 0.05, 0],
  ]
  // Wound so every face normal points up out of the bract.
  const bractFaces = [0, 2, 1, 1, 2, 5, 1, 5, 3, 5, 2, 4]

  const positions: number[] = []
  const indices: number[] = []
  for (let quarter = 0; quarter < 4; quarter++) {
    const angle = quarter * (Math.PI / 2)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const offset = quarter * bract.length
    for (const [x, y, z] of bract) {
      positions.push(x * cos - z * sin, y, x * sin + z * cos)
    }
    for (const face of bractFaces) indices.push(offset + face)
  }

  const centre = positions.length / 3
  for (const [x, z] of [
    [0.11, -0.11],
    [0.11, 0.11],
    [-0.11, 0.11],
    [-0.11, -0.11],
  ] as const) {
    positions.push(x, 0.012, z)
  }
  indices.push(centre, centre + 2, centre + 1, centre, centre + 3, centre + 2)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeGeometries(): TreeGeometries {
  return {
    // Unit height, scaled per tree: a pine holds its diameter far up the bole,
    // a hardwood sheds it fast, so the two tapers are worth separate geometry.
    trunkStraight: new CylinderGeometry(0.45, 1, 1, 6),
    trunkTapered: new CylinderGeometry(0.28, 1, 1, 6),
    limb: new CylinderGeometry(0.5, 1, 1, 5),
    bough: new ConeGeometry(1, 1, 7, 1),
    sprig: new ConeGeometry(1, 1, 5, 1),
    blob: new DodecahedronGeometry(1, 0),
    blossom: makeBlossomGeometry(),
  }
}

function makeMaterials(): TreeMaterials {
  const standard = (color: number, roughness = 0.92) =>
    new MeshStandardMaterial({ color, roughness, flatShading: true })

  return {
    barkPine: standard(0x6f5643),
    barkDark: standard(0x4b3a30),
    // Flowering dogwood really is pale grey next to everything around it.
    barkGrey: standard(0x8b7a6b),
    // White pine needles are blue-green, and that cool cast against the warm
    // sunrise is half of why the reference photos read as Appalachian.
    pineNeedle: standard(0x6d9384),
    pineNeedleLit: standard(0x86ac93),
    hemlockDark: standard(0x35603f),
    hemlockLit: standard(0x437a4b),
    dogwoodLeaf: standard(0x6f9c52),
    dogwoodBlossom: new MeshStandardMaterial({
      color: 0xfff3e0,
      roughness: 0.74,
      flatShading: true,
      side: DoubleSide,
    }),
    mapleRed: standard(0xbc6440),
    mapleGreen: standard(0x8f9c4c),
  }
}

/**
 * Eastern white pine — the signature silhouette of the reference photographs.
 *
 * Everything here serves one read: distinct horizontal whorls of bough with
 * daylight between them, climbing a bole that stays nearly cylindrical, topped
 * by the bare leader spike. The tier radii are deliberately jittered rather
 * than falling off smoothly; a real white pine loses whole boughs to ice storms
 * and it is that raggedness, not the cone shape, that tells it apart from a
 * generic evergreen.
 */
function buildWhitePine(
  random: () => number,
  geometries: TreeGeometries,
  materials: TreeMaterials,
): Group {
  const tree = new Group()
  tree.name = 'Eastern white pine'
  const height = 5.6

  const trunk = new Mesh(geometries.trunkStraight, materials.barkPine)
  trunk.scale.set(0.13, height * 0.98, 0.13)
  trunk.position.y = height * 0.49
  tree.add(trunk)

  const TIERS = 7
  const lowest = height * 0.34
  const span = height * 0.62
  for (let tier = 0; tier < TIERS; tier++) {
    const t = tier / (TIERS - 1)
    const radius = (1.26 - t * 0.98) * (0.84 + random() * 0.32)
    const bough = new Mesh(
      geometries.bough,
      tier % 2 === 0 ? materials.pineNeedle : materials.pineNeedleLit,
    )
    // Shallow cones, not deep ones: a tier has to read as a plate of needles
    // seen edge-on from the play camera, which sits barely a metre off grass.
    bough.scale.set(radius, radius * 0.46, radius)
    bough.position.set(
      (random() - 0.5) * radius * 0.26,
      lowest + t * span,
      (random() - 0.5) * radius * 0.26,
    )
    bough.rotation.y = random() * TWO_PI
    bough.rotation.x = (random() - 0.5) * 0.12
    bough.rotation.z = (random() - 0.5) * 0.12
    tree.add(bough)
  }

  for (let sprig = 0; sprig < 3; sprig++) {
    const t = 0.3 + random() * 0.52
    const angle = random() * TWO_PI
    const reach = (1.16 - t * 0.86) * (0.92 + random() * 0.48)
    addOrientedCone(
      tree,
      geometries.sprig,
      materials.pineNeedle,
      Math.cos(angle) * reach * 0.28,
      lowest + t * span,
      Math.sin(angle) * reach * 0.28,
      Math.cos(angle),
      0.24,
      Math.sin(angle),
      reach * 0.2,
      reach * 0.78,
    )
  }

  const leader = new Mesh(geometries.sprig, materials.pineNeedleLit)
  leader.scale.set(0.21, 0.64, 0.21)
  leader.position.y = height * 0.96
  leader.rotation.z = 0.05
  tree.add(leader)

  return tree
}

/**
 * Eastern hemlock — dark, dense, and conical, with the leader nodding over at
 * the top. That nod is the field mark: it is how you know a hemlock from a
 * spruce at fifty metres, so it survives here even though almost nothing else
 * of the tree's detail does.
 */
function buildHemlock(
  random: () => number,
  geometries: TreeGeometries,
  materials: TreeMaterials,
): Group {
  const tree = new Group()
  tree.name = 'Eastern hemlock'
  const height = 4.4

  const trunk = new Mesh(geometries.trunkTapered, materials.barkDark)
  trunk.scale.set(0.11, height * 0.9, 0.11)
  trunk.position.y = height * 0.45
  tree.add(trunk)

  const LAYERS = 6
  const lowest = height * 0.18
  const span = height * 0.66
  for (let layer = 0; layer < LAYERS; layer++) {
    const t = layer / (LAYERS - 1)
    const radius = (1.22 - t * 0.92) * (0.94 + random() * 0.14)
    const skirt = new Mesh(
      geometries.bough,
      layer % 2 === 0 ? materials.hemlockDark : materials.hemlockLit,
    )
    // Deep, heavily overlapping cones — a hemlock is a solid dark mass, the
    // exact opposite of the white pine's open, daylit tiers standing beside it.
    skirt.scale.set(radius, radius * 0.95, radius)
    skirt.position.y = lowest + t * span
    skirt.rotation.y = random() * TWO_PI
    tree.add(skirt)
  }

  for (let droop = 0; droop < 4; droop++) {
    const t = 0.22 + droop * 0.2 + random() * 0.09
    const angle = random() * TWO_PI
    const reach = (1.22 - t * 0.92) * 0.55
    addOrientedCone(
      tree,
      geometries.sprig,
      materials.hemlockLit,
      Math.cos(angle) * reach,
      lowest + t * span + 0.1,
      Math.sin(angle) * reach,
      Math.cos(angle) * 0.72,
      -0.6,
      Math.sin(angle) * 0.72,
      0.13,
      0.6,
    )
  }

  addOrientedCone(
    tree,
    geometries.sprig,
    materials.hemlockDark,
    0,
    lowest + span * 0.98,
    0,
    0.44,
    0.9,
    0.14,
    0.14,
    0.86,
  )

  return tree
}

/**
 * Flowering dogwood — a small understory tree whose whole character is flat
 * horizontal shelves of foliage with daylight stacked between them, carrying
 * masses of white bracts on top. Nothing about it is vertical, which is why it
 * works as the accent between the two conifer shapes.
 */
function buildDogwood(
  random: () => number,
  geometries: TreeGeometries,
  materials: TreeMaterials,
): Group {
  const tree = new Group()
  tree.name = 'Flowering dogwood'
  const trunkHeight = 1.55

  const trunk = new Mesh(geometries.trunkTapered, materials.barkGrey)
  trunk.scale.set(0.085, trunkHeight, 0.085)
  trunk.position.y = trunkHeight * 0.5
  // Understory trees lean toward whatever light reaches them.
  trunk.rotation.z = 0.07
  tree.add(trunk)

  const addShelf = (
    centreX: number,
    centreY: number,
    centreZ: number,
    radius: number,
    blooms: number,
  ): void => {
    const shelf = new Mesh(geometries.bough, materials.dogwoodLeaf)
    const halfHeight = radius * 0.17
    shelf.scale.set(radius, halfHeight * 2, radius)
    shelf.position.set(centreX, centreY, centreZ)
    shelf.rotation.y = random() * TWO_PI
    tree.add(shelf)

    for (let bloom = 0; bloom < blooms; bloom++) {
      const angle = random() * TWO_PI
      const ring = radius * (0.14 + random() * 0.72)
      const blossom = new Mesh(geometries.blossom, materials.dogwoodBlossom)
      blossom.scale.setScalar(0.15 + random() * 0.045)
      // Ride the cone's own slope so no bract floats above or sinks into the
      // shelf it belongs to.
      blossom.position.set(
        centreX + Math.cos(angle) * ring,
        centreY + halfHeight - (ring / radius) * halfHeight * 2 + 0.02,
        centreZ + Math.sin(angle) * ring,
      )
      blossom.rotation.y = random() * TWO_PI
      tree.add(blossom)
    }
  }

  const SHELVES = 4
  for (let shelf = 0; shelf < SHELVES; shelf++) {
    const angle = shelf * (TWO_PI / SHELVES) + random() * 0.55
    const baseY = 1.02 + shelf * 0.46
    const reach = 1.18 - shelf * 0.16
    const tipX = Math.cos(angle) * reach
    const tipZ = Math.sin(angle) * reach
    const tipY = baseY + 0.16 + random() * 0.12
    addLimb(tree, geometries.limb, materials.barkGrey, 0, baseY, 0, tipX, tipY, tipZ, 0.042)
    addShelf(tipX * 0.86, tipY + 0.06, tipZ * 0.86, 0.62 - shelf * 0.055, 2)
  }

  addLimb(tree, geometries.limb, materials.barkGrey, 0, trunkHeight * 0.85, 0, 0.09, 3.16, 0.05, 0.05)
  addShelf(0.09, 3.22, 0.05, 0.55, 3)

  return tree
}

/**
 * Red maple — one broad warm-toned hardwood, so the treeline is not entirely
 * conifer. Its crown mixes red and olive blobs because a WNC red maple is
 * genuinely two-toned at this time of day, and the warm patches are what pull
 * the eye across to the far side of the frame.
 */
function buildRedMaple(
  random: () => number,
  geometries: TreeGeometries,
  materials: TreeMaterials,
): Group {
  const tree = new Group()
  tree.name = 'Red maple'
  const trunkHeight = 2.1

  const trunk = new Mesh(geometries.trunkTapered, materials.barkDark)
  trunk.scale.set(0.16, trunkHeight, 0.16)
  trunk.position.y = trunkHeight * 0.5
  tree.add(trunk)

  const LIMBS = 4
  for (let limb = 0; limb < LIMBS; limb++) {
    const angle = limb * (TWO_PI / LIMBS) + random() * 0.6
    const reach = 0.62 + random() * 0.28
    addLimb(
      tree,
      geometries.limb,
      materials.barkDark,
      0,
      trunkHeight * 0.72,
      0,
      Math.cos(angle) * reach,
      trunkHeight + 0.62 + random() * 0.3,
      Math.sin(angle) * reach,
      0.075,
    )
  }

  const CROWN = 7
  const crownBase = 2.45
  const crownSpan = 1.95
  for (let blob = 0; blob < CROWN; blob++) {
    const t = blob / (CROWN - 1)
    // Golden-angle spacing stops the blobs clumping on one side without
    // needing a rejection loop, and keeps the crown identical every load.
    const angle = blob * 2.3999 + random() * 0.5
    // Widest a little below half height: a mature maple is a broad egg, not a
    // ball balanced on a stick.
    const profile = Math.sin(Math.PI * (0.2 + t * 0.72))
    const ring = profile * 0.74 * (0.5 + random() * 0.66)
    const radius = 0.44 + profile * 0.44
    const clump = new Mesh(geometries.blob, blob % 3 === 0 ? materials.mapleRed : materials.mapleGreen)
    clump.position.set(Math.cos(angle) * ring, crownBase + t * crownSpan, Math.sin(angle) * ring)
    clump.scale.set(radius, radius * 0.84, radius)
    clump.rotation.set(random() * TWO_PI, random() * TWO_PI, random() * TWO_PI)
    tree.add(clump)
  }

  return tree
}

const BUILDERS: Readonly<Record<WncTreeSpecies, TreeBuilder>> = {
  'white-pine': buildWhitePine,
  hemlock: buildHemlock,
  dogwood: buildDogwood,
  'red-maple': buildRedMaple,
}

/** Nominal unscaled height, used only to tune how much each tree may sway. */
const BASE_HEIGHTS: Readonly<Record<WncTreeSpecies, number>> = {
  'white-pine': 5.7,
  hemlock: 4.5,
  dogwood: 3.4,
  'red-maple': 5.1,
}

function resolveSpecies(name: string): WncTreeSpecies {
  const key = name.toLowerCase().replace(/[\s_-]/g, '')
  if (key.includes('hemlock')) return 'hemlock'
  if (key.includes('dogwood')) return 'dogwood'
  if (key.includes('maple')) return 'red-maple'
  return 'white-pine'
}

/**
 * The authored framing set, written in what the CHILD sees rather than in raw
 * world coordinates: `screenLeft` is metres left of the play camera's view axis
 * and `depth` is metres along it. Authoring by world x/z repeatedly produced
 * "edge" trees that turned out to sit dead centre behind the cougar.
 */
const ARRANGEMENT: ReadonlyArray<readonly [number, number, WncTreeSpecies, number]> = [
  // Everything is pushed well back. An earlier arrangement put the nearest
  // trunks 6-9 metres out, which at this focal length filled the frame with
  // crowns and walled off the ridgeline the trees are supposed to frame.
  // Trees only earn their place here by leaving the middle of the shot empty.
  [11.5, 17.0, 'white-pine', 1.15],
  [-11.8, 18.5, 'white-pine', 1.05],
  [9.6, 20.0, 'hemlock', 0.95],
  [-9.4, 21.0, 'hemlock', 0.9],
  [13.2, 22.0, 'dogwood', 0.95],
  [-13.0, 20.0, 'dogwood', 0.95],
  // Far treeline hugging the base of the ridges, reading as forest rather than
  // as individual trees.
  [4.6, 27.0, 'white-pine', 0.9],
  [-5.2, 28.0, 'hemlock', 0.85],
  [-16.0, 24.0, 'red-maple', 1.0],
  [17.5, 26.0, 'white-pine', 0.85],
  [-19.0, 26.5, 'white-pine', 0.9],
  [-2.0, 30.0, 'hemlock', 0.8],
  [11.0, 30.0, 'dogwood', 0.9],
]

/**
 * Builds the framing treeline. It never adds itself to a scene, so the caller
 * keeps scene ownership and lifecycle explicit.
 */
export function createWncTrees(options: WncTreesOptions = {}): WncTrees {
  const root = new Group()
  root.name = 'Western North Carolina treeline'
  root.userData.kind = 'wnc-trees'

  const random = makeRng(options.seed ?? DEFAULT_SEED)
  const geometries = makeGeometries()
  const materials = makeMaterials()
  const swaying: TreeSway[] = []
  let disposed = false

  function plant(species: WncTreeSpecies, x: number, z: number, scale: number): void {
    const tree = BUILDERS[species](random, geometries, materials)
    // Sunk a few centimetres: the sway pivots at the group origin, and a trunk
    // resting exactly on the grass would peel a sliver of daylight open at its
    // heel on every gust.
    tree.position.set(x, -0.05, z)
    tree.rotation.y = random() * TWO_PI
    tree.scale.setScalar(scale)
    root.add(tree)

    const height = BASE_HEIGHTS[species] * scale
    swaying.push({
      node: tree,
      phase: random() * TWO_PI,
      // Big trees move less, and they move slower — mass resists the same gust
      // a dogwood gives in to. Both curves key off real height so a tree the
      // caller adds later is tuned the same way as an authored one.
      amount: clamp(0.085 / height, 0.007, 0.03),
      speed: clamp(1.9 / Math.sqrt(height), 0.5, 1.4),
    })
  }

  const bearingSin = Math.sin(CAMERA_BEARING)
  const bearingCos = Math.cos(CAMERA_BEARING)
  for (const [screenLeft, depth, species, scale] of ARRANGEMENT) {
    plant(
      species,
      CAMERA_FLAT_X - depth * bearingSin - screenLeft * bearingCos,
      CAMERA_FLAT_Z - depth * bearingCos + screenLeft * bearingSin,
      scale,
    )
  }

  let animationTime = 0
  let lastElapsed = 0

  function add(x: number, z: number, species: string, scale = 1): void {
    if (disposed) return
    plant(
      resolveSpecies(species),
      finite(x),
      finite(z),
      clamp(finite(scale, 1), 0.35, 2.2),
    )
  }

  function update(elapsedSeconds: number, deltaSeconds: number): void {
    if (disposed) return
    // Nothing in this module moves except the wind, so reduced motion is a
    // plain early return: the trees were built upright and simply stay so.
    if (options.reducedMotion) return

    const elapsed = finite(elapsedSeconds)
    const delta = clamp(finite(deltaSeconds), 0, 0.08)
    // Integrating a clamped delta means returning from a suspended tab resumes
    // the breeze instead of snapping every crown to a new angle.
    if (elapsed < lastElapsed) animationTime = 0
    lastElapsed = elapsed
    animationTime += delta

    for (const sway of swaying) {
      sway.node.rotation.z = Math.sin(animationTime * sway.speed + sway.phase) * sway.amount
      // A second, slower axis at an unrelated frequency: one sine alone reads
      // as a metronome, two make it read as air.
      sway.node.rotation.x =
        Math.cos(animationTime * sway.speed * 0.71 + sway.phase * 1.3) * sway.amount * 0.42
    }
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
    // The shared caches are disposed explicitly too, so a caller that disposes
    // before any tree is planted still releases everything.
    for (const geometry of Object.values(geometries)) ownedGeometries.add(geometry)
    for (const material of Object.values(materials)) ownedMaterials.add(material)
    for (const geometry of ownedGeometries) geometry.dispose()
    for (const material of ownedMaterials) material.dispose()
  }

  return { root, add, update, dispose }
}
