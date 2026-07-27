/**
 * Lofted tube geometry — the reason this cougar can look like an animal.
 *
 * Every previous attempt built the character by stacking spheres and capsules,
 * and it always read as a bag of beads: every joint showed as a bulge, and no
 * amount of repositioning fixed it, because the problem was the construction
 * method rather than the numbers.
 *
 * A loft sweeps a circular cross-section along a smooth curve with a radius
 * that varies per station, producing ONE continuous surface. That is what lets
 * a thick chest taper into a narrow waist and swell into a haunch with no seam
 * anywhere. Normals are averaged across the whole surface, so it shades as a
 * single organic mass.
 */
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three'

export interface LoftOptions {
  /** Spine of the loft, in local space. At least two points. */
  path: Vector3[]
  /**
   * Radius at each station along the path, 0..1 parameterized. Length must be
   * >= 2; values are sampled with linear interpolation between stations, so a
   * short profile like [0.05, 0.18, 0.12] reads as thin -> thick -> medium.
   */
  profile: number[]
  /** Rings along the length. More = smoother taper, more triangles. */
  segments?: number
  /** Vertices around each ring. */
  radial?: number
  /** Taper the final ring to a point (tail tips, snouts). */
  capEnd?: boolean
  /** Taper the first ring to a point. */
  capStart?: boolean
  /** Non-uniform cross-section: scales the ring on its local X. 1 = circular. */
  flatten?: number
  /** Non-uniform cross-section: scales the ring on its local Y. */
  squash?: number
}

function sampleProfile(profile: number[], t: number): number {
  if (profile.length === 1) return profile[0]!
  const scaled = t * (profile.length - 1)
  const i = Math.min(Math.floor(scaled), profile.length - 2)
  const f = scaled - i
  return profile[i]! * (1 - f) + profile[i + 1]! * f
}

/**
 * Build a smooth tube along `path` whose radius follows `profile`.
 *
 * Frames are computed with a parallel-transport walk rather than per-point
 * Frenet frames: a Frenet frame flips its normal wherever the curve's
 * curvature inverts, which twists the mesh and produces a visible crease. A
 * transported frame stays continuous along the whole sweep.
 */
export function loft(opts: LoftOptions): BufferGeometry {
  const {
    path,
    profile,
    segments = 48,
    radial = 20,
    capEnd = false,
    capStart = false,
    flatten = 1,
    squash = 1,
  } = opts

  if (path.length < 2) throw new Error('loft: path needs at least 2 points')
  if (profile.length < 1) throw new Error('loft: profile needs at least 1 value')

  const curve = new CatmullRomCurve3(path, false, 'catmullrom', 0.5)
  const points = curve.getSpacedPoints(segments)
  const tangents: Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    tangents.push(curve.getTangentAt(i / segments).normalize())
  }

  // --- Parallel transport of an initial normal along the curve.
  const normals: Vector3[] = []
  const binormals: Vector3[] = []

  // Seed a normal perpendicular to the first tangent, choosing the world axis
  // least aligned with it so the cross product is well conditioned.
  const t0 = tangents[0]!
  const seed = new Vector3(0, 1, 0)
  if (Math.abs(t0.dot(seed)) > 0.9) seed.set(1, 0, 0)
  let normal = new Vector3().crossVectors(t0, seed).normalize()

  for (let i = 0; i <= segments; i++) {
    const t = tangents[i]!
    // Re-orthogonalize against the current tangent, then carry it forward.
    normal = normal.clone().sub(t.clone().multiplyScalar(normal.dot(t)))
    if (normal.lengthSq() < 1e-8) {
      const alt = new Vector3(0, 1, 0)
      if (Math.abs(t.dot(alt)) > 0.9) alt.set(1, 0, 0)
      normal = new Vector3().crossVectors(t, alt)
    }
    normal.normalize()
    normals.push(normal.clone())
    binormals.push(new Vector3().crossVectors(t, normal).normalize())
  }

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    let r = sampleProfile(profile, t)
    if (capStart && i === 0) r = 0
    if (capEnd && i === segments) r = 0

    const p = points[i]!
    const n = normals[i]!
    const b = binormals[i]!

    for (let j = 0; j <= radial; j++) {
      const theta = (j / radial) * Math.PI * 2
      const cos = Math.cos(theta) * r * flatten
      const sin = Math.sin(theta) * r * squash
      positions.push(
        p.x + n.x * cos + b.x * sin,
        p.y + n.y * cos + b.y * sin,
        p.z + n.z * cos + b.z * sin,
      )
      uvs.push(j / radial, t)
    }
  }

  const ring = radial + 1
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j
      const bIdx = a + ring
      indices.push(a, bIdx, a + 1)
      indices.push(bIdx, bIdx + 1, a + 1)
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * An ellipsoid blob, for masses that are not sweeps — the cranium, the
 * shoulder over a leg root, cheek volume. Kept here so every piece of the
 * cougar comes from one small vocabulary of smooth forms.
 */
export function blob(
  rx: number,
  ry: number,
  rz: number,
  segments = 24,
): BufferGeometry {
  const path = [new Vector3(0, -ry, 0), new Vector3(0, 0, 0), new Vector3(0, ry, 0)]
  const stations = 16
  const profile: number[] = []
  for (let i = 0; i <= stations; i++) {
    // Circle profile in the sweep direction gives a true ellipsoid rather
    // than a capsule with flat sides.
    const t = (i / stations) * 2 - 1
    profile.push(Math.sqrt(Math.max(0, 1 - t * t)))
  }
  const geo = loft({
    path,
    profile,
    segments,
    radial: segments,
    flatten: rx,
    squash: rz,
  })
  return geo
}
