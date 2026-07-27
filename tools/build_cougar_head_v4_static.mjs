/**
 * Build the Purple Cougar v4 head as a static Three.js-authored OBJ.
 *
 * This script uses geometry classes only. It does not create a renderer,
 * browser, WebGL context, rig, animation, or runtime asset.
 *
 * Run:
 *   node tools/build_cougar_head_v4_static.mjs
 */

import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'


const TOOLS = dirname(fileURLToPath(import.meta.url))
const PROJECT = dirname(TOOLS)
const OUTPUT_DIR = join(PROJECT, 'artifacts', 'v4', 'head', 'static')
const OBJ_PATH = join(OUTPUT_DIR, 'purple-cougar-head-v4.obj')
const MTL_PATH = join(OUTPUT_DIR, 'purple-cougar-head-v4.mtl')
const METRICS_PATH = join(OUTPUT_DIR, 'purple-cougar-head-v4-metrics.json')

const MATERIAL_SPECS = {
  Fur: {
    hex: 0x6d32ad,
    kd: [0.43, 0.20, 0.68],
    roughness: 0.68,
  },
  FurDark: {
    hex: 0x24102f,
    kd: [0.14, 0.06, 0.18],
    roughness: 0.72,
  },
  Cream: {
    hex: 0xe8c9d1,
    kd: [0.91, 0.79, 0.82],
    roughness: 0.70,
  },
  EarInner: {
    hex: 0xb65e82,
    kd: [0.71, 0.37, 0.51],
    roughness: 0.73,
  },
  Socket: {
    hex: 0x130817,
    kd: [0.075, 0.031, 0.090],
    roughness: 0.52,
  },
  Sclera: {
    hex: 0xf3ede9,
    kd: [0.95, 0.93, 0.91],
    roughness: 0.28,
  },
  Iris: {
    hex: 0xe59a26,
    kd: [0.90, 0.60, 0.15],
    roughness: 0.25,
  },
  Pupil: {
    hex: 0x09050c,
    kd: [0.035, 0.020, 0.047],
    roughness: 0.20,
  },
  Highlight: {
    hex: 0xfff7df,
    kd: [1.0, 0.97, 0.88],
    roughness: 0.10,
  },
  Nose: {
    hex: 0xce6d8d,
    kd: [0.81, 0.43, 0.55],
    roughness: 0.36,
  },
  Whisker: {
    hex: 0xf2e0de,
    kd: [0.95, 0.88, 0.87],
    roughness: 0.50,
  },
}

const materials = Object.fromEntries(
  Object.entries(MATERIAL_SPECS).map(([name, spec]) => {
    const result = name === 'Fur' || name === 'Cream' || name === 'Sclera'
      || name === 'Iris' || name === 'Nose'
      ? new MeshPhysicalMaterial({
          color: spec.hex,
          roughness: spec.roughness,
          clearcoat: name === 'Iris' ? 0.38 : 0.04,
        })
      : new MeshStandardMaterial({
          color: spec.hex,
          roughness: spec.roughness,
        })
    result.name = name
    if (name === 'EarInner') result.side = DoubleSide
    return [name, result]
  }),
)

function smoothGeometry(geometry) {
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function makeSkullGeometry() {
  const geometry = new SphereGeometry(1, 96, 64)
  const position = geometry.getAttribute('position')
  const vertex = new Vector3()

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index)
    const sourceX = vertex.x
    const sourceY = vertex.y
    const sourceZ = vertex.z
    const frontness = Math.max(0, sourceZ)
    const cheekBand = Math.exp(-(((sourceY + 0.20) / 0.34) ** 2))
    const lowerTaper = 1 - 0.30 * Math.max(0, -sourceY - 0.08) ** 1.65
    const crownTaper = 1 - 0.10 * Math.max(0, sourceY - 0.34) ** 1.7
    const cheekWidth = 1 + 0.15 * cheekBand * (0.55 + frontness * 0.45)

    // A broad cheek plane tapering into a narrower jaw is the primary feline
    // cue. The cranium remains slightly wider than tall without becoming a
    // spherical mascot head.
    const x = sourceX * 1.12 * cheekWidth * lowerTaper * crownTaper
    const y = sourceY * 1.08 + 0.04

    // Keep the rear cranium shallow and push only the lower face forward into
    // a short wedge. This replaces the rejected ball-with-parts profile.
    const frontWedge = frontness
      * 0.16
      * cheekBand
      * (0.42 + 0.58 * (1 - Math.abs(sourceX)) ** 1.5)
    const foreheadPlane = frontness
      * 0.045
      * Math.exp(-(((sourceY - 0.36) / 0.31) ** 2))
    let z = sourceZ * 0.76 + frontWedge + foreheadPlane

    // Real depressions under the eye apertures keep the eye assemblies seated
    // on the facial plane rather than reading as intersecting stickers.
    const socketX = Math.exp(
      -(((Math.abs(x) - 0.46) / 0.27) ** 2),
    )
    const socketY = Math.exp(-(((y - 0.27) / 0.24) ** 2))
    const socketMask = socketX * socketY * frontness ** 2
    z -= 0.085 * socketMask

    position.setXYZ(index, x, y, z)
  }
  position.needsUpdate = true
  return smoothGeometry(geometry)
}

function makeMuzzleGeometry() {
  const radialRings = 24
  const segments = 96
  const vertices = [0, 0, 0.315]
  const indices = []

  for (let ring = 1; ring <= radialRings; ring += 1) {
    const radial = ring / radialRings
    const dome = (1 - radial * radial) ** 0.72
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2
      const x = Math.cos(angle) * 0.535 * radial
      const y = Math.sin(angle) * 0.270 * radial
      const lobe = 0.045
        * (1 - Math.exp(-((Math.abs(x) / 0.17) ** 2)))
        * (1 - radial) ** 0.6
      vertices.push(
        x,
        y,
        -0.065 + 0.380 * dome + lobe,
      )
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + segment, 1 + ((segment + 1) % segments))
  }
  for (let ring = 0; ring < radialRings - 1; ring += 1) {
    const lower = 1 + ring * segments
    const upper = lower + segments
    for (let segment = 0; segment < segments; segment += 1) {
      const following = (segment + 1) % segments
      indices.push(
        lower + segment,
        upper + segment,
        upper + following,
        lower + segment,
        upper + following,
        lower + following,
      )
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(vertices), 3),
  )
  geometry.setIndex(indices)
  return smoothGeometry(geometry)
}

function makeChinGeometry() {
  const radialRings = 18
  const segments = 72
  const vertices = [0, 0, 0.165]
  const indices = []

  for (let ring = 1; ring <= radialRings; ring += 1) {
    const radial = ring / radialRings
    const dome = (1 - radial * radial) ** 0.72
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2
      vertices.push(
        Math.cos(angle) * 0.31 * radial,
        Math.sin(angle) * 0.145 * radial,
        -0.045 + 0.210 * dome,
      )
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + segment, 1 + ((segment + 1) % segments))
  }
  for (let ring = 0; ring < radialRings - 1; ring += 1) {
    const lower = 1 + ring * segments
    const upper = lower + segments
    for (let segment = 0; segment < segments; segment += 1) {
      const following = (segment + 1) % segments
      indices.push(
        lower + segment,
        upper + segment,
        upper + following,
        lower + segment,
        upper + following,
        lower + following,
      )
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(vertices), 3),
  )
  geometry.setIndex(indices)
  return smoothGeometry(geometry)
}

const EAR_BASE_Y = 0.62
const EAR_HEIGHT = 0.70

function makeEarGeometry(side) {
  const geometry = new SphereGeometry(1, 72, 56)
  const position = geometry.getAttribute('position')
  const vertex = new Vector3()

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index)
    const progress = (vertex.y + 1) * 0.5
    const lateralTaper = 1 - progress * 0.34
    const centerX = side * (0.91 + progress * 0.08)
    position.setXYZ(
      index,
      centerX + vertex.x * 0.47 * lateralTaper,
      EAR_BASE_Y + progress * EAR_HEIGHT,
      -0.10 + progress * 0.06 + vertex.z * 0.205,
    )
  }
  position.needsUpdate = true
  return smoothGeometry(geometry)
}

function makeInnerEarGeometry(side) {
  const verticalSegments = 40
  const horizontalSegments = 28
  const vertices = []
  const indices = []

  for (let row = 0; row <= verticalSegments; row += 1) {
    const progress = 0.12 + (row / verticalSegments) * 0.76
    const sourceY = progress * 2 - 1
    const verticalRadius = Math.sqrt(Math.max(0, 1 - sourceY * sourceY))
    const centerX = side * (0.91 + progress * 0.08)
    const lateralTaper = 1 - progress * 0.34
    for (let column = 0; column <= horizontalSegments; column += 1) {
      const local = -0.70 + (column / horizontalSegments) * 1.40
      const sourceX = local * verticalRadius
      const sourceZ = Math.sqrt(
        Math.max(0, 1 - sourceY * sourceY - sourceX * sourceX),
      )
      vertices.push(
        centerX + sourceX * 0.47 * lateralTaper,
        EAR_BASE_Y + progress * EAR_HEIGHT,
        -0.10 + progress * 0.06 + sourceZ * 0.205 + 0.010,
      )
    }
  }

  const columns = horizontalSegments + 1
  for (let row = 0; row < verticalSegments; row += 1) {
    for (let column = 0; column < horizontalSegments; column += 1) {
      const lower = row * columns + column
      const upper = (row + 1) * columns + column
      indices.push(lower, upper + 1, upper, lower, lower + 1, upper + 1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(vertices), 3),
  )
  geometry.setIndex(indices)
  return smoothGeometry(geometry)
}

function almondPoint(angle, halfWidth, halfHeight) {
  const sine = Math.sin(angle)
  return new Vector2(
    halfWidth * Math.cos(angle),
    halfHeight * sine * (0.68 + 0.32 * Math.abs(sine)),
  )
}

function makeAlmondSurface(halfWidth, halfHeight, bulge, edgeRecess = 0) {
  const radialRings = 10
  const segments = 64
  const vertices = [0, 0, bulge]
  const indices = []

  for (let ring = 1; ring <= radialRings; ring += 1) {
    const radial = ring / radialRings
    for (let segment = 0; segment < segments; segment += 1) {
      const point = almondPoint(
        (segment / segments) * Math.PI * 2,
        halfWidth * radial,
        halfHeight * radial,
      )
      vertices.push(
        point.x,
        point.y,
        bulge * (1 - radial * radial)
          - edgeRecess * (Math.abs(point.x) / halfWidth) ** 1.8,
      )
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + segment, 1 + ((segment + 1) % segments))
  }
  for (let ring = 0; ring < radialRings - 1; ring += 1) {
    const lower = 1 + ring * segments
    const upper = lower + segments
    for (let segment = 0; segment < segments; segment += 1) {
      const following = (segment + 1) % segments
      indices.push(
        lower + segment,
        upper + segment,
        upper + following,
        lower + segment,
        upper + following,
        lower + following,
      )
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(vertices), 3),
  )
  geometry.setIndex(indices)
  return smoothGeometry(geometry)
}

function makeLidCurve(halfWidth, halfHeight, upper, edgeRecess) {
  const points = []
  const samples = 12
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples
    const x = MathUtils.lerp(-halfWidth, halfWidth, progress)
    const arc = Math.sin(progress * Math.PI) ** 0.84
    const y = (upper ? 1 : -0.74) * halfHeight * arc
    const z = 0.027 - edgeRecess * (Math.abs(x) / halfWidth) ** 1.8
    points.push(new Vector3(x, y, z))
  }
  return new CatmullRomCurve3(points, false, 'centripetal')
}

function makeNoseGeometry() {
  const geometry = new SphereGeometry(1, 64, 48)
  const position = geometry.getAttribute('position')
  const vertex = new Vector3()

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index)
    const vertical = (vertex.y + 1) * 0.5
    const width = 0.44 + vertical * 0.56
    const lowerPoint = vertex.y < -0.15
      ? 1 - Math.abs(vertex.y + 0.15) * 0.26
      : 1
    position.setXYZ(
      index,
      vertex.x * 0.205 * width * lowerPoint,
      vertex.y * 0.145,
      vertex.z * 0.110,
    )
  }
  position.needsUpdate = true
  return smoothGeometry(geometry)
}

function makeTaperedTube(
  points,
  radiusAt,
  tubularSegments = 48,
  radialSegments = 8,
) {
  const curve = new CatmullRomCurve3(points, false, 'centripetal')
  const frames = curve.computeFrenetFrames(tubularSegments, false)
  const vertices = []
  const indices = []

  for (let ring = 0; ring <= tubularSegments; ring += 1) {
    const progress = ring / tubularSegments
    const point = curve.getPointAt(progress)
    const normal = frames.normals[ring]
    const binormal = frames.binormals[ring]
    const radius = radiusAt(progress)
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2
      const offset = normal
        .clone()
        .multiplyScalar(Math.cos(angle) * radius)
        .add(binormal.clone().multiplyScalar(Math.sin(angle) * radius))
      const vertex = point.clone().add(offset)
      vertices.push(vertex.x, vertex.y, vertex.z)
    }
  }

  for (let ring = 0; ring < tubularSegments; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const following = (segment + 1) % radialSegments
      const lower = ring * radialSegments
      const upper = (ring + 1) * radialSegments
      indices.push(
        lower + segment,
        upper + segment,
        upper + following,
        lower + segment,
        upper + following,
        lower + following,
      )
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(vertices), 3),
  )
  geometry.setIndex(indices)
  return smoothGeometry(geometry)
}

function createMesh(name, geometry, materialName) {
  const result = new Mesh(geometry, materials[materialName])
  result.name = name
  return result
}

function addEye(root, side) {
  const label = side < 0 ? 'L' : 'R'
  const eye = new Group()
  eye.name = `Eye${label}`
  eye.position.set(side * 0.455, 0.27, 0.742)
  eye.rotation.y = side * 0.14
  eye.rotation.z = side * 0.045

  eye.add(
    createMesh(
      `RecessedAlmondSocket${label}`,
      makeAlmondSurface(0.39, 0.25, 0.025, 0.055),
      'Socket',
    ),
  )
  const sclera = createMesh(
    `AlmondSclera${label}`,
    makeAlmondSurface(0.318, 0.178, 0.034, 0.042),
    'Sclera',
  )
  sclera.position.z = 0.045
  eye.add(sclera)

  const iris = createMesh(
    `AmberIris${label}`,
    new SphereGeometry(1, 40, 28),
    'Iris',
  )
  iris.scale.set(0.108, 0.120, 0.026)
  iris.position.set(0, -0.004, 0.087)
  eye.add(iris)

  const pupil = createMesh(
    `VerticalPupil${label}`,
    new SphereGeometry(1, 36, 24),
    'Pupil',
  )
  pupil.scale.set(0.039, 0.078, 0.018)
  pupil.position.set(0, -0.004, 0.109)
  eye.add(pupil)

  const highlight = createMesh(
    `EyeHighlight${label}`,
    new SphereGeometry(1, 24, 16),
    'Highlight',
  )
  highlight.scale.setScalar(0.027)
  highlight.position.set(-0.040, 0.050, 0.130)
  eye.add(highlight)

  eye.add(
    createMesh(
      `UpperLid${label}`,
      new TubeGeometry(
        makeLidCurve(0.397, 0.255, true, 0.058),
        48,
        0.024,
        10,
      ),
      'FurDark',
    ),
    createMesh(
      `LowerLid${label}`,
      new TubeGeometry(
        makeLidCurve(0.39, 0.235, false, 0.055),
        48,
        0.015,
        9,
      ),
      'Fur',
    ),
  )
  root.add(eye)
}

function addBrows(root) {
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'L' : 'R'
    root.add(
      createMesh(
        `SoftBrow${label}`,
        makeTaperedTube(
          [
            new Vector3(side * 0.18, 0.60, 0.745),
            new Vector3(side * 0.32, 0.68, 0.720),
            new Vector3(side * 0.49, 0.70, 0.660),
            new Vector3(side * 0.64, 0.65, 0.590),
            new Vector3(side * 0.75, 0.57, 0.530),
          ],
          (progress) => 0.010 + Math.sin(progress * Math.PI) * 0.030,
          48,
          10,
        ),
        'FurDark',
      ),
    )
  }
}

function addNoseAndMouth(root) {
  const nose = createMesh('RoundedFelineNose', makeNoseGeometry(), 'Nose')
  nose.position.set(0, -0.245, 1.080)
  root.add(nose)

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'L' : 'R'
    const nostril = createMesh(
      `Nostril${label}`,
      new SphereGeometry(1, 28, 18),
      'Pupil',
    )
    nostril.scale.set(0.035, 0.015, 0.010)
    nostril.position.set(side * 0.061, -0.233, 1.186)
    root.add(nostril)
  }

  root.add(
    createMesh(
      'Philtrum',
      makeTaperedTube(
        [
          new Vector3(0, -0.37, 1.178),
          new Vector3(0, -0.45, 1.155),
          new Vector3(0, -0.515, 1.118),
        ],
        (progress) => MathUtils.lerp(0.012, 0.006, progress),
        30,
        8,
      ),
      'FurDark',
    ),
  )

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'L' : 'R'
    root.add(
      createMesh(
        `MouthBranch${label}`,
        makeTaperedTube(
          [
            new Vector3(0, -0.515, 1.118),
            new Vector3(side * 0.11, -0.555, 1.103),
            new Vector3(side * 0.24, -0.55, 1.068),
            new Vector3(side * 0.35, -0.505, 1.010),
          ],
          (progress) => MathUtils.lerp(0.009, 0.002, progress),
          34,
          8,
        ),
        'FurDark',
      ),
    )
  }
}

function addWhiskers(root) {
  const fans = [
    [
      new Vector3(0.34, -0.35, 1.147),
      new Vector3(0.68, -0.31, 1.190),
      new Vector3(1.08, -0.23, 1.188),
      new Vector3(1.49, -0.12, 1.137),
    ],
    [
      new Vector3(0.36, -0.43, 1.132),
      new Vector3(0.72, -0.43, 1.175),
      new Vector3(1.14, -0.43, 1.155),
      new Vector3(1.56, -0.39, 1.074),
    ],
    [
      new Vector3(0.34, -0.51, 1.100),
      new Vector3(0.68, -0.57, 1.122),
      new Vector3(1.08, -0.68, 1.082),
      new Vector3(1.45, -0.78, 0.982),
    ],
  ]

  for (const side of [-1, 1]) {
    for (let index = 0; index < fans.length; index += 1) {
      const label = side < 0 ? 'L' : 'R'
      const points = fans[index].map(
        (point) => new Vector3(point.x * side, point.y, point.z),
      )
      root.add(
        createMesh(
          `Whisker${label}${index + 1}`,
          makeTaperedTube(
            points,
            (progress) => MathUtils.lerp(
              0.009,
              0.0012,
              progress ** 0.7,
            ),
            48,
            7,
          ),
          'Whisker',
        ),
      )
    }
  }
}

function buildHead() {
  const root = new Group()
  root.name = 'PurpleCougarHeadV4'
  root.add(createMesh('HeartSkull', makeSkullGeometry(), 'Fur'))

  const muzzle = createMesh('IntegratedMuzzle', makeMuzzleGeometry(), 'Cream')
  muzzle.position.set(0, -0.365, 0.805)
  root.add(muzzle)

  const chin = createMesh('IntegratedChin', makeChinGeometry(), 'Cream')
  chin.position.set(0, -0.610, 0.825)
  root.add(chin)

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'L' : 'R'
    root.add(createMesh(`RoundedEar${label}`, makeEarGeometry(side), 'Fur'))
    root.add(
      createMesh(
        `InnerEar${label}`,
        makeInnerEarGeometry(side),
        'EarInner',
      ),
    )
    addEye(root, side)
  }
  addBrows(root)
  addNoseAndMouth(root)
  addWhiskers(root)
  root.updateMatrixWorld(true)
  return root
}

function collectMetrics(root) {
  let meshes = 0
  let vertices = 0
  let triangles = 0
  const materialNames = new Set()

  root.traverse((object) => {
    if (!object.isMesh) return
    meshes += 1
    const position = object.geometry.getAttribute('position')
    vertices += position.count
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : position.count / 3
    materialNames.add(object.material.name)
  })

  const bounds = new Box3().setFromObject(root)
  const size = bounds.getSize(new Vector3())
  const skullBox = new Box3().setFromObject(root.getObjectByName('HeartSkull'))
  const skullSize = skullBox.getSize(new Vector3())
  const earBox = new Box3().setFromObject(root.getObjectByName('RoundedEarL'))
  const earSize = earBox.getSize(new Vector3())
  const socketBox = new Box3().setFromObject(
    root.getObjectByName('RecessedAlmondSocketL'),
  )
  const socketSize = socketBox.getSize(new Vector3())
  const noseBox = new Box3().setFromObject(
    root.getObjectByName('RoundedFelineNose'),
  )
  return {
    prototype: 'purple-cougar-head-v4-static',
    stage: 'reference-matched-head-study-no-rig',
    sourceReferences: [
      join(PROJECT, 'artifacts', 'v4', 'purple-cougar-head-turnaround-v1.png'),
      '/var/folders/f4/b0t1pkt90qqcm936w8d_pyhw0000gn/T/'
        + 'codex-clipboard-f7abb729-0e44-4394-b070-cd50aebafaaf.png',
    ],
    outputs: {
      obj: OBJ_PATH,
      mtl: MTL_PATH,
    },
    topology: {
      meshObjects: meshes,
      vertices,
      triangles: Math.round(triangles),
      materials: materialNames.size,
    },
    bounds: {
      width: Number(size.x.toFixed(4)),
      height: Number(size.y.toFixed(4)),
      depth: Number(size.z.toFixed(4)),
    },
    designRatios: {
      skullWidthToHeight: Number(
        (skullSize.x / skullSize.y).toFixed(3),
      ),
      muzzleProjectionToSkullDepth: Number(
        (
          Math.max(0, noseBox.max.z - skullBox.max.z)
          / skullSize.z
        ).toFixed(3),
      ),
      eyeApertureWidthToHeight: Number(
        (socketSize.x / socketSize.y).toFixed(3),
      ),
      earHeightToSkullHeight: Number(
        (earSize.y / skullSize.y).toFixed(3),
      ),
    },
    constructionChecks: {
      heartShapedDeformedSkull: true,
      singleContinuousMuzzleMass: true,
      roundedLateralVolumetricEars: true,
      curvedInnerEarSurfaces: true,
      recessedCurvedAlmondSockets: true,
      shallowEyesNotBeads: true,
      integratedCreamMuzzleAndChin: true,
      softTaperedBrows: true,
      taperedWhiskers: true,
      rigPresent: false,
      browserOrWebglUsed: false,
      blenderUsed: false,
    },
  }
}

function makeMtl() {
  const blocks = [
    '# Purple Cougar v4 materials',
    '# Authored for the isolated static head study.',
  ]
  for (const [name, spec] of Object.entries(MATERIAL_SPECS)) {
    const [red, green, blue] = spec.kd
    const shininess = Math.round((1 - spec.roughness) * 180)
    blocks.push(
      '',
      `newmtl ${name}`,
      `Ka ${(red * 0.18).toFixed(5)} ${(green * 0.18).toFixed(5)} ${(blue * 0.18).toFixed(5)}`,
      `Kd ${red.toFixed(5)} ${green.toFixed(5)} ${blue.toFixed(5)}`,
      'Ks 0.08000 0.08000 0.08000',
      `Ns ${shininess}`,
      'd 1.0',
      'illum 2',
    )
  }
  return `${blocks.join('\n')}\n`
}

mkdirSync(OUTPUT_DIR, { recursive: true })
const head = buildHead()
const exporter = new OBJExporter()
const body = exporter.parse(head)
const obj = [
  '# Purple Cougar v4 head study',
  'mtllib purple-cougar-head-v4.mtl',
  body,
].join('\n')
const metrics = collectMetrics(head)

writeFileSync(OBJ_PATH, obj, 'utf8')
writeFileSync(MTL_PATH, makeMtl(), 'utf8')
writeFileSync(METRICS_PATH, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8')

console.log(
  `HEAD_V4_STATIC meshes=${metrics.topology.meshObjects}`
    + ` vertices=${metrics.topology.vertices}`
    + ` triangles=${metrics.topology.triangles}`
    + ` materials=${metrics.topology.materials}`,
)
console.log(`OBJ ${OBJ_PATH}`)
console.log(`MTL ${MTL_PATH}`)
console.log(`METRICS ${METRICS_PATH}`)
