/**
 * The ball: a tethered particle with real physics.
 *
 * Nothing here scripts a path. The ball falls, drags, bounces, rolls, and is
 * yanked around by a cord whose far end is the cougar's cuffed paw. At rest it
 * simply lies on the ground — an orbit is something that HAPPENS when it has
 * energy, never a state it is placed into.
 *
 * Position-based dynamics: predict a position from velocity, solve the cord
 * and ground constraints against that position, then derive the new velocity
 * from how far the position actually moved. That last step is what transfers
 * a moving anchor's motion into the ball, which is how a real skip-ball is
 * driven — by the leg, through the cord.
 *
 * Pure: no three.js, no DOM, no randomness. Runs in bare node under vitest.
 */
import {
  AIR_DRAG,
  CONSTRAINT_ITERATIONS,
  BALL_RADIUS,
  CORD_LENGTH,
  GRAVITY,
  GROUND_FRICTION,
  GROUND_RESTITUTION,
  MAX_BALL_SPEED,
  REST_SPEED,
  ROLL_FRICTION,
} from './constants'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface BallPhysics {
  pos: Vec3
  vel: Vec3
  /** True while the ball is touching the ground this step. */
  onGround: boolean
}

/** Ball starts lying on the grass, at rest, below and behind the anchor. */
export function createBall(anchor: Vec3): BallPhysics {
  return {
    pos: { x: anchor.x - 0.35, y: BALL_RADIUS, z: anchor.z + 0.5 },
    vel: { x: 0, y: 0, z: 0 },
    onGround: true,
  }
}

export function speed(b: BallPhysics): number {
  return Math.hypot(b.vel.x, b.vel.y, b.vel.z)
}

export function cordDistance(b: BallPhysics, anchor: Vec3): number {
  return Math.hypot(b.pos.x - anchor.x, b.pos.y - anchor.y, b.pos.z - anchor.z)
}

export function cordTaut(b: BallPhysics, anchor: Vec3): boolean {
  return cordDistance(b, anchor) >= CORD_LENGTH - 1e-6
}

/** True once the ball has essentially stopped and is lying on the ground. */
export function atRest(b: BallPhysics): boolean {
  return b.onGround && speed(b) < REST_SPEED
}

function clampSpeed(b: BallPhysics): void {
  const s = speed(b)
  if (s > MAX_BALL_SPEED) {
    const k = MAX_BALL_SPEED / s
    b.vel.x *= k
    b.vel.y *= k
    b.vel.z *= k
  }
}

/** An impulse — a kick, a bat, a fling. The only direct push the ball ever gets. */
export function kick(b: BallPhysics, vx: number, vy: number, vz: number): void {
  b.vel.x += vx
  b.vel.y += vy
  b.vel.z += vz
  clampSpeed(b)
}

/** Pull the position back onto the cord sphere. Slack does nothing at all. */
function solveCord(pos: Vec3, anchor: Vec3): void {
  const dx = pos.x - anchor.x
  const dy = pos.y - anchor.y
  const dz = pos.z - anchor.z
  const d = Math.hypot(dx, dy, dz)
  if (d <= CORD_LENGTH || d < 1e-9) return
  const k = CORD_LENGTH / d
  pos.x = anchor.x + dx * k
  pos.y = anchor.y + dy * k
  pos.z = anchor.z + dz * k
}

/** Keep the ball on top of the grass. Returns whether it was clamped. */
function solveGround(pos: Vec3): boolean {
  if (pos.y >= BALL_RADIUS) return false
  pos.y = BALL_RADIUS
  return true
}

/**
 * One FIXED step. Callers must not vary dt — a constraint solver stepped at a
 * variable rate is not reproducible, and both the tests and screenshot QA
 * depend on identical input producing an identical trajectory.
 */
export function stepBall(b: BallPhysics, anchor: Vec3, dt: number): void {
  const px = b.pos.x
  const py = b.pos.y
  const pz = b.pos.z

  b.vel.y -= GRAVITY * dt

  // Exponential drag, so the decay rate does not depend on the timestep.
  const drag = Math.exp(-AIR_DRAG * dt)
  b.vel.x *= drag
  b.vel.y *= drag
  b.vel.z *= drag

  // Remember the approach velocity BEFORE the position solve. The ground
  // clamp cancels downward motion, and the PBD velocity update below then
  // reads back a non-negative vy — so a restitution test applied afterwards
  // never fires and the ball lands stone dead with no bounce. The impact
  // speed has to be sampled here, while it still exists.
  const approachY = b.vel.y

  b.pos.x += b.vel.x * dt
  b.pos.y += b.vel.y * dt
  b.pos.z += b.vel.z * dt

  // Solve both constraints together, iteratively. Solving them once in
  // sequence is not enough: the ground clamp pushes the ball up, which can
  // shove it back outside the cord sphere, so it ends the step over-extended.
  // That happens constantly in the common case of the ball dragging along the
  // grass on a taut cord. A few relaxation passes converge to satisfying both.
  let hit = false
  for (let i = 0; i < CONSTRAINT_ITERATIONS; i++) {
    solveCord(b.pos, anchor)
    if (solveGround(b.pos)) hit = true
  }
  // The cord is the harder constraint of the two — a ball visibly hanging off
  // the end of an over-long cord reads worse than one grazing the grass.
  solveCord(b.pos, anchor)

  // Velocity from the corrected position. THIS is the line that lets a moving
  // cuff drag the ball around; without it the cord would only ever stop the
  // ball, never carry it.
  b.vel.x = (b.pos.x - px) / dt
  b.vel.y = (b.pos.y - py) / dt
  b.vel.z = (b.pos.z - pz) / dt

  b.onGround = hit
  if (hit) {
    b.vel.y = approachY < 0 ? -approachY * GROUND_RESTITUTION : Math.max(0, b.vel.y)
    // Rolling resistance is gentler than a skid, so a ball that has settled
    // trundles a little before stopping instead of sticking on contact.
    const rolling = Math.abs(approachY) < 0.6
    const f = Math.exp(-(rolling ? ROLL_FRICTION : GROUND_FRICTION) * dt)
    b.vel.x *= f
    b.vel.z *= f
    // Kill the last dribble of motion so it comes to a definite rest rather
    // than creeping forever.
    if (rolling && Math.hypot(b.vel.x, b.vel.z) < REST_SPEED * 0.5) {
      b.vel.x = 0
      b.vel.z = 0
      b.vel.y = 0
    }
  }

  clampSpeed(b)
}
