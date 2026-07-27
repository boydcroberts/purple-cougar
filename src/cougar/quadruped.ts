/**
 * Purple Cougar's stylized cinematic hero model.
 *
 * The silhouette follows the supplied standing reference: a long athletic
 * torso, powerful haunches, straight forelegs, feline rear hocks, broad paws,
 * an expressive rounded head, and a long tail with an upturned tip.
 * Local space is +Z forward, +Y up, +X her right.
 */
import {
  type BufferGeometry,
  CircleGeometry,
  Group,
  Mesh,
  type Material,
  type MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three'
import { blob, loft } from './loft'
import type { Palette } from './materials'

const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z)

export interface Quadruped {
  root: Object3D
  /**
   * Rig nodes are Object3D rather than Group because glTF empty transforms
   * load as plain Object3D instances. The procedural model still supplies
   * Groups, which are fully compatible with this contract.
   */
  legFL: Object3D
  legFR: Object3D
  legHL: Object3D
  legHR: Object3D
  neck: Object3D
  head: Object3D
  tail: Object3D
  cuffAnchor: Object3D
  cuffWorld: Vector3
  syncCuff(): void
}

function heroMesh(geometry: BufferGeometry, material: Material): Mesh {
  const result = new Mesh(geometry, material)
  result.castShadow = true
  result.receiveShadow = true
  return result
}

function buildLimb(
  points: Vector3[],
  profile: number[],
  material: MeshStandardMaterial,
): Group {
  const limb = new Group()
  limb.add(
    heroMesh(
      loft({
        path: points,
        profile,
        segments: 42,
        radial: 18,
        flatten: 1.04,
        squash: 0.95,
      }),
      material,
    ),
  )
  return limb
}

function buildPaw(
  material: MeshStandardMaterial,
  dark: MeshStandardMaterial,
  scale = 1,
): Group {
  const paw = new Group()

  const top = heroMesh(
    loft({
      path: [
        V(0, 0.018 * scale, -0.052 * scale),
        V(0, 0.025 * scale, 0.015 * scale),
        V(0, 0.014 * scale, 0.096 * scale),
      ],
      profile: [0.048 * scale, 0.082 * scale, 0.056 * scale],
      segments: 22,
      radial: 16,
      capStart: true,
      capEnd: true,
      flatten: 1.14,
      squash: 0.62,
    }),
    material,
  )
  paw.add(top)

  for (const x of [-0.04, -0.014, 0.014, 0.04]) {
    const toe = heroMesh(
      blob(0.02 * scale, 0.016 * scale, 0.027 * scale),
      material,
    )
    toe.position.set(x * scale, -0.002 * scale, 0.079 * scale)
    paw.add(toe)
  }

  const pad = heroMesh(
    blob(0.047 * scale, 0.009 * scale, 0.054 * scale),
    dark,
  )
  pad.position.set(0, -0.031 * scale, 0.022 * scale)
  paw.add(pad)

  return paw
}

function buildEar(side: number, palette: Palette): Group {
  const ear = new Group()
  ear.name = side < 0 ? 'leftEar' : 'rightEar'
  ear.position.set(side * 0.136, 0.132, -0.025)
  ear.rotation.z = -side * 0.2
  ear.rotation.x = -0.08

  const outer = heroMesh(
    loft({
      path: [
        V(0, -0.022, 0),
        V(side * 0.002, 0.012, 0.003),
        V(side * 0.006, 0.05, 0.001),
        V(side * 0.01, 0.085, -0.005),
        V(side * 0.012, 0.112, -0.01),
      ],
      profile: [0.057, 0.062, 0.052, 0.034, 0.01],
      segments: 28,
      radial: 18,
      capEnd: true,
      flatten: 0.52,
      squash: 1,
    }),
    palette.fur,
  )
  ear.add(outer)

  const inner = heroMesh(
    loft({
      path: [
        V(0, -0.004, 0.03),
        V(side * 0.002, 0.025, 0.032),
        V(side * 0.005, 0.058, 0.027),
        V(side * 0.007, 0.085, 0.018),
      ],
      profile: [0.036, 0.038, 0.026, 0.004],
      segments: 22,
      radial: 16,
      capEnd: true,
      flatten: 0.24,
      squash: 1,
    }),
    palette.earInner,
  )
  ear.add(inner)
  return ear
}

function buildEye(side: number, palette: Palette): Group {
  const eye = new Group()
  eye.name = side < 0 ? 'leftEye' : 'rightEye'
  eye.position.set(side * 0.073, 0.038, 0.19)

  const outline = heroMesh(new CircleGeometry(0.046, 28), palette.furDark)
  outline.scale.set(0.91, 1.08, 1)
  eye.add(outline)

  const sclera = heroMesh(new CircleGeometry(0.041, 28), palette.eyeWhite)
  sclera.scale.set(0.88, 1.05, 1)
  sclera.position.z = 0.002
  eye.add(sclera)

  const iris = heroMesh(new CircleGeometry(0.024, 24), palette.iris)
  iris.scale.y = 1.06
  iris.position.set(-0.003, 0.002, 0.004)
  eye.add(iris)

  const pupil = heroMesh(new CircleGeometry(0.009, 18), palette.pupil)
  pupil.scale.y = 1.65
  pupil.position.set(-0.003, 0.002, 0.006)
  eye.add(pupil)

  const highlight = heroMesh(new CircleGeometry(0.0055, 14), palette.highlight)
  highlight.position.set(-0.009, 0.011, 0.008)
  eye.add(highlight)

  const upperLid = heroMesh(new CircleGeometry(0.044, 24), palette.fur)
  upperLid.scale.y = 0.45
  upperLid.position.set(0, 0.043, 0.009)
  upperLid.rotation.z = side * 0.08
  eye.add(upperLid)

  const lowerLid = heroMesh(new CircleGeometry(0.041, 24), palette.fur)
  lowerLid.scale.y = 0.24
  lowerLid.position.set(0, -0.043, 0.009)
  eye.add(lowerLid)
  return eye
}

function buildHead(palette: Palette): Group {
  const head = new Group()
  head.name = 'head'

  const cranium = heroMesh(
    loft({
      path: [
        V(0, 0.015, -0.13),
        V(0, 0.035, -0.04),
        V(0, 0.02, 0.065),
        V(0, -0.012, 0.145),
      ],
      profile: [0.105, 0.166, 0.173, 0.128],
      segments: 38,
      radial: 24,
      capStart: true,
      capEnd: true,
      flatten: 1.13,
      squash: 0.96,
    }),
    palette.fur,
  )
  head.add(cranium)

  // Broad fur cheeks taper the skull into a short cougar muzzle.
  for (const side of [-1, 1]) {
    const cheek = heroMesh(blob(0.052, 0.058, 0.035), palette.fur)
    cheek.position.set(side * 0.107, -0.028, 0.066)
    head.add(cheek)

    head.add(buildEye(side, palette))

    const brow = heroMesh(
      loft({
        path: [
          V(side * 0.026, 0.091, 0.188),
          V(side * 0.072, 0.108, 0.185),
          V(side * 0.118, 0.093, 0.166),
        ],
        profile: [0.006, 0.012, 0.005],
        segments: 12,
        radial: 8,
        capStart: true,
        capEnd: true,
      }),
      palette.furDark,
    )
    head.add(brow)
  }

  const forehead = heroMesh(blob(0.055, 0.068, 0.032), palette.fur)
  forehead.position.set(0, 0.04, 0.105)
  head.add(forehead)

  const muzzleBase = heroMesh(
    loft({
      path: [
        V(0, -0.045, 0.09),
        V(0, -0.054, 0.15),
        V(0, -0.054, 0.195),
      ],
      profile: [0.081, 0.069, 0.038],
      segments: 24,
      radial: 20,
      capEnd: true,
      flatten: 1.12,
      squash: 0.66,
    }),
    palette.fur,
  )
  head.add(muzzleBase)

  for (const side of [-1, 1]) {
    const muzzlePad = heroMesh(blob(0.069, 0.03, 0.009), palette.cream)
    muzzlePad.position.set(side * 0.035, -0.056, 0.211)
    head.add(muzzlePad)
  }

  const chin = heroMesh(blob(0.045, 0.014, 0.012), palette.cream)
  chin.position.set(0, -0.083, 0.192)
  head.add(chin)

  const noseBase = heroMesh(blob(0.04, 0.022, 0.01), palette.nose)
  noseBase.position.set(0, -0.036, 0.21)
  head.add(noseBase)

  const noseFace = heroMesh(
    new CircleGeometry(0.04, 3, -Math.PI / 2),
    palette.nose,
  )
  noseFace.scale.set(1.25, 0.9, 1)
  noseFace.position.set(0, -0.033, 0.222)
  noseFace.rotation.y = 0.18
  head.add(noseFace)

  for (const x of [-0.014, 0.014]) {
    const nostril = heroMesh(new CircleGeometry(0.004, 10), palette.furDark)
    nostril.position.set(x, -0.032, 0.222)
    nostril.rotation.y = 0.18
    head.add(nostril)
  }

  for (const side of [-1, 1]) {
    for (let dot = 0; dot < 3; dot += 1) {
      const whiskerDot = heroMesh(new CircleGeometry(0.0018, 8), palette.furDark)
      whiskerDot.position.set(
        side * (0.026 + dot * 0.012),
        -0.05 - (dot % 2) * 0.007,
        0.214,
      )
      head.add(whiskerDot)
    }
  }

  const mouthStitch = heroMesh(
    loft({
      path: [V(0, -0.051, 0.219), V(0, -0.075, 0.211)],
      profile: [0.003, 0.002],
      segments: 6,
      radial: 5,
      capStart: true,
      capEnd: true,
    }),
    palette.furDark,
  )
  head.add(mouthStitch)

  for (const side of [-1, 1]) {
    const mouthCorner = heroMesh(
      loft({
        path: [
          V(0, -0.068, 0.214),
          V(side * 0.019, -0.079, 0.207),
          V(side * 0.041, -0.074, 0.196),
        ],
        profile: [0.0022, 0.0018, 0.0008],
        segments: 8,
        radial: 5,
        capEnd: true,
      }),
      palette.furDark,
    )
    head.add(mouthCorner)
  }

  // Three fine whiskers per side match the reference without dominating the
  // face at desktop play distance.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      const droop = (index - 1) * 0.013
      const whisker = heroMesh(
        loft({
          path: [
            V(side * 0.056, -0.052 + droop, 0.197),
            V(side * 0.128, -0.046 + droop, 0.202),
            V(side * 0.204, -0.059 + droop, 0.184),
          ],
          profile: [0.0017, 0.0011, 0.0005],
          segments: 10,
          radial: 5,
          capEnd: true,
        }),
        palette.whisker,
      )
      head.add(whisker)
    }
  }

  head.add(buildEar(-1, palette), buildEar(1, palette))
  return head
}

export function createQuadruped(palette: Palette): Quadruped {
  const root = new Group()
  root.name = 'cougar'
  // Body presents a readable side silhouette while the head turns farther
  // toward the camera, matching the primary supplied view.
  root.rotation.y = -0.15

  const body = heroMesh(
    loft({
      path: [
        V(0, 0.6, -0.79),
        V(0, 0.67, -0.59),
        V(0, 0.66, -0.34),
        V(0, 0.62, -0.08),
        V(0, 0.64, 0.19),
        V(0, 0.67, 0.43),
        V(0, 0.68, 0.53),
        V(0, 0.68, 0.6),
      ],
      profile: [0.145, 0.255, 0.248, 0.225, 0.252, 0.182, 0.12, 0.06],
      segments: 72,
      radial: 24,
      capStart: true,
      capEnd: true,
      flatten: 1.06,
      squash: 0.9,
    }),
    palette.fur,
  )
  root.add(body)

  const underside = heroMesh(
    loft({
      path: [
        V(0, 0.455, -0.44),
        V(0, 0.445, -0.12),
        V(0, 0.47, 0.2),
      ],
      profile: [0.055, 0.074, 0.058],
      segments: 28,
      radial: 16,
      capStart: true,
      capEnd: true,
      flatten: 1.3,
      squash: 0.52,
    }),
    palette.cream,
  )
  root.add(underside)

  const neck = new Group()
  neck.name = 'neck'
  neck.add(
    heroMesh(
      loft({
        path: [
          V(0, 0.6, 0.34),
          V(0, 0.66, 0.45),
          V(0, 0.72, 0.56),
          V(0, 0.77, 0.65),
        ],
        profile: [0.158, 0.155, 0.135, 0.106],
        segments: 32,
        radial: 20,
        flatten: 1.05,
        squash: 0.9,
      }),
      palette.fur,
    ),
  )
  neck.add(
    heroMesh(
      loft({
        path: [V(0, 0.51, 0.49), V(0, 0.61, 0.6), V(0, 0.7, 0.69)],
        profile: [0.062, 0.071, 0.041],
        segments: 22,
        radial: 16,
        capStart: true,
        capEnd: true,
        flatten: 1.08,
        squash: 0.32,
      }),
      palette.cream,
    ),
  )
  root.add(neck)

  const head = buildHead(palette)
  head.position.set(0, 0.81, 0.69)
  head.rotation.y = 0.66
  head.scale.setScalar(1.06)
  neck.add(head)

  const frontProfile = [0.075, 0.13, 0.118, 0.098, 0.07, 0.05]
  const legFR = buildLimb(
    [
      V(0.05, 0.61, 0.08),
      V(0.14, 0.59, 0.24),
      V(0.17, 0.5, 0.28),
      V(0.18, 0.4, 0.31),
      V(0.18, 0.22, 0.38),
      V(0.18, 0.058, 0.45),
    ],
    frontProfile,
    palette.fur,
  )
  const legFL = buildLimb(
    [
      V(-0.05, 0.6, 0.05),
      V(-0.13, 0.58, 0.21),
      V(-0.16, 0.48, 0.2),
      V(-0.16, 0.37, 0.22),
      V(-0.16, 0.2, 0.27),
      V(-0.16, 0.055, 0.32),
    ],
    frontProfile,
    palette.fur,
  )
  root.add(legFR, legFL)

  const pawFR = buildPaw(palette.fur, palette.furDark, 1.05)
  pawFR.position.set(0.18, 0.045, 0.45)
  legFR.add(pawFR)
  const pawFL = buildPaw(palette.fur, palette.furDark)
  pawFL.position.set(-0.16, 0.045, 0.32)
  legFL.add(pawFL)

  const hindProfile = [0.155, 0.115, 0.064, 0.046]
  const legHR = buildLimb(
    [V(0.18, 0.58, -0.5), V(0.25, 0.41, -0.28), V(0.2, 0.2, -0.58), V(0.2, 0.055, -0.44)],
    hindProfile,
    palette.fur,
  )
  const legHL = buildLimb(
    [V(-0.18, 0.58, -0.5), V(-0.25, 0.41, -0.28), V(-0.2, 0.2, -0.58), V(-0.2, 0.055, -0.44)],
    hindProfile,
    palette.fur,
  )
  root.add(legHR, legHL)

  const pawHR = buildPaw(palette.fur, palette.furDark)
  pawHR.position.set(0.2, 0.045, -0.44)
  legHR.add(pawHR)
  const pawHL = buildPaw(palette.fur, palette.furDark, 0.96)
  pawHL.position.set(-0.2, 0.045, -0.44)
  legHL.add(pawHL)

  const tail = new Group()
  tail.name = 'tail'
  tail.add(
    heroMesh(
      loft({
        path: [
          V(0, 0.61, -0.78),
          V(0.1, 0.57, -0.98),
          V(0.28, 0.49, -1.18),
          V(0.49, 0.46, -1.34),
          V(0.68, 0.52, -1.41),
          V(0.78, 0.64, -1.35),
          V(0.8, 0.76, -1.24),
        ],
        profile: [0.074, 0.069, 0.062, 0.056, 0.051, 0.047, 0.038],
        segments: 62,
        radial: 16,
        capEnd: true,
      }),
      palette.fur,
    ),
  )
  const tailTip = heroMesh(blob(0.048, 0.052, 0.045), palette.fur)
  tailTip.position.set(0.8, 0.76, -1.24)
  tail.add(tailTip)
  root.add(tail)

  const cuff = new Group()
  cuff.position.set(0.2, 0.105, -0.44)
  legHR.add(cuff)
  const strap = heroMesh(new TorusGeometry(0.052, 0.012, 8, 24), palette.cuff)
  strap.rotation.x = Math.PI / 2
  cuff.add(strap)
  const velcro = heroMesh(blob(0.022, 0.012, 0.016), palette.pupil)
  velcro.position.set(0, 0.002, 0.057)
  cuff.add(velcro)

  const cuffAnchor = new Object3D()
  cuffAnchor.name = 'cuffAnchor'
  cuffAnchor.position.set(0, -0.01, 0.046)
  cuff.add(cuffAnchor)

  const cuffWorld = new Vector3()
  function syncCuff(): void {
    root.updateMatrixWorld(true)
    cuffWorld.setFromMatrixPosition(cuffAnchor.matrixWorld)
  }
  syncCuff()

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
    syncCuff,
  }
}
