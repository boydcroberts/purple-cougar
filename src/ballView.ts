/**
 * The skip-ball from the approved toy reference (PRODUCT_VISION.md): a matte
 * orange rubber ball with thin green meridian stripes, a small dark
 * knot/grommet, and a thin black floppy cord.
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
  BackSide,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { BALL_RADIUS, CORD_LENGTH } from './constants'
import type { BallPhysics, Vec3 } from './physics'

const BALL_ORANGE = '#e07a1f'
const STRIPE_GREEN = '#2e8b4a'
const CORD_BLACK = 0x232323
const KNOT_DARK = 0x2e2e2e

/** Orange with thin green meridian stripes — drawn, never loaded. */
function ballTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = BALL_ORANGE
  g.fillRect(0, 0, 512, 256)

  // Vertical lines in UV space wrap into rings around the ball. Thin, like
  // the printed lines on the real toy — not wide painted bands.
  g.strokeStyle = STRIPE_GREEN
  g.lineWidth = 18
  g.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    const x = (i / 3) * 512 + 34
    g.beginPath()
    g.moveTo(x, 0)
    // A slight lean, so they read as curving around a sphere and not as a
    // barcode wrapped onto one.
    g.lineTo(x + 28, 256)
    g.stroke()
  }

  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export interface BallView {
  group: Group
  update(ball: BallPhysics, anchor: Vec3, dt?: number): void
  setInviting(inviting: boolean): void
  celebrate(): void
}

export function createBallView(): BallView {
  const group = new Group()

  const ball = new Mesh(
    new SphereGeometry(BALL_RADIUS, 28, 20),
    // Matte rubber, not glossy plastic — but real rubber still carries a low,
    // broad sheen. A soft clearcoat keeps a live highlight moving across the
    // toy as it rolls, which matte-only shading was missing.
    new MeshPhysicalMaterial({
      map: ballTexture(),
      roughness: 0.82,
      clearcoat: 0.32,
      clearcoatRoughness: 0.58,
    }),
  )
  ball.castShadow = true
  group.add(ball)

  // A soft blob shadow pinned to the grass under the ball. The sun's shadow
  // map is tuned tight around the cougar, so a small fast-moving sphere can
  // read as floating without this cheap, always-present grounding cue.
  const contactCanvas = document.createElement('canvas')
  contactCanvas.width = 128
  contactCanvas.height = 128
  const contactContext = contactCanvas.getContext('2d')!
  const contactGradient = contactContext.createRadialGradient(64, 64, 6, 64, 64, 62)
  contactGradient.addColorStop(0, 'rgba(20, 40, 16, 0.55)')
  contactGradient.addColorStop(0.6, 'rgba(20, 40, 16, 0.28)')
  contactGradient.addColorStop(1, 'rgba(20, 40, 16, 0)')
  contactContext.fillStyle = contactGradient
  contactContext.fillRect(0, 0, 128, 128)
  const contactShadowMaterial = new MeshBasicMaterial({
    map: new CanvasTexture(contactCanvas),
    transparent: true,
    depthWrite: false,
  })
  const contactShadow = new Mesh(new CircleGeometry(BALL_RADIUS * 1.5, 24), contactShadowMaterial)
  contactShadow.rotation.x = -Math.PI / 2
  contactShadow.position.y = 0.006
  group.add(contactShadow)

  // A quiet pulse gives a non-reading child a clear, friendly invitation.
  // It is attached to the ball so it stays meaningful even when the ball is
  // rolling away from its original spot.
  const glowMaterial = new MeshStandardMaterial({
    color: 0xffed72,
    emissive: 0xffcf3f,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // Render the far side of the halo shell so the real purple ball occludes
    // its center. A front-facing translucent sphere washed the toy into a
    // giant yellow blob whenever it bounced close to the camera.
    side: BackSide,
  })
  const glow = new Mesh(new SphereGeometry(BALL_RADIUS * 1.35, 20, 14), glowMaterial)
  glow.visible = false
  ball.add(glow)

  // The knot where the cord is tied through the top of the ball.
  const knot = new Mesh(
    new SphereGeometry(BALL_RADIUS * 0.17, 10, 8),
    new MeshStandardMaterial({ color: KNOT_DARK, roughness: 0.9 }),
  )
  knot.position.y = BALL_RADIUS * 0.94
  ball.add(knot)

  // A one-pixel WebGL line vanished against the grass at desktop distance.
  // This small, preallocated hexagonal tube reads as an actual toy cord while
  // still updating in place with no frame-by-frame geometry allocation.
  const cordPoints = 25
  const cordSides = 6
  const cordRadius = 0.008
  const cordGeometry = new BufferGeometry()
  const cordCenters = new Float32Array(cordPoints * 3)
  const cordPositions = new Float32Array(cordPoints * cordSides * 3)
  const cordNormals = new Float32Array(cordPositions.length)
  const cordPositionAttribute = new Float32BufferAttribute(cordPositions, 3)
  const cordNormalAttribute = new Float32BufferAttribute(cordNormals, 3)
  // Float32BufferAttribute normalizes input by copying it, so all frame
  // updates must target the attribute-owned arrays, not the constructor inputs.
  const cordPositionData = cordPositionAttribute.array
  const cordNormalData = cordNormalAttribute.array
  cordPositionAttribute.setUsage(DynamicDrawUsage)
  cordNormalAttribute.setUsage(DynamicDrawUsage)
  cordGeometry.setAttribute('position', cordPositionAttribute)
  cordGeometry.setAttribute('normal', cordNormalAttribute)

  const cordIndices: number[] = []
  for (let point = 0; point < cordPoints - 1; point++) {
    for (let side = 0; side < cordSides; side++) {
      const nextSide = (side + 1) % cordSides
      const a = point * cordSides + side
      const b = point * cordSides + nextSide
      const c = (point + 1) * cordSides + nextSide
      const d = (point + 1) * cordSides + side
      cordIndices.push(a, b, d, b, c, d)
    }
  }
  cordGeometry.setIndex(cordIndices)

  const cord = new Mesh(
    cordGeometry,
    new MeshStandardMaterial({
      color: CORD_BLACK,
      roughness: 0.9,
      side: DoubleSide,
    }),
  )
  cord.castShadow = true
  // Bounds would otherwise need recomputing every frame for a moving tube.
  cord.frustumCulled = false
  group.add(cord)

  const from = new Vector3()
  const to = new Vector3()
  const mid = new Vector3()
  const along = new Vector3()
  const spinAxis = new Vector3()
  const up = new Vector3(0, 1, 0)
  const xAxis = new Vector3(1, 0, 0)
  const tangent = new Vector3()
  const ringSide = new Vector3()
  const ringUp = new Vector3()
  const ringNormal = new Vector3()
  const q = new Quaternion()
  let inviting = false
  let celebration = 0
  let elapsed = 0

  function update(state: BallPhysics, anchor: Vec3, dt = 1 / 60): void {
    elapsed += Math.max(0, Math.min(dt, 0.05))
    celebration = Math.max(0, celebration - dt)
    ball.position.set(state.pos.x, state.pos.y, state.pos.z)

    // Grounding blob: full strength on the grass, spreading and fading as the
    // ball climbs, gone entirely by the top of a bounce.
    contactShadow.position.x = state.pos.x
    contactShadow.position.z = state.pos.z
    const height = Math.max(0, state.pos.y - BALL_RADIUS)
    const grounded = Math.max(0, 1 - height / 1.1)
    contactShadowMaterial.opacity = grounded * grounded
    const spread = 1 + height * 0.45
    contactShadow.scale.set(spread, spread, 1)

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
    // Follow the knot as the ball rolls instead of terminating inside it.
    to.set(0, BALL_RADIUS * 0.94, 0)
      .applyQuaternion(ball.quaternion)
      .add(ball.position)
    const slack = Math.max(0, CORD_LENGTH - from.distanceTo(to))

    mid.copy(from).add(to).multiplyScalar(0.5)
    mid.y -= slack * 0.62 + 0.008
    along.copy(to).sub(from)
    // A little lateral wander, so a slack cord is not a flat 2D arc.
    mid.x += along.z * slack * 0.14
    mid.z -= along.x * slack * 0.14
    // Never let the cord sag through the grass.
    mid.y = Math.max(mid.y, cordRadius + 0.002)

    for (let i = 0; i < cordPoints; i++) {
      const t = i / (cordPoints - 1)
      const oneMinusT = 1 - t
      const offset = i * 3
      cordCenters[offset] =
        oneMinusT * oneMinusT * from.x + 2 * oneMinusT * t * mid.x + t * t * to.x
      cordCenters[offset + 1] =
        oneMinusT * oneMinusT * from.y + 2 * oneMinusT * t * mid.y + t * t * to.y
      cordCenters[offset + 2] =
        oneMinusT * oneMinusT * from.z + 2 * oneMinusT * t * mid.z + t * t * to.z
    }

    for (let point = 0; point < cordPoints; point++) {
      const before = Math.max(0, point - 1) * 3
      const after = Math.min(cordPoints - 1, point + 1) * 3
      tangent.set(
        cordCenters[after]! - cordCenters[before]!,
        cordCenters[after + 1]! - cordCenters[before + 1]!,
        cordCenters[after + 2]! - cordCenters[before + 2]!,
      )
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1)
      else tangent.normalize()
      ringSide.crossVectors(tangent, up)
      if (ringSide.lengthSq() < 1e-6) ringSide.crossVectors(tangent, xAxis)
      ringSide.normalize()
      ringUp.crossVectors(ringSide, tangent).normalize()

      const center = point * 3
      for (let side = 0; side < cordSides; side++) {
        const angle = (side / cordSides) * Math.PI * 2
        ringNormal
          .copy(ringSide)
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(ringUp, Math.sin(angle))
        const vertex = (point * cordSides + side) * 3
        cordPositionData[vertex] = cordCenters[center]! + ringNormal.x * cordRadius
        cordPositionData[vertex + 1] = cordCenters[center + 1]! + ringNormal.y * cordRadius
        cordPositionData[vertex + 2] = cordCenters[center + 2]! + ringNormal.z * cordRadius
        cordNormalData[vertex] = ringNormal.x
        cordNormalData[vertex + 1] = ringNormal.y
        cordNormalData[vertex + 2] = ringNormal.z
      }
    }
    cordPositionAttribute.needsUpdate = true
    cordNormalAttribute.needsUpdate = true

    const glowStrength = celebration > 0 ? 1 : inviting ? 0.72 : 0
    glow.visible = glowStrength > 0
    if (glow.visible) {
      const pulse = 1 + Math.sin(elapsed * 5.4) * (celebration > 0 ? 0.16 : 0.1)
      glow.scale.setScalar(pulse)
      glowMaterial.opacity =
        glowStrength * (0.08 + (Math.sin(elapsed * 5.4) + 1) * 0.025)
    }
  }

  return {
    group,
    update,
    setInviting(nextInviting) {
      inviting = nextInviting
    },
    celebrate() {
      celebration = 1.5
    },
  }
}
