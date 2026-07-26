import { BASE_PERIOD, TAU, THETA_PASS } from './constants'

export interface BallState {
  /** Orbit angle in radians, always normalized to [0, TAU). */
  theta: number
  /** Seconds per revolution. */
  period: number
  /** False while he's face-down and the ball is lying still. */
  spinning: boolean
}

export function createBall(period: number = BASE_PERIOD): BallState {
  return { theta: 0, period, spinning: true }
}

/** Positive modulo — JS `%` keeps the sign of the dividend, which breaks wrapping. */
function wrap(v: number): number {
  return ((v % TAU) + TAU) % TAU
}

/**
 * Advance the orbit by `dt` seconds.
 * Mutates `b.theta`. Returns the arc swept, in radians (0 if not spinning).
 */
export function advance(b: BallState, dt: number): number {
  if (!b.spinning) return 0
  const swept = (TAU * dt) / b.period
  b.theta = wrap(b.theta + swept)
  return swept
}

/** Seconds until the cord next sweeps over the free foot. Infinity if stopped. */
export function timeToPass(b: BallState): number {
  if (!b.spinning) return Infinity
  const delta = wrap(THETA_PASS - b.theta)
  return (delta / TAU) * b.period
}

/**
 * Did an arc starting at `before` and sweeping `sweep` radians pass the free foot?
 *
 * Starting exactly on THETA_PASS does NOT count as an immediate crossing —
 * otherwise a bonk would re-fire on the frame after it resolved. A full
 * revolution from that position does count.
 */
export function crossedPass(before: number, sweep: number): boolean {
  if (sweep <= 0) return false
  let delta = wrap(THETA_PASS - before)
  if (delta === 0) delta = TAU
  return delta <= sweep
}
