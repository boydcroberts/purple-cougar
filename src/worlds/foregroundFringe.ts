/**
 * Near-camera grass at the bottom corners of the frame.
 *
 * The reference photos (docs/reference/daisies-lake.jpeg) all frame the view
 * through dense planting close to the lens; the meadow had nothing in front of
 * the cougar at all, so the bottom third of the frame was empty flat green and
 * the world read as a stage rather than a place. These clumps sit just inside
 * the near field, catch the BokehPass, and give the composition a foreground
 * layer without adding anything the child has to look at or through.
 *
 * Every position here was measured with `window.__pc.project()` against the
 * runtime follow camera, not the authored one in scene.ts. Two constraints had
 * to hold at once: the clumps must land at the frame edge (|ndc x| ~0.8-0.95)
 * AND sit at radius >= 1.5 from the origin. The tethered ball never travels
 * further than CORD_LENGTH (0.62) from the cougar's ankle, so that radius keeps
 * the grass permanently out of the play space.
 *
 * Render-only: no physics, no input, no story state.
 */
import {
  ConeGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  BufferGeometry,
} from 'three'
import { makeRng } from './world'

const DEFAULT_SEED = 0x46524e47

/** Broomsedge (Andropogon virginicus) and switchgrass (Panicum virgatum) both
 *  stand exactly like this along a WNC meadow edge in late summer. */
export const foregroundPlants: ReadonlyArray<{ common: string; species: string }> = [
  { common: 'Broomsedge', species: 'Andropogon virginicus' },
  { common: 'Switchgrass', species: 'Panicum virgatum' },
]

export interface ForegroundFringe {
  readonly root: Group
  update(elapsedSeconds: number, deltaSeconds: number): void
  dispose(): void
}

export interface ForegroundFringeOptions {
  readonly seed?: number
  readonly reducedMotion?: boolean
}

interface SwayBlade {
  readonly node: Mesh
  readonly phase: number
  readonly baseTiltX: number
  readonly baseTiltZ: number
  readonly amount: number
}

/** x, z, blade count, height scale. Screen-left is SMALLER x and LARGER z here:
 *  the camera sits at (1.7, 0.95, 1.84) looking back toward the origin. */
const CLUMPS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0.75, 1.55, 46, 1.0, -1],
  [0.55, 1.46, 34, 0.82, -1],
  [0.95, 1.62, 30, 0.9, -1],
  [1.6, 0.9, 46, 1.0, 1],
  [1.62, 1.14, 34, 0.88, 1],
  [1.52, 0.68, 30, 0.84, 1],
]

/**
 * World-space direction of screen-right for the runtime follow camera, on the
 * ground plane. Derived from the camera basis rather than assumed: the camera
 * sits at (1.7, 0.95, 1.84) looking back at the origin, so screen-right is
 * NOT +x. Clumps lean along this axis, away from frame centre, which is what
 * lets the grass be tall enough to frame the shot without ever fountaining
 * across the cougar.
 */
const SCREEN_RIGHT_X = 0.75
const SCREEN_RIGHT_Z = -0.63

export function createForegroundFringe(
  options: ForegroundFringeOptions = {},
): ForegroundFringe {
  const root = new Group()
  root.name = 'Foreground fringe'
  root.userData.kind = 'foreground-fringe'

  const random = makeRng(options.seed ?? DEFAULT_SEED)
  const reducedMotion = options.reducedMotion === true

  // Foreground foliage this close to the lens is backlit by the low sun, so it
  // reads as a dark frame rather than as more bright meadow. That contrast is
  // most of what makes the layer separate from the field behind it.
  const bladeMaterials = [
    new MeshStandardMaterial({ color: 0x2d6330, roughness: 0.92, flatShading: true }),
    new MeshStandardMaterial({ color: 0x3a7a38, roughness: 0.92, flatShading: true }),
    new MeshStandardMaterial({ color: 0x4c8f3f, roughness: 0.92, flatShading: true }),
  ]
  // Thin enough that a single blade never reads as a solid triangle — the
  // clump has to carry the shape, not any one spike.
  const bladeGeometry = new ConeGeometry(0.013, 1, 3, 1)

  const swaying: SwayBlade[] = []

  for (const [x, z, count, heightScale, side] of CLUMPS) {
    const clump = new Group()
    clump.name = 'Foreground grass clump'
    clump.position.set(x, 0, z)
    root.add(clump)

    for (let blade = 0; blade < count; blade++) {
      // Kept low deliberately. Taller blades fountain across the middle of the
      // frame and cross the cougar's legs and face — the character has to stay
      // completely unobstructed, so this layer only ever dresses the corners.
      const height = (0.46 + random() * 0.38) * heightScale
      const mesh = new Mesh(bladeGeometry, bladeMaterials[blade % bladeMaterials.length]!)
      // The cone is authored 1 unit tall around its own centre, so lift it by
      // half its scaled height to stand it on the ground.
      mesh.scale.set(0.85 + random() * 0.5, height, 0.85 + random() * 0.5)
      const spreadAngle = random() * Math.PI * 2
      // Square-rooted so blades fill the disc evenly instead of bunching at the
      // centre and leaving a bare rim.
      const spread = Math.sqrt(random()) * 0.26
      mesh.position.set(
        Math.cos(spreadAngle) * spread,
        height * 0.5,
        Math.sin(spreadAngle) * spread,
      )
      // A tussock fountains: blades near the middle stand up and the outer ones
      // lean further out the further they sit from the centre. Tilting every
      // blade by the same random amount instead is what made the first pass
      // read as a handful of loose spikes stuck in the ground.
      // Lean direction is the blade's own radial offset blended with the
      // clump's screen-outward bias, so the tussock still opens naturally but
      // always away from the character rather than across her.
      const leanX = Math.cos(spreadAngle) * 0.4 + side * SCREEN_RIGHT_X * 0.9
      const leanZ = Math.sin(spreadAngle) * 0.4 + side * SCREEN_RIGHT_Z * 0.9
      const leanLength = Math.hypot(leanX, leanZ) || 1
      const lean = (spread / 0.26) * 0.5 + random() * 0.16
      // Tipping toward +z is a positive rotation about X; tipping toward +x is
      // a NEGATIVE rotation about Z. Getting these signs backwards folds the
      // clump inward on itself instead of opening it out.
      const tiltX = (leanZ / leanLength) * lean
      const tiltZ = -(leanX / leanLength) * lean
      mesh.rotation.set(tiltX, random() * Math.PI, tiltZ)
      // No shadows: at this distance a cast shadow rakes straight across the
      // play pad and reads as dirt on the grass the child is playing on.
      mesh.castShadow = false
      mesh.receiveShadow = false
      clump.add(mesh)

      swaying.push({
        node: mesh,
        phase: random() * Math.PI * 2,
        baseTiltX: tiltX,
        baseTiltZ: tiltZ,
        amount: 0.05 + random() * 0.06,
      })
    }
  }

  function update(elapsedSeconds: number): void {
    if (reducedMotion) return
    for (const blade of swaying) {
      const wave = Math.sin(elapsedSeconds * 1.15 + blade.phase)
      blade.node.rotation.x = blade.baseTiltX + wave * blade.amount
      blade.node.rotation.z = blade.baseTiltZ + Math.cos(elapsedSeconds * 0.9 + blade.phase) * blade.amount * 0.6
    }
  }

  let disposed = false
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

  return { root, update, dispose }
}
