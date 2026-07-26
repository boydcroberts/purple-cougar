import {
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { BALL_Y, BALL_Y_TILT, CORD_LENGTH } from './constants'
import type { BallState } from './skipball'

const ORANGE = '#ff7a1a'
const BLUE = '#1b57d6'

// Ball roll, derived from theta (not accumulated) so it's frame-rate independent
// and freezes automatically whenever the orbit stops (tumble phase).
// Rolling-without-slipping estimate: CORD_LENGTH / ball radius = 1.15 / 0.17 ≈ 6.8
// turns per orbit, rounded to the nearest integer so the rotation is continuous
// across the theta wrap at TAU (a non-integer turn count would visibly pop there).
const SPIN_TURNS_PER_ORBIT = 7
// Secondary axis, smaller so it tumbles rather than spinning perfectly flat.
// Kept at the original brief's 3:7 ratio (0.06 : 0.14) between the two axes.
const TUMBLE_TURNS_PER_ORBIT = 3

/** Orange ball, blue stripes — drawn, not loaded. */
function stripedTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = ORANGE
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = BLUE
  for (let i = 0; i < 4; i++) g.fillRect(0, i * 64 + 22, 256, 18)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export interface BallView {
  group: Group
  update(ball: BallState, ankle: Vector3): void
}

export function createBallView(): BallView {
  const group = new Group()

  const ball = new Mesh(
    new SphereGeometry(0.17, 24, 18),
    new MeshStandardMaterial({ map: stripedTexture(), roughness: 0.6 }),
  )
  ball.castShadow = true
  group.add(ball)

  // Unit-height cylinder along +Y, scaled and aimed at the ball each frame.
  const cord = new Mesh(
    new CylinderGeometry(0.012, 0.012, 1, 6),
    new MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9 }),
  )
  cord.geometry.translate(0, 0.5, 0)
  group.add(cord)

  const ballPos = new Vector3()
  const dir = new Vector3()
  const up = new Vector3(0, 1, 0)

  function update(state: BallState, ankle: Vector3): void {
    ballPos.set(
      ankle.x + Math.cos(state.theta) * CORD_LENGTH,
      BALL_Y + Math.sin(state.theta) * BALL_Y_TILT,
      ankle.z + Math.sin(state.theta) * CORD_LENGTH,
    )
    ball.position.copy(ballPos)
    ball.rotation.z = -state.theta * SPIN_TURNS_PER_ORBIT
    ball.rotation.x = -state.theta * TUMBLE_TURNS_PER_ORBIT

    cord.position.copy(ankle)
    dir.copy(ballPos).sub(ankle)
    cord.scale.set(1, dir.length(), 1)
    cord.quaternion.setFromUnitVectors(up, dir.normalize())
  }

  return { group, update }
}
