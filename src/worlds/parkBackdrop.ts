/**
 * Scenic depth for the first Meadow view.
 *
 * This is intentionally a render-only module: it owns no physics, input, or
 * story state. The composition is aligned to the default three-quarter camera
 * so the central horizon survives both a 4:3 iPad and portrait framing.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from 'three'
import { BufferGeometry } from 'three'
import type { Material } from 'three'
import { makeRng } from './world'

const DEFAULT_SEED = 0x5041524b
const DEFAULT_CAMERA_BEARING = Math.atan2(2.35, 3.23)
/** The play camera's ground position (scene.ts camera.position x/z). */
const CAMERA_FLAT_X = 2.35
const CAMERA_FLAT_Z = 3.05
const TWO_PI = Math.PI * 2

export interface ParkBackdropOptions {
  /** Stable decorative variation; omit for the authored Meadow composition. */
  readonly seed?: number
  /** Leaves the landmark visible while freezing ambient motion. */
  readonly reducedMotion?: boolean
}

export interface ParkBackdrop {
  /** Add this fully positioned group to the stage scene. */
  readonly root: Group
  /** Advance only visual motion. Both inputs are seconds. */
  update(elapsedSeconds: number, deltaSeconds: number): void
  /** Release every geometry and material created by this factory. */
  dispose(): void
}

interface BackdropMaterials {
  readonly farHill: MeshStandardMaterial
  readonly middleHill: MeshStandardMaterial
  readonly nearHill: MeshStandardMaterial
  readonly lake: MeshStandardMaterial
  readonly cloud: MeshBasicMaterial
  readonly cloudShade: MeshBasicMaterial
  /** Distinct cumulus silhouettes. Empty only where there is no DOM to paint on. */
  readonly cloudSoft: ReadonlyArray<MeshBasicMaterial>
  readonly windmillTower: MeshStandardMaterial
  readonly windmillTrim: MeshStandardMaterial
  readonly windmillRoof: MeshStandardMaterial
  readonly windmillBlade: MeshStandardMaterial
  readonly butterflyBody: MeshStandardMaterial
  readonly butterflyWingA: MeshStandardMaterial
  readonly butterflyWingB: MeshStandardMaterial
  readonly treeTrunk: MeshStandardMaterial
  readonly treeCrown: MeshStandardMaterial
  readonly treeCrownLight: MeshStandardMaterial
}

interface CloudMotion {
  readonly node: Group
  readonly baseX: number
  readonly baseY: number
  readonly phase: number
  readonly amplitude: number
}

interface ButterflyMotion {
  readonly node: Group
  readonly leftWing: Mesh
  readonly rightWing: Mesh
  readonly baseX: number
  readonly baseY: number
  readonly baseZ: number
  readonly phase: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function makeMaterials(): BackdropMaterials {
  const standard = (color: number, roughness = 0.9) =>
    new MeshStandardMaterial({ color, roughness, flatShading: true })

  return {
    farHill: standard(0x91bc7a),
    middleHill: standard(0x6f9e5f),
    nearHill: standard(0x568a56),
    lake: new MeshStandardMaterial({
      color: 0x86b6cf,
      roughness: 0.18,
      metalness: 0.15,
      flatShading: false,
    }),
    cloud: new MeshBasicMaterial({ color: 0xf5fbf5 }),
    cloudShade: new MeshBasicMaterial({ color: 0xcfe6e8 }),
    cloudSoft: [0, 1, 2]
      .map((variant) => makeCloudTexture(variant))
      .filter((map): map is CanvasTexture => map !== null)
      // depthWrite off so overlapping clouds blend instead of cutting each
      // other's soft edges into visible rectangles.
      .map((map) => new MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        fog: false,
      })),
    // Purple, to match the cougar's world — but deliberately a LIGHTER, less
    // saturated lavender than her coat. Pitching the tower at her own purple
    // would have the landmark competing with the character for the eye.
    windmillTower: standard(0x9d80c8),
    windmillTrim: standard(0xd9c2f2),
    windmillRoof: standard(0x5c3b7d),
    windmillBlade: standard(0xe8dbf7),
    butterflyBody: standard(0x4b5664),
    // Flat single-sided plates vanish every time a wing swings past edge-on.
    butterflyWingA: new MeshStandardMaterial({
      color: 0xf29ab0,
      roughness: 0.9,
      flatShading: true,
      side: DoubleSide,
    }),
    butterflyWingB: new MeshStandardMaterial({
      color: 0xf4c85f,
      roughness: 0.9,
      flatShading: true,
      side: DoubleSide,
    }),
    treeTrunk: standard(0x7a4a2e),
    treeCrown: standard(0x3e8b4d),
    treeCrownLight: standard(0x54a458),
  }
}

/** A tiny lollipop tree for the hillsides — trunk, crown, one light tuft. */
function addHillTree(
  parent: Group,
  x: number,
  z: number,
  scale: number,
  materials: BackdropMaterials,
): void {
  const tree = new Group()
  tree.name = 'Hillside tree'
  tree.position.set(x, 0, z)
  tree.scale.setScalar(scale)

  const trunk = new Mesh(new CylinderGeometry(0.05, 0.075, 0.42, 5), materials.treeTrunk)
  trunk.position.y = 0.21
  tree.add(trunk)

  const crown = new Mesh(new DodecahedronGeometry(0.34, 0), materials.treeCrown)
  crown.position.y = 0.62
  crown.scale.set(1, 1.18, 0.92)
  tree.add(crown)

  const tuft = new Mesh(new DodecahedronGeometry(0.17, 0), materials.treeCrownLight)
  tuft.position.set(0.14, 0.82, 0.1)
  tree.add(tuft)

  parent.add(tree)
}

function addHill(
  parent: Group,
  geometry: SphereGeometry,
  material: MeshStandardMaterial,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): void {
  const hill = new Mesh(geometry, material)
  hill.name = 'Rolling meadow hill'
  hill.position.set(x, 0.005, z)
  hill.scale.set(width, height, depth)
  parent.add(hill)
}

/**
 * One Blue Ridge ridgeline: a standing silhouette whose top edge follows a
 * fractal skyline, filled down to the ground.
 *
 * Layered ridges fading into haze are THE signature of the Southern
 * Appalachians — the mountains read as blue precisely because each further
 * ridge is scattered toward the sky colour. Flat billboards are right here:
 * these sit far past anything the child can reach, so real relief would cost
 * geometry nobody can ever see around.
 */
function makeRidgeGeometry(
  width: number,
  baseHeight: number,
  roughness: number,
  segments: number,
  random: () => number,
  summits: number,
  floor: number,
): BufferGeometry {
  const points = segments + 1
  const heights = new Float32Array(points)

  // Sum octaves of smooth random noise. The lowest octave must fit SEVERAL
  // summits across the range — an earlier version gave it a single period, so
  // it produced one slow ramp across the whole width and every ridge came out
  // as a flat slab with a slight tilt.
  for (let octave = 0; octave < 5; octave++) {
    const period = Math.max(2, Math.round(segments / (summits * Math.pow(2, octave))))
    const amplitude = Math.pow(roughness, octave)
    const knots: number[] = []
    for (let knot = 0; knot <= Math.ceil(segments / period) + 1; knot++) {
      knots.push(random())
    }
    for (let index = 0; index < points; index++) {
      const t = index / period
      const knotIndex = Math.floor(t)
      const frac = t - knotIndex
      const a = knots[knotIndex] ?? 0.5
      const b = knots[knotIndex + 1] ?? 0.5
      // Smoothstep between knots keeps peaks rounded like weathered
      // Appalachian summits rather than sharp alpine spikes.
      const eased = frac * frac * (3 - 2 * frac)
      heights[index]! += (a + (b - a) * eased) * amplitude
    }
  }

  let peak = 0
  let trough = Number.POSITIVE_INFINITY
  for (const height of heights) {
    peak = Math.max(peak, height)
    trough = Math.min(trough, height)
  }
  // Remap so summits reach baseHeight and saddles bottom out at `floor` of it.
  // The floor is the layering dial: near ridges get deep saddles so the paler
  // ranges behind show through the gaps, while far ridges get a high floor
  // because distance compresses real relief into a thin band.
  const span = Math.max(1e-6, peak - trough)
  for (let index = 0; index < points; index++) {
    heights[index] = (floor + (1 - floor) * ((heights[index]! - trough) / span)) * baseHeight
  }
  const scale = 1

  const positions = new Float32Array(points * 2 * 3)
  for (let index = 0; index < points; index++) {
    const x = (index / segments - 0.5) * width
    const top = heights[index]! * scale
    positions[index * 6] = x
    positions[index * 6 + 1] = top
    positions[index * 6 + 2] = 0
    positions[index * 6 + 3] = x
    positions[index * 6 + 4] = -0.2
    positions[index * 6 + 5] = 0
  }

  const indices: number[] = []
  for (let index = 0; index < segments; index++) {
    const topLeft = index * 2
    const bottomLeft = topLeft + 1
    const topRight = topLeft + 2
    const bottomRight = topLeft + 3
    indices.push(topLeft, bottomLeft, topRight, bottomLeft, bottomRight, topRight)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Deterministic lattice hash, so every load paints the same sky. */
function cloudHash(ix: number, iy: number, seed: number): number {
  const h = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453
  return h - Math.floor(h)
}

function cloudNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = cloudHash(ix, iy, seed)
  const b = cloudHash(ix + 1, iy, seed)
  const c = cloudHash(ix, iy + 1, seed)
  const d = cloudHash(ix + 1, iy + 1, seed)
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy
}

/** Five octaves — the high ones are what give a cumulus its cauliflower rim. */
function cloudFbm(x: number, y: number, seed: number): number {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  for (let octave = 0; octave < 5; octave++) {
    sum += cloudNoise(x * frequency, y * frequency, seed + octave * 13) * amplitude
    frequency *= 2.07
    amplitude *= 0.5
  }
  return sum
}

/**
 * A cumulus cloud, built as a fractal density field rather than as a handful of
 * smooth blobs.
 *
 * Two earlier passes failed here for opposite reasons: hard dodecahedron puffs
 * read as childish stickers, and overlapping radial gradients read as
 * featureless smudges. Neither had the thing that actually makes a cloud look
 * like a cloud — billowing self-similar structure at several scales. So the
 * silhouette comes from thresholding fbm noise against a cumulus profile
 * (billowing dome, flat base), which gives a cauliflower rim for free, and the
 * shading runs bright warm on top to cool and dark underneath.
 *
 * `variant` reseeds the field so no two clouds in the sky share a silhouette.
 * Returns null when there is no DOM (headless build/test).
 */
function makeCloudTexture(variant: number): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const width = 256
  const height = 128
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const seed = 1 + variant * 7.13
  const image = ctx.createImageData(width, height)
  // Golden hour: sunlit crowns take warm light, the flat base goes cool and
  // markedly darker. That top-to-bottom swing is most of what reads as volume.
  const lit = [255, 251, 243] as const
  const shadowed = [176, 174, 198] as const

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const u = px / width
      const v = py / height

      // Cumulus profile: an ellipse squashed wide, with its base cut flat.
      const dx = (u - 0.5) / 0.46
      const dy = (v - 0.66) / 0.56
      const dome = 1 - Math.sqrt(dx * dx + dy * dy)
      // Anything below the base line falls away fast, which is what gives a
      // cumulus its distinctive flat bottom instead of a round balloon.
      const baseCut = v > 0.74 ? (v - 0.74) / 0.16 : 0

      const detail = cloudFbm(u * 5.5, v * 5.5, seed)
      const density = dome * 0.72 + detail * 0.62 - baseCut * 0.9

      // Soft but narrow threshold: wide enough not to alias, tight enough that
      // the fractal edge survives as structure rather than dissolving to haze.
      const alpha = Math.max(0, Math.min(1, (density - 0.34) / 0.15))

      // Lit from above: higher in the cloud and denser both read brighter.
      const shade = Math.max(0, Math.min(1, v * 1.15 - detail * 0.5 + baseCut * 0.35))
      const offset = (py * width + px) * 4
      for (let c = 0; c < 3; c++) {
        image.data[offset + c] = Math.round(lit[c]! + (shadowed[c]! - lit[c]!) * shade)
      }
      image.data[offset + 3] = Math.round(alpha * 255)
    }
  }
  ctx.putImageData(image, 0, 0)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * One butterfly wing, hinged at the body and lying in the X-Y plane so the
 * existing rotation about Y still swings it like a hinge.
 *
 * A flattened dodecahedron was standing in for this, and at the size these
 * needed to be to read as creatures at all it landed as an opaque pink or
 * yellow lump floating in the mid-ground. A wing needs a wing's outline: a
 * swept forewing tip and a smaller hindwing lobe below it.
 */
function makeButterflyWingGeometry(): BufferGeometry {
  // Fractions of the wing span, measured out from the hinge at x = 0.
  const outline = new Float32Array([
    0, -0.15, 0,
    0, 0.18, 0,
    0.95, 0.5, 0,
    1.0, 0.02, 0,
    0.5, -0.45, 0,
  ])
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(outline, 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4])
  geometry.computeVertexNormals()
  return geometry
}

function addCloud(
  parent: Group,
  geometry: DodecahedronGeometry,
  planeGeometry: PlaneGeometry | null,
  materials: BackdropMaterials,
  x: number,
  y: number,
  z: number,
  scale: number,
  phase: number,
  variant: number,
): CloudMotion {
  const cloud = new Group()
  cloud.name = 'Large low-poly cloud'
  cloud.position.set(x, y, z)

  const softMaterial = materials.cloudSoft[variant % Math.max(1, materials.cloudSoft.length)]
  if (planeGeometry && softMaterial) {
    const billboard = new Mesh(planeGeometry, softMaterial)
    // The painted tile carries its own soft margin, so it is drawn wider than
    // the puff cluster it replaces to land at the same apparent size.
    billboard.scale.set(2.6, 1.3, 1)
    cloud.add(billboard)
  } else {
    const puffs: ReadonlyArray<readonly [number, number, number, boolean]> = [
      [-0.62, -0.02, 0.78, true],
      [-0.22, 0.16, 1.02, false],
      [0.28, 0.18, 0.94, false],
      [0.69, 0.02, 0.66, true],
    ]
    for (const [offsetX, offsetY, puffScale, shaded] of puffs) {
      const puff = new Mesh(geometry, shaded ? materials.cloudShade : materials.cloud)
      puff.position.set(offsetX, offsetY, 0)
      puff.scale.set(puffScale * 0.92, puffScale * 0.54, puffScale * 0.48)
      cloud.add(puff)
    }
  }

  cloud.scale.setScalar(scale)
  parent.add(cloud)
  return {
    node: cloud,
    baseX: x,
    baseY: y,
    phase,
    amplitude: 0.06 + scale * 0.055,
  }
}

function addWindmill(
  parent: Group,
  materials: BackdropMaterials,
  x: number,
  z: number,
): Group {
  const windmill = new Group()
  windmill.name = 'Friendly distant windmill'
  windmill.position.set(x, 0.01, z)
  windmill.scale.setScalar(1.55)

  const tower = new Mesh(
    new CylinderGeometry(0.19, 0.39, 1.32, 6),
    materials.windmillTower,
  )
  tower.position.y = 0.66
  windmill.add(tower)

  const roof = new Mesh(new ConeGeometry(0.37, 0.42, 6), materials.windmillRoof)
  roof.position.y = 1.53
  roof.rotation.y = Math.PI / 6
  windmill.add(roof)

  const axle = new Mesh(new BoxGeometry(0.18, 0.14, 0.16), materials.windmillTrim)
  axle.position.set(0, 1.34, 0.22)
  windmill.add(axle)

  const rotor = new Group()
  rotor.name = 'Windmill sails'
  rotor.position.set(0, 1.34, 0.32)
  const bladeGeometry = new CylinderGeometry(0.15, 0.065, 0.64, 4)
  for (let blade = 0; blade < 4; blade++) {
    const pivot = new Group()
    pivot.rotation.z = blade * (TWO_PI / 4) + Math.PI / 4
    const sail = new Mesh(bladeGeometry, materials.windmillBlade)
    sail.position.set(0.025, 0.34, 0)
    pivot.add(sail)
    rotor.add(pivot)
  }
  const hub = new Mesh(new DodecahedronGeometry(0.14, 0), materials.windmillTrim)
  hub.scale.z = 0.55
  rotor.add(hub)
  windmill.add(rotor)
  parent.add(windmill)
  return rotor
}

function addButterfly(
  parent: Group,
  wingGeometry: BufferGeometry,
  materials: BackdropMaterials,
  x: number,
  y: number,
  z: number,
  phase: number,
  alternate: boolean,
): ButterflyMotion {
  const butterfly = new Group()
  butterfly.name = 'Meadow butterfly'
  butterfly.position.set(x, y, z)

  const body = new Mesh(new CylinderGeometry(0.014, 0.02, 0.11, 4), materials.butterflyBody)
  body.rotation.x = Math.PI / 2
  butterfly.add(body)

  // Each wing pivots at the body, not around its own centre, so the flap reads
  // as a hinge rather than as a blob spinning in place.
  const leftWing = new Mesh(wingGeometry, alternate ? materials.butterflyWingB : materials.butterflyWingA)
  leftWing.position.set(-0.012, 0.014, 0)
  leftWing.scale.set(-0.15, 0.15, 0.15)
  butterfly.add(leftWing)

  const rightWing = new Mesh(wingGeometry, alternate ? materials.butterflyWingA : materials.butterflyWingB)
  rightWing.position.set(0.012, 0.014, 0)
  rightWing.scale.set(0.15, 0.15, 0.15)
  butterfly.add(rightWing)

  parent.add(butterfly)
  return { node: butterfly, leftWing, rightWing, baseX: x, baseY: y, baseZ: z, phase }
}

/**
 * Creates the distant park layers for the Meadow. It never adds itself to a
 * scene, so the caller can keep scene ownership and lifecycle explicit.
 */
export function createParkBackdrop(options: ParkBackdropOptions = {}): ParkBackdrop {
  const root = new Group()
  root.name = 'Sunny Meadow Park Backdrop'
  root.userData.kind = 'park-backdrop'

  // The default follow camera is offset to camera-right. Positioning the root
  // along its actual horizon ray keeps the hill valley centered instead of
  // piling every distant object into one side of a portrait viewport.
  const horizonDistance = 9.8
  root.position.set(
    -Math.sin(DEFAULT_CAMERA_BEARING) * horizonDistance,
    0,
    -0.18 - Math.cos(DEFAULT_CAMERA_BEARING) * horizonDistance,
  )
  root.rotation.y = DEFAULT_CAMERA_BEARING

  const random = makeRng(options.seed ?? DEFAULT_SEED)

  // Landmarks are authored in what the CHILD sees, not in raw root
  // coordinates. `screenLeft` is metres to the left of the play camera's own
  // view axis and `depth` is metres in front of it, so a landmark asked for at
  // screen-left genuinely lands beside the cougar instead of behind her.
  // Placing by raw world coordinates repeatedly produced landmarks only ~20%
  // off-centre, which the cougar's silhouette then covered completely.
  const bearingCos = Math.cos(DEFAULT_CAMERA_BEARING)
  const bearingSin = Math.sin(DEFAULT_CAMERA_BEARING)
  const toLocal = (worldX: number, worldZ: number): readonly [number, number] => {
    const dx = worldX - root.position.x
    const dz = worldZ - root.position.z
    return [dx * bearingCos - dz * bearingSin, dx * bearingSin + dz * bearingCos]
  }
  const placeInView = (screenLeft: number, depth: number): readonly [number, number] =>
    toLocal(
      CAMERA_FLAT_X - depth * bearingSin - screenLeft * bearingCos,
      CAMERA_FLAT_Z - depth * bearingCos + screenLeft * bearingSin,
    )
  const materials = makeMaterials()
  const hillGeometry = new SphereGeometry(1, 10, 5, 0, TWO_PI, 0, Math.PI / 2)
  const cloudGeometry = new DodecahedronGeometry(1, 0)
  const cloudPlaneGeometry = materials.cloudSoft.length > 0 ? new PlaneGeometry(1, 1) : null
  // Large enough to actually read as living creatures from the play camera —
  // at the previous size they disappeared into single pixels.
  const butterflyGeometry = makeButterflyWingGeometry()

  // --- The Blue Ridge, straight off the reference photo: six ridgelines
  // stacked back to front. The nearest is nearly a dark teal silhouette and
  // each one behind it is paler, bluer, and more washed toward lavender as
  // more air stacks up in front of it. That haze ramp IS the effect — it does
  // more for depth than any amount of geometry closer to the camera, and it is
  // why the Southern Appalachians read blue at all.
  //
  // Unlit basic materials on purpose: a distant ridge's colour comes from the
  // atmosphere between it and the eye, not from sun striking its trees, so
  // shading them would fight the very gradient the illusion depends on.
  const ridgeGeometries: BufferGeometry[] = []
  // Heights measured against the live camera (window.__pc.project): the ground
  // horizon sits at screen y 0.442, and these put every summit in a tight band
  // just above it, the nearest ridge highest. Sizing them "realistically" for
  // their distance made them speed bumps; sizing them by eye made them flat
  // slabs that swallowed the whole sky.
  for (const [distance, width, height, roughness, color, summits, floor] of [
    [-34, 108, 3.5, 0.5, 0xc6ccdf, 4, 0.74],
    [-29, 92, 3.2, 0.52, 0xb0b9d2, 4, 0.66],
    [-24, 78, 2.95, 0.55, 0x94a1c0, 5, 0.56],
    [-19, 64, 2.7, 0.58, 0x74879f, 5, 0.44],
    [-14.5, 52, 2.45, 0.6, 0x56707a, 6, 0.32],
    [-11, 44, 2.2, 0.62, 0x3c5c5c, 6, 0.2],
  ] as const) {
    const geometry = makeRidgeGeometry(width, height, roughness, 110, random, summits, floor)
    ridgeGeometries.push(geometry)
    const ridge = new Mesh(
      geometry,
      new MeshBasicMaterial({ color, side: DoubleSide, fog: false }),
    )
    ridge.name = 'Blue Ridge ridgeline'
    ridge.position.set(0, 0, distance)
    ridge.frustumCulled = false
    root.add(ridge)
  }

  // --- The sun itself, low over the ridgeline. In the reference photograph
  // this is the thing the eye goes to first: a small hot disc with a wide soft
  // bloom bleeding into the haze around it. The bloom is drawn additively so
  // it brightens the sky it sits on instead of stamping a grey plate over it.
  const glowCanvas = document.createElement('canvas')
  glowCanvas.width = 128
  glowCanvas.height = 128
  const glowContext = glowCanvas.getContext('2d')!
  const glowGradient = glowContext.createRadialGradient(64, 64, 2, 64, 64, 64)
  glowGradient.addColorStop(0, 'rgba(255, 244, 214, 0.95)')
  glowGradient.addColorStop(0.22, 'rgba(255, 214, 148, 0.55)')
  glowGradient.addColorStop(0.55, 'rgba(250, 176, 112, 0.2)')
  glowGradient.addColorStop(1, 'rgba(250, 160, 100, 0)')
  glowContext.fillStyle = glowGradient
  glowContext.fillRect(0, 0, 128, 128)
  const glowTexture = new CanvasTexture(glowCanvas)
  glowTexture.colorSpace = SRGBColorSpace

  const sun = new Group()
  sun.name = 'Sunrise sun'
  const sunBloom = new Mesh(
    new PlaneGeometry(9.5, 9.5),
    new MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    }),
  )
  sun.add(sunBloom)
  const sunDisc = new Mesh(
    new CircleGeometry(0.62, 32),
    new MeshBasicMaterial({ color: 0xfff6dc, fog: false, depthWrite: false }),
  )
  sunDisc.position.z = 0.01
  sun.add(sunDisc)
  const [sunX, sunZ] = placeInView(-10.1, 30)
  sun.position.set(sunX, 3.6, sunZ)
  sun.renderOrder = -1
  root.add(sun)

  // --- A mountain lake resting in the valley below the ridges. It is wide,
  // calm, and set well back, so it reads as a real body of water the park
  // could one day walk down to rather than a puddle behind the meadow.
  // Pulled forward into the band between the garden crescent and the ridges.
  //
  // Measured, not guessed: at its old centre the water spanned ndc y 0.291 to
  // 0.349 — 23 pixels at 800px tall, which is the "sliver" the roadmap
  // diagnosed. A bigger plane cannot fix that; a horizontal surface 20 units
  // out seen from a 0.95m eye height subtends almost nothing. Distance is the
  // only lever, so the near shore now sits ~7 units from the origin instead of
  // ~13. That is still clear of the garden crescent, whose beds reach 5.5
  // (bedOuterRadius in wncGarden.ts) — putting water inside that footprint is
  // what made flowers render through the lake on the previous attempt.
  // No sand bar. A pale shore plane sitting a hair under the water read as a
  // dirty band cutting through the middle of the lake rather than as a beach,
  // and the water wants to be one uncomplicated sweep of blue. Grass meets
  // water directly at the near edge, which is what the reference lake does.
  // Narrowed from 44 and re-centred on the view axis so the water has visible
  // BANKS. At full width it spanned the frame across its whole depth band
  // (depth 10.9 to 23.9), which meant no tree could stand at a close enough
  // depth to be on screen without standing in open water — the treeline had to
  // be pushed past 24 and came back bleached by the fog, which starts at 18.
  // With banks, the framing trees sit on land in clear air and the lake still
  // fills the frame at its near edge, where it matters.
  const lakeGeometry = new PlaneGeometry(18, 13, 32, 18)
  const lake = new Mesh(lakeGeometry, materials.lake)
  lake.name = 'Mountain lake'
  lake.rotation.x = -Math.PI / 2
  lake.position.set(0, 0.03, -3.6)
  lake.receiveShadow = true
  root.add(lake)
  const lakePositions = lakeGeometry.getAttribute('position') as BufferAttribute
  const lakeRest = new Float32Array(lakePositions.array)

  // Near foothills in living green, where the blue haze has not taken over.
  // They are deliberately LOW and pushed to the sides: the previous tall domes
  // sat directly across the sightline and buried the ridges and the lake
  // entirely, which is the whole reason the view existed. Their job is to
  // close the left and right corners, not to own the horizon.
  // These now sit BEYOND the lake's far edge (local z -10.1) rather than at
  // z -0.6..-4.4, which after the water came forward left them standing in the
  // middle of it. Read as the far shore instead: a lake needs a treed bank
  // rising behind it to be a lake and not a blue stripe. They are scaled up to
  // keep closing the left and right corners from the greater distance.
  addHill(root, hillGeometry, materials.middleHill, -13.5, -17.5, 11.5, 1.02, 1.5)
  addHill(root, hillGeometry, materials.middleHill, 13.8, -17.8, 12, 1.1, 1.55)
  addHill(root, hillGeometry, materials.nearHill, -8.2, -12.4, 7.2, 0.72, 1.1)
  addHill(root, hillGeometry, materials.nearHill, 9.0, -12.6, 7.4, 0.76, 1.12)

  const clouds = [
    addCloud(root, cloudGeometry, cloudPlaneGeometry, materials, -3.95, 2.78, -1.7, 1.08, random() * TWO_PI, 0),
    addCloud(root, cloudGeometry, cloudPlaneGeometry, materials, 0.55, 3.58, -3.45, 0.74, random() * TWO_PI, 1),
    addCloud(root, cloudGeometry, cloudPlaneGeometry, materials, 3.55, 2.7, -1.25, 0.92, random() * TWO_PI, 2),
    // A fuller sky: smaller, higher fair-weather clouds layered between the
    // original three so the blue never reads as empty.
    addCloud(root, cloudGeometry, cloudPlaneGeometry, materials, -1.75, 3.25, -2.6, 0.6, random() * TWO_PI, 3),
    addCloud(root, cloudGeometry, cloudPlaneGeometry, materials, 2.1, 3.45, -3.1, 0.55, random() * TWO_PI, 4),
    addCloud(root, cloudGeometry, cloudPlaneGeometry, materials, -5.9, 3.3, -2.9, 0.82, random() * TWO_PI, 5),
    addCloud(root, cloudGeometry, cloudPlaneGeometry, materials, 5.6, 3.35, -2.7, 0.7, random() * TWO_PI, 6),
  ]

  // Measured against the live follow camera (window.__pc.project): this lands
  // the windmill across screen x -0.85..-0.61 with its sail tips at y 0.88,
  // so the whole of it clears both the frame edge and the top. It had to move
  // further out and back when the tower grew — at the old (5.6, 12) the larger
  // windmill ran off the left edge at -1.01 and its sails were cut off by the
  // top of the frame. The gap between her silhouette and the edge only fits
  // one landmark, so nothing else goes on the left.
  const [windmillX, windmillZ] = placeInView(6.2, 15)
  const rotor = addWindmill(root, materials, windmillX, windmillZ)

  // A few hillside trees break up the big flat green shapes and give the
  // horizon a sense of place. Kept sparse — landmarks, not a forest.
  for (const [screenLeft, depth, scale] of [
    [-4.5, 13, 0.95],
    [-7.4, 15, 1.1],
    [-6.0, 19, 0.9],
  ] as const) {
    const [treeX, treeZ] = placeInView(screenLeft, depth)
    addHillTree(root, treeX, treeZ, scale, materials)
  }
  const butterflies = [
    addButterfly(root, butterflyGeometry, materials, -2.3, 0.92, 1.26, random() * TWO_PI, false),
    addButterfly(root, butterflyGeometry, materials, 1.45, 1.08, 0.84, random() * TWO_PI, true),
  ]

  let animationTime = 0
  let lastElapsed = 0
  let disposed = false

  function update(elapsedSeconds: number, deltaSeconds: number): void {
    if (disposed) return
    const elapsed = finite(elapsedSeconds)
    const delta = clamp(finite(deltaSeconds), 0, 0.08)
    // Advance from a clamped delta so coming back from a suspended tab never
    // jumps a butterfly across the sky. An elapsed-clock reset starts a new,
    // equally calm visual loop.
    if (elapsed < lastElapsed) animationTime = 0
    lastElapsed = elapsed
    animationTime += delta
    const time = options.reducedMotion ? 0 : animationTime

    for (const cloud of clouds) {
      // Perceptibly adrift within a child's attention span, still far from
      // busy — a slow constant travel with a gentle vertical breathe.
      cloud.node.position.x =
        cloud.baseX + Math.sin(time * 0.21 + cloud.phase) * cloud.amplitude * 1.6
      cloud.node.position.y = cloud.baseY + Math.cos(time * 0.14 + cloud.phase) * 0.035
    }

    // Fast enough that a child can see the sails actually going around —
    // 0.16 rad/s was one revolution every 40 seconds, i.e. visually parked.
    rotor.rotation.z = time * 0.55

    // Slow crossing swells on the lake. Vertical displacement only — a still
    // mirror looks like painted glass, and anything faster than this reads as
    // an ocean rather than a sheltered mountain lake.
    for (let index = 0; index < lakePositions.count; index++) {
      const x = lakeRest[index * 3]!
      const y = lakeRest[index * 3 + 1]!
      lakePositions.setZ(
        index,
        Math.sin(x * 0.55 + time * 0.5) * 0.035 + Math.cos(y * 0.8 - time * 0.36) * 0.025,
      )
    }
    lakePositions.needsUpdate = true
    lakeGeometry.computeVertexNormals()
    for (const butterfly of butterflies) {
      const flight = time * 1.35 + butterfly.phase
      const flap = Math.sin(flight * 3.4) * 0.52
      butterfly.node.position.set(
        butterfly.baseX + Math.sin(flight) * 0.13,
        butterfly.baseY + Math.cos(flight * 1.65) * 0.075,
        butterfly.baseZ + Math.cos(flight * 0.72) * 0.08,
      )
      butterfly.node.rotation.y = Math.sin(flight * 0.75) * 0.26
      butterfly.leftWing.rotation.y = 0.42 + flap
      butterfly.rightWing.rotation.y = -0.42 - flap
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
      const meshMaterials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of meshMaterials) ownedMaterials.add(material)
    })
    for (const geometry of geometries) geometry.dispose()
    for (const material of ownedMaterials) {
      // Material.dispose() does not release its textures, and every map in this
      // module is painted here and owned by this backdrop alone.
      const map = (material as { map?: { dispose(): void } | null }).map
      map?.dispose()
      material.dispose()
    }
    for (const geometry of ridgeGeometries) geometry.dispose()
  }

  return { root, update, dispose }
}
