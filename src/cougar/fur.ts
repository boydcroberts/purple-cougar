/**
 * Procedural fur textures.
 *
 * A single flat colour is the loudest amateur tell in a character render: real
 * fur has mottling, darker guard hairs, and a soft gradient from a darker back
 * to a paler belly. None of that needs an artist — it can be generated at
 * runtime from noise, which keeps the project asset-free.
 *
 * Three maps are produced from the same noise field so they agree with each
 * other:
 *  - albedo:    colour breakup, plus a dark-topped / pale-bellied gradient
 *  - roughness: guard hairs catch light differently from undercoat
 *  - normal:    fine directional relief, so the sheen has something to bite on
 *
 * Everything is deterministic — a seeded PRNG, never Math.random — because
 * screenshot QA compares renders across runs.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Value noise on a grid, smoothed — cheap, tileable, and good enough for fur. */
function noiseField(size: number, cells: number, rand: () => number): Float32Array {
  const g = new Float32Array((cells + 1) * (cells + 1))
  for (let i = 0; i < g.length; i++) g[i] = rand()
  // Wrap the far edges onto the near ones so the texture tiles seamlessly.
  for (let i = 0; i <= cells; i++) {
    g[i * (cells + 1) + cells] = g[i * (cells + 1)]!
    g[cells * (cells + 1) + i] = g[i]!
  }

  const out = new Float32Array(size * size)
  const scale = cells / size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x * scale
      const fy = y * scale
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const tx = fx - x0
      const ty = fy - y0
      // Smoothstep, so cell boundaries do not show as a grid.
      const sx = tx * tx * (3 - 2 * tx)
      const sy = ty * ty * (3 - 2 * ty)
      const i00 = y0 * (cells + 1) + x0
      const a = g[i00]!
      const b = g[i00 + 1]!
      const c = g[i00 + cells + 1]!
      const d = g[i00 + cells + 2]!
      out[y * size + x] = (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy
    }
  }
  return out
}

/** Several octaves of value noise, so detail exists at more than one scale. */
function fbm(size: number, rand: () => number): Float32Array {
  const out = new Float32Array(size * size)
  let amp = 0.5
  let total = 0
  for (const cells of [4, 8, 16, 32, 64]) {
    const layer = noiseField(size, cells, rand)
    for (let i = 0; i < out.length; i++) out[i] = out[i]! + layer[i]! * amp
    total += amp
    amp *= 0.55
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total
  return out
}

export interface FurMaps {
  albedo: CanvasTexture
  roughness: CanvasTexture
  normal: CanvasTexture
}

const SIZE = 512

/**
 * Build the three coat maps for a base colour.
 *
 * `belly` lightens the lower part of the UV range and `spine` darkens the
 * upper, which on a lofted body maps to a darker back and a paler underside —
 * the counter-shading nearly every real mammal has, and a strong realism cue.
 */
export function createFurMaps(
  baseHex: number,
  seed = 0x9e3779b9,
  opts: { mottle?: number; spine?: number; belly?: number } = {},
): FurMaps {
  const { mottle = 0.16, spine = 0.2, belly = 0.16 } = opts
  const rand = mulberry32(seed)
  const n = fbm(SIZE, rand)
  // A second, finer field for individual hair strands.
  const hair = noiseField(SIZE, 220, mulberry32(seed ^ 0x5bf03635))

  const br = (baseHex >> 16) & 255
  const bg = (baseHex >> 8) & 255
  const bb = baseHex & 255

  const albedoCanvas = document.createElement('canvas')
  albedoCanvas.width = albedoCanvas.height = SIZE
  const roughCanvas = document.createElement('canvas')
  roughCanvas.width = roughCanvas.height = SIZE
  const normalCanvas = document.createElement('canvas')
  normalCanvas.width = normalCanvas.height = SIZE

  const aCtx = albedoCanvas.getContext('2d')!
  const rCtx = roughCanvas.getContext('2d')!
  const nCtx = normalCanvas.getContext('2d')!

  const aImg = aCtx.createImageData(SIZE, SIZE)
  const rImg = rCtx.createImageData(SIZE, SIZE)
  const nImg = nCtx.createImageData(SIZE, SIZE)

  const height = new Float32Array(SIZE * SIZE)

  for (let y = 0; y < SIZE; y++) {
    // v runs 0 at one pole of the sweep to 1 at the other. On the lofted body
    // this is around the circumference, so it produces the back/belly split.
    const v = y / (SIZE - 1)
    const counter = Math.cos(v * Math.PI * 2) // +1 back, -1 belly
    const shade = 1 - counter * spine + Math.max(0, -counter) * belly

    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x
      const m = (n[i]! - 0.5) * 2 * mottle
      const h = hair[i]!
      height[i] = n[i]! * 0.65 + h * 0.35

      const k = shade * (1 + m)
      const p = i * 4
      aImg.data[p] = Math.max(0, Math.min(255, br * k))
      aImg.data[p + 1] = Math.max(0, Math.min(255, bg * k))
      aImg.data[p + 2] = Math.max(0, Math.min(255, bb * k))
      aImg.data[p + 3] = 255

      // Guard hairs are glossier than undercoat: high noise -> lower roughness.
      const rough = 255 * (0.94 - h * 0.3)
      rImg.data[p] = rImg.data[p + 1] = rImg.data[p + 2] = rough
      rImg.data[p + 3] = 255
    }
  }

  // Normal map from the height field, by central differences.
  const STRENGTH = 2.6
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x
      const xl = height[y * SIZE + ((x - 1 + SIZE) % SIZE)]!
      const xr = height[y * SIZE + ((x + 1) % SIZE)]!
      const yu = height[((y - 1 + SIZE) % SIZE) * SIZE + x]!
      const yd = height[((y + 1) % SIZE) * SIZE + x]!
      const dx = (xl - xr) * STRENGTH
      const dy = (yu - yd) * STRENGTH
      const len = Math.hypot(dx, dy, 1)
      const p = i * 4
      nImg.data[p] = ((dx / len) * 0.5 + 0.5) * 255
      nImg.data[p + 1] = ((dy / len) * 0.5 + 0.5) * 255
      nImg.data[p + 2] = (1 / len) * 0.5 * 255 + 127
      nImg.data[p + 3] = 255
    }
  }

  aCtx.putImageData(aImg, 0, 0)
  rCtx.putImageData(rImg, 0, 0)
  nCtx.putImageData(nImg, 0, 0)

  const albedo = new CanvasTexture(albedoCanvas)
  albedo.colorSpace = SRGBColorSpace
  const roughness = new CanvasTexture(roughCanvas)
  const normal = new CanvasTexture(normalCanvas)

  for (const t of [albedo, roughness, normal]) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.anisotropy = 4
  }

  return { albedo, roughness, normal }
}
