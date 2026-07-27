/** Every tunable number in the toy. Expect all of these to change after
 *  watching a real 3-year-old play. No magic numbers live anywhere else. */

export const TAU = Math.PI * 2

// --- Hop timing ---
/** Total duration of a hop, seconds. */
export const HOP_DUR = 0.45
/** Free foot leaves the ground this many seconds after the tap. */
export const AIRBORNE_START = 0.1
/** Free foot lands again this many seconds after the tap. */
export const AIRBORNE_END = 0.35
/** A tap this close to landing is buffered and fires on touchdown. */
export const BUFFER_WINDOW = 0.15

// --- Ball orbit ---
/** Seconds per revolution at rest. Deliberately slow. */
export const BASE_PERIOD = 1.4
/** Speed floor — the ball never orbits faster than this. */
export const MIN_PERIOD = 0.95
/** Period shortens by this much per consecutive clear. */
export const RAMP_PER_CLEAR = 0.0225
/** Orbit angle at which the cord sweeps over the free (left) foot. */
export const THETA_PASS = Math.PI

// --- Bonk recovery ---
/** How long he lies there after tripping. */
export const BONK_TUMBLE_DUR = 1.2
/** Beat of stillness after the tumble before the ball respins. */
export const BONK_PAUSE = 0.8
/** How long the ball takes to ease back up to BASE_PERIOD. */
export const BONK_RESPIN = 0.6
/** Period the respin eases from (slow, then speeds up to BASE_PERIOD). */
export const RESPIN_START_PERIOD = 3.0

// --- Placement / visuals ---
/** Peak height of a hop, world units. */
export const HOP_HEIGHT = 0.55
/** Cuffed ankle position, world units. */
export const ANKLE = { x: 0.22, y: 0.28, z: 0 }
/** Ball height above the ground. */
export const BALL_Y = 0.18
/** Vertical wobble across the orbit, so it reads in 3D. */
export const BALL_Y_TILT = 0.06

// --- Progression (consumed in a later phase) ---
/** Clears between world changes. */
export const TRAVEL_EVERY = 10

// --- Ball physics (rev 2: a real tethered particle, not a scripted orbit) ---
/** Fixed simulation timestep. Never varies with display refresh rate. */
export const PHYS_DT = 1 / 120
/** Cartoon-weighted gravity; true 9.81 reads as floaty at this scale. */
export const GRAVITY = 14
/** Air drag, applied as exp(-AIR_DRAG * dt). */
export const AIR_DRAG = 0.5
/** Energy kept on a bounce, 0..1. A rubber ball on grass is fairly dead. */
export const GROUND_RESTITUTION = 0.38
/** Horizontal friction on impact, as exp(-k * dt). */
export const GROUND_FRICTION = 3.2
/** Gentler friction once it is rolling rather than skidding. */
export const ROLL_FRICTION = 0.9
/** Below this speed on the ground, the ball is considered at rest. */
export const REST_SPEED = 0.12
/** Ball radius. Sized against a cougar whose shoulder stands at 0.74. */
export const BALL_RADIUS = 0.115
/** Cord length from the ankle cuff. */
export const CORD_LENGTH = 0.85
/** Hard cap, so a mashed kick cannot blow up the constraint solver. */
export const MAX_BALL_SPEED = 14
/** Screen-drag to world-velocity scale for a fling. */
export const FLING_SCALE = 7
