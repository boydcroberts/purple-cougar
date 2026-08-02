import { Group, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  createCinematicGardenLife,
  sampleCinematicGardenGlint,
  sampleCinematicGardenMote,
} from '../src/worlds/cinematicGardenLife'

const viewport = { width: 24, height: 13.5 }

describe('cinematic garden life', () => {
  it('keeps its outer-frame samples stable under reduced motion', () => {
    expect(sampleCinematicGardenMote(3, viewport, 1, true)).toEqual(
      sampleCinematicGardenMote(3, viewport, 99, true),
    )
    expect(sampleCinematicGardenGlint(2, viewport, 1, true)).toEqual(
      sampleCinematicGardenGlint(2, viewport, 99, true),
    )
  })

  it('keeps pollen outside the hero and ball corridor', () => {
    for (let index = 0; index < 10; index++) {
      const pose = sampleCinematicGardenMote(index, viewport, 0, true)
      expect(Math.abs(pose.x)).toBeGreaterThan(viewport.width * 0.34)
    }
  })

  it('camera-locks, responds to a brief burst, and disposes idempotently', () => {
    const life = createCinematicGardenLife()
    const parent = new Group()
    parent.add(life.root)
    const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 100)
    camera.position.set(2.35, 1.35, 3.05)
    camera.lookAt(0, 0.43, -0.18)
    camera.updateWorldMatrix(true, false)

    life.update(camera, 1)
    life.root.updateWorldMatrix(true, true)
    expect(life.root.getObjectByName('Cinematic foreground botanical frame')).toBeTruthy()
    const pollenWorld = life.pollen.getWorldPosition(new Vector3())
    const expected = new Vector3()
    const forward = new Vector3()
    camera.getWorldPosition(expected)
    camera.getWorldDirection(forward)
    expected.addScaledVector(forward, 16.5)
    expect(pollenWorld.distanceTo(expected)).toBeLessThan(1e-8)

    const beforeBurst = new Matrix4()
    life.pollen.getMatrixAt(0, beforeBurst)
    life.burst(1)
    life.update(camera, 1 + 0.39)
    const duringBurst = new Matrix4()
    life.pollen.getMatrixAt(0, duringBurst)
    expect(duringBurst.elements).not.toEqual(beforeBurst.elements)

    life.dispose()
    life.dispose()
    expect(life.root.parent).toBeNull()
  })
})
