/**
 * A world is a place the cougar plays in. Three of them ship: dino valley,
 * the pool, and the race track.
 *
 * Each world owns its own scenery and its own physics overrides. Water is not
 * decoration — a ball in the pool floats, drifts, and slows differently from
 * one on dirt, and that difference is something a four-year-old notices
 * immediately.
 *
 * Worlds are built once and then shown/hidden, never rebuilt on a switch: a
 * child mashing the world buttons must not stutter the frame rate.
 */
import type { Group } from 'three'
import type { BallPhysics, Vec3 } from '../physics'

export type WorldId = 'dino' | 'pool' | 'race'

/** Per-world physics overrides. Undefined fields fall back to the defaults. */
export interface WorldPhysics {
  /** Multiplies gravity. Water buoyancy is modelled as reduced effective g. */
  gravityScale?: number
  /** Multiplies air drag. Water is far draggier than air. */
  dragScale?: number
  /** Bounce off the ground plane, 0..1. Dirt is deader than tarmac. */
  restitution?: number
  /** Horizontal friction on the ground. Tarmac lets the ball roll and roll. */
  friction?: number
  /**
   * Height of the play surface. The pool's water sits above the grass, so the
   * ball floats at a level rather than resting on the ground.
   */
  surfaceY?: number
  /** True if the surface is water, which makes the ball bob instead of bounce. */
  buoyant?: boolean
}

/**
 * A scene object a child can tap to hear named. This is the whole educational
 * layer: tap a dinosaur, hear "T-rex! Big teeth!", see the word.
 */
export interface NamedThing {
  /** The node to hit-test against. */
  node: Group
  /** Big label shown on screen, e.g. "T-REX". */
  label: string
  /** Spoken line, e.g. "T-rex. Big teeth!" */
  spoken: string
  /** One true fact, spoken after the name. */
  fact: string
}

export interface World {
  id: WorldId
  /** Everything in this world. Added to the scene once, toggled via .visible. */
  group: Group
  /** Physics overrides while this world is active. */
  physics: WorldPhysics
  /** Tappable, nameable things — the educational layer. */
  things: NamedThing[]
  /** Sky colour, so each world feels like a different place. */
  skyColor: number
  /** Ground colour under the cougar. */
  groundColor: number
  /**
   * Called every frame while active. `t` is seconds since load. Drive
   * ambient motion here: dinosaurs bobbing, cars streaking past, water
   * rippling. Must be cheap and must not allocate per frame.
   */
  update(t: number, dt: number): void
  /**
   * Called when the ball is inside this world's special region (the pool),
   * so the world can add its own forces. Optional.
   */
  affectBall?(ball: BallPhysics, anchor: Vec3, dt: number): void
}

export interface WorldFactoryDeps {
  /** Deterministic RNG. Worlds MUST use this, never Math.random — screenshot
   *  QA and reproducible physics both depend on it. */
  rand(): number
}

/**
 * A small deterministic PRNG (mulberry32). Seeded per world so scenery layout
 * is identical on every load.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function rand(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
