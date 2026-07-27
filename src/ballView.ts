/**
 * The skip-ball, matched to the real toy the owner photographed: a matte
 * orange rubber ball with thin green stripes curving around it like meridians,
 * a small dark knot where the cord enters the top, and a thin black cord.
 *
 * The cord is rebuilt every frame from a curve that sags by however much slack
 * there is. A permanently straight cord is the single biggest tell that the
 * physics is fake, and the owner's photo shows the real one lying in loose
 * coils on a seat cushion.
 *
 * The ball's spin comes from its velocity — angular speed |v| / radius about
 * the axis perpendicular to travel. That is physically right, frame-rate
 * independent, and it stops dead exactly when the ball does.
 */
import {
  CanvasTexture,
  CatmullRomCurve3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three'
import { BALL_RADIUS, CORD_LENGTH } from './constants'
import type { BallPhysics, Vec3 } from './physics'

const ORANGE = '#f26a1b'
const STRIPE_GREEN = '#2f9e44'
const CORD_BLACK = 0x14140f

/** Orange with thin green meridian stripes — drawn, never loaded. */
function ballTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = ORANGE
  g.fillRect(0, 0, 512, 256)

  // Vertical lines in UV space wrap into rings around the ball. Thin, like
  // the printed lines on the real toy — not wide painted bands.
  g.strokeStyle = STRIPE_GREEN
  g.lineWidth = 11
  g.lineCap = 'round'
  for (let i = 0; i < 5; i++) {
    const x = (i / 5) * 512 + 26
    g.beginPath()
    g.moveTo(x, 0)
    // A slight lean, so they read as curving around a sphere and not as a
    // barcode wrapped onto one.
    g.lineTo(x + 34, 256)
    g.stroke()
  }

  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export interface BallView {
  group: Group
  update(ball: BallPhysics, anchor: Vec3): void
}

export function createBallView(): BallView {
  const group = new Group()

  const ball = new Mesh(
    new SphereGeometry(BALL_RADIUS, 28, 20),
    // Matte — the real ball is rubber, not glossy plastic.
    new MeshStandardMaterial({ map: ballTexture(), roughness: 0.82 }),
  )
  ball.castShadow = true
  group.add(ball)

  // The knot where the cord is tied through the top of the ball.
  const knot = new Mesh(
    new SphereGeometry(BALL_RADIUS * 0.17, 10, 8),
    new MeshStandardMaterial({ color: CORD_BLACK, roughness: 0.9 }),
  )
  knot.position.y = BALL_RADIUS * 0.94
  ball.add(knot)

  const cordMat = new MeshStandardMaterial({ color: CORD_BLACK, roughness: 0.9 })
  const cord = new Mesh(
    new TubeGeometry(
      new CatmullRomCurve3([new Vector3(), new Vector3(0, 0.1, 0)]),
      20,
      0.0055,
      6,
      false,
    ),
    cordMat,
  )
  group.add(cord)

  const from = new Vector3()
  const to = new Vector3()
  const mid = new Vector3()
  const along = new Vector3()
  const spinAxis = new Vector3()
  const up = new Vector3(0, 1, 0)
  const q = new Quaternion()

  function update(state: BallPhysics, anchor: Vec3): void {
    ball.position.set(state.pos.x, state.pos.y, state.pos.z)

    const v = Math.hypot(state.vel.x, state.vel.y, state.vel.z)
    if (v > 1e-4) {
      spinAxis.set(state.vel.x, state.vel.y, state.vel.z).normalize().cross(up)
      if (spinAxis.lengthSq() > 1e-8) {
        spinAxis.normalize()
        q.setFromAxisAngle(spinAxis, (v / BALL_RADIUS) / 60)
        ball.quaternion.premultiply(q)
      }
    }

    // --- Cord, sagging by however much slack there is.
    from.set(anchor.x, anchor.y, anchor.z)
    to.set(state.pos.x, state.pos.y, state.pos.z)
    const slack = Math.max(0, CORD_LENGTH - from.distanceTo(to))

    mid.copy(from).add(to).multiplyScalar(0.5)
    mid.y -= slack * 0.62 + 0.008
    along.copy(to).sub(from)
    // A little lateral wander, so a slack cord is not a flat 2D arc.
    mid.x += along.z * slack * 0.14
    mid.z -= along.x * slack * 0.14
    // Never let the cord sag through the grass.
    mid.y = Math.max(mid.y, 0.004)

    cord.geometry.dispose()
    cord.geometry = new TubeGeometry(
      new CatmullRomCurve3([from.clone(), mid.clone(), to.clone()]),
      20,
      0.0055,
      6,
      false,
    )
  }

  return { group, update }
}
