/**
 * The high-fidelity environment layer for the desktop Meadow.
 *
 * Purple Cougar already proves that an authored 2.5D asset can look more
 * convincing than a pile of procedural primitives at this camera distance.
 * This card uses the same idea for the Blue Ridge garden, lake, and mountains:
 * one coherent, original plate behind the real interactive cougar and ball.
 * It is camera-locked so the low, child-friendly follow camera never exposes a
 * card edge during a ball reaction or a QA azimuth change.
 */
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import type { Texture } from 'three'

export const BLUE_RIDGE_GARDEN_ASSET_URL = '/assets/blue-ridge-garden-railway-v2.webp'
/** The lower (near-camera) railhead in the authored 16:9 garden plate. */
export const GARDEN_RAIL_HEAD_SOURCE_Y = 0.545
const ASSET_ASPECT = 1672 / 941
/** Camera-space depth of the composed garden plate. */
export const CINEMATIC_ENVIRONMENT_DISTANCE = 30
const OVERSCAN = 1.08
const PLATE_FADE_SECONDS = 0.18

export interface CinematicEnvironment {
  readonly root: Group
  /** The plate stays hidden until its image texture has loaded successfully. */
  readonly plate: Mesh<PlaneGeometry, MeshBasicMaterial>
  /**
   * Load the scenic plate without ever blanking the procedural fallback.
   * `false` leaves the plate hidden, so the rest of the game remains playable.
   */
  load(loader?: CinematicEnvironmentTextureLoader): Promise<boolean>
  /** Keep the scenic card correctly framed behind the perspective camera. */
  update(camera: PerspectiveCamera, elapsedSeconds: number, reducedMotion?: boolean): void
  /** True only after the authored plate is fully visible over its fallback. */
  isFullyVisible(): boolean
  /** Release GPU resources created by this layer. */
  dispose(): void
}

export interface CinematicPlateSize {
  readonly width: number
  readonly height: number
}

/** A tiny loader boundary keeps load/failure behaviour deterministic in tests. */
export interface CinematicEnvironmentTextureLoader {
  loadAsync(url: string): Promise<Texture>
}

/**
 * Size a 16:9 authored card to cover any game viewport. Exported so its
 * desktop and portrait framing contract can be tested without WebGL.
 */
export function fitCinematicPlate(
  verticalFovDegrees: number,
  viewportAspect: number,
  distance = CINEMATIC_ENVIRONMENT_DISTANCE,
): CinematicPlateSize {
  const safeFov = Math.min(100, Math.max(1, verticalFovDegrees))
  const safeAspect = Math.max(0.1, viewportAspect)
  const safeDistance = Math.max(0.1, distance)
  const viewportHeight = Math.tan((safeFov * Math.PI) / 360) * safeDistance * 2
  const viewportWidth = viewportHeight * safeAspect
  const height = Math.max(viewportHeight, viewportWidth / ASSET_ASPECT) * OVERSCAN
  return { width: height * ASSET_ASPECT, height }
}

/**
 * Camera-local height of the photographed near railhead. Keeping this
 * calculation next to the fitted plate prevents the moving train from
 * detaching at 4:3 or ultrawide desktop aspect ratios.
 */
export function cinematicGardenRailHeadY(
  verticalFovDegrees: number,
  viewportAspect: number,
): number {
  const plate = fitCinematicPlate(verticalFovDegrees, viewportAspect)
  return (0.5 - GARDEN_RAIL_HEAD_SOURCE_Y) * plate.height
}

function createBrowserTextureLoader(): CinematicEnvironmentTextureLoader {
  return new TextureLoader()
}

export function createCinematicEnvironment(): CinematicEnvironment {
  const root = new Group()
  root.name = 'Cinematic Blue Ridge Garden Railway and Lake'
  root.userData.kind = 'cinematic-environment'

  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  })
  const plate = new Mesh(new PlaneGeometry(1, 1), material)
  plate.name = 'Hyper-realistic Blue Ridge garden railway plate'
  // A textureless opaque card would render as a black full-screen rectangle.
  // Keep the procedural sky and meadow visible until the authored plate is
  // genuinely ready, and leave them intact if the image ever fails to load.
  plate.visible = false
  plate.frustumCulled = false
  // The background is deliberately behind every live actor, but should render
  // before the cougar's transparent fur card and the ball's contact shadow.
  plate.renderOrder = -100
  root.add(plate)

  const cameraDirection = new Vector3()
  let ownedTexture: Texture | null = null
  let disposed = false
  let loadGeneration = 0
  let revealStartedAt: number | null = null
  let fullyVisible = false

  function installTexture(texture: Texture): void {
    const previousTexture = ownedTexture
    texture.colorSpace = SRGBColorSpace
    // The source plate is already lit and graded. A material-only render keeps
    // its garden colours stable beneath the game's key/fill/rim light rig.
    texture.generateMipmaps = true
    material.map = texture
    material.needsUpdate = true
    material.opacity = 0
    plate.visible = true
    ownedTexture = texture
    revealStartedAt = null
    fullyVisible = false
    if (previousTexture && previousTexture !== texture) previousTexture.dispose()
  }

  async function load(loader?: CinematicEnvironmentTextureLoader): Promise<boolean> {
    if (disposed) return false
    const generation = ++loadGeneration
    try {
      const texture = await (loader ?? createBrowserTextureLoader()).loadAsync(
        BLUE_RIDGE_GARDEN_ASSET_URL,
      )
      if (disposed || generation !== loadGeneration) {
        texture.dispose()
        return false
      }
      installTexture(texture)
      return true
    } catch {
      // This plate is presentation enhancement, never a dependency for play.
      return false
    }
  }

  function update(
    camera: PerspectiveCamera,
    elapsedSeconds: number,
    reducedMotion = false,
  ): void {
    if (disposed) return
    camera.getWorldDirection(cameraDirection)
    root.position
      .copy(camera.position)
      .addScaledVector(cameraDirection, CINEMATIC_ENVIRONMENT_DISTANCE)
    root.quaternion.copy(camera.quaternion)

    const size = fitCinematicPlate(camera.fov, camera.aspect)
    plate.scale.set(size.width, size.height, 1)

    if (plate.visible && material.map && !fullyVisible) {
      const elapsed = Math.max(0, elapsedSeconds)
      if (revealStartedAt === null) revealStartedAt = elapsed
      const duration = reducedMotion ? 0 : PLATE_FADE_SECONDS
      const progress = duration === 0 ? 1 : Math.min(1, (elapsed - revealStartedAt) / duration)
      // Smoothstep avoids a visible first-frame pop without making the world
      // feel like a separate UI transition.
      material.opacity = progress * progress * (3 - 2 * progress)
      fullyVisible = progress >= 1
    }

    // A nearly imperceptible breathing shift prevents the horizon from feeling
    // like a pasted browser wallpaper while avoiding any camera shake. The
    // movement stays below a pixel at normal desktop scale and is disabled by
    // reduced-motion at the caller level by simply holding elapsed at zero.
    plate.position.y = reducedMotion ? 0 : Math.sin(Math.max(0, elapsedSeconds) * 0.07) * 0.012
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    loadGeneration += 1
    root.removeFromParent()
    plate.visible = false
    plate.geometry.dispose()
    material.map = null
    material.dispose()
    ownedTexture?.dispose()
    ownedTexture = null
  }

  return { root, plate, load, update, isFullyVisible: () => fullyVisible, dispose }
}
