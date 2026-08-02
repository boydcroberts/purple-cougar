/**
 * A rare Brevard white squirrel is the Meadow's hidden wildlife moment.
 *
 * The image generator produced a clean chroma-key source, but the shared
 * local alpha-removal helper is not available in this checkout. Keying in the
 * material keeps the original fur edge at full resolution and avoids shipping
 * another baked derivative. The card is tiny and distant, so this one shader
 * is considerably cheaper than bringing the old multi-mesh squirrel back.
 */
import {
  Color,
  Group,
  type Intersection,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three'

const ASSET_URL = '/assets/brevard-white-squirrel-chroma-v1.webp'
const SOURCE_ASPECT = 1536 / 1024
const DISTANCE = 29.4
const FIRST_APPEARANCE = 8
const CROSSING_SECONDS = 1.45
const BETWEEN_APPEARANCES = 15

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
   * Returns a silhouette-aware ray hit only while the visible squirrel can be
   * discovered. A plain Three mesh raycast would also hit its transparent
   * chroma-key rectangle.
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
 * A conservative union of the photographed squirrel's curled tail and long
 * leaping body. It deliberately rejects the keyed green margin around it.
 * `sourceY` uses the top-left source image convention while a Three UV's v
 * coordinate is bottom-left.
 */
export function isSquirrelHitUv(u: number, v: number): boolean {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return false
  const sourceY = 1 - v
  return (
    ellipseContains(u, sourceY, 0.58, 0.56, 0.4, 0.2) ||
    ellipseContains(u, sourceY, 0.3, 0.27, 0.18, 0.26)
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
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      map: { value: texture },
      // The shipped WebP border samples at #0ef712. Color converts that sRGB
      // sample into the same linear working space as the decoded texture.
      keyColor: { value: new Color(0x0ef712) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 keyColor;
      varying vec2 vUv;

      void main() {
        vec4 source = texture2D(map, vUv);
        float fromKey = distance(source.rgb, keyColor);
        float alpha = smoothstep(0.055, 0.19, fromKey);
        // Reduce the thin green fringe introduced by antialiasing against the
        // source key without bleaching the cream and white fur itself.
        vec3 despilled = vec3(
          source.r,
          min(source.g, max(source.r, source.b) * 1.08 + 0.04),
          source.b
        );
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(mix(despilled, source.rgb, alpha), source.a * alpha);
      }
    `,
  })
  const image = new Mesh(new PlaneGeometry(1, 1), material)
  image.name = 'White squirrel image'
  image.visible = false
  image.frustumCulled = false
  root.add(image)

  const forward = new Vector3()
  let startedAt = Number.NEGATIVE_INFINITY
  let nextAppearanceAt = Number.POSITIVE_INFINITY
  let active = false
  let dashing = false
  let disposed = false
  let pausedForReducedMotion = false

  function hide(nextAt: number): void {
    dashing = false
    image.visible = false
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

    if (reducedMotion) {
      if (!pausedForReducedMotion) hide(Number.POSITIVE_INFINITY)
      pausedForReducedMotion = true
      return
    }
    if (pausedForReducedMotion) {
      pausedForReducedMotion = false
      nextAppearanceAt = elapsed + FIRST_APPEARANCE
    }
    if (!dashing && elapsed >= nextAppearanceAt) dashNow(elapsed)
    if (!dashing) return

    const progress = (elapsed - startedAt) / CROSSING_SECONDS
    if (progress >= 1) {
      hide(elapsed + BETWEEN_APPEARANCES)
      return
    }

    camera.getWorldDirection(forward)
    root.position.copy(camera.position).addScaledVector(forward, DISTANCE)
    root.quaternion.copy(camera.quaternion)

    const height = visibleHeight(camera)
    const width = height * camera.aspect
    const spriteHeight = height * 0.09
    const spriteWidth = spriteHeight * SOURCE_ASPECT
    // The squirrel uses the far meadow's lower edge, so it can pass behind the
    // cougar instead of cutting across her face or the ball's action.
    const left = -width * 0.5 - spriteWidth * 0.5
    const right = width * 0.5 + spriteWidth * 0.5
    const x = left + (right - left) * progress
    const hop = Math.sin(progress * Math.PI * 6) * spriteHeight * 0.1
    const bob = Math.sin(progress * Math.PI * 12) * 0.035

    image.position.set(x, -height * 0.16 + hop, 0)
    image.scale.set(spriteWidth, spriteHeight, 1)
    image.rotation.z = bob
    // A quick squirrel dash that begins before the image finishes loading is
    // still a valid timing beat, but it must never create an invisible click
    // target. The next animation frame reveals it once the texture is ready.
    image.visible = textureReady
  }

  function hitTest(raycaster: Raycaster): Intersection<Object3D> | null {
    if (!textureReady || !dashing || !image.visible) return null
    image.updateWorldMatrix(true, false)
    const hit = raycaster.intersectObject(image, false)[0]
    return hit?.uv && isSquirrelHitUv(hit.uv.x, hit.uv.y) ? hit : null
  }

  function discover(elapsedSeconds: number): boolean {
    if (!dashing || !image.visible) return false
    hide(Math.max(0, elapsedSeconds) + BETWEEN_APPEARANCES)
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
