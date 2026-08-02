import { describe, expect, it } from 'vitest'
import { isSquirrelHitUv } from '../src/worlds/cinematicSquirrel'

describe('cinematic white squirrel hit region', () => {
  it('accepts the photographed body and curled tail while rejecting keyed green margins', () => {
    // UV v is bottom-up; the source image is measured top-down.
    expect(isSquirrelHitUv(0.62, 0.44)).toBe(true)
    expect(isSquirrelHitUv(0.3, 0.73)).toBe(true)
    expect(isSquirrelHitUv(0.02, 0.02)).toBe(false)
    expect(isSquirrelHitUv(0.96, 0.96)).toBe(false)
  })

  it('rejects invalid texture coordinates', () => {
    expect(isSquirrelHitUv(Number.NaN, 0.5)).toBe(false)
    expect(isSquirrelHitUv(0.5, Number.POSITIVE_INFINITY)).toBe(false)
  })
})
