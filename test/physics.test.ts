import { describe, expect, it } from 'vitest'
import {
  BALL_RADIUS,
  CORD_LENGTH,
  MAX_BALL_SPEED,
  PHYS_DT,
  REST_SPEED,
} from '../src/constants'
import {
  atRest,
  cordDistance,
  cordTaut,
  createBall,
  kick,
  speed,
  stepBall,
  type BallPhysics,
  type Vec3,
} from '../src/physics'

const anchor = (x = 0.12, y = 0.1, z = -0.5): Vec3 => ({ x, y, z })

function run(b: BallPhysics, a: Vec3, steps: number): void {
  for (let i = 0; i < steps; i++) stepBall(b, a, PHYS_DT)
}

describe('resting state', () => {
  it('starts lying on the ground, not orbiting', () => {
    const b = createBall(anchor())
    expect(b.pos.y).toBeCloseTo(BALL_RADIUS, 9)
    expect(speed(b)).toBe(0)
    expect(b.onGround).toBe(true)
    expect(atRest(b)).toBe(true)
  })

  it('stays put when left alone', () => {
    const a = anchor()
    const b = createBall(a)
    const start = { ...b.pos }
    run(b, a, 600)
    expect(b.pos.x).toBeCloseTo(start.x, 6)
    expect(b.pos.z).toBeCloseTo(start.z, 6)
    expect(atRest(b)).toBe(true)
  })

  it('comes back to rest after being kicked', () => {
    const a = anchor()
    const b = createBall(a)
    kick(b, 4, 3, 2)
    expect(atRest(b)).toBe(false)
    run(b, a, 2400) // 20 seconds
    expect(atRest(b)).toBe(true)
    expect(b.pos.y).toBeCloseTo(BALL_RADIUS, 4)
  })
})

describe('the cord', () => {
  it('never lets the ball end a step beyond its length', () => {
    const a = anchor()
    const b = createBall(a)
    kick(b, 12, 9, 7)
    for (let i = 0; i < 3000; i++) {
      stepBall(b, a, PHYS_DT)
      expect(cordDistance(b, a)).toBeLessThanOrEqual(CORD_LENGTH + 1e-6)
    }
  })

  it('is slack and inert while the ball is close in', () => {
    const a = anchor(0, 2, 0)
    const b = createBall(a)
    b.pos = { x: 0, y: 1.6, z: 0 }
    b.vel = { x: 0, y: 0, z: 0 }
    expect(cordTaut(b, a)).toBe(false)
    const yBefore = b.pos.y
    stepBall(b, a, PHYS_DT)
    expect(b.pos.y).toBeLessThan(yBefore) // free fall, cord did nothing
  })

  it('goes taut when the ball is flung away', () => {
    const a = anchor()
    const b = createBall(a)
    kick(b, 10, 4, 0)
    run(b, a, 40)
    expect(cordTaut(b, a)).toBe(true)
  })
})

describe('the ground', () => {
  it('never lets the ball sink through the grass', () => {
    const a = anchor()
    const b = createBall(a)
    kick(b, 3, -12, 2)
    for (let i = 0; i < 1500; i++) {
      stepBall(b, a, PHYS_DT)
      expect(b.pos.y).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-6)
    }
  })

  it('bounces lower each time', () => {
    // Sit the ball directly under the anchor and pop it straight up, staying
    // well inside CORD_LENGTH so the cord never interferes with the arc. (A
    // first version dropped it from high above a high anchor, and the cord
    // snapped taut and held it in mid-air — it never reached the ground.)
    const a = anchor()
    const b = createBall(a)
    b.pos = { x: a.x, y: BALL_RADIUS, z: a.z }
    b.vel = { x: 0, y: 0, z: 0 }
    kick(b, 0, 3.4, 0)
    const peaks: number[] = []
    let rising = false
    let last = b.pos.y
    for (let i = 0; i < 2400; i++) {
      stepBall(b, a, PHYS_DT)
      if (b.pos.y > last) rising = true
      else if (rising) {
        peaks.push(last)
        rising = false
      }
      last = b.pos.y
    }
    expect(peaks.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]!).toBeLessThan(peaks[i - 1]!)
    }
  })
})

describe('the moving anchor drives the ball', () => {
  it('picks up speed when the cuff is swept, without any direct push', () => {
    const b = createBall(anchor())
    run(b, anchor(), 240)
    expect(atRest(b)).toBe(true)

    // Sweep the cuff in an arc, the way a paw swipe would.
    for (let i = 0; i < 90; i++) {
      const t = i / 90
      const a = anchor(0.12 + Math.sin(t * Math.PI) * 0.7, 0.1 + t * 0.25, -0.5 + Math.cos(t * Math.PI) * 0.5)
      stepBall(b, a, PHYS_DT)
    }
    expect(speed(b)).toBeGreaterThan(REST_SPEED * 4)
  })
})

describe('determinism', () => {
  it('gives an identical trajectory for identical input', () => {
    function trace(): number[] {
      const a = anchor()
      const b = createBall(a)
      kick(b, 5, 4, 3)
      const out: number[] = []
      for (let i = 0; i < 400; i++) {
        stepBall(b, a, PHYS_DT)
        out.push(b.pos.x, b.pos.y, b.pos.z)
      }
      return out
    }
    expect(trace()).toEqual(trace())
  })
})

describe('safety', () => {
  it('clamps an absurd kick', () => {
    const b = createBall(anchor())
    kick(b, 9000, 9000, 9000)
    expect(speed(b)).toBeLessThanOrEqual(MAX_BALL_SPEED + 1e-6)
  })

  it('produces no NaN when the ball sits exactly on the anchor', () => {
    const a = anchor()
    const b = createBall(a)
    b.pos = { ...a }
    b.vel = { x: 0, y: 0, z: 0 }
    stepBall(b, a, PHYS_DT)
    expect(Number.isFinite(b.pos.x)).toBe(true)
    expect(Number.isFinite(b.pos.y)).toBe(true)
    expect(Number.isFinite(b.pos.z)).toBe(true)
  })
})
