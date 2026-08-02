/**
 * A deliberately gentle follow camera for a young child.
 *
 * The base composition stays stable around Purple Cougar; the ball may pull
 * the look target a little when it makes a big, meaningful move, but it never
 * drags the camera into a whip-pan or leaves the character off screen.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import type { Vec3 } from './physics'

export interface FollowCamera {
  update(dt: number, cougar: Vec3, ball: Vec3, ballSpeed: number): void
  setAzimuth(deg: number): void
  reset(): void
}

// The Meadow now reads from a small bluff above the lake. The higher angle
// preserves Purple Cougar as the hero while letting the water remain a real,
// visible destination beyond the garden rather than a hidden blue sliver.
const BASE_DISTANCE = 2.78
const BASE_HEIGHT = 1.35
const BASE_AZIMUTH = Math.atan2(2.35, 3.05)
const LOOK_HEIGHT = 0.43
const LOOK_SMOOTHNESS = 5.4
const CAMERA_SMOOTHNESS = 4.2

export function createFollowCamera(camera: PerspectiveCamera): FollowCamera {
  const lookTarget = new Vector3(0, LOOK_HEIGHT, -0.18)
  const desiredLook = new Vector3()
  const desiredPosition = new Vector3()
  let azimuth = BASE_AZIMUTH

  function framingDistance(): number {
    // A portrait viewport has much less horizontal field of view. Back the
    // camera away smoothly so the cougar, ball, ramp, and bell remain one
    // readable play sentence instead of cropping into unrelated fragments.
    // iPad portrait is still wide enough for the authored play pad. Only the
    // much narrower phone shapes need extra distance; backing away on iPad
    // made the hero and landmarks feel toy-sized in an ocean of sky.
    const narrowness = Math.max(0, 0.68 - camera.aspect)
    return BASE_DISTANCE * (1 + narrowness * 1.6)
  }

  function portraitFramingOffset(): number {
    // The three-quarter hero pose leans toward screen-left. On a phone, a
    // slight look-target shift keeps her face in frame while preserving the
    // ball's generous tap space on the right.
    return -Math.max(0, 0.68 - camera.aspect) * 1.45
  }

  function reset(): void {
    azimuth = BASE_AZIMUTH
    lookTarget.set(portraitFramingOffset(), LOOK_HEIGHT, -0.18)
    const distance = framingDistance()
    camera.position.set(
      Math.sin(azimuth) * distance,
      BASE_HEIGHT,
      Math.cos(azimuth) * distance,
    )
    camera.lookAt(lookTarget)
  }

  reset()

  return {
    update(dt, cougar, ball, ballSpeed) {
      const safeDt = Math.max(0, Math.min(dt, 0.05))
      // The ball earns camera attention only when it is actually moving. Its
      // influence is deliberately capped so Purple Cougar remains the hero.
      const attention = Math.min(0.28, Math.max(0, (ballSpeed - 1.2) * 0.035))
      desiredLook.set(
        cougar.x + (ball.x - cougar.x) * attention + portraitFramingOffset(),
        LOOK_HEIGHT + Math.max(-0.08, Math.min(0.18, (ball.y - LOOK_HEIGHT) * attention)),
        cougar.z + (ball.z - cougar.z) * attention - 0.18,
      )
      lookTarget.lerp(desiredLook, 1 - Math.exp(-LOOK_SMOOTHNESS * safeDt))

      desiredPosition.set(
        lookTarget.x + Math.sin(azimuth) * framingDistance(),
        lookTarget.y + (BASE_HEIGHT - LOOK_HEIGHT),
        lookTarget.z + Math.cos(azimuth) * framingDistance(),
      )
      camera.position.lerp(desiredPosition, 1 - Math.exp(-CAMERA_SMOOTHNESS * safeDt))
      camera.lookAt(lookTarget)
    },
    setAzimuth(deg) {
      azimuth = (deg * Math.PI) / 180
    },
    reset,
  }
}
