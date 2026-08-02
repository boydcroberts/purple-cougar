/**
 * The mottled meadow surface, shared by the stage ground plane and the meadow
 * module's play pad so the foreground and the field beyond it are made of the
 * same grass.
 *
 * A single flat green was the loudest "fake" cue in the backdrop review: the
 * ground is the largest surface on screen and read as a putting green. Real WNC
 * meadow (docs/reference/) is never one value — sunlit yellow-green, cooler
 * shadowed green and warm dry patches sit in broad overlapping drifts.
 *
 * Drawn per-pixel rather than into vertex colours because the detail needed is
 * finer than any sane vertex spacing on a 60-unit plane could carry.
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

/** World units covered by one repeat of the tile. Measured against the play
 *  camera with `window.__pc.project()`: only ~6×5 units of ground are ever on
 *  screen, so a tile this size never shows its own repetition in frame. */
const TILE_UNITS = 8

const TEXTURE_PX = 512

/** Deterministic lattice hash — no RNG state, so the meadow is identical on
 *  every load and in every headless build. */
function hash2(ix: number, iy: number): number {
  const h = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453
  return h - Math.floor(h)
}

/**
 * Smoothed value noise in 0..1 that repeats every `period` lattice cells, so
 * the tile wraps seamlessly. Without the wrap the ground shows a hard grid seam
 * everywhere the texture repeats.
 */
function periodicNoise2(x: number, y: number, period: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const at = (i: number, j: number) =>
    hash2(((i % period) + period) % period, ((j % period) + period) % period)
  const a = at(ix, iy)
  const b = at(ix + 1, iy)
  const c = at(ix, iy + 1)
  const d = at(ix + 1, iy + 1)
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy
}

/** sRGB bytes, mixed directly — staying out of three's linear working space
 *  here keeps the tile readable as plain colour arithmetic. */
type Rgb = readonly [number, number, number]

const MID: Rgb = [107, 191, 74]
const SUN: Rgb = [142, 208, 95]
const DEEP: Rgb = [61, 122, 51]
const DRY: Rgb = [169, 181, 102]

/** One shared canvas: the pixel loop is the expensive part and every consumer
 *  wants the same image, only at a different repeat. */
let sharedCanvas: HTMLCanvasElement | null = null

function drawTile(): HTMLCanvasElement | null {
  if (sharedCanvas) return sharedCanvas
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_PX
  canvas.height = TEXTURE_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const image = ctx.createImageData(TEXTURE_PX, TEXTURE_PX)
  for (let py = 0; py < TEXTURE_PX; py++) {
    for (let px = 0; px < TEXTURE_PX; px++) {
      const u = px / TEXTURE_PX
      const v = py / TEXTURE_PX
      // Broad drifts you read as terrain, a mid break-up so the drifts are not
      // airbrushed blobs, and a fine octave that survives up close to camera.
      const drift =
        periodicNoise2(u * 8, v * 8, 8) * 0.5 +
        periodicNoise2(u * 16, v * 16, 16) * 0.28 +
        periodicNoise2(u * 48, v * 48, 48) * 0.14 +
        // Blade-scale octave. Without it the drifts read as soft lighting
        // variation rather than as grass when the camera is this close.
        periodicNoise2(u * 128, v * 128, 128) * 0.08
      const grain = periodicNoise2(u * 32 + 3, v * 32 + 7, 32)

      const toDeep = Math.max(0, Math.min(0.9, (0.53 - drift) * 3.1))
      const toSun = Math.max(0, Math.min(0.9, (drift - 0.5) * 3.3))
      // Dry patches only where a sunlit rise and the fine grain agree, so they
      // land as occasional scuffs rather than an even speckle.
      const toDry = Math.max(0, Math.min(0.42, (drift + grain - 1.22) * 1.8))

      const offset = (py * TEXTURE_PX + px) * 4
      for (let c = 0; c < 3; c++) {
        let value = MID[c]!
        value += (DEEP[c]! - value) * toDeep
        value += (SUN[c]! - value) * toSun
        value += (DRY[c]! - value) * toDry
        image.data[offset + c] = value
      }
      image.data[offset + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  sharedCanvas = canvas
  return canvas
}

/**
 * A meadow texture for a mesh whose UV 0..1 spans `worldSpan` world units.
 * Returns null when there is no DOM (headless build/test) — callers fall back
 * to their flat colour.
 */
export function makeMeadowTexture(worldSpan: number): CanvasTexture | null {
  const canvas = drawTile()
  if (!canvas) return null
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.setScalar(worldSpan / TILE_UNITS)
  texture.anisotropy = 8
  return texture
}
