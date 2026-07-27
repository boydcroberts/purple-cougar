import { describe, expect, it } from 'vitest'
import { createPalette } from '../src/cougar/materials'
import { createRig } from '../src/cougar/rig'

describe('rig structure', () => {
  it('parents every joint into one root', () => {
    const rig = createRig(createPalette())
    for (const j of [rig.hips, rig.torso, rig.neck, rig.head, rig.hipR, rig.kneeR, rig.ankleR]) {
      let n: import('three').Object3D | null = j.group
      let found = false
      while (n) {
        if (n === rig.root) { found = true; break }
        n = n.parent
      }
      expect(found, `${j.group.name} must descend from root`).toBe(true)
    }
  })

  it('chains the right leg hip -> knee -> ankle -> cuff', () => {
    const rig = createRig(createPalette())
    expect(rig.kneeR.group.parent).toBe(rig.hipR.group)
    expect(rig.ankleR.group.parent).toBe(rig.kneeR.group)
    expect(rig.cuffAnchor.parent).toBe(rig.ankleR.group)
  })

  it('builds a five-segment tail chained base to tip', () => {
    const rig = createRig(createPalette())
    expect(rig.tail).toHaveLength(5)
    for (let i = 1; i < rig.tail.length; i++) {
      expect(rig.tail[i]!.group.parent).toBe(rig.tail[i - 1]!.group)
    }
  })

  it('reports the cuff world position at rest', () => {
    const rig = createRig(createPalette())
    rig.syncCuff()
    const p = rig.cuffWorld
    expect(p.x).toBeGreaterThan(0)          // right side
    expect(p.y).toBeGreaterThan(0)          // above ground
    expect(p.y).toBeLessThan(0.6)           // near the ankle, not the hip
  })

  it('keeps cuffWorld identity stable across syncs', () => {
    const rig = createRig(createPalette())
    const ref = rig.cuffWorld
    rig.syncCuff()
    rig.hipR.group.rotation.x = 0.7
    rig.syncCuff()
    expect(rig.cuffWorld).toBe(ref)
  })

  it('moves the cuff when the hip rotates', () => {
    const rig = createRig(createPalette())
    rig.syncCuff()
    const before = rig.cuffWorld.clone()
    rig.hipR.group.rotation.x = 0.9
    rig.syncCuff()
    expect(rig.cuffWorld.distanceTo(before)).toBeGreaterThan(0.1)
  })

  it('restores the rest pose', () => {
    const rig = createRig(createPalette())
    rig.syncCuff()
    const rest = rig.cuffWorld.clone()
    rig.hipR.group.rotation.x = 1.2
    rig.kneeR.group.rotation.x = -0.8
    rig.resetToRest()
    rig.syncCuff()
    expect(rig.cuffWorld.distanceTo(rest)).toBeLessThan(1e-9)
  })
})
