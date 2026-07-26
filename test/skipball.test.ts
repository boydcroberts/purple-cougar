import { describe, expect, it } from 'vitest'
import { BASE_PERIOD, TAU, THETA_PASS } from '../src/constants'
import { advance, createBall, crossedPass, timeToPass } from '../src/skipball'

describe('createBall', () => {
  it('starts at angle zero, spinning, at the base period', () => {
    const b = createBall()
    expect(b.theta).toBe(0)
    expect(b.period).toBe(BASE_PERIOD)
    expect(b.spinning).toBe(true)
  })

  it('accepts an explicit period', () => {
    expect(createBall(2).period).toBe(2)
  })
})

describe('advance', () => {
  it('sweeps a full revolution in exactly one period', () => {
    const b = createBall(2)
    const swept = advance(b, 2)
    expect(swept).toBeCloseTo(TAU, 10)
    expect(b.theta).toBeCloseTo(0, 10)
  })

  it('wraps theta into [0, TAU)', () => {
    const b = createBall(1)
    advance(b, 1.25)
    expect(b.theta).toBeGreaterThanOrEqual(0)
    expect(b.theta).toBeLessThan(TAU)
    expect(b.theta).toBeCloseTo(TAU * 0.25, 10)
  })

  it('does not move a ball that is not spinning', () => {
    const b = createBall(1)
    b.theta = 1
    b.spinning = false
    expect(advance(b, 0.5)).toBe(0)
    expect(b.theta).toBe(1)
  })
})

describe('timeToPass', () => {
  it('is zero when sitting exactly on the pass angle', () => {
    const b = createBall(1.4)
    b.theta = THETA_PASS
    expect(timeToPass(b)).toBeCloseTo(0, 10)
  })

  it('is half a period from the antipode', () => {
    const b = createBall(1.4)
    b.theta = 0
    expect(timeToPass(b)).toBeCloseTo(0.7, 10)
  })

  it('wraps forward rather than going negative', () => {
    const b = createBall(1.4)
    b.theta = THETA_PASS + 0.1
    expect(timeToPass(b)).toBeGreaterThan(0)
    expect(timeToPass(b)).toBeCloseTo(((TAU - 0.1) / TAU) * 1.4, 10)
  })

  it('is Infinity when the ball is not spinning', () => {
    const b = createBall(1.4)
    b.spinning = false
    expect(timeToPass(b)).toBe(Infinity)
  })
})

describe('crossedPass', () => {
  it('is true when the sweep reaches the pass angle', () => {
    expect(crossedPass(THETA_PASS - 0.1, 0.2)).toBe(true)
  })

  it('is false when the sweep stops short', () => {
    expect(crossedPass(THETA_PASS - 0.3, 0.2)).toBe(false)
  })

  it('does not re-trigger when starting exactly on the pass angle', () => {
    expect(crossedPass(THETA_PASS, 0.2)).toBe(false)
  })

  it('re-triggers a full revolution later', () => {
    expect(crossedPass(THETA_PASS, TAU + 0.001)).toBe(true)
  })

  it('detects a crossing that wraps through zero', () => {
    expect(crossedPass(TAU - 0.05, 0.1 + THETA_PASS)).toBe(true)
  })

  it('is false for a zero-length sweep', () => {
    expect(crossedPass(THETA_PASS - 0.1, 0)).toBe(false)
  })
})
