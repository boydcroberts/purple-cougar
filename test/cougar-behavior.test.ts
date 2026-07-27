import { Group, Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createCougarBehavior } from '../src/cougar/behavior'
import type { Quadruped } from '../src/cougar/quadruped'

function createTestQuadruped(): Quadruped {
  const root = new Group()
  const neck = new Group()
  const head = new Group()
  const tail = new Group()
  const legFL = new Group()
  const legFR = new Group()
  const legHL = new Group()
  const legHR = new Group()
  const cuffAnchor = new Object3D()
  const cuffWorld = new Vector3()

  neck.position.set(0, -0.74, -0.46)
  head.position.set(0, 0.87, 0.8)
  tail.position.set(0, -0.62, 0.74)
  cuffAnchor.position.set(0.12, 0.1, -0.46)

  // Matches the controller's small, structural ear probe without bringing
  // procedural geometry into this headless test.
  for (const side of [-1, 1]) {
    const ear = new Group()
    ear.position.set(side * 0.072, 0.088, -0.012)
    ear.add(new Object3D(), new Object3D())
    head.add(ear)
  }

  legHR.add(cuffAnchor)
  neck.add(head)
  root.add(neck, tail, legFL, legFR, legHL, legHR)

  return {
    root,
    legFL,
    legFR,
    legHL,
    legHR,
    neck,
    head,
    tail,
    cuffAnchor,
    cuffWorld,
    syncCuff() {
      root.updateMatrixWorld(true)
      cuffWorld.setFromMatrixPosition(cuffAnchor.matrixWorld)
    },
  }
}

describe('cougar behavior', () => {
  it('preserves the existing rest pose while installing and removing motion layers', () => {
    const cougar = createTestQuadruped()
    cougar.root.updateMatrixWorld(true)
    const headBefore = cougar.head.getWorldPosition(new Vector3())
    const tailBefore = cougar.tail.getWorldPosition(new Vector3())

    const behavior = createCougarBehavior(cougar)
    cougar.root.updateMatrixWorld(true)

    expect(cougar.head.getWorldPosition(new Vector3()).distanceTo(headBefore)).toBeLessThan(1e-8)
    expect(cougar.tail.getWorldPosition(new Vector3()).distanceTo(tailBefore)).toBeLessThan(1e-8)

    behavior.dispose()
    expect(cougar.head.parent).toBe(cougar.neck)
    expect(cougar.tail.parent).toBe(cougar.root)
  })

  it('smoothly tracks a ball target and accepts reactions', () => {
    const cougar = createTestQuadruped()
    const behavior = createCougarBehavior(cougar, { initialMood: 'curious' })

    behavior.update(0.1, { lookAt: { x: 4, y: 0.2, z: 3 } })
    behavior.react('happy')
    behavior.update(0.12)

    expect(behavior.mood).toBe('curious')
    expect(cougar.head.parent?.rotation.y ?? 0).toBeGreaterThan(0)
    expect(Math.abs(cougar.tail.parent?.rotation.y ?? 0)).toBeGreaterThan(0.01)
  })

  it('roars: chin sweeps up, tail rises, and the pose fully releases after', () => {
    const cougar = createTestQuadruped()
    const behavior = createCougarBehavior(cougar)

    behavior.react('roar', 1.2)
    // Step to mid-roar, where the sin envelope peaks.
    for (let i = 0; i < 35; i++) behavior.update(1 / 60)

    // Chin up = negative head pitch on the neck pivot; tail pitched upward.
    expect(cougar.head.parent?.rotation.x ?? 0).toBeLessThan(-0.01)
    expect(cougar.tail.parent?.rotation.x ?? 0).toBeGreaterThan(0.01)

    // Run well past the 1.15s duration: the reaction must fully clear.
    for (let i = 0; i < 90; i++) behavior.update(1 / 60)
    expect(Math.abs(cougar.head.parent?.rotation.x ?? 0)).toBeLessThan(0.05)

    behavior.dispose()
  })

  it('rejects unknown reactions including near-misses of roar', () => {
    const cougar = createTestQuadruped()
    const behavior = createCougarBehavior(cougar)
    expect(() => behavior.react('ROAR' as never)).toThrow(RangeError)
    behavior.dispose()
  })
})
