import { describe, expect, it } from 'vitest'
import { createCougarBehavior } from '../src/cougar/behavior'
import {
  createHeroDriverQuadruped,
  deformHeroPoint,
  isHeroHitUv,
  type HeroDeformationPose,
} from '../src/cougar/heroBillboard'

const neutralPose: HeroDeformationPose = {
  breath: 0,
  headShiftX: 0,
  headLift: 0,
  headRoll: 0,
  tailSwing: 0,
  leftEarFlick: 0,
  rightEarFlick: 0,
}

describe('reference-matched hero driver', () => {
  it('does not treat transparent outer image padding as the cougar', () => {
    expect(isHeroHitUv(0.5, 0.5)).toBe(true)
    expect(isHeroHitUv(0.01, 0.5)).toBe(false)
    expect(isHeroHitUv(0.5, 0.99)).toBe(false)
    expect(isHeroHitUv(0.5, 0.01)).toBe(false)
  })

  it('preserves the quadruped rig contract without loading the 3D model', () => {
    const driver = createHeroDriverQuadruped()

    for (const name of [
      'cougar',
      'neck',
      'head',
      'legFL',
      'legFR',
      'legHL',
      'legHR',
      'tail',
      'cuffAnchor',
    ]) {
      expect(driver.root.getObjectByName(name)).toBeTruthy()
    }

    driver.syncCuff()
    expect(driver.cuffWorld.toArray().every(Number.isFinite)).toBe(true)
  })

  it('accepts the same deterministic behavior controller as the 3D rig', () => {
    const driver = createHeroDriverQuadruped()
    const behavior = createCougarBehavior(driver, {
      neckPivot: { x: 0, y: 0.62, z: 0.34 },
      tailPivot: { x: 0, y: 0.61, z: -0.75 },
    })

    behavior.react('happy', 0.8)
    behavior.update(1 / 60, { lookAt: { x: 0.4, y: 0.08, z: -0.2 } })
    driver.syncCuff()

    expect(driver.cuffWorld.toArray().every(Number.isFinite)).toBe(true)

    // The roar reaction must run on the driver rig with a finite, stable cuff.
    behavior.react('roar', 1.2)
    for (let i = 0; i < 40; i++) behavior.update(1 / 60)
    driver.syncCuff()
    expect(driver.cuffWorld.toArray().every(Number.isFinite)).toBe(true)

    behavior.dispose()
  })

  it('keeps planted paws and the painted cuff fixed during regional motion', () => {
    const pose: HeroDeformationPose = {
      ...neutralPose,
      breath: 1,
      headShiftX: 0.02,
      headLift: 0.02,
      headRoll: 0.08,
      tailSwing: 0.16,
      leftEarFlick: 0.07,
      rightEarFlick: -0.07,
    }
    const target = { x: 0, y: 0 }

    deformHeroPoint(-0.2, -0.62, 0.38, 0.08, pose, target)
    expect(target).toEqual({ x: -0.2, y: -0.62 })

    deformHeroPoint(0.41, -0.39, 0.722, 0.239, pose, target)
    expect(target).toEqual({ x: 0.41, y: -0.39 })
  })

  it('moves the head, ears, torso, and tail without producing invalid geometry', () => {
    const pose: HeroDeformationPose = {
      breath: 0.9,
      headShiftX: 0.018,
      headLift: 0.015,
      headRoll: 0.065,
      tailSwing: 0.14,
      leftEarFlick: 0.06,
      rightEarFlick: -0.05,
    }
    const samples = [
      { base: [-0.5, 0.42], uv: [0.18, 0.74] }, // face
      { base: [-0.62, 0.55], uv: [0.09, 0.84] }, // left ear
      { base: [0.12, 0.18], uv: [0.56, 0.62] }, // ribcage
      { base: [0.75, 0.02], uv: [0.94, 0.5] }, // tail tip
    ] as const
    const target = { x: 0, y: 0 }

    for (const sample of samples) {
      deformHeroPoint(
        sample.base[0],
        sample.base[1],
        sample.uv[0],
        sample.uv[1],
        pose,
        target,
      )
      expect(Number.isFinite(target.x)).toBe(true)
      expect(Number.isFinite(target.y)).toBe(true)
      expect(
        Math.hypot(target.x - sample.base[0], target.y - sample.base[1]),
      ).toBeGreaterThan(0)
    }
  })

  it('adds a lively torso, shoulder, and curled-tail pass without unplanting paws', () => {
    const pose: HeroDeformationPose = {
      ...neutralPose,
      torsoSway: 0.62,
      shoulderLift: 0.58,
      tailSwing: 0.035,
      tailCurl: -0.028,
    }
    const target = { x: 0, y: 0 }

    deformHeroPoint(0.12, 0.18, 0.56, 0.62, pose, target)
    expect(target.x).not.toBe(0.12)

    deformHeroPoint(-0.24, 0.18, 0.365, 0.59, pose, target)
    expect(target.y).not.toBe(0.18)

    deformHeroPoint(0.6, 0.02, 0.96, 0.46, pose, target)
    expect(target.x).not.toBe(0.6)
    expect(target.y).not.toBe(0.02)

    // The exact rear-cuff and planted-paw samples must never inherit the
    // added body life; that keeps the ball tether visually trustworthy.
    deformHeroPoint(0.41, -0.39, 0.722, 0.239, pose, target)
    expect(target).toEqual({ x: 0.41, y: -0.39 })
    deformHeroPoint(-0.2, -0.62, 0.38, 0.08, pose, target)
    expect(target).toEqual({ x: -0.2, y: -0.62 })
  })
})
