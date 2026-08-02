import { describe, expect, it } from 'vitest'
import {
  GARDEN_DISCOVERIES,
  GARDEN_EDGE_ZONE_WIDTH,
  GARDEN_MIN_SCREEN_Y,
  getGardenEdge,
  lookupGardenDiscovery,
} from '../src/worlds/gardenDiscoveries'

describe('garden discoveries', () => {
  it('keeps a kid-friendly fact and botanical name for every visible learning plant', () => {
    expect(GARDEN_DISCOVERIES.map((discovery) => discovery.commonName)).toEqual([
      'Shasta daisy',
      'Knock Out rose',
      'Christmas fern',
      'Catawba rhododendron',
      'Mountain laurel',
    ])

    for (const discovery of GARDEN_DISCOVERIES) {
      expect(discovery.botanicalName.length).toBeGreaterThan(0)
      expect(discovery.fact.length).toBeGreaterThan(0)
    }
  })

  it('uses only the two garden edges and leaves the central play area clear', () => {
    expect(getGardenEdge(0)).toBe('left')
    expect(getGardenEdge(GARDEN_EDGE_ZONE_WIDTH)).toBe('left')
    expect(getGardenEdge(0.5)).toBeNull()
    expect(getGardenEdge(1 - GARDEN_EDGE_ZONE_WIDTH)).toBe('right')
    expect(getGardenEdge(1)).toBe('right')

    expect(lookupGardenDiscovery({ x: 0.5, y: 0.5 })).toBeNull()
    expect(lookupGardenDiscovery({ x: 0.1, y: GARDEN_MIN_SCREEN_Y - 0.01 })).toBeNull()
  })

  it('selects a stable plant for every valid edge coordinate', () => {
    expect(lookupGardenDiscovery({ x: 0.1, y: 0.4 })?.id).toBe('shasta-daisy')
    expect(lookupGardenDiscovery({ x: 0.1, y: 0.62 })?.id).toBe('knock-out-rose')
    expect(lookupGardenDiscovery({ x: 0.1, y: 1 })?.id).toBe('christmas-fern')
    expect(lookupGardenDiscovery({ x: 0.9, y: 0.4 })?.id).toBe('catawba-rhododendron')
    expect(lookupGardenDiscovery({ x: 0.9, y: 1 })?.id).toBe('mountain-laurel')
  })

  it('rejects coordinates outside normalized screen space', () => {
    expect(lookupGardenDiscovery({ x: -0.01, y: 0.4 })).toBeNull()
    expect(lookupGardenDiscovery({ x: 0.1, y: -0.01 })).toBeNull()
    expect(lookupGardenDiscovery({ x: 1.01, y: 0.4 })).toBeNull()
    expect(lookupGardenDiscovery({ x: 0.9, y: Number.NaN })).toBeNull()
  })
})
