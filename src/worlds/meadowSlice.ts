/**
 * A compact, self-contained meadow for the first bouncing-ball vertical
 * slice.  It deliberately owns only render objects: the caller keeps the
 * ball simulation authoritative and feeds its world-space position back here
 * to receive a one-shot bell-strike event.
 *
 * There are no loaded assets and no Math.random calls.  Given the same seed,
 * every blade of grass, flower, block, and train starts in the same place.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { makeRng } from './world'

const TWO_PI = Math.PI * 2
const DEFAULT_SEED = 0x4d454144

/** A deliberately tiny structural vector type, compatible with BallPhysics. */
export interface MeadowVector3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Render-only input from the authoritative ball simulation. `position` and
 * `velocity` are in world space; `createMeadowSlice` converts them to the
 * meadow's local space so callers may position the returned root freely.
 */
export interface MeadowBallSample {
  readonly position: MeadowVector3
  readonly velocity?: MeadowVector3
  readonly radius?: number
}

export interface MeadowBellTarget extends MeadowVector3 {
  /** Radius of the clapper's friendly hit zone, before the ball radius. */
  readonly radius: number
}

/** Returned once when the ball enters the bell's hit zone. */
export interface MeadowBellStrike {
  readonly target: MeadowBellTarget
  /** 0.45..1, derived from incoming ball speed for an audio/rumble hook. */
  readonly strength: number
}

/** The decorative ramp's local footprint, useful to a future collision layer. */
export interface MeadowRamp {
  readonly center: MeadowVector3
  readonly width: number
  readonly depth: number
  readonly rise: number
}

export interface MeadowSliceOptions {
  /** Stable layout seed. Omit it for the shipped meadow composition. */
  readonly seed?: number
}

export interface MeadowSlice {
  /** Add this group to the stage scene. The factory never adds it itself. */
  readonly root: Group
  /** Local-world ramp dimensions; it is visual until physics opts into it. */
  readonly ramp: MeadowRamp
  /** Local-space bell clapper target, exposed for debug and future tooling. */
  readonly bellTarget: MeadowBellTarget
  /**
   * Advance ambient visuals and, if a ball sample is supplied, return a
   * one-shot bell event. `elapsedSeconds` is absolute time; `deltaSeconds`
   * should be the clamped frame delta.
   */
  update(
    elapsedSeconds: number,
    deltaSeconds: number,
    ball?: MeadowBallSample,
  ): MeadowBellStrike | null
  /** Check the ball without advancing grass/train animation. */
  observeBall(ball: MeadowBallSample): MeadowBellStrike | null
  /** The travelling engine, so a tap on it can be tested and answered. */
  readonly trainVehicle: Group
  /** Clear contact/ringing state without rebuilding the deterministic layout. */
  reset(): void
  /** Release geometries/materials created by this factory. Idempotent. */
  dispose(): void
}

interface SwayNode {
  readonly node: Group
  readonly phase: number
  readonly amount: number
}

interface MeadowMaterials {
  readonly playMat: MeshStandardMaterial
  readonly grass: MeshStandardMaterial
  readonly grassDark: MeshStandardMaterial
  readonly stem: MeshStandardMaterial
  readonly wood: MeshStandardMaterial
  readonly woodDark: MeshStandardMaterial
  readonly ramp: MeshStandardMaterial
  readonly rampStripe: MeshStandardMaterial
  readonly blockBlue: MeshStandardMaterial
  readonly blockPink: MeshStandardMaterial
  readonly blockPurple: MeshStandardMaterial
  readonly bell: MeshStandardMaterial
  readonly bellDark: MeshStandardMaterial
  readonly hill: MeshStandardMaterial
  readonly trainRed: MeshStandardMaterial
  readonly trainBlue: MeshStandardMaterial
  readonly trainCream: MeshStandardMaterial
  readonly trainWheel: MeshStandardMaterial
  readonly smoke: MeshStandardMaterial
  readonly ring: MeshBasicMaterial
  readonly flowerPink: MeshStandardMaterial
  readonly flowerYellow: MeshStandardMaterial
  readonly flowerBlue: MeshStandardMaterial
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function shadow(mesh: Mesh): Mesh {
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function wedgeGeometry(width: number, depth: number, rise: number): BufferGeometry {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  // High end faces the distant train; the ball rolls down toward the child.
  const vertices = new Float32Array([
    -halfWidth, 0, halfDepth,
    halfWidth, 0, halfDepth,
    halfWidth, 0, -halfDepth,
    -halfWidth, 0, -halfDepth,
    -halfWidth, rise, -halfDepth,
    halfWidth, rise, -halfDepth,
  ])
  const indices = [
    0, 2, 1, 0, 3, 2, // underside
    0, 1, 5, 0, 5, 4, // slope
    0, 4, 3, // left side
    1, 2, 5, // right side
    3, 4, 5, 3, 5, 2, // tall back
  ]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeMaterials(): MeadowMaterials {
  const standard = (color: Color | number | string, roughness = 0.84) =>
    new MeshStandardMaterial({ color, roughness, flatShading: true })

  return {
    playMat: standard(0x7ecb58),
    // Warm, sunlit greens close to the ground plane — the previous cool
    // blue-greens read as dark "witch hat" cones against the bright meadow.
    grass: standard(0x55b04a),
    grassDark: standard(0x3f9346),
    stem: standard(0x458b3e),
    wood: standard(0xa76435),
    woodDark: standard(0x6f3f28),
    ramp: standard(0xf0a643),
    rampStripe: standard(0xffd77c),
    blockBlue: standard(0x72bde8),
    blockPink: standard(0xf28a9f),
    blockPurple: standard(0x9277d1),
    bell: new MeshStandardMaterial({
      color: 0xf4b64d,
      roughness: 0.38,
      metalness: 0.28,
      flatShading: true,
      emissive: 0x5e2c00,
      emissiveIntensity: 0.03,
    }),
    bellDark: standard(0x91501a),
    hill: standard(0x5b9b65),
    trainRed: standard(0xd6604e),
    trainBlue: standard(0x497fa8),
    trainCream: standard(0xf3d89a),
    trainWheel: standard(0x494e5b),
    smoke: standard(0xe5edf0, 1),
    ring: new MeshBasicMaterial({
      color: 0xffe49a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
    flowerPink: standard(0xf37ca5),
    flowerYellow: standard(0xffce5b),
    flowerBlue: standard(0x75aee8),
  }
}

function addGrassTuft(
  parent: Group,
  x: number,
  z: number,
  scale: number,
  phase: number,
  geometry: ConeGeometry,
  materials: MeadowMaterials,
): SwayNode {
  const tuft = new Group()
  tuft.name = 'Meadow grass'
  tuft.position.set(x, 0, z)
  tuft.scale.setScalar(scale)

  for (let blade = 0; blade < 3; blade++) {
    const angle = (blade / 3) * TWO_PI + phase * 0.4
    const mesh = shadow(new Mesh(geometry, blade === 1 ? materials.grassDark : materials.grass))
    mesh.position.set(Math.cos(angle) * 0.022, 0.12, Math.sin(angle) * 0.022)
    mesh.rotation.z = 0.18 + blade * 0.08
    mesh.rotation.y = angle
    tuft.add(mesh)
  }

  parent.add(tuft)
  return { node: tuft, phase, amount: 0.05 + scale * 0.025 }
}

function addDistantTrain(parent: Group, materials: MeadowMaterials): {
  train: Group
  vehicle: Group
  smoke: Group[]
  wheels: Mesh[]
} {
  const train = new Group()
  train.name = 'Friendly train on rainbow bridge'
  // Desktop hero framing needs clear air around the cougar's face. Keep the
  // train legible as a moving story beat, but firmly distant and screen-right
  // so the cabin, smoke, and bridge frame rather than cross the silhouette.
  // Raised high enough that the travelling engine stays visible above the
  // cougar's back instead of vanishing behind her for half of every crossing,
  // but set further back and smaller than it once was: at its old size it ran
  // straight through the horizon band and left the Blue Ridge no room at all.
  train.position.set(-1.0, 0.78, -7.6)
  train.scale.setScalar(0.48)

  // The deck spans well past both edges of every supported framing so the
  // continuously travelling train never visibly runs out of track. It reaches
  // further left than right because the wrapped train re-enters from the left
  // through the visible dip beside the hill tree.
  const bridgeDeck = shadow(new Mesh(new BoxGeometry(18, 0.13, 0.72), materials.wood))
  bridgeDeck.name = 'Toy train bridge deck'
  bridgeDeck.position.set(-2, 0.02, 0)
  train.add(bridgeDeck)

  const bridgeRail = new BoxGeometry(17.8, 0.045, 0.042)
  for (const z of [-0.23, 0.23]) {
    const rail = shadow(new Mesh(bridgeRail, materials.trainWheel))
    rail.position.set(-2, 0.16, z)
    train.add(rail)
  }

  const sleeperGeometry = new BoxGeometry(0.09, 0.035, 0.62)
  for (let sleeperIndex = -52; sleeperIndex <= 33; sleeperIndex++) {
    const sleeper = shadow(new Mesh(sleeperGeometry, materials.woodDark))
    sleeper.position.set(sleeperIndex * 0.21, 0.11, 0)
    train.add(sleeper)
  }

  // A bold near-side beam and three piers stop the track from reading like a
  // floating line. The resulting silhouette still stays low behind the play
  // surface and never competes with the cougar.
  const bridgeFront = shadow(new Mesh(new BoxGeometry(18.08, 0.14, 0.1), materials.trainRed))
  bridgeFront.position.set(-2, 0, 0.37)
  train.add(bridgeFront)
  // Piers stretch from the raised deck all the way to the meadow floor.
  const pierGeometry = new RoundedBoxGeometry(0.44, 1.36, 0.5, 0.08, 3)
  for (const x of [-10.5, -8.55, -6.1, -3.66, -1.22, 1.22, 3.66, 6.1]) {
    const pier = shadow(new Mesh(pierGeometry, materials.blockBlue))
    pier.position.set(x, -0.66, 0)
    train.add(pier)
  }

  const vehicle = new Group()
  vehicle.name = 'Big friendly train'
  // Seated so the wheel rims actually touch the railheads (rail top sits at
  // y 0.1825 in train space): 0.2 + wheel centre 0.14 - radius 0.155 = 0.1825.
  vehicle.position.set(0, 0.2, 0)
  train.add(vehicle)

  const chassis = shadow(new Mesh(new BoxGeometry(3.38, 0.22, 0.56), materials.trainBlue))
  chassis.position.y = 0.16
  vehicle.add(chassis)

  const engine = shadow(new Mesh(new BoxGeometry(0.72, 0.52, 0.5), materials.trainRed))
  engine.position.set(0.82, 0.46, 0)
  vehicle.add(engine)

  const boiler = shadow(new Mesh(new CylinderGeometry(0.25, 0.25, 0.88, 10), materials.trainCream))
  boiler.rotation.z = Math.PI / 2
  boiler.position.set(0.31, 0.53, 0)
  vehicle.add(boiler)

  const cabin = shadow(new Mesh(new BoxGeometry(0.56, 0.67, 0.52), materials.trainRed))
  cabin.position.set(-0.37, 0.57, 0)
  vehicle.add(cabin)

  const cabinRoof = shadow(new Mesh(new RoundedBoxGeometry(0.72, 0.12, 0.62, 0.05, 2), materials.trainCream))
  cabinRoof.position.set(-0.37, 0.94, 0)
  vehicle.add(cabinRoof)

  const window = shadow(new Mesh(new RoundedBoxGeometry(0.25, 0.28, 0.022, 0.03, 2), materials.blockBlue))
  window.position.set(-0.37, 0.64, 0.272)
  vehicle.add(window)

  const wagon = shadow(new Mesh(new RoundedBoxGeometry(0.84, 0.42, 0.52, 0.08, 3), materials.trainCream))
  wagon.position.set(-1.33, 0.4, 0)
  vehicle.add(wagon)

  // Seated directly on the wagon box — the rounded corners of both shapes
  // otherwise open a visible sliver of daylight between lid and wagon.
  const wagonCap = shadow(new Mesh(new RoundedBoxGeometry(0.9, 0.11, 0.56, 0.05, 2), materials.blockPurple))
  wagonCap.position.set(-1.33, 0.615, 0)
  vehicle.add(wagonCap)

  const wheelGeometry = new CylinderGeometry(0.155, 0.155, 0.065, 10)
  const wheels: Mesh[] = []
  // Wheel gauge matches the rail gauge (±0.23) — at ±0.31 the wheels ran in
  // the air outside the track, which read as a derailed train.
  for (const x of [-1.48, -0.82, -0.13, 0.62, 1.06]) {
    for (const z of [-0.23, 0.23]) {
      const wheel = shadow(new Mesh(wheelGeometry, materials.trainWheel))
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(x, 0.14, z)
      vehicle.add(wheel)
      wheels.push(wheel)
    }
  }

  const engineFace = shadow(new Mesh(new CylinderGeometry(0.255, 0.255, 0.075, 10), materials.trainRed))
  engineFace.rotation.z = Math.PI / 2
  engineFace.position.set(1.19, 0.53, 0)
  vehicle.add(engineFace)

  const headlight = shadow(new Mesh(new SphereGeometry(0.09, 10, 8), materials.bell))
  headlight.position.set(1.245, 0.57, 0)
  vehicle.add(headlight)

  const chimney = shadow(new Mesh(new CylinderGeometry(0.095, 0.12, 0.43, 8), materials.woodDark))
  chimney.position.set(0.62, 0.86, 0)
  vehicle.add(chimney)

  const smoke: Group[] = []
  const smokeGeometry = new DodecahedronGeometry(0.17, 0)
  for (let puff = 0; puff < 3; puff++) {
    const cloud = new Group()
    cloud.name = 'Train puff'
    cloud.position.set(0.62 + puff * 0.12, 1.08 + puff * 0.17, 0)
    cloud.scale.setScalar(0.8 + puff * 0.2)
    cloud.add(new Mesh(smokeGeometry, materials.smoke))
    vehicle.add(cloud)
    smoke.push(cloud)
  }

  parent.add(train)
  return { train, vehicle, smoke, wheels }
}

/**
 * Create a charming, low-poly play meadow without adding anything to a scene
 * or changing physics. The caller owns placement, frame scheduling, sounds,
 * and the actual ball collision rules.
 */
export function createMeadowSlice(options: MeadowSliceOptions = {}): MeadowSlice {
  const root = new Group()
  root.name = 'Bouncing Ball Meadow'
  root.userData.kind = 'meadow-slice'

  const random = makeRng(options.seed ?? DEFAULT_SEED)
  const materials = makeMaterials()
  const swaying: SwayNode[] = []

  const meadowDisc = shadow(
    new Mesh(new CylinderGeometry(2.28, 2.42, 0.035, 14), materials.playMat),
  )
  meadowDisc.name = 'Meadow play pad'
  meadowDisc.position.y = -0.02
  root.add(meadowDisc)

  // A subtle ring of cut grass keeps the first play space legible without
  // requiring invisible walls or another UI overlay.
  const path = new Mesh(new CircleGeometry(1.63, 48), materials.grass)
  path.name = 'Mown meadow ring'
  path.rotation.x = -Math.PI / 2
  path.position.y = 0.001
  path.receiveShadow = true
  root.add(path)

  const grassBladeGeometry = new ConeGeometry(0.032, 0.25, 3, 1)
  // Denser, smaller tufts: a soft scatter of grass rather than a few tall
  // spikes. Size falls off toward the mown ring so the play area stays clear.
  for (let grass = 0; grass < 52; grass++) {
    const angle = random() * TWO_PI
    const radius = 1.24 + random() * 1.05
    swaying.push(
      addGrassTuft(
        root,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0.45 + random() * 0.55,
        random() * TWO_PI,
        grassBladeGeometry,
        materials,
      ),
    )
  }

  // A loose camera-side arc of tufts frames the bottom of the shot the way
  // the flowers frame its corners.
  for (let framing = 0; framing < 7; framing++) {
    const angle = (framing / 7 - 0.5) * 2.2 + Math.atan2(3.05, 2.35) + (random() - 0.5) * 0.3
    const radius = 2.55 + random() * 0.75
    swaying.push(
      addGrassTuft(
        root,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0.55 + random() * 0.5,
        random() * TWO_PI,
        grassBladeGeometry,
        materials,
      ),
    )
  }

  // Flowers deliberately live in wncGarden.ts now, not here. This module's
  // lollipop blooms — a disc of petal spheres on a stalk — were fine when they
  // were the only flowers in the world, but beside real Shasta daisies and
  // Knock Out roses they read as plastic and broke the whole illusion. The mown
  // play disc is supposed to be mown; the planting belongs in the beds.

  // A short downhill wedge: a bold, toy-sized play invitation rather than a
  // quiet bit of scenery. Its exposed footprint lets a future world-physics
  // layer opt in without the render composition becoming authoritative.
  const ramp: MeadowRamp = Object.freeze({
    // The near-right quadrant is deliberately clear of Purple Cougar's body
    // in the default camera view, so a child can see the slope, stripes, and
    // ball route without needing to rotate or hunt behind the character.
    center: Object.freeze({ x: 0.58, y: 0, z: 0.42 }),
    // Keep the landmark legible without turning it into a foreground wall:
    // this is roughly 28% smaller than the first readability pass, leaving
    // Purple Cougar's lower body and the real ball visible above/behind it.
    width: 0.7,
    depth: 0.92,
    rise: 0.25,
  })
  const rampRoot = new Group()
  rampRoot.name = 'Striped toy ball ramp'
  rampRoot.position.set(ramp.center.x, ramp.center.y, ramp.center.z)
  root.add(rampRoot)

  const rampBody = shadow(new Mesh(wedgeGeometry(ramp.width, ramp.depth, ramp.rise), materials.ramp))
  rampBody.name = 'Bright orange ball ramp slope'
  rampRoot.add(rampBody)

  const rampSlope = Math.atan2(ramp.rise, ramp.depth)
  const railGeometry = new BoxGeometry(0.07, 0.065, ramp.depth * 0.96)
  for (const x of [-ramp.width * 0.47, ramp.width * 0.47]) {
    const rail = shadow(new Mesh(railGeometry, materials.blockPurple))
    rail.name = 'Ramp guard rail'
    rail.position.set(x, ramp.rise * 0.5 + 0.036, 0)
    rail.rotation.x = -rampSlope
    rampRoot.add(rail)
  }

  const stripeGeometry = new BoxGeometry(ramp.width * 0.82, 0.016, 0.06)
  for (const z of [-0.31, -0.1, 0.11, 0.32]) {
    const stripe = shadow(new Mesh(stripeGeometry, materials.rampStripe))
    stripe.name = 'Ramp candy stripe'
    stripe.position.set(0, (ramp.rise * (0.5 - z / ramp.depth)) + 0.016, z)
    stripe.rotation.x = -rampSlope
    rampRoot.add(stripe)
  }

  // A dotted blue trail makes the ramp's intended ball journey legible even
  // when the real ball is temporarily behind Purple Cougar or off camera.
  const trailGeometry = new SphereGeometry(0.062, 10, 8)
  for (const z of [-0.22, 0, 0.22]) {
    const trail = shadow(new Mesh(trailGeometry, materials.blockBlue))
    trail.name = 'Ball path dot'
    trail.position.set(0, ramp.rise * (0.5 - z / ramp.depth) + 0.074, z)
    rampRoot.add(trail)
  }

  const landingPad = new Mesh(new CircleGeometry(0.25, 16), materials.blockBlue)
  landingPad.name = 'Ramp landing target'
  landingPad.rotation.x = -Math.PI / 2
  landingPad.position.set(0, 0.008, ramp.depth * 0.5 + 0.17)
  landingPad.receiveShadow = true
  rampRoot.add(landingPad)

  // Desktop composition is being resolved around Purple Cougar first. Keep
  // the authored course available to the controller, but take it out of the
  // rendered meadow until it earns a clearer, quieter role.
  rampRoot.visible = false

  // The bell is purposefully within a lively ball toss, but not in the
  // cougar's standing silhouette. The visual clapper and hit target share a
  // coordinate so the returned event is easy to reason about.
  const bellTarget: MeadowBellTarget = Object.freeze({ x: 0.72, y: 0.31, z: -0.52, radius: 0.13 })
  const bellStand = new Group()
  bellStand.name = 'Rainbow bell station'
  root.add(bellStand)

  // A tiny roofed station is intentionally much more than two posts and a
  // crossbar. At iPad scale the canopy, blue backboard, gold halo, and bell
  // form one instantly recognisable "ring the bell" landmark.
  const bellBase = shadow(new Mesh(new RoundedBoxGeometry(1.04, 0.15, 0.58, 0.08, 3), materials.blockPurple))
  bellBase.name = 'Bell station base'
  bellBase.position.set(bellTarget.x, 0.075, bellTarget.z)
  bellStand.add(bellBase)

  const bellBack = shadow(new Mesh(new RoundedBoxGeometry(0.9, 0.68, 0.1, 0.06, 3), materials.blockBlue))
  bellBack.name = 'Bell station blue backboard'
  bellBack.position.set(bellTarget.x, 0.48, bellTarget.z - 0.19)
  bellStand.add(bellBack)

  const postGeometry = new RoundedBoxGeometry(0.1, 0.58, 0.12, 0.04, 2)
  for (const x of [bellTarget.x - 0.42, bellTarget.x + 0.42]) {
    const post = shadow(new Mesh(postGeometry, materials.blockPink))
    post.name = 'Bell station column'
    post.position.set(x, 0.43, bellTarget.z - 0.02)
    bellStand.add(post)
  }

  const roof = shadow(new Mesh(new ConeGeometry(0.58, 0.28, 8), materials.ramp))
  roof.name = 'Bell station canopy'
  roof.position.set(bellTarget.x, 1.04, bellTarget.z - 0.05)
  bellStand.add(roof)
  const roofRim = shadow(new Mesh(new CylinderGeometry(0.59, 0.59, 0.06, 10), materials.rampStripe))
  roofRim.position.set(bellTarget.x, 0.91, bellTarget.z - 0.05)
  bellStand.add(roofRim)

  const bellHalo = new Mesh(new TorusGeometry(0.285, 0.024, 6, 16), materials.rampStripe)
  bellHalo.name = 'Bell station halo'
  bellHalo.position.set(bellTarget.x, 0.65, bellTarget.z - 0.225)
  bellStand.add(bellHalo)

  const bellButton = shadow(new Mesh(new SphereGeometry(0.09, 10, 8), materials.trainRed))
  bellButton.name = 'Bell station red button'
  bellButton.position.set(bellTarget.x, 0.17, bellTarget.z + 0.31)
  bellStand.add(bellButton)

  const bellPivot = new Group()
  bellPivot.name = 'Golden meadow bell'
  bellPivot.position.set(bellTarget.x, 0.78, bellTarget.z)
  bellStand.add(bellPivot)

  // The bell station was crowding the hero at desktop scale. It will return
  // only after its silhouette and placement have a distinct gameplay job.
  bellStand.visible = false
  const bellEnabled = bellStand.visible

  const bellProfile = [
    new Vector2(0.06, 0.035),
    new Vector2(0.12, -0.005),
    new Vector2(0.18, -0.12),
    new Vector2(0.205, -0.3),
    new Vector2(0.176, -0.37),
    new Vector2(0.12, -0.39),
  ]
  const bellShell = shadow(new Mesh(new LatheGeometry(bellProfile, 14), materials.bell))
  bellPivot.add(bellShell)

  const bellRim = shadow(new Mesh(new TorusGeometry(0.18, 0.021, 6, 14), materials.bellDark))
  bellRim.rotation.x = Math.PI / 2
  bellRim.position.y = -0.37
  bellPivot.add(bellRim)

  const clapperChain = shadow(new Mesh(new CylinderGeometry(0.012, 0.012, 0.16, 6), materials.bellDark))
  clapperChain.position.y = -0.43
  bellPivot.add(clapperChain)

  const clapper = shadow(new Mesh(new SphereGeometry(0.065, 8, 6), materials.bellDark))
  clapper.position.y = bellTarget.y - bellPivot.position.y
  bellPivot.add(clapper)

  const ringLines = new Group()
  ringLines.name = 'Bell ring lines'
  ringLines.visible = false
  ringLines.position.set(bellTarget.x, 0.43, bellTarget.z)
  for (const direction of [-1, 1]) {
    const line = new Mesh(new TorusGeometry(0.12, 0.009, 5, 10, Math.PI * 0.68), materials.ring)
    line.rotation.y = direction < 0 ? Math.PI : 0
    line.position.x = direction * 0.23
    ringLines.add(line)
  }
  root.add(ringLines)

  // Low green knolls flanking the bridge. They used to stand 1.2 units tall
  // directly across the sightline, which walled off the Blue Ridge and the
  // lake behind them — the entire reason the distance exists. Now they only
  // grip the ground at the far left and right, so the valley stays open.
  const hillGeometry = new DodecahedronGeometry(1, 1)
  const hillA = shadow(new Mesh(hillGeometry, materials.hill))
  hillA.name = 'Distant meadow hill'
  hillA.position.set(-5.1, 0.34, -6.45)
  hillA.scale.set(3.4, 0.5, 1.05)
  root.add(hillA)
  const hillB = shadow(new Mesh(hillGeometry, materials.hill))
  hillB.name = 'Distant meadow hill right'
  hillB.position.set(5.5, 0.3, -6.65)
  hillB.scale.set(3.1, 0.46, 0.9)
  root.add(hillB)

  const treeTrunkGeometry = new CylinderGeometry(0.075, 0.1, 0.85, 6)
  const treeCrownGeometry = new DodecahedronGeometry(0.48, 0)
  const treePositions: ReadonlyArray<readonly [number, number, number]> = [
    [-3.05, -4.45, 1.04],
    [3.06, -4.72, 0.92],
  ]
  for (const [x, z, scale] of treePositions) {
    const tree = new Group()
    tree.name = 'Storybook tree landmark'
    tree.position.set(x, 0, z)
    tree.scale.setScalar(scale)
    const trunk = shadow(new Mesh(treeTrunkGeometry, materials.woodDark))
    trunk.position.y = 0.41
    tree.add(trunk)
    const crown = shadow(new Mesh(treeCrownGeometry, materials.grassDark))
    crown.position.y = 1.04
    crown.scale.set(1.08, 1.28, 0.8)
    tree.add(crown)
    root.add(tree)
  }

  const distantTrain = addDistantTrain(root, materials)

  // Close butterflies over the flowers. The backdrop butterflies are too far
  // away to read; these are near enough for a child to notice and follow.
  // Wings are flat rounded blades hinged at the body — the earlier chunky
  // dodecahedron wings read as pink rocks, not an insect.
  interface MeadowButterfly {
    group: Group
    leftPivot: Group
    rightPivot: Group
    phase: number
    radiusX: number
    radiusZ: number
  }
  const butterflyWingGeometry = new SphereGeometry(0.055, 10, 7)
  function makeButterfly(
    wingMaterial: MeshStandardMaterial,
    phase: number,
    radiusX: number,
    radiusZ: number,
  ): MeadowButterfly {
    const group = new Group()
    group.name = 'Meadow butterfly'
    const body = new Mesh(new SphereGeometry(0.013, 6, 5), materials.woodDark)
    body.scale.set(1, 0.9, 2.6)
    group.add(body)
    const leftPivot = new Group()
    const rightPivot = new Group()
    for (const [pivot, side] of [
      [leftPivot, -1],
      [rightPivot, 1],
    ] as const) {
      const wing = new Mesh(butterflyWingGeometry, wingMaterial)
      // A flat blade, longer than deep, pushed out so the pivot hinges at the
      // body like a real wing root. Shadows are what stop a flat wing from
      // reading as a petal lying on the grass.
      wing.scale.set(1.35, 0.07, 0.8)
      wing.position.x = side * 0.062
      wing.castShadow = true
      pivot.add(wing)
      group.add(pivot)
    }
    root.add(group)
    return { group, leftPivot, rightPivot, phase, radiusX, radiusZ }
  }
  const butterflies: MeadowButterfly[] = [
    makeButterfly(materials.flowerPink, 0, 1.35, 1.5),
    makeButterfly(materials.flowerYellow, 3.6, 1.1, 1.8),
  ]

  const ballLocal = new Vector3()
  let bellContact = false
  let bellEnergy = 0
  let bellAge = 0
  let disposed = false

  function observeBall(ball: MeadowBallSample): MeadowBellStrike | null {
    if (disposed || !bellEnabled) return null
    const position = ball.position
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      return null
    }

    // The sample arrives in scene/world coordinates. This keeps the API valid
    // if an integrator later places the meadow under a transformed group.
    root.updateWorldMatrix(true, false)
    ballLocal.set(position.x, position.y, position.z)
    root.worldToLocal(ballLocal)

    const ballRadius = clamp(finite(ball.radius ?? 0.115, 0.115), 0.04, 0.42)
    const dx = ballLocal.x - bellTarget.x
    const dy = ballLocal.y - bellTarget.y
    const dz = ballLocal.z - bellTarget.z
    const hitRadius = bellTarget.radius + ballRadius
    const distanceSquared = dx * dx + dy * dy + dz * dz

    // A little exit hysteresis means a resting ball against the clapper does
    // not retrigger a bell every rendered frame.
    const exitRadius = hitRadius + 0.07
    if (distanceSquared > exitRadius * exitRadius) bellContact = false
    if (bellContact || distanceSquared > hitRadius * hitRadius) return null

    bellContact = true
    const velocity = ball.velocity
    const speed = velocity && Number.isFinite(velocity.x) && Number.isFinite(velocity.y) && Number.isFinite(velocity.z)
      ? Math.hypot(velocity.x, velocity.y, velocity.z)
      : 0
    const strength = clamp(0.45 + speed / 8, 0.45, 1)
    bellEnergy = Math.max(bellEnergy, strength)
    bellAge = 0
    return { target: bellTarget, strength }
  }

  function update(elapsedSeconds: number, deltaSeconds: number, ball?: MeadowBallSample): MeadowBellStrike | null {
    if (disposed) return null
    const elapsed = finite(elapsedSeconds)
    const delta = clamp(finite(deltaSeconds), 0, 0.1)

    for (const sway of swaying) {
      sway.node.rotation.z = Math.sin(elapsed * 1.25 + sway.phase) * sway.amount
      sway.node.rotation.x = Math.cos(elapsed * 0.92 + sway.phase * 0.73) * sway.amount * 0.25
    }

    // Butterflies: slow lissajous wanders above the flower ring, each facing
    // its direction of travel, wings flapping fast the way small wings do,
    // with a light bounce synced to the downstroke.
    for (const flier of butterflies) {
      const flight = elapsed * 0.5 + flier.phase
      const flapPhase = (elapsed + flier.phase) * 9.5
      // The wander is pushed into the far half of the meadow, away from the
      // camera resting near (1.7, 1.84). A butterfly that drifts within ~2m of
      // the lens stops reading as an insect and becomes a pink slab filling
      // the frame edge.
      flier.group.position.set(
        Math.sin(flight * 0.62) * flier.radiusX,
        // High enough over the flowers to be unmistakably airborne.
        0.68 + Math.sin(flight * 1.7) * 0.17 + Math.sin(flapPhase) * 0.012,
        Math.cos(flight * 0.41) * flier.radiusZ * 0.45 - 1.5,
      )
      const headingX = Math.cos(flight * 0.62) * 0.62 * flier.radiusX
      const headingZ = -Math.sin(flight * 0.41) * 0.41 * flier.radiusZ * 0.45
      flier.group.rotation.y = Math.atan2(headingX, headingZ)
      // Wings rest in a shallow V and sweep upward from there — spending time
      // dead-flat is what made them read as petals on the lawn.
      const flap = 0.45 + Math.sin(flapPhase) * 0.7
      flier.leftPivot.rotation.z = flap
      flier.rightPivot.rotation.z = -flap
    }

    // The train travels one way — engine first, toward screen-right — exits
    // past the frame, and re-enters from the left, so it always reads as the
    // same friendly train going somewhere rather than shuttling in place.
    // Slow enough that a portrait view never becomes a distracting whip-pan.
    const TRAIN_SPAN = 8.6
    const TRAIN_SPEED = 0.85
    distantTrain.vehicle.position.x = ((elapsed * TRAIN_SPEED) % (TRAIN_SPAN * 2)) - TRAIN_SPAN
    // Tiny bob only — anything larger visibly lifts the rims off the rails.
    distantTrain.vehicle.position.y = 0.2 + Math.sin(elapsed * 1.24) * 0.006
    for (const wheel of distantTrain.wheels) {
      // The cylinder is tilted onto its axle by rotation.x, so the rolling
      // spin must go on the local axis (rotation.y) — animating rotation.z
      // flips the disc end-over-end instead. Angular speed is v / r so the
      // rims genuinely roll along the rails rather than spinning at a
      // disconnected rate.
      wheel.rotation.y = -(TRAIN_SPEED / 0.155) * elapsed
    }
    for (let puff = 0; puff < distantTrain.smoke.length; puff++) {
      const cloud = distantTrain.smoke[puff]!
      const floatPhase = elapsed * 0.7 + puff * 0.85
      // Puffs trail behind the chimney and climb as they age — smoke hanging
      // motionless above a travelling engine reads as a sticker, a drifting
      // wake reads as motion.
      cloud.position.y = 1.08 + puff * 0.26 + Math.sin(floatPhase) * 0.05
      cloud.position.x = 0.62 - puff * 0.4 + Math.cos(floatPhase) * 0.045
    }

    bellAge += delta
    if (bellEnergy > 0.001) {
      const decay = Math.exp(-bellAge * 2.7)
      const wobble = Math.sin(bellAge * 27) * bellEnergy * decay
      bellPivot.rotation.z = wobble * 0.24
      clapper.position.x = wobble * 0.045
      ringLines.visible = true
      const ringScale = 1 + (1 - decay) * 0.7
      ringLines.scale.setScalar(ringScale)
      materials.ring.opacity = decay * 0.78
      materials.bell.emissiveIntensity = 0.03 + decay * bellEnergy * 0.32
      if (bellAge > 1.45) bellEnergy = 0
    } else {
      bellPivot.rotation.z = 0
      clapper.position.x = 0
      ringLines.visible = false
      materials.ring.opacity = 0
      materials.bell.emissiveIntensity = 0.03
    }

    return ball ? observeBall(ball) : null
  }

  function reset(): void {
    bellContact = false
    bellEnergy = 0
    bellAge = 0
    bellPivot.rotation.z = 0
    clapper.position.x = 0
    ringLines.visible = false
    materials.ring.opacity = 0
    materials.bell.emissiveIntensity = 0.03
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

  return {
    root,
    ramp,
    bellTarget,
    update,
    observeBall,
    trainVehicle: distantTrain.vehicle,
    reset,
    dispose,
  }
}
