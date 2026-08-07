/**
 * The stone tunnel portal the excursion train emerges from.
 *
 * The painted deck in `storybook-garden-railway-v2.jpg` climbs out of the
 * gorge and runs straight into a rock shoulder at u=0.582. Before this existed
 * the locomotive simply faded up in open air beside the waterfall, which read
 * as a card sliding across a photograph rather than a train on a railway.
 *
 * The portal is drawn as its own card slightly nearer the camera than the
 * train, so the dark mouth genuinely occludes the locomotive rather than
 * relying on an opacity ramp. Everything is procedural geometry — the arch is
 * a handful of triangles, so this costs no new binary asset.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three'

/** Sampled from the plate's sunlit cliff face beside the tunnel site. */
const STONE_COLOR = 0x4a3826
/** Sampled from the deck shadow; the mouth reads darker than any painted rock. */
const MOUTH_COLOR = 0x140f0a

const ARCH_SEGMENTS = 18

export interface CinematicTunnel {
  readonly root: Group
  /**
   * Place the portal. `width` and `height` are in the card's own camera-space
   * units, and `y` is the wheel/deck line the arch springs from.
   */
  place(x: number, y: number, width: number, height: number): void
  dispose(): void
}

/**
 * Builds a filled arch: vertical jambs up to the springing line, then a
 * semicircular head. Returned as a triangle fan around the arch's base centre
 * so it stays one draw call.
 *
 * Exported for tests: the portal must never render a shape that dips below its
 * own base line, or the mouth would cut a hole in the painted deck.
 */
export function buildArchGeometry(
  width: number,
  height: number,
  segments = ARCH_SEGMENTS,
): BufferGeometry {
  const halfWidth = Math.max(1e-4, width) * 0.5
  const safeHeight = Math.max(1e-4, height)
  // The springing line sits where the semicircular head takes over from the
  // straight jambs. A head taller than the arch is half-width means clamping.
  const headHeight = Math.min(halfWidth, safeHeight)
  const jambHeight = Math.max(0, safeHeight - headHeight)

  const outline: number[][] = [[-halfWidth, 0], [-halfWidth, jambHeight]]
  const steps = Math.max(3, Math.floor(segments))
  for (let index = 0; index <= steps; index++) {
    const angle = Math.PI - (index / steps) * Math.PI
    outline.push([Math.cos(angle) * halfWidth, jambHeight + Math.sin(angle) * headHeight])
  }
  outline.push([halfWidth, 0])

  const positions: number[] = []
  for (let index = 0; index < outline.length - 1; index++) {
    const current = outline[index]!
    const next = outline[index + 1]!
    positions.push(0, 0, 0)
    positions.push(current[0]!, current[1]!, 0)
    positions.push(next[0]!, next[1]!, 0)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return geometry
}

export function createCinematicTunnel(): CinematicTunnel {
  const root = new Group()
  root.name = 'Blue Ridge railway tunnel portal'
  root.userData.kind = 'cinematic-tunnel'

  const surroundMaterial = new MeshBasicMaterial({
    color: new Color(STONE_COLOR),
    side: DoubleSide,
    fog: false,
    toneMapped: false,
    // Opaque stone that MUST write depth: the plate and the train both render
    // later with depthTest on, and without a depth write they simply paint
    // over the portal and it vanishes.
    depthWrite: true,
  })
  const mouthMaterial = new MeshBasicMaterial({
    color: new Color(MOUTH_COLOR),
    side: DoubleSide,
    fog: false,
    toneMapped: false,
    // Opaque stone that MUST write depth: the plate and the train both render
    // later with depthTest on, and without a depth write they simply paint
    // over the portal and it vanishes.
    depthWrite: true,
  })

  const surround = new Mesh(buildArchGeometry(1, 1), surroundMaterial)
  surround.name = 'Tunnel stone surround'
  surround.frustumCulled = false
  const mouth = new Mesh(buildArchGeometry(1, 1), mouthMaterial)
  mouth.name = 'Tunnel mouth'
  mouth.frustumCulled = false
  // The mouth must cover the locomotive; the surround only frames it.
  mouth.position.z = 0.002
  root.add(surround, mouth)

  let disposed = false

  function place(x: number, y: number, width: number, height: number): void {
    if (disposed) return
    const safeWidth = Math.max(1e-4, width)
    const safeHeight = Math.max(1e-4, height)
    // A visible stone ring around the opening, proportional so it survives any
    // viewport size without a second set of tuned constants.
    const ringWidth = safeWidth * 0.11
    surround.geometry.dispose()
    surround.geometry = buildArchGeometry(
      safeWidth + ringWidth * 2,
      safeHeight + ringWidth,
    )
    mouth.geometry.dispose()
    mouth.geometry = buildArchGeometry(safeWidth, safeHeight)
    surround.position.set(x, y, 0)
    mouth.position.set(x, y, 0.002)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    root.removeFromParent()
    surround.geometry.dispose()
    mouth.geometry.dispose()
    surroundMaterial.dispose()
    mouthMaterial.dispose()
  }

  return { root, place, dispose }
}
