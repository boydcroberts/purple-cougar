import { Group, PerspectiveCamera, Raycaster, Texture, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  EASTERN_TIGER_SWALLOWTAIL_ASSET_URL,
  butterflyFlowerBedPose,
  createCinematicButterfly,
  isButterflySubjectUv,
  type CinematicButterflyTextureLoader,
} from '../src/worlds/cinematicButterfly'

function createCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 100)
  camera.position.set(2.35, 1.35, 3.05)
  camera.lookAt(0, 0.43, -0.18)
  camera.updateWorldMatrix(true, false)
  return camera
}

describe('cinematic Eastern tiger swallowtail', () => {
  it('keeps its pure flight path inside the left flower bed and out of the centre play space', () => {
    const viewport = { width: 16, height: 9 }

    for (const elapsed of [0, 0.5, 2.5, 11, 37]) {
      const pose = butterflyFlowerBedPose(elapsed, viewport)
      expect(pose.x - pose.width * 0.5).toBeGreaterThan(-viewport.width * 0.5)
      expect(pose.x + pose.width * 0.5).toBeLessThan(-viewport.width * 0.25)
      expect(pose.y).toBeLessThan(0)
    }
  })

  it('holds the exact same calm pose under reduced motion', () => {
    const viewport = { width: 16, height: 9 }

    expect(butterflyFlowerBedPose(0, viewport, true)).toEqual(
      butterflyFlowerBedPose(42, viewport, true),
    )
  })

  it('accepts only conservative wing and body UVs, never the keyed card rectangle', () => {
    // These y values use PlaneGeometry/Raycaster UV coordinates, where 1 is
    // the source image's top edge.
    expect(isButterflySubjectUv({ x: 0.33, y: 0.8 })).toBe(true)
    expect(isButterflySubjectUv({ x: 0.5, y: 0.5 })).toBe(true)
    expect(isButterflySubjectUv({ x: 0.7, y: 0.46 })).toBe(true)
    expect(isButterflySubjectUv({ x: 0.05, y: 0.95 })).toBe(false)
    expect(isButterflySubjectUv({ x: 0.95, y: 0.08 })).toBe(false)
    expect(isButterflySubjectUv({ x: Number.NaN, y: 0.5 })).toBe(false)
  })

  it('camera-locks behind the scene, permits hits only while visible, and disposes loaded art once', async () => {
    const camera = createCamera()
    const butterfly = createCinematicButterfly()
    const parent = new Group()
    parent.add(butterfly.root)

    butterfly.update(camera, 1)
    const expected = camera.position.clone()
    camera.getWorldDirection(expected.sub(camera.position)).multiplyScalar(12).add(camera.position)
    expect(butterfly.root.position.distanceTo(expected)).toBeLessThan(1e-8)

    const target = new Vector3()
    butterfly.image.getWorldPosition(target)
    const raycaster = new Raycaster(
      camera.position,
      target.sub(camera.position).normalize(),
    )
    expect(butterfly.hitTest(raycaster)).toBeNull()

    const texture = new Texture()
    const textureDispose = vi.spyOn(texture, 'dispose')
    const loader: CinematicButterflyTextureLoader = {
      loadAsync: vi.fn(async (url: string) => {
        expect(url).toBe(EASTERN_TIGER_SWALLOWTAIL_ASSET_URL)
        return texture
      }),
    }
    await expect(butterfly.load(loader)).resolves.toBe(true)
    butterfly.root.updateWorldMatrix(true, true)
    butterfly.image.getWorldPosition(target)
    raycaster.set(camera.position, target.sub(camera.position).normalize())
    expect(butterfly.hitTest(raycaster)).not.toBeNull()

    butterfly.dispose()
    butterfly.dispose()
    expect(butterfly.root.parent).toBeNull()
    expect(textureDispose).toHaveBeenCalledTimes(1)
  })
})
