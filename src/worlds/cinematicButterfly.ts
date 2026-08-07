/**
 * A single Eastern tiger swallowtail that lives in the garden's outer flower bed.
 *
 * The source is an authored alpha-matted plate, not a sprite atlas. Keeping it
 * as a camera-locked card preserves the wing detail while guaranteeing that the
 * butterfly never drifts through Purple Cougar's central play space.
 */
import {
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  MeshBasicMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three'
import type { Camera, Intersection } from 'three'

/** Public Vite path for the authored, alpha-matted swallowtail plate. */
export const EASTERN_TIGER_SWALLOWTAIL_ASSET_URL =
  '/assets/eastern-tiger-swallowtail-hero-v2.webp'

const SOURCE_ASPECT = 973 / 912
const DEFAULT_DISTANCE = 12
const DEFAULT_HALF_VIEWPORT_WIDTH = 10

export interface ButterflyViewport {
  /** Visible camera-space width at the butterfly card's depth. */
  readonly width: number
  /** Visible camera-space height at the butterfly card's depth. */
  readonly height: number
}

/**
 * Camera-local transform and dimensions for the butterfly card.
 *
 * `x` and `y` are deliberately in viewport units rather than world units, so
 * the left flower-bed placement remains stable under the gentle follow camera.
 */
export interface ButterflyFlightPose {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly roll: number
  readonly scaleX: number
  readonly scaleY: number
}

/** UV shape accepted as a real butterfly hit, independent of Three.js. */
export interface ButterflyUv {
  readonly x: number
  readonly y: number
}

/** Narrow loader boundary keeps construction safe in non-browser tests. */
export interface CinematicButterflyTextureLoader {
  loadAsync(url: string): Promise<Texture>
}

export interface CinematicButterflyOptions {
  /** Asset path, primarily useful for art iteration and deterministic tests. */
  readonly assetUrl?: string
  /** Read every frame so an OS motion-preference change takes effect live. */
  readonly reducedMotion?: boolean
  /** Camera-space depth. This must stay farther away than the live cougar. */
  readonly distance?: number
}

export interface CinematicButterfly {
  /** Add this to the stage scene once. It is positioned in camera space by update(). */
  readonly root: Group
  /** The matted swallowtail card, available for intentional renderer tuning. */
  readonly image: Mesh<PlaneGeometry, MeshBasicMaterial>
  readonly assetUrl: string
  /** Load the authored plate once a browser runtime is available. */
  load(loader?: CinematicButterflyTextureLoader): Promise<boolean>
  /** Attach a caller-owned texture without invoking browser image APIs. */
  setTexture(texture: Texture): void
  /** Keep the flower-bed card camera-locked and advance its small hover. */
  update(camera: Camera, elapsedSeconds: number): void
  /**
   * Returns the actual wing/body intersection, or null. Transparent background
   * pixels on the rectangular card are intentionally never tappable.
   */
  hitTest(raycaster: Raycaster): Intersection | null
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
  readonly top?: number
  readonly bottom?: number
  readonly zoom?: number
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function viewportAtDistance(camera: Camera, distance: number): ButterflyViewport {
  const perspective = camera as Camera & PerspectiveCameraShape
  if (
    perspective.isPerspectiveCamera === true
    && Number.isFinite(perspective.fov)
    && Number.isFinite(perspective.aspect)
    && (perspective.fov ?? 0) > 0
    && (perspective.aspect ?? 0) > 0
  ) {
    const height = Math.max(
      0.1,
      Math.tan(((perspective.fov ?? 42) * Math.PI) / 360) * distance * 2,
    )
    return { width: height * (perspective.aspect ?? 1), height }
  }

  const orthographic = camera as Camera & OrthographicCameraShape
  if (
    orthographic.isOrthographicCamera === true
    && Number.isFinite(orthographic.left)
    && Number.isFinite(orthographic.right)
    && Number.isFinite(orthographic.top)
    && Number.isFinite(orthographic.bottom)
  ) {
    const zoom = positive(orthographic.zoom, 1)
    return {
      width: Math.max(0.1, Math.abs((orthographic.right ?? 1) - (orthographic.left ?? -1)) / zoom),
      height: Math.max(0.1, Math.abs((orthographic.top ?? 1) - (orthographic.bottom ?? -1)) / zoom),
    }
  }

  return { width: DEFAULT_HALF_VIEWPORT_WIDTH * 2, height: DEFAULT_HALF_VIEWPORT_WIDTH * 2 }
}

/**
 * Computes a subtle hover contained entirely in the left-hand flower-bed zone.
 *
 * This function has no Three.js or camera dependency, which makes the visual
 * placement contract testable: the card stays outside the centre play space,
 * inside the viewport edge, and becomes exactly still under reduced motion.
 */
export function butterflyFlowerBedPose(
  elapsedSeconds: number,
  viewport: ButterflyViewport,
  reducedMotion = false,
): ButterflyFlightPose {
  const height = Math.max(0.1, finite(viewport.height, 1))
  const width = Math.max(0.1, finite(viewport.width, 1))
  // Portrait needs a smaller card so the outer flower bed stays clear of the
  // hero. On desktop the butterfly remains intentionally small and detailed.
  const cardHeight = Math.min(height * 0.18, width * 0.16)
  const cardWidth = cardHeight * SOURCE_ASPECT
  // A butterfly that hovers inside a tenth of a card-width reads as a sticker
  // taped to the flower bed. It now wanders a real patch on a slow
  // figure-eight — but the wander is derived from the corridor left between
  // the screen edge and the centre play space, never a fixed multiple of card
  // size, so widening it can't push her across the hero at any aspect ratio.
  const edgeGutter = Math.min(width * 0.04, height * 0.035)
  const centreExclusion = width * 0.25
  const corridor = Math.max(
    0,
    width * 0.5 - centreExclusion - cardWidth - edgeGutter,
  )
  const horizontalAmplitude = reducedMotion
    ? 0
    : Math.min(cardWidth * 0.85, corridor * 0.45)
  const verticalAmplitude = reducedMotion ? 0 : cardHeight * 0.62
  const farthestCenter = Math.max(
    0,
    width * 0.5 - cardWidth * 0.5 - edgeGutter - horizontalAmplitude,
  )
  // A quarter-screen central exclusion remains clear even at narrow aspects.
  const leftFlowerBedCenter = Math.min(width * 0.37, farthestCenter)
  const time = reducedMotion ? 0 : Math.max(0, finite(elapsedSeconds, 0))
  // Two incommensurate rates keep the loop from ever visibly repeating.
  const hoverX = Math.sin(time * 0.53) * horizontalAmplitude
  const hoverY =
    (Math.sin(time * 1.06 + 0.4) * 0.6 + Math.sin(time * 0.31 + 1.1) * 0.4) *
    verticalAmplitude

  // Wingbeat: the card is a wings-open top view, so closing the wings toward
  // the camera is a horizontal squash. A shallow few percent looked painted;
  // a real swallowtail nearly disappears edge-on at the top of the stroke.
  const beat = Math.sin(time * 8.4)
  const closed = Math.pow(Math.abs(beat), 0.65)
  const flap = reducedMotion ? 1 : 1 - closed * 0.58
  // Banking into the turn, driven by the horizontal velocity of the path.
  const drift = Math.cos(time * 0.53)

  return {
    x: -leftFlowerBedCenter + hoverX,
    // This sits over the planted lower third, never in the sky or across the hero.
    y: -height * 0.31 + hoverY,
    width: cardWidth,
    height: cardHeight,
    roll: reducedMotion ? 0 : drift * 0.16 + Math.sin(time * 2.6 + 0.45) * 0.03,
    scaleX: flap,
    // A touch of lift on the upstroke stops the squash reading as a flat
    // horizontal scale.
    scaleY: reducedMotion ? 1 : 1 + closed * 0.05,
  }
}

type ButterflyPolygon = readonly (readonly [number, number])[]

/*
 * Conservative interiors of the matted subject in source-image space, measured
 * against the trimmed v2 plate (973x912).
 * The visual source has y=0 at its top, while PlaneGeometry/Raycaster UVs use
 * y=0 at the bottom, so `isButterflySubjectUv` flips y before testing.
 *
 * Keeping this data compact and conservative matters more than tracing every
 * thin antenna or tail: a child should be able to tap the wings/body, but a
 * tap on green sky around them must fall through to the real playfield.
 */
const BUTTERFLY_HIT_POLYGONS: readonly ButterflyPolygon[] = [
  // Tall upper-left forewing.
  [
    [0.064, 0.027],
    [0.261, 0.061],
    [0.466, 0.319],
    [0.537, 0.465],
    [0.387, 0.544],
    [0.143, 0.420],
  ],
  // Scalloped lower-left wing, omitting its thin tail tip.
  [
    [0.143, 0.420],
    [0.403, 0.499],
    [0.466, 0.679],
    [0.308, 0.825],
    [0.111, 0.723],
    [0.072, 0.555],
  ],
  // Broad right forewing.
  [
    [0.498, 0.443],
    [0.750, 0.409],
    [0.987, 0.465],
    [0.995, 0.611],
    [0.727, 0.712],
    [0.521, 0.645],
  ],
  // Lower wing and visible blue/orange tail markings.
  [
    [0.403, 0.622],
    [0.656, 0.679],
    [0.656, 0.813],
    [0.466, 0.937],
    [0.277, 0.836],
  ],
  // The dark body joins the four wing regions into one forgiving target.
  [
    [0.411, 0.398],
    [0.521, 0.420],
    [0.561, 0.589],
    [0.466, 0.679],
    [0.395, 0.589],
  ],
]

function isInsidePolygon(x: number, y: number, polygon: ButterflyPolygon): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [currentX, currentY] = polygon[index]!
    const [previousX, previousY] = polygon[previous]!
    const crosses = (currentY > y) !== (previousY > y)
    const intersectionX =
      ((previousX - currentX) * (y - currentY)) / (previousY - currentY || 1e-8) + currentX
    if (crosses && x < intersectionX) inside = !inside
  }
  return inside
}

/**
 * Tests a PlaneGeometry UV against the actual photographed wing/body shape.
 * This is deliberately pure so its rejection of the keyed green rectangle can
 * be covered without constructing a renderer or loading an image.
 */
export function isButterflySubjectUv(uv: ButterflyUv): boolean {
  if (!Number.isFinite(uv.x) || !Number.isFinite(uv.y) || uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) {
    return false
  }
  const sourceY = 1 - uv.y
  return BUTTERFLY_HIT_POLYGONS.some((polygon) => isInsidePolygon(uv.x, sourceY, polygon))
}

function createBrowserTextureLoader(): CinematicButterflyTextureLoader {
  // TextureLoader creates an Image only when its load method is called.
  return new TextureLoader()
}

/**
 * Creates an untextured swallowtail layer. Add `root` to the scene, call
 * `load()` in the browser, and call `update(stage.camera, elapsed)` each frame.
 */
export function createCinematicButterfly(
  options: CinematicButterflyOptions = {},
): CinematicButterfly {
  const assetUrl = options.assetUrl?.trim() || EASTERN_TIGER_SWALLOWTAIL_ASSET_URL
  const distance = positive(options.distance, DEFAULT_DISTANCE)

  const root = new Group()
  root.name = 'Cinematic Eastern tiger swallowtail layer'
  root.userData.kind = 'cinematic-butterfly'

  const hover = new Group()
  hover.name = 'Eastern tiger swallowtail hover'
  root.add(hover)

  const geometry = new PlaneGeometry(1, 1)
  // Keying in the shader cost a green rim on every antialiased wing edge and
  // still lost the antennae. The shipped plate is now a real alpha matte,
  // keyed and despilled offline, so the material is plain alpha.
  const material = new MeshBasicMaterial({
    map: null,
    transparent: true,
    alphaTest: 0.02,
    depthTest: true,
    // The butterfly must be hidden by Purple Cougar, but transparent pixels
    // must never write a rectangular occluder into the depth buffer.
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    toneMapped: false,
  })
  const image = new Mesh(geometry, material)
  image.name = 'Eastern tiger swallowtail image'
  image.visible = false
  image.frustumCulled = false
  image.castShadow = false
  image.receiveShadow = false
  hover.add(image)

  const cameraPosition = new Vector3()
  const cameraForward = new Vector3()
  const cameraQuaternion = new Quaternion()
  let ownedTexture: Texture | null = null
  let disposed = false
  let loadGeneration = 0

  function installTexture(texture: Texture, ownsTexture: boolean): void {
    const previousOwnedTexture = ownedTexture
    texture.colorSpace = SRGBColorSpace
    texture.generateMipmaps = true
    material.map = texture
    material.needsUpdate = true
    image.visible = true
    ownedTexture = ownsTexture ? texture : null

    if (previousOwnedTexture && previousOwnedTexture !== texture) previousOwnedTexture.dispose()
  }

  function setTexture(texture: Texture): void {
    if (disposed) return
    // A direct caller-provided texture always wins over an older async load.
    loadGeneration++
    installTexture(texture, false)
  }

  async function load(loader?: CinematicButterflyTextureLoader): Promise<boolean> {
    if (disposed) return false
    const generation = ++loadGeneration

    try {
      const texture = await (loader ?? createBrowserTextureLoader()).loadAsync(assetUrl)
      if (disposed || generation !== loadGeneration) {
        texture.dispose()
        return false
      }
      installTexture(texture, true)
      return true
    } catch {
      // Decorative art must never make the child's playable scene unavailable.
      return false
    }
  }

  function update(camera: Camera, elapsedSeconds: number): void {
    if (disposed) return

    camera.updateWorldMatrix(true, false)
    camera.getWorldPosition(cameraPosition)
    camera.getWorldQuaternion(cameraQuaternion)
    cameraForward.set(0, 0, -1).applyQuaternion(cameraQuaternion)
    root.position.copy(cameraPosition).addScaledVector(cameraForward, distance)
    root.quaternion.copy(cameraQuaternion)

    const pose = butterflyFlowerBedPose(
      elapsedSeconds,
      viewportAtDistance(camera, distance),
      options.reducedMotion === true,
    )
    hover.position.set(pose.x, pose.y, 0)
    hover.rotation.z = pose.roll
    image.scale.set(pose.width * pose.scaleX, pose.height * pose.scaleY, 1)
  }

  function hitTest(
    raycaster: Raycaster,
  ): Intersection | null {
    if (disposed || !image.visible || material.map === null) return null
    root.updateWorldMatrix(true, true)
    for (const intersection of raycaster.intersectObject(image, false)) {
      if (intersection.uv && isButterflySubjectUv(intersection.uv)) return intersection
    }
    return null
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    loadGeneration++
    root.removeFromParent()
    image.visible = false
    material.map = null
    geometry.dispose()
    material.dispose()
    ownedTexture?.dispose()
    ownedTexture = null
  }

  return { root, image, assetUrl, load, setTexture, update, hitTest, dispose }
}
