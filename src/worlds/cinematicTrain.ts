/**
 * Camera-locked purple excursion train.
 *
 * This is deliberately a visual layer rather than a physical world object:
 * the alpha cutout can stay framed as a distant landmark while the child
 * moves the ball and the follow camera makes its small, gentle adjustments.
 * Keeping it separate also lets the richer asset replace a low-poly proxy
 * without coupling texture loading to the game loop.
 */
import {
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  TextureLoader,
  Vector3,
} from 'three'
import type { Camera, Intersection, Raycaster, Texture } from 'three'

/** Public Vite path for the authored, alpha-textured train cutout. */
export const PURPLE_EXCURSION_TRAIN_ASSET_URL = '/assets/purple-excursion-train-v1.webp'

// Kept in pixel proportions so the fitted steam engine does not stretch.
const TRAIN_ASPECT = 1774 / 887
// Far enough behind the play action that the train reads as a landmark, not a
// foreground prop. It is still deliberately large enough for a child to spot
// the purple engine and wheels without a label.
/** Camera-space depth of the moving train card. */
export const CINEMATIC_TRAIN_DISTANCE = 19
// The new railway is authored directly into the garden plate. A slightly
// smaller engine reads as a real distant excursion train instead of a second
// foreground hero, while still staying easy for a child to find.
export const CINEMATIC_TRAIN_WIDTH = 4.85
// The train card's painted wheel line is pixel-aligned to the lower rail of
// the integrated 16:9 garden plate. It intentionally is not a free-floating
// lower-third decoration anymore.
const DEFAULT_SCREEN_Y = 0.02
const DEFAULT_LOOP_SECONDS = 22
const DEFAULT_EDGE_PADDING = 0.48
const DEFAULT_HALF_VIEWPORT_WIDTH = 10

// Start in frame so the train is a real first-impression landmark rather than
// something a child has to wait for. It still leaves fully beyond the screen
// before looping, which avoids a visible jump at either edge.
const INITIAL_PROGRESS = 0.44
const REDUCED_MOTION_PROGRESS = 0.58

// The plate only paints a railway across its right half — a stone viaduct over
// the gorge, and a cutting that disappears behind the conifers. Running the
// full viewport span sent the locomotive gliding across open lake, mountains,
// and sunset sky with nothing under its wheels. Travel now begins inside that
// tree line, so it emerges from the forest instead of out of nothing.
// Progress 0 puts the locomotive's nose level with the painted tunnel mouth,
// so the whole card starts inside the mountain.
const TRAVEL_START_FRACTION = -0.01
const TRAVEL_END_FRACTION = 1
/**
 * Fraction of the run spent clearing the portal. The tunnel card occludes the
 * emerging half of the train outright; this ramp only covers the tail, which
 * would otherwise wink into existence beyond the arch.
 */
const EMERGENCE_FRACTION = 0.3

// Pixel-measured mouth of the tall forward funnel in the supplied side-view
// art. The locomotive faces screen-right, so steam trails toward screen-left.
const CHIMNEY_U = 0.804
const CHIMNEY_V = 0.147
// Measured off the rendered frame against the painted deck, not off the card
// art: at 0.8 the wheels floated roughly a sleeper's height above the rail.
export const TRAIN_WHEEL_SOURCE_Y = 0.727
// Rear edge of the rearmost driving wheel. The gear overlays are separate
// meshes that the card's wipe cannot clip, so they must stay hidden until the
// whole mechanism has left the tunnel — gating on the locomotive's front left
// disembodied wheels turning against the rock face.
const LOCOMOTIVE_SOURCE_U = 0.478
const STEAM_PUFF_COUNT = 3
const STEAM_CYCLE_SECONDS = 3.1

// The engine's four linked drivers are a tiny part of the distant card, so
// the running gear stays deliberately selective: a light rim, moving spokes,
// and brass side rods only. Animating every coach bogie would read as visual
// noise instead of a single understandable "the train is alive" cue.
const DRIVE_WHEEL_SOURCE_CENTERS = [
  // Pixel-checked against the purple engine's four linked driving wheels.
  // Keeping the positions in source space protects the fit from card sizing
  // or desktop aspect changes.
  [0.523, 0.699],
  [0.582, 0.699],
  [0.644, 0.699],
  [0.706, 0.699],
] as const
const REAR_DRIVE_WHEEL_SOURCE = DRIVE_WHEEL_SOURCE_CENTERS[0]
const FRONT_DRIVE_WHEEL_SOURCE = DRIVE_WHEEL_SOURCE_CENTERS[3]
const DRIVE_WHEEL_RADIUS_SOURCE_U = 0.041
const DRIVE_CRANK_RADIUS_RATIO = 0.38
const PISTON_GUIDE_U = 0.79
const PISTON_GUIDE_V = 0.699
const HEADLAMP_U = 0.852
const HEADLAMP_V = 0.274
const DEFAULT_WHEEL_REVOLUTION_SECONDS = 1.02
const CELEBRATION_DURATION_SECONDS = 2.35

const STEAM_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const STEAM_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 tint;
  uniform float opacity;
  varying vec2 vUv;

  void main() {
    vec2 centered = vUv - 0.5;
    float radius = length(centered);
    float softEdge = 1.0 - smoothstep(0.22, 0.5, radius);
    // A faint unevenness breaks the perfectly graphic circle without a
    // canvas/noise texture or another asset request.
    float wisp = 0.92 + 0.08 * sin(centered.x * 19.0 + centered.y * 13.0);
    gl_FragColor = vec4(tint, softEdge * wisp * opacity);
  }
`

// A small procedural bloom avoids another raster layer while making the
// locomotive's existing painted lamp feel warm at a distance. The glow is
// transparent outside the circle, so it cannot turn the alpha card into a
// rectangle under post-processing.
const HEADLAMP_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 tint;
  uniform float opacity;
  varying vec2 vUv;

  void main() {
    float radius = length(vUv - 0.5);
    float halo = 1.0 - smoothstep(0.08, 0.5, radius);
    float core = 1.0 - smoothstep(0.0, 0.19, radius);
    float alpha = (halo * 0.44 + core * 0.78) * opacity;
    gl_FragColor = vec4(tint, alpha);
  }
`

/** The narrow interface keeps unit tests free of Image/DOM construction. */
export interface CinematicTrainTextureLoader {
  loadAsync(url: string): Promise<Texture>
}

/** One camera-space exhaust puff, sampled from the train's elapsed clock. */
export interface CinematicTrainSteamPuff {
  /** Local position relative to the moving train card. */
  readonly x: number
  readonly y: number
  /** Uniform scale for the unit soft-puff plane. */
  readonly scale: number
  /** Fragment alpha, intentionally kept restrained. */
  readonly opacity: number
  /** Tiny screen-plane roll so the stream does not read as stamped circles. */
  readonly rotation: number
}

/** A small side-rod pose in the train card's local camera-facing plane. */
export interface CinematicTrainRodPose {
  /** Centre position in scene units relative to the card. */
  readonly x: number
  readonly y: number
  /** Drawn bar length in scene units. */
  readonly length: number
  /** Counter-clockwise screen-plane rotation in radians. */
  readonly rotation: number
}

/**
 * Pure visual state for the locomotive's running gear. It is intentionally
 * separate from Three objects so the mechanism can be regression-tested
 * without a browser, texture, or renderer.
 */
export interface CinematicTrainMechanicalPose {
  /** Rotation shared by the four coupled driving wheels. */
  readonly driveWheelAngle: number
  /** Brass coupling rod travelling with the linked driver crank pins. */
  readonly couplingRod: CinematicTrainRodPose
  /** Short rod running from the front driver toward the painted cylinder. */
  readonly pistonRod: CinematicTrainRodPose
  /** Local crank-pin offset applied to each driver-wheel centre. */
  readonly crankOffset: Readonly<{ x: number; y: number }>
  /** Size and alpha of the subtle warm lamp bloom. */
  readonly headlamp: Readonly<{ scale: number; opacity: number }>
}

export interface CinematicTrainMechanicalPoseOptions {
  /** Card width in scene units. Defaults to the shipping train size. */
  readonly trainWidth?: number
  /** Seconds for one driver-wheel revolution. */
  readonly wheelRevolutionSeconds?: number
  /** 0–1 temporary delight from a story/tap celebration. */
  readonly celebration?: number
}

/**
 * Conservative source-image bands around the painted train silhouette. They
 * are intentionally smaller than the card bounds, so alpha padding never
 * becomes an invisible click target. Values use source pixels normalized from
 * the top-left; Three plane UVs are converted below.
 */
const TRAIN_HIT_BANDS: ReadonlyArray<readonly [number, number, number, number]> = [
  // Chassis, wheel line, and rails.
  [0.018, 0.988, 0.555, 0.805],
  // Passenger cars and their arched roofs.
  [0.025, 0.485, 0.37, 0.69],
  // Cab, dome, and boiler.
  [0.425, 0.915, 0.285, 0.7],
  // Tall forward funnel.
  [0.765, 0.865, 0.14, 0.555],
  // Cowcatcher and forward lamp housing.
  [0.875, 0.985, 0.455, 0.79],
]

/**
 * Returns whether a Three plane UV lies on a conservative portion of the
 * authored train. This intentionally does not promise pixel-perfect alpha;
 * it prevents the broad transparent card margin from intercepting child taps.
 */
export function isCinematicTrainHitUv(u: number, v: number): boolean {
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) return false
  // PlaneGeometry uses v=1 at its top edge, while source images are measured
  // from their top edge downward.
  const topOriginV = 1 - v
  return TRAIN_HIT_BANDS.some(([minU, maxU, minV, maxV]) => (
    u >= minU && u <= maxU && topOriginV >= minV && topOriginV <= maxV
  ))
}

export interface CinematicTrainOptions {
  /** Asset path, primarily useful for local art iteration and tests. */
  readonly assetUrl?: string
  /** Read every frame so a shared OS-motion preference can change live. */
  readonly reducedMotion?: boolean
  /** Camera-space depth in scene units. The train stays behind the play area. */
  readonly distance?: number
  /** Width of the source image in scene units; height preserves its aspect. */
  readonly width?: number
  /**
   * Camera-space vertical placement. A callback lets the train follow an
   * authored rail line as a background plate reframes across desktop aspects.
   */
  /**
   * Camera-local y for the wheel line. The callback receives the card's
   * current lateral offset because the painted railbed climbs — a height that
   * ignores where the train is along the track cannot sit on it.
   */
  readonly screenY?: number | ((camera: Camera, lateral: number) => number)
  /**
   * Camera-local x of the tunnel mouth the train emerges from. Supplying it
   * turns the run into a real emergence: the card starts wholly inside the
   * mountain and is wiped by the portal edge as it pulls out.
   */
  readonly tunnelLateral?: (camera: Camera) => number
  /** Duration of one left-to-right crossing. */
  readonly loopSeconds?: number
}

export interface CinematicTrain {
  /** Add this to the stage scene once. Do not parent it to the camera. */
  readonly root: Group
  /** Camera-space child that carries the crossing and subtle suspension bob. */
  readonly vehicle: Group
  /** The alpha-textured 2.5D card; exposed for intentional renderer tuning. */
  readonly image: Mesh<PlaneGeometry, MeshBasicMaterial>
  /** Soft shader puffs spawned from the painted locomotive's funnel. */
  readonly steam: Group
  /** Selective moving drivers and brass linkage over the painted engine. */
  readonly runningGear: Group
  /** Soft warm bloom centered over the train's painted headlamp. */
  readonly headlamp: Group
  readonly assetUrl: string
  /**
   * Load the authored image. Supplying a loader keeps non-browser tests DOM
   * free; omitting it creates Three's TextureLoader only when loading is
   * actually requested by a browser runtime.
   */
  load(loader?: CinematicTrainTextureLoader): Promise<boolean>
  /** Attach a caller-owned texture without invoking browser image APIs. */
  setTexture(texture: Texture): void
  /** Raycast the visible train only; transparent card padding never counts. */
  hitTest(raycaster: Raycaster): Intersection | null
  /** Align to the current camera and advance the crossing from elapsed time. */
  update(camera: Camera, elapsedSeconds: number): void
  /** Queue a brief, non-audio "happy chug" for a tap or story beat. */
  celebrate(): void
  /** Release only resources owned by this layer. Safe to call more than once. */
  dispose(): void
}

interface PerspectiveCameraShape {
  readonly isPerspectiveCamera?: boolean
  readonly fov?: number
  readonly aspect?: number
}

interface OrthographicCameraShape {
  readonly isOrthographicCamera?: boolean
  readonly left?: number
  readonly right?: number
  readonly zoom?: number
}

interface SteamPuff {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>
  readonly material: ShaderMaterial
  readonly opacityUniform: { value: number }
}

interface DriverWheelOverlay {
  readonly rig: Group
}

interface RodOverlay {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function unitLoop(value: number): number {
  const wrapped = value - Math.floor(value)
  return Number.isFinite(wrapped) ? wrapped : 0
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function smoothstep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped * clamped * (3 - 2 * clamped)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, finite(value, 0)))
}

function sourcePointToTrainPlane(sourceU: number, sourceTopV: number, width: number): Vector3 {
  const height = width / TRAIN_ASPECT
  return new Vector3(
    (sourceU - 0.5) * width,
    (0.5 - sourceTopV) * height,
    0,
  )
}

function rodBetween(start: Readonly<{ x: number; y: number }>, end: Readonly<{ x: number; y: number }>): CinematicTrainRodPose {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return {
    x: start.x + dx * 0.5,
    y: start.y + dy * 0.5,
    length: Math.hypot(dx, dy),
    rotation: Math.atan2(dy, dx),
  }
}

function wheelRevolutionSecondsForCrossing(halfSpan: number, loopSeconds: number, width: number): number {
  const travelSpeed = (Math.max(0.1, finite(halfSpan, 0)) * 2) / positive(loopSeconds, DEFAULT_LOOP_SECONDS)
  const wheelCircumference = Math.PI * 2 * width * DRIVE_WHEEL_RADIUS_SOURCE_U
  const derived = wheelCircumference / Math.max(0.1, travelSpeed)
  // Across ordinary desktop ratios, tying wheel speed to crossing velocity
  // makes the running gear read as mechanically driven rather than a looping
  // sticker. The bounds only protect malformed camera/options input.
  return Math.min(1.6, Math.max(0.48, finite(derived, DEFAULT_WHEEL_REVOLUTION_SECONDS)))
}

function celebrationEnvelope(secondsSinceStart: number): number {
  const elapsed = finite(secondsSinceStart, Number.NEGATIVE_INFINITY)
  if (elapsed < 0 || elapsed > CELEBRATION_DURATION_SECONDS) return 0
  const fadeIn = smoothstep01(elapsed / 0.16)
  const fadeOut = 1 - smoothstep01((elapsed - (CELEBRATION_DURATION_SECONDS - 0.52)) / 0.52)
  return fadeIn * fadeOut
}

/**
 * Samples the locomotive's selective, physically linked running gear. The
 * artwork supplies the detailed wheels; these restrained overlays only supply
 * parallax-free motion cues at the engine's true source positions.
 */
export function sampleCinematicTrainMechanicalPose(
  elapsedSeconds: number,
  options: CinematicTrainMechanicalPoseOptions = {},
): CinematicTrainMechanicalPose {
  const width = positive(options.trainWidth, CINEMATIC_TRAIN_WIDTH)
  const cycleSeconds = positive(options.wheelRevolutionSeconds, DEFAULT_WHEEL_REVOLUTION_SECONDS)
  const time = Math.max(0, finite(elapsedSeconds, 0))
  const celebration = clamp01(options.celebration ?? 0)
  const driveWheelAngle = unitLoop(time / cycleSeconds) * Math.PI * 2
  const wheelRadius = width * DRIVE_WHEEL_RADIUS_SOURCE_U
  const crankRadius = wheelRadius * DRIVE_CRANK_RADIUS_RATIO
  const crankOffset = {
    x: Math.cos(driveWheelAngle) * crankRadius,
    y: Math.sin(driveWheelAngle) * crankRadius,
  }
  const rearDriver = sourcePointToTrainPlane(
    REAR_DRIVE_WHEEL_SOURCE[0],
    REAR_DRIVE_WHEEL_SOURCE[1],
    width,
  ).add(new Vector3(crankOffset.x, crankOffset.y, 0))
  const frontDriver = sourcePointToTrainPlane(
    FRONT_DRIVE_WHEEL_SOURCE[0],
    FRONT_DRIVE_WHEEL_SOURCE[1],
    width,
  ).add(new Vector3(crankOffset.x, crankOffset.y, 0))
  const pistonGuide = sourcePointToTrainPlane(PISTON_GUIDE_U, PISTON_GUIDE_V, width)
  const lampBeat = 0.5 + 0.5 * Math.sin(time * 2.7 + 0.7)

  return {
    driveWheelAngle,
    couplingRod: rodBetween(rearDriver, frontDriver),
    pistonRod: rodBetween(frontDriver, pistonGuide),
    crankOffset,
    headlamp: {
      scale: width * (0.055 + lampBeat * 0.006 + celebration * 0.012),
      opacity: 0.098 + lampBeat * 0.026 + celebration * 0.12,
    },
  }
}

/**
 * Samples a small, deliberately muted exhaust trail in the card's local
 * screen plane. This stays pure so a test can check the chimney origin and
 * the backwards/upwards drift without a renderer or browser image resource.
 */
export function sampleCinematicTrainSteamPuff(
  elapsedSeconds: number,
  puffIndex: number,
  trainWidth = CINEMATIC_TRAIN_WIDTH,
): CinematicTrainSteamPuff {
  const width = positive(trainWidth, CINEMATIC_TRAIN_WIDTH)
  const height = width / TRAIN_ASPECT
  const index = Math.max(0, Math.floor(finite(puffIndex, 0))) % STEAM_PUFF_COUNT
  const time = Math.max(0, finite(elapsedSeconds, 0))
  const age = unitLoop(time / STEAM_CYCLE_SECONDS + index / STEAM_PUFF_COUNT)
  const easedAge = smoothstep01(age)
  const fadeIn = smoothstep01(age / 0.13)
  const fadeOut = 1 - smoothstep01((age - 0.72) / 0.28)
  const sway = Math.sin(time * 1.7 + index * 2.21)
  const sourceX = (CHIMNEY_U - 0.5) * width
  const sourceY = (0.5 - CHIMNEY_V) * height

  return {
    // Steam exits at the painted funnel, climbs, and trails behind the
    // right-facing engine. The sway is only applied after lift-off so a fresh
    // puff does not appear to miss its source.
    x: sourceX - width * (easedAge * 0.118 + sway * easedAge * 0.012),
    y: sourceY + width * (easedAge * 0.172 + Math.cos(time * 1.33 + index) * easedAge * 0.012),
    scale: width * (0.025 + easedAge * 0.06),
    opacity: 0.145 * fadeIn * fadeOut,
    rotation: sway * easedAge * 0.15,
  }
}

/** Local y of the painted wheel contact line for a train card of this width. */
export function cinematicTrainWheelContactY(width = CINEMATIC_TRAIN_WIDTH): number {
  const safeWidth = positive(width, CINEMATIC_TRAIN_WIDTH)
  return (0.5 - TRAIN_WHEEL_SOURCE_Y) * (safeWidth / TRAIN_ASPECT)
}

function cameraHalfViewportWidth(camera: Camera, distance: number): number {
  const perspective = camera as Camera & PerspectiveCameraShape
  if (
    perspective.isPerspectiveCamera === true
    && Number.isFinite(perspective.fov)
    && Number.isFinite(perspective.aspect)
    && (perspective.fov ?? 0) > 0
    && (perspective.aspect ?? 0) > 0
  ) {
    const verticalHalf = Math.tan(((perspective.fov ?? 42) * Math.PI) / 360) * distance
    return Math.max(0.1, verticalHalf * (perspective.aspect ?? 1))
  }

  const orthographic = camera as Camera & OrthographicCameraShape
  if (
    orthographic.isOrthographicCamera === true
    && Number.isFinite(orthographic.left)
    && Number.isFinite(orthographic.right)
  ) {
    const zoom = positive(orthographic.zoom, 1)
    return Math.max(0.1, Math.abs((orthographic.right ?? 1) - (orthographic.left ?? -1)) / (2 * zoom))
  }

  return DEFAULT_HALF_VIEWPORT_WIDTH
}

function createBrowserTextureLoader(): CinematicTrainTextureLoader {
  // TextureLoader ultimately creates an Image only once `loadAsync()` is
  // called. Constructing it remains safe for the static scene/test path.
  return new TextureLoader()
}

/**
 * Create an untextured train layer. Call `load()` once the browser runtime is
 * ready, then call `update(stage.camera, elapsedSeconds)` each rendered frame.
 */
export function createCinematicTrain(options: CinematicTrainOptions = {}): CinematicTrain {
  const assetUrl = options.assetUrl?.trim() || PURPLE_EXCURSION_TRAIN_ASSET_URL
  const distance = positive(options.distance, CINEMATIC_TRAIN_DISTANCE)
  const width = positive(options.width, CINEMATIC_TRAIN_WIDTH)
  const screenYSource = options.screenY ?? DEFAULT_SCREEN_Y
  const loopSeconds = positive(options.loopSeconds, DEFAULT_LOOP_SECONDS)
  const height = width / TRAIN_ASPECT

  const root = new Group()
  root.name = 'Cinematic purple excursion train layer'
  root.userData.kind = 'cinematic-train'

  const vehicle = new Group()
  vehicle.name = 'Purple excursion train crossing'
  root.add(vehicle)

  const geometry = new PlaneGeometry(width, height)
  const material = new MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.015,
    depthTest: true,
    // This card needs to be covered by nearer garden and hero objects, but it
    // must not stamp a rectangular depth field behind its transparent pixels.
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    toneMapped: false,
  })
  // A horizontal wipe at the portal edge. This is what makes the locomotive
  // come *out of* the mountain rather than fade up in front of it.
  const revealUniform = { value: 0 }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRevealU = revealUniform
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uRevealU;\nvoid main() {')
      .replace(
        '#include <alphatest_fragment>',
        `float pcReveal = smoothstep(uRevealU, uRevealU + 0.008, vMapUv.x);
         if (pcReveal <= 0.0) discard;
         diffuseColor.a *= pcReveal;
         #include <alphatest_fragment>`,
      )
  }

  const image = new Mesh(geometry, material)
  image.name = 'Purple excursion train image'
  image.visible = false
  image.renderOrder = 0
  image.frustumCulled = false
  image.castShadow = false
  image.receiveShadow = false

  // The picture already contains finely rendered wheels. These lightweight
  // overlays sit exactly over the four engine drivers and move as one linked
  // mechanism, creating a readable animation without bolting a second toy
  // train onto the scene.
  const runningGear = new Group()
  runningGear.name = 'Animated locomotive running gear'
  runningGear.position.z = 0.006
  runningGear.visible = false
  const driverRadius = width * DRIVE_WHEEL_RADIUS_SOURCE_U
  const crankRadius = driverRadius * DRIVE_CRANK_RADIUS_RATIO
  const rimGeometry = new RingGeometry(driverRadius * 0.84, driverRadius, 24)
  const spokeGeometry = new PlaneGeometry(driverRadius * 1.52, driverRadius * 0.07)
  const crankGeometry = new CircleGeometry(driverRadius * 0.125, 16)
  const rodGeometry = new PlaneGeometry(1, 1)
  const rimMaterial = new MeshBasicMaterial({
    color: 0xe7c979,
    transparent: true,
    opacity: 0.29,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    toneMapped: false,
  })
  const spokeMaterial = new MeshBasicMaterial({
    color: 0xd6b8ff,
    transparent: true,
    opacity: 0.2,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    toneMapped: false,
  })
  const brassMaterial = new MeshBasicMaterial({
    color: 0xf2c76e,
    transparent: true,
    opacity: 0.5,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    toneMapped: false,
  })
  const driverWheels: DriverWheelOverlay[] = []
  for (const [sourceU, sourceTopV] of DRIVE_WHEEL_SOURCE_CENTERS) {
    const rig = new Group()
    rig.name = 'Moving purple locomotive driver'
    rig.position.copy(sourcePointToTrainPlane(sourceU, sourceTopV, width))

    const rim = new Mesh(rimGeometry, rimMaterial)
    rim.name = 'Driver rim shimmer'
    rim.renderOrder = 1
    rig.add(rim)

    // Three broad paired spokes are enough to read as a rotating wheel at the
    // train's intentionally distant size. More would moiré against the photo.
    for (const rotation of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
      const spoke = new Mesh(spokeGeometry, spokeMaterial)
      spoke.name = 'Driver moving spoke'
      spoke.rotation.z = rotation
      spoke.renderOrder = 1
      rig.add(spoke)
    }

    const crankPin = new Mesh(crankGeometry, brassMaterial)
    crankPin.name = 'Driver brass crank pin'
    crankPin.position.x = crankRadius
    crankPin.renderOrder = 2
    rig.add(crankPin)
    runningGear.add(rig)
    driverWheels.push({ rig })
  }

  function createRod(name: string): RodOverlay {
    const mesh = new Mesh(rodGeometry, brassMaterial)
    mesh.name = name
    mesh.renderOrder = 2
    runningGear.add(mesh)
    return { mesh }
  }

  const couplingRod = createRod('Animated brass coupling rod')
  const pistonRod = createRod('Animated piston rod')

  const headlamp = new Group()
  headlamp.name = 'Warm locomotive headlamp glow'
  headlamp.position.copy(sourcePointToTrainPlane(HEADLAMP_U, HEADLAMP_V, width))
  headlamp.position.z = 0.014
  headlamp.visible = false
  const headlampGeometry = new PlaneGeometry(1, 1)
  const headlampOpacityUniform = { value: 0 }
  const headlampMaterial = new ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      tint: { value: new Color(0xffdfa0) },
      opacity: headlampOpacityUniform,
    },
    vertexShader: STEAM_VERTEX_SHADER,
    fragmentShader: HEADLAMP_FRAGMENT_SHADER,
  })
  const headlampBloom = new Mesh(headlampGeometry, headlampMaterial)
  headlampBloom.name = 'Animated headlamp bloom'
  headlampBloom.renderOrder = 3
  headlamp.add(headlampBloom)

  const steam = new Group()
  steam.name = 'Cinematic train steam'
  steam.visible = false
  // The shared unit card is procedurally feathered in the fragment shader.
  // Three individually animated materials are a tiny, predictable cost and
  // avoid any DOM canvas texture allocation.
  const steamGeometry = new PlaneGeometry(1, 1)
  const steamPuffs: SteamPuff[] = []
  for (let index = 0; index < STEAM_PUFF_COUNT; index++) {
    const opacityUniform = { value: 0 }
    const steamMaterial = new ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tint: { value: new Color(0xe6edf2) },
        opacity: opacityUniform,
      },
      vertexShader: STEAM_VERTEX_SHADER,
      fragmentShader: STEAM_FRAGMENT_SHADER,
    })
    const puff = new Mesh(steamGeometry, steamMaterial)
    puff.name = `Train steam puff ${index + 1}`
    puff.position.z = -0.012 - index * 0.001
    puff.renderOrder = -3
    puff.frustumCulled = false
    steam.add(puff)
    steamPuffs.push({ mesh: puff, material: steamMaterial, opacityUniform })
  }
  vehicle.add(steam, image, runningGear, headlamp)

  const cameraPosition = new Vector3()
  const cameraForward = new Vector3()
  const cameraQuaternion = new Quaternion()
  let ownedTexture: Texture | null = null
  let disposed = false
  let loadGeneration = 0
  let celebrationRequested = false
  let celebrationStartedAt = Number.NEGATIVE_INFINITY

  function installTexture(texture: Texture, ownsTexture: boolean): void {
    const previousOwnedTexture = ownedTexture
    texture.colorSpace = SRGBColorSpace
    material.map = texture
    material.needsUpdate = true
    image.visible = true
    ownedTexture = ownsTexture ? texture : null

    if (previousOwnedTexture && previousOwnedTexture !== texture) previousOwnedTexture.dispose()
  }

  function setTexture(texture: Texture): void {
    if (disposed) return
    // A direct texture assignment is intentionally authoritative over a
    // pending async fetch, so an old response cannot replace new art.
    loadGeneration++
    installTexture(texture, false)
  }

  async function load(loader?: CinematicTrainTextureLoader): Promise<boolean> {
    if (disposed) return false
    const generation = ++loadGeneration

    try {
      const activeLoader = loader ?? createBrowserTextureLoader()
      const texture = await activeLoader.loadAsync(assetUrl)
      if (disposed || generation !== loadGeneration) {
        texture.dispose()
        return false
      }
      installTexture(texture, true)
      return true
    } catch {
      // Loading art must not take the playable scene down. The caller can
      // continue with its existing world and retry this explicit operation.
      return false
    }
  }

  function hitTest(raycaster: Raycaster): Intersection | null {
    if (disposed || !image.visible || material.map === null) return null
    // `update()` may have moved the camera-space root after the scene's last
    // renderer matrix pass; raycasting must use those current world matrices.
    root.updateWorldMatrix(true, true)
    const hit = raycaster.intersectObject(image, false)[0]
    if (!hit?.uv || !isCinematicTrainHitUv(hit.uv.x, hit.uv.y)) return null
    return hit
  }

  function celebrate(): void {
    if (disposed || options.reducedMotion) return
    // The caller does not own the shared game clock, so begin on the next
    // render tick rather than accepting a wall-clock value that could make the
    // effect jump or run differently in a paused tab.
    celebrationRequested = true
  }

  function update(camera: Camera, elapsedSeconds: number): void {
    if (disposed) return

    // Keep the card in camera space while the root remains a normal scene
    // child. That preserves normal depth testing against all real garden mesh.
    camera.updateWorldMatrix(true, false)
    camera.getWorldPosition(cameraPosition)
    camera.getWorldQuaternion(cameraQuaternion)
    cameraForward.set(0, 0, -1).applyQuaternion(cameraQuaternion)
    root.position.copy(cameraPosition).addScaledVector(cameraForward, distance)
    root.quaternion.copy(cameraQuaternion)

    const halfSpan = cameraHalfViewportWidth(camera, distance) + width * 0.5 + DEFAULT_EDGE_PADDING
    const motionProgress = options.reducedMotion
      ? REDUCED_MOTION_PROGRESS
      : unitLoop(Math.max(0, finite(elapsedSeconds, 0)) / loopSeconds + INITIAL_PROGRESS)
    const tunnelLateral = options.tunnelLateral?.(camera)
    const hasTunnel = typeof tunnelLateral === 'number' && Number.isFinite(tunnelLateral)
    // Nose at the mouth means the whole card starts inside the mountain.
    const startLateral = hasTunnel
      ? tunnelLateral - width * 0.5
      : TRAVEL_START_FRACTION * halfSpan
    const endLateral = TRAVEL_END_FRACTION * halfSpan
    const lateral = startLateral + motionProgress * (endLateral - startLateral)
    // Local u on the card at the portal edge. Everything left of it is still
    // in the tunnel and must not be drawn — a uniform opacity ramp would make
    // the buried half translucent over the hillside instead of hidden.
    const revealU = hasTunnel
      ? clampUnit(0.5 + (tunnelLateral - lateral) / Math.max(1e-4, width))
      : 0
    revealUniform.value = revealU
    // Without a tunnel to hide behind, fall back to fading at the run's ends.
    const emergence =
      options.reducedMotion || hasTunnel
        ? smoothstep01((1 - motionProgress) / 0.08)
        : smoothstep01(motionProgress / EMERGENCE_FRACTION) *
          smoothstep01((1 - motionProgress) / 0.08)
    const time = Math.max(0, finite(elapsedSeconds, 0))
    const requestedScreenY =
      typeof screenYSource === 'function'
        ? screenYSource(camera, lateral)
        : screenYSource
    const screenY = finite(requestedScreenY, DEFAULT_SCREEN_Y)
    // The wheel contact is deliberately rigid: even a charming suspension
    // bob makes a distant 2.5D locomotive look like it is floating above the
    // authored railway. The gear, steam, and lamp carry all visual motion.
    vehicle.position.set(lateral, screenY, 0)

    if (options.reducedMotion) {
      celebrationRequested = false
      celebrationStartedAt = Number.NEGATIVE_INFINITY
    } else if (celebrationRequested) {
      celebrationRequested = false
      celebrationStartedAt = time
    }
    const celebration = options.reducedMotion
      ? 0
      : celebrationEnvelope(time - celebrationStartedAt)
    const visualReady = image.visible && material.map !== null
    material.opacity = emergence
    // Wheel speed is derived from how far the card actually travels, so
    // shortening the run to the painted railway does not leave the drivers
    // spinning at the old full-span rate.
    const travelHalfSpan =
      (halfSpan * (TRAVEL_END_FRACTION - TRAVEL_START_FRACTION)) / 2
    const wheelRevolutionSeconds = wheelRevolutionSecondsForCrossing(
      travelHalfSpan,
      loopSeconds,
      width,
    )
    const mechanicalPose = sampleCinematicTrainMechanicalPose(
      options.reducedMotion ? 0 : time,
      { trainWidth: width, wheelRevolutionSeconds, celebration },
    )

    // The gear, lamp, and steam are separate meshes, so the card's wipe does
    // not clip them. Gate them on the locomotive itself being clear of the
    // portal — otherwise disembodied drive wheels turn in front of the rock.
    const locomotiveClear = revealU < LOCOMOTIVE_SOURCE_U
    runningGear.visible = visualReady && locomotiveClear
    headlamp.visible = visualReady && locomotiveClear
    if (visualReady && locomotiveClear) {
      for (const wheel of driverWheels) wheel.rig.rotation.z = mechanicalPose.driveWheelAngle

      couplingRod.mesh.position.set(
        mechanicalPose.couplingRod.x,
        mechanicalPose.couplingRod.y,
        0,
      )
      couplingRod.mesh.rotation.z = mechanicalPose.couplingRod.rotation
      couplingRod.mesh.scale.set(
        mechanicalPose.couplingRod.length,
        Math.max(0.012, width * 0.0042),
        1,
      )

      pistonRod.mesh.position.set(
        mechanicalPose.pistonRod.x,
        mechanicalPose.pistonRod.y,
        0,
      )
      pistonRod.mesh.rotation.z = mechanicalPose.pistonRod.rotation
      pistonRod.mesh.scale.set(
        mechanicalPose.pistonRod.length,
        Math.max(0.009, width * 0.0029),
        1,
      )

      headlampBloom.scale.setScalar(mechanicalPose.headlamp.scale)
      headlampOpacityUniform.value = mechanicalPose.headlamp.opacity * emergence
    } else {
      headlampOpacityUniform.value = 0
    }

    // Steam is a motion cue, not a separate landmark. It is absent until the
    // train image is ready, then fully suppressed under reduced motion.
    steam.visible = !options.reducedMotion && visualReady && locomotiveClear
    if (steam.visible) {
      for (let index = 0; index < steamPuffs.length; index++) {
        const puff = steamPuffs[index]!
        const pose = sampleCinematicTrainSteamPuff(time, index, width)
        puff.mesh.position.x = pose.x
        puff.mesh.position.y = pose.y
        puff.mesh.scale.setScalar(pose.scale)
        puff.mesh.rotation.z = pose.rotation
        puff.opacityUniform.value =
          pose.opacity * (1 + celebration * 0.55) * emergence
      }
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    loadGeneration++
    root.removeFromParent()
    material.map = null
    image.visible = false
    steam.visible = false
    runningGear.visible = false
    headlamp.visible = false
    geometry.dispose()
    material.dispose()
    rimGeometry.dispose()
    spokeGeometry.dispose()
    crankGeometry.dispose()
    rodGeometry.dispose()
    rimMaterial.dispose()
    spokeMaterial.dispose()
    brassMaterial.dispose()
    headlampGeometry.dispose()
    headlampMaterial.dispose()
    steamGeometry.dispose()
    for (const puff of steamPuffs) puff.material.dispose()
    ownedTexture?.dispose()
    ownedTexture = null
  }

  return {
    root,
    vehicle,
    image,
    steam,
    runningGear,
    headlamp,
    assetUrl,
    load,
    setTexture,
    hitTest,
    update,
    celebrate,
    dispose,
  }
}
