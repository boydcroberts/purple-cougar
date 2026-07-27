/**
 * The visible "RAWR": three soft rings that burst from Purple Cougar's muzzle
 * and swell outward while she roars. Same visual grammar as the bell's ring
 * lines, so every big sound in the park shares one readable language.
 */
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RingGeometry,
  Vector3,
} from 'three'

const RING_COUNT = 3
const RING_LIFE = 0.9
const RING_STAGGER = 0.18

export interface RoarRings {
  group: Group
  burst(origin: Vector3): void
  update(dt: number, camera: PerspectiveCamera): void
  dispose(): void
}

export function createRoarRings(): RoarRings {
  const group = new Group()
  group.name = 'Roar rings'
  group.visible = false

  const geometry = new RingGeometry(0.15, 0.185, 28)
  const rings: { mesh: Mesh; material: MeshBasicMaterial }[] = []
  for (let ring = 0; ring < RING_COUNT; ring++) {
    const material = new MeshBasicMaterial({
      color: 0xfff0b0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    })
    const mesh = new Mesh(geometry, material)
    mesh.visible = false
    group.add(mesh)
    rings.push({ mesh, material })
  }

  let age = Number.POSITIVE_INFINITY

  return {
    group,
    burst(origin) {
      group.position.copy(origin)
      age = 0
      group.visible = true
    },
    update(dt, camera) {
      if (!group.visible) return
      age += Math.max(0, Math.min(dt, 0.05))
      // Rings always face the child, whatever the camera is doing.
      group.quaternion.copy(camera.quaternion)
      let anyAlive = false
      for (let ring = 0; ring < rings.length; ring++) {
        const { mesh, material } = rings[ring]!
        const local = age - ring * RING_STAGGER
        if (local < 0 || local > RING_LIFE) {
          mesh.visible = false
          continue
        }
        anyAlive = true
        mesh.visible = true
        const progress = local / RING_LIFE
        mesh.scale.setScalar(0.55 + progress * 2.4)
        material.opacity = Math.sin(progress * Math.PI) * 0.62
      }
      if (!anyAlive && age > RING_LIFE + RING_STAGGER * (RING_COUNT - 1)) {
        group.visible = false
      }
    },
    dispose() {
      group.removeFromParent()
      geometry.dispose()
      for (const { material } of rings) material.dispose()
    },
  }
}
