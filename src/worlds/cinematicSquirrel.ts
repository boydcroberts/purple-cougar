/**
 * The rare Brevard white squirrel — Purple Cougar's little co-star.
 *
 * She used to be a chroma-keyed sprite: the green key survived antialiasing as
 * a fringe around every hair, and at 16% of frame height she read as a white
 * smudge rather than a character. She is now a real alpha matte cut with
 * `tools/subject-cutout.swift`, big enough to see, and she sits with the
 * cougar between dashes instead of only streaking past.
 */
import {
  Group,
  type Intersection,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three'

const ASSET_URL = '/assets/brevard-white-squirrel-hero-v2.webp'
const SOURCE_ASPECT = 629 / 662
const DISTANCE = 29.4
const FIRST_APPEARANCE = 8
// A 1.45s dash of a 9%-of-frame sprite crossed 1280px faster than a
// three-year-old can find it. Slower and larger is the whole point of an
// easter egg you are meant to wait for.
const CROSSING_SECONDS = 2.4
const BETWEEN_APPEARANCES = 15
const TWO_PI = Math.PI * 2
/**
 * She is a co-star, so she gets real screen size — but sizing her off frame
 * height alone made her nearly as tall as the cougar in portrait, where the
 * frame is tall and the hero itself scales down. The width cap keeps her in
 * proportion to the cougar at any aspect.
 */
const SPRITE_HEIGHT_FRACTION = 0.2
const SPRITE_WIDTH_FRACTION = 0.22
/** Where she waits between dashes: just off the cougar's left shoulder. */
const COMPANION_X = -0.29
const COMPANION_Y = -0.2
/** A tap can only re-teach the species card once per dash cycle. */
const DISCOVERY_COOLDOWN = 12

export interface CinematicSquirrel {
  readonly root: Group
  /** Begin the first wildlife crossing only after world discovery is unlocked. */
  activate(elapsedSeconds: number): void
  update(camera: PerspectiveCamera, elapsedSeconds: number, reducedMotion: boolean): void
  /** True only while the small sprite is actually on screen. */
  isDashing(): boolean
  /** Force the easter egg into view for QA or a special story beat. */
  dashNow(elapsedSeconds: number): void
  /**
   * Returns a silhouette-aware ray hit only while the squirrel is on screen.
   * A plain Three mesh raycast would also hit the transparent corners of her
   * rectangular card.
   */
  hitTest(raycaster: Raycaster): Intersection<Object3D> | null
  /** Hide the current dash and wait before scheduling another surprise. */
  discover(elapsedSeconds: number): boolean
  dispose(): void
}

function loadTexture(onReady: () => void, onError: () => void): Texture {
  const texture = new TextureLoader().load(ASSET_URL, onReady, undefined, onError)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function visibleHeight(camera: PerspectiveCamera): number {
  return Math.tan((camera.fov * Math.PI) / 360) * DISTANCE * 2
}

function ellipseContains(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): boolean {
  const normalizedX = (x - centerX) / radiusX
  const normalizedY = (y - centerY) / radiusY
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1
}

/**
 * A conservative union of the matted squirrel's upright body, head, and the
 * big fluffy tail sweeping up behind her. Re-measured for the v2 plate, where
 * she sits facing left instead of leaping right. `sourceY` uses the top-left
 * source image convention while a Three UV's v coordinate is bottom-left.
 */
export function isSquirrelHitUv(u: number, v: number): boolean {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return false
  const sourceY = 1 - v
  return (
    ellipseContains(u, sourceY, 0.28, 0.55, 0.26, 0.42) ||
    ellipseContains(u, sourceY, 0.27, 0.27, 0.24, 0.22) ||
    ellipseContains(u, sourceY, 0.72, 0.42, 0.28, 0.4)
  )
}

export function createCinematicSquirrel(): CinematicSquirrel {
  const root = new Group()
  root.name = 'Brevard white squirrel easter egg'
  root.userData.kind = 'cinematic-squirrel'

  let textureReady = false
  const texture = loadTexture(
    () => {
      textureReady = true
    },
    () => {
      textureReady = false
    },
  )
  // A real matte needs no keying shader — just alpha. alphaTest clips the
  // faint matte skirt so her fur does not sit on a grey halo.
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const image = new Mesh(new PlaneGeometry(1, 1), material)
  image.name = 'White squirrel image'
  image.visible = false
  image.renderOrder = 8
  image.frustumCulled = false
  root.add(image)

  const forward = new Vector3()
  let startedAt = Number.NEGATIVE_INFINITY
  let nextAppearanceAt = Number.POSITIVE_INFINITY
  let active = false
  let dashing = false
  let disposed = false
  let pausedForReducedMotion = false
  let discoveredAt = Number.NEGATIVE_INFINITY

  /**
   * Ends a dash. She does not disappear — every direction reference has her
   * sitting right next to the cougar, so she scampers back to that spot and
   * waits there.
   */
  function settle(nextAt: number): void {
    dashing = false
    nextAppearanceAt = nextAt
  }

  function activate(elapsedSeconds: number): void {
    if (disposed || active) return
    active = true
    nextAppearanceAt = Math.max(0, elapsedSeconds) + FIRST_APPEARANCE
  }

  function dashNow(elapsedSeconds: number): void {
    if (disposed) return
    active = true
    startedAt = Math.max(0, elapsedSeconds)
    dashing = true
    image.visible = textureReady
  }

  function update(camera: PerspectiveCamera, elapsedSeconds: number, reducedMotion: boolean): void {
    if (disposed) return
    const elapsed = Math.max(0, elapsedSeconds)

    if (!active) {
      image.visible = false
      return
    }

    camera.getWorldDirection(forward)
    root.position.copy(camera.position).addScaledVector(forward, DISTANCE)
    root.quaternion.copy(camera.quaternion)

    const height = visibleHeight(camera)
    const width = height * camera.aspect
    const spriteHeight = Math.min(
      height * SPRITE_HEIGHT_FRACTION,
      width * SPRITE_WIDTH_FRACTION,
    )
    const spriteWidth = spriteHeight * SOURCE_ASPECT
    image.scale.set(spriteWidth, spriteHeight, 1)

    // Reduced motion keeps the companion, drops the movement. Vanishing her
    // would punish the setting by removing a character.
    if (reducedMotion) {
      dashing = false
      pausedForReducedMotion = true
      nextAppearanceAt = Number.POSITIVE_INFINITY
      image.position.set(width * COMPANION_X, height * COMPANION_Y, 0)
      image.rotation.z = 0
      image.visible = textureReady
      return
    }
    if (pausedForReducedMotion) {
      pausedForReducedMotion = false
      nextAppearanceAt = elapsed + FIRST_APPEARANCE
    }
    if (!dashing && elapsed >= nextAppearanceAt) dashNow(elapsed)

    if (dashing) {
      const progress = (elapsed - startedAt) / CROSSING_SECONDS
      if (progress >= 1) {
        settle(elapsed + BETWEEN_APPEARANCES)
      } else {
        // She scampers out from her waiting spot and loops back to it, so the
        // dash reads as one animal moving rather than a sprite teleporting in.
        const arc = Math.sin(progress * Math.PI)
        const x = width * (COMPANION_X - arc * 0.2)
        const hop = Math.abs(Math.sin(progress * Math.PI * 9)) * spriteHeight * 0.13
        image.position.set(x, height * COMPANION_Y + hop, 0)
        image.rotation.z = Math.sin(progress * TWO_PI * 5.5) * 0.05
        image.visible = textureReady
        return
      }
    }

    // Waiting, but never frozen: a slow breath, a drifting tail, and a little
    // double-hop every few seconds so she reads as alive next to the cougar.
    const breath = Math.sin(elapsed * 1.7) * spriteHeight * 0.011
    const hopCycle = (elapsed % 6.5) / 6.5
    const hopping = hopCycle < 0.16 ? Math.sin((hopCycle / 0.16) * Math.PI * 2) : 0
    image.position.set(
      width * COMPANION_X + hopping * spriteWidth * 0.02,
      height * COMPANION_Y + breath + Math.abs(hopping) * spriteHeight * 0.06,
      0,
    )
    image.rotation.z = Math.sin(elapsed * 0.9) * 0.018 + hopping * 0.03
    // A dash that begins before the image finishes loading is still a valid
    // timing beat, but it must never create an invisible click target.
    image.visible = textureReady
  }

  function hitTest(raycaster: Raycaster): Intersection<Object3D> | null {
    if (!textureReady || !image.visible) return null
    image.updateWorldMatrix(true, false)
    const hit = raycaster.intersectObject(image, false)[0]
    return hit?.uv && isSquirrelHitUv(hit.uv.x, hit.uv.y) ? hit : null
  }

  function discover(elapsedSeconds: number): boolean {
    if (!image.visible) return false
    const elapsed = Math.max(0, elapsedSeconds)
    // She is on screen permanently now, so the species card needs its own
    // cooldown; without it a child tapping her repeatedly would re-open the
    // same teaching card every frame.
    if (elapsed - discoveredAt < DISCOVERY_COOLDOWN) return false
    discoveredAt = elapsed
    settle(elapsed + BETWEEN_APPEARANCES)
    return true
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    root.removeFromParent()
    image.geometry.dispose()
    texture.dispose()
    material.dispose()
  }

  return { root, activate, update, isDashing: () => dashing, dashNow, hitTest, discover, dispose }
}
