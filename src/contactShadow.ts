import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'

/**
 * Once the authored cinematic plate fades in, `scene.ts` hides the 60x60
 * ground, so the sun's shadow map has no receiver left and these painted blobs
 * become the ONLY thing grounding an actor.
 *
 * Casting a real shadow instead is not an option here: the hero is an
 * alpha-cut `MeshBasicMaterial` billboard with every rig mesh underneath
 * force-hidden, and `scene.ts`'s key light sits on the camera side (+X, +Z)
 * while the plate is lit from behind — a real shadow map would fall the wrong
 * way. Every constant below was measured against a 1280x800 capture.
 */

/**
 * Measured from the plate: the sun burns through the ridge at frame RIGHT and
 * low, and the near foreground rocks are dark on their camera-left faces. So
 * the cast throws screen-LEFT and slightly toward the viewer. Given in world
 * space for the resting follow camera near (1.7, 1.35, 1.84) looking at
 * (0, 0.52, -0.18), for which screen-right is world (-0.77, 0, 0.64).
 */
export const SHADOW_SUN_OFFSET = { x: 0.77, z: -0.64 } as const

/**
 * A lawn shadow is a deep desaturated green — never neutral grey, and never
 * the violet the hero's old blob used, which mud-shifted the grass around her.
 */
const SHADOW_RGB = '24, 36, 18'

/** Canvas u of the contact core; the throw lobe trails away toward +u. */
const CORE_U = 0.42
const THROW_U = 0.66

export interface ContactShadowOptions {
  /** Footprint along the throw direction, in world units. */
  readonly length: number
  /** Footprint across the throw direction, in world units. */
  readonly width: number
  /** Darkness of the contact core, 0..1. */
  readonly strength: number
}

export interface ContactShadow {
  readonly mesh: Mesh
  readonly material: MeshBasicMaterial
  /** Slide the blob so its contact core sits at an actor's ground point. */
  setGroundPosition(x: number, z: number): void
  dispose(): void
}

function lobe(
  context: CanvasRenderingContext2D,
  centerU: number,
  radius: number,
  flatten: number,
  peakAlpha: number,
): void {
  context.save()
  context.translate(centerU * 256, 128)
  context.scale(1, flatten)
  const gradient = context.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius)
  gradient.addColorStop(0, `rgba(${SHADOW_RGB}, ${peakAlpha})`)
  gradient.addColorStop(0.4, `rgba(${SHADOW_RGB}, ${peakAlpha * 0.72})`)
  gradient.addColorStop(0.74, `rgba(${SHADOW_RGB}, ${peakAlpha * 0.26})`)
  gradient.addColorStop(1, `rgba(${SHADOW_RGB}, 0)`)
  context.fillStyle = gradient
  context.fillRect(-radius, -radius, radius * 2, radius * 2)
  context.restore()
}

function shadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create a contact shadow texture')

  // Two lobes, not one. A single radial falloff reads as an airbrushed dot; a
  // real low-sun cast is a tight, near-opaque core where the actor touches
  // plus a long soft throw away from the light. Where they overlap the density
  // accumulates, which is exactly what the contact point needs.
  lobe(context, CORE_U, 78, 0.52, 1)
  lobe(context, THROW_U, 108, 0.6, 0.55)

  const texture = new CanvasTexture(canvas)
  // Authored as sRGB values. Left linear, the blend maths washed the blob out
  // to the point of invisibility against the plate's sunlit lawn.
  texture.colorSpace = SRGBColorSpace
  return texture
}

export function createContactShadow(options: ContactShadowOptions): ContactShadow {
  const texture = shadowTexture()
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: options.strength,
    // Writing depth let the hero's blob silently occlude the ball's blob and
    // any garden mote sorted behind it.
    depthWrite: false,
    toneMapped: false,
  })

  const mesh = new Mesh(new PlaneGeometry(options.length, options.width), material)
  mesh.name = 'contactShadow'
  mesh.rotation.x = -Math.PI / 2
  // Aim the long axis down the throw direction. After the -90deg X rotation the
  // plane's local +X still maps to world +X, so a plain Z spin orients it.
  mesh.rotation.z = Math.atan2(SHADOW_SUN_OFFSET.z, SHADOW_SUN_OFFSET.x)
  // Just clear of y=0 so it never z-fights whatever ground is showing.
  mesh.position.y = 0.006
  mesh.renderOrder = 0

  // The core sits off-centre in the texture, so the mesh has to slide back by
  // the same amount for the core to land on the actor's feet rather than
  // beside them.
  const coreShift = (0.5 - CORE_U) * options.length
  const coreX = Math.cos(mesh.rotation.z) * coreShift
  const coreZ = Math.sin(mesh.rotation.z) * coreShift

  return {
    mesh,
    material,
    setGroundPosition(x, z) {
      mesh.position.x = x + coreX
      mesh.position.z = z + coreZ
    },
    dispose() {
      mesh.geometry.dispose()
      material.map?.dispose()
      material.dispose()
    },
  }
}
