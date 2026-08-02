import { Group, PerspectiveCamera, SRGBColorSpace, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  BLUE_RIDGE_GARDEN_ASSET_URL,
  createCinematicEnvironment,
  fitCinematicPlate,
  type CinematicEnvironmentTextureLoader,
} from '../src/worlds/cinematicEnvironment'

describe('cinematic environment plate framing', () => {
  it('covers a desktop viewport without letterboxing', () => {
    const size = fitCinematicPlate(42, 16 / 9, 30)
    const visibleHeight = Math.tan((42 * Math.PI) / 360) * 30 * 2
    const visibleWidth = visibleHeight * (16 / 9)

    expect(size.width).toBeGreaterThan(visibleWidth)
    expect(size.height).toBeGreaterThan(visibleHeight)
  })

  it('expands vertically for portrait framing while preserving the asset aspect', () => {
    const size = fitCinematicPlate(58, 3 / 4, 30)

    expect(size.width / size.height).toBeCloseTo(1672 / 941, 6)
    expect(size.height).toBeGreaterThan(30)
  })

  it('does not show a blank plate until its art is available, and retains the fallback on failure', async () => {
    const environment = createCinematicEnvironment()
    const parent = new Group()
    parent.add(environment.root)

    expect(environment.plate.visible).toBe(false)
    await expect(environment.load({ loadAsync: async () => Promise.reject(new Error('offline')) })).resolves.toBe(false)
    expect(environment.plate.visible).toBe(false)

    const texture = new Texture()
    const textureDispose = vi.spyOn(texture, 'dispose')
    const loader: CinematicEnvironmentTextureLoader = {
      loadAsync: vi.fn(async (url: string) => {
        expect(url).toBe(BLUE_RIDGE_GARDEN_ASSET_URL)
        return texture
      }),
    }
    await expect(environment.load(loader)).resolves.toBe(true)
    expect(environment.plate.visible).toBe(true)
    expect(environment.plate.material.map).toBe(texture)
    expect(texture.colorSpace).toBe(SRGBColorSpace)

    const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 100)
    camera.position.set(0, 1.2, 3)
    camera.lookAt(0, 0.5, 0)
    environment.update(camera, 0)
    expect(environment.isFullyVisible()).toBe(false)
    environment.update(camera, 0.2)
    expect(environment.isFullyVisible()).toBe(true)
    expect(environment.plate.material.opacity).toBe(1)

    environment.dispose()
    environment.dispose()
    expect(environment.root.parent).toBeNull()
    expect(textureDispose).toHaveBeenCalledTimes(1)
  })
})
