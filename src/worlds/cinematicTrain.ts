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
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
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

// Pixel-measured mouth of the tall forward funnel in the supplied side-view
// art. The locomotive faces screen-right, so steam trails toward screen-left.
const CHIMNEY_U = 0.804
const CHIMNEY_V = 0.147
const TRAIN_WHEEL_SOURCE_Y = 0.8
const STEAM_PUFF_COUNT = 3
const STEAM_CYCLE_SECONDS = 3.1

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
  readonly screenY?: number | ((camera: Camera) => number)
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

function smoothstep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped * clamped * (3 - 2 * clamped)
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
  const image = new Mesh(geometry, material)
  image.name = 'Purple excursion train image'
  image.visible = false
  image.frustumCulled = false
  image.castShadow = false
  image.receiveShadow = false
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
  vehicle.add(steam, image)

  const cameraPosition = new Vector3()
  const cameraForward = new Vector3()
  const cameraQuaternion = new Quaternion()
  let ownedTexture: Texture | null = null
  let disposed = false
  let loadGeneration = 0

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
    const lateral = (motionProgress * 2 - 1) * halfSpan
    const time = Math.max(0, finite(elapsedSeconds, 0))
    const bob = options.reducedMotion ? 0 : Math.sin(time * 2.3) * 0.022
    const requestedScreenY =
      typeof screenYSource === 'function' ? screenYSource(camera) : screenYSource
    const screenY = finite(requestedScreenY, DEFAULT_SCREEN_Y)
    vehicle.position.set(lateral, screenY + bob, 0)

    // Steam is a motion cue, not a separate landmark. It is absent until the
    // train image is ready, then fully suppressed under reduced motion.
    steam.visible = !options.reducedMotion && image.visible && material.map !== null
    if (steam.visible) {
      for (let index = 0; index < steamPuffs.length; index++) {
        const puff = steamPuffs[index]!
        const pose = sampleCinematicTrainSteamPuff(time, index, width)
        puff.mesh.position.x = pose.x
        puff.mesh.position.y = pose.y
        puff.mesh.scale.setScalar(pose.scale)
        puff.mesh.rotation.z = pose.rotation
        puff.opacityUniform.value = pose.opacity
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
    geometry.dispose()
    material.dispose()
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
    assetUrl,
    load,
    setTexture,
    hitTest,
    update,
    dispose,
  }
}
