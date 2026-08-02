/**
 * Garden learning data deliberately stays apart from the Three.js garden.
 * The renderer can change shape, while these names, facts, and screen zones
 * remain cheap to test and safe to use from any input layer.
 */

/** The garden uses the outside quarter of each side of the screen. */
export const GARDEN_EDGE_ZONE_WIDTH = 0.24
/** The upper scenery is sky/tree canopy; visible flower beds start below this. */
export const GARDEN_MIN_SCREEN_Y = 0.36

export type GardenEdge = 'left' | 'right'

export type GardenDiscoveryId =
  | 'shasta-daisy'
  | 'knock-out-rose'
  | 'christmas-fern'
  | 'catawba-rhododendron'
  | 'mountain-laurel'

export interface GardenDiscovery {
  readonly id: GardenDiscoveryId
  readonly edge: GardenEdge
  readonly commonName: string
  readonly botanicalName: string
  readonly fact: string
}

/** A normalized viewport coordinate: 0 is the top/left edge and 1 the bottom/right edge. */
export interface NormalizedScreenCoordinate {
  readonly x: number
  readonly y: number
}

const LEFT_GARDEN_DISCOVERIES: readonly GardenDiscovery[] = [
  {
    id: 'shasta-daisy',
    edge: 'left',
    commonName: 'Shasta daisy',
    botanicalName: 'Leucanthemum × superbum',
    fact: 'Its sunny yellow center is made of many tiny flowers growing together.',
  },
  {
    id: 'knock-out-rose',
    edge: 'left',
    commonName: 'Knock Out rose',
    botanicalName: "Rosa 'Radrazz'",
    fact: 'This rose can make bright blooms again and again during warm months.',
  },
  {
    id: 'christmas-fern',
    edge: 'left',
    commonName: 'Christmas fern',
    botanicalName: 'Polystichum acrostichoides',
    fact: 'Its green fronds can stay green through winter, like a living Christmas decoration.',
  },
]

const RIGHT_GARDEN_DISCOVERIES: readonly GardenDiscovery[] = [
  {
    id: 'catawba-rhododendron',
    edge: 'right',
    commonName: 'Catawba rhododendron',
    botanicalName: 'Rhododendron catawbiense',
    fact: 'In spring, it makes big flower clusters where bees can find nectar.',
  },
  {
    id: 'mountain-laurel',
    edge: 'right',
    commonName: 'Mountain laurel',
    botanicalName: 'Kalmia latifolia',
    fact: 'Its spring flowers look like little cups, and it grows in these mountains.',
  },
]

/** Every currently visible, named garden plant. Kept in a stable display order. */
export const GARDEN_DISCOVERIES: readonly GardenDiscovery[] = [
  ...LEFT_GARDEN_DISCOVERIES,
  ...RIGHT_GARDEN_DISCOVERIES,
]

function isNormalized(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

/** Returns the garden side for a valid screen x-coordinate, or null over the clear play area. */
export function getGardenEdge(screenX: number): GardenEdge | null {
  if (!isNormalized(screenX)) return null
  if (screenX <= GARDEN_EDGE_ZONE_WIDTH) return 'left'
  if (screenX >= 1 - GARDEN_EDGE_ZONE_WIDTH) return 'right'
  return null
}

/**
 * Resolves a tap in normalized screen space to one garden discovery.
 *
 * Each edge is divided into equal top-to-bottom bands in its stable plant
 * order. The broad centre always returns null, preserving the cougar's clear
 * play area even if a caller sends every pointer event through this function.
 */
export function lookupGardenDiscovery(
  coordinate: NormalizedScreenCoordinate,
): GardenDiscovery | null {
  const { x, y } = coordinate
  if (!isNormalized(y) || y < GARDEN_MIN_SCREEN_Y) return null

  const edge = getGardenEdge(x)
  if (!edge) return null

  const discoveries = edge === 'left' ? LEFT_GARDEN_DISCOVERIES : RIGHT_GARDEN_DISCOVERIES
  const gardenProgress = (y - GARDEN_MIN_SCREEN_Y) / (1 - GARDEN_MIN_SCREEN_Y)
  const index = Math.min(discoveries.length - 1, Math.floor(gardenProgress * discoveries.length))
  return discoveries[index] ?? null
}
