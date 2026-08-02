import {
  Group,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  type Camera,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  CINEMATIC_ENVIRONMENT_DISTANCE,
  GARDEN_RAIL_HEAD_SOURCE_Y,
  cinematicGardenRailHeadY,
  createCinematicEnvironment,
} from '../src/worlds/cinematicEnvironment'
import {
  CINEMATIC_TRAIN_DISTANCE,
  PURPLE_EXCURSION_TRAIN_ASSET_URL,
  cinematicTrainWheelContactY,
  createCinematicTrain,
  isCinematicTrainHitUv,
  sampleCinematicTrainSteamPuff,
  type CinematicTrainTextureLoader,
} from '../src/worlds/cinematicTrain'

function createCamera(aspect = 16 / 9): PerspectiveCamera {
  const camera = new PerspectiveCamera(42, aspect, 0.1, 100)
  camera.position.set(2.35, 1.35, 3.05)
  camera.lookAt(0, 0.43, -0.18)
  camera.updateWorldMatrix(true, false)
  return camera
}

function expectedCameraLockedPosition(camera: Camera, distance: number): Vector3 {
  const position = new Vector3()
  const forward = new Vector3()
  camera.getWorldPosition(position)
  camera.getWorldDirection(forward)
  return position.addScaledVector(forward, distance)
}

function raycasterAtTrainLocalPoint(
  train: ReturnType<typeof createCinematicTrain>,
  camera: PerspectiveCamera,
  localPoint: Vector3,
): Raycaster {
  train.root.updateWorldMatrix(true, true)
  const point = train.image.localToWorld(localPoint.clone()).project(camera)
  const raycaster = new Raycaster()
  raycaster.setFromCamera(new Vector2(point.x, point.y), camera)
  return raycaster
}

describe('cinematic purple excursion train', () => {
  it('only accepts UV bands occupied by the painted train, not its alpha padding', () => {
    // Boiler centre and the top of the tall funnel are both real train art.
    expect(isCinematicTrainHitUv(0.7, 1 - 0.5)).toBe(true)
    expect(isCinematicTrainHitUv(0.804, 1 - 0.147)).toBe(true)

    // Sky over the cars, grass below the rails, and the gap outside the card
    // all stay tap-through even though Three's plane raycaster intersects.
    expect(isCinematicTrainHitUv(0.5, 1 - 0.1)).toBe(false)
    expect(isCinematicTrainHitUv(0.5, 1 - 0.91)).toBe(false)
    expect(isCinematicTrainHitUv(1.1, 0.5)).toBe(false)
  })

  it('returns a typed ray hit only for visible artwork, never the transparent card margin', () => {
    const train = createCinematicTrain()
    const camera = createCamera()
    train.setTexture(new Texture())
    // 0.06 + the initial 0.44 phase centres the crossing in frame.
    train.update(camera, 22 * 0.06)

    expect(train.hitTest(raycasterAtTrainLocalPoint(train, camera, new Vector3()))).not.toBeNull()

    // PlaneGeometry maps its top edge to v=1. This lies in the clear sky
    // above the card's visible train, where a raw plane raycast would hit.
    const cardHeight = train.image.geometry.parameters.height
    const blankPoint = new Vector3(0, cardHeight * 0.4, 0)
    expect(train.hitTest(raycasterAtTrainLocalPoint(train, camera, blankPoint))).toBeNull()
  })

  it('emits restrained steam from the painted funnel and trails it upward behind the engine', () => {
    const atFunnel = sampleCinematicTrainSteamPuff(0, 0, 5.5)
    const inFlight = sampleCinematicTrainSteamPuff(0.62, 0, 5.5)

    // 0.804 and 0.147 are the source funnel's measured image coordinates.
    expect(atFunnel.x).toBeCloseTo((0.804 - 0.5) * 5.5)
    expect(atFunnel.y).toBeCloseTo((0.5 - 0.147) * (5.5 / (1774 / 887)))
    expect(inFlight.x).toBeLessThan(atFunnel.x)
    expect(inFlight.y).toBeGreaterThan(atFunnel.y)
    expect(inFlight.scale).toBeGreaterThan(atFunnel.scale)
    expect(inFlight.opacity).toBeGreaterThan(0)
    expect(inFlight.opacity).toBeLessThan(0.15)
  })

  it('constructs and follows the camera without starting a browser image load', () => {
    const train = createCinematicTrain()
    const camera = createCamera()

    train.update(camera, 0)
    expect(train.root.position.distanceTo(expectedCameraLockedPosition(camera, 19))).toBeLessThan(1e-8)
    expect(train.vehicle.position.x).toBeLessThan(0)
    expect(train.image.visible).toBe(false)

    const firstPosition = train.vehicle.position.clone()
    train.update(camera, 4)
    expect(train.vehicle.position.x).toBeGreaterThan(firstPosition.x)
    expect(train.vehicle.position.y).not.toBe(firstPosition.y)

    camera.position.add(new Vector3(0.7, 0.1, -0.45))
    camera.lookAt(0, 0.43, -0.18)
    train.update(camera, 4)
    expect(train.root.position.distanceTo(expectedCameraLockedPosition(camera, 19))).toBeLessThan(1e-8)
  })

  it('places the painted wheels on the railway across ordinary desktop aspects', () => {
    for (const aspect of [4 / 3, 16 / 9, 21 / 9]) {
      const camera = createCamera(aspect)
      const environment = createCinematicEnvironment()
      const train = createCinematicTrain({
        screenY: (activeCamera) => {
          const perspective = activeCamera as PerspectiveCamera
          return (
            cinematicGardenRailHeadY(perspective.fov, perspective.aspect) *
              (CINEMATIC_TRAIN_DISTANCE / CINEMATIC_ENVIRONMENT_DISTANCE) -
            cinematicTrainWheelContactY()
          )
        },
      })
      train.setTexture(new Texture())

      environment.update(camera, 0)
      train.update(camera, 0)
      environment.root.updateWorldMatrix(true, true)
      train.root.updateWorldMatrix(true, true)

      // A PlaneGeometry's local coordinates are normalized; its world transform
      // applies the fitted environment scale. The train geometry already uses
      // its authored scene dimensions.
      const rail = environment.plate
        .localToWorld(new Vector3(0, 0.5 - GARDEN_RAIL_HEAD_SOURCE_Y, 0))
        .project(camera)
      const trainHeight = train.image.geometry.parameters.height
      const wheel = train.image
        .localToWorld(new Vector3(0, (0.5 - 0.8) * trainHeight, 0))
        .project(camera)

      expect(wheel.y).toBeCloseTo(rail.y, 2)
      train.dispose()
      environment.dispose()
    }
  })

  it('freezes the crossing and bob live when the shared motion preference changes', () => {
    const motion = { reducedMotion: false }
    const train = createCinematicTrain(motion)
    const camera = createCamera()

    train.update(camera, 1)
    motion.reducedMotion = true
    train.update(camera, 2)
    const restingPosition = train.vehicle.position.clone()
    train.update(camera, 40)

    expect(train.vehicle.position).toEqual(restingPosition)
  })

  it('accepts an injected loader and disposes only its internally loaded texture', async () => {
    const texture = new Texture()
    const textureDispose = vi.spyOn(texture, 'dispose')
    const loader: CinematicTrainTextureLoader = {
      loadAsync: vi.fn(async (url: string) => {
        expect(url).toBe(PURPLE_EXCURSION_TRAIN_ASSET_URL)
        return texture
      }),
    }
    const train = createCinematicTrain()
    const parent = new Group()
    parent.add(train.root)

    await expect(train.load(loader)).resolves.toBe(true)
    expect(train.image.visible).toBe(true)
    expect(train.image.material.map).toBe(texture)
    expect(texture.colorSpace).toBe(SRGBColorSpace)

    train.update(createCamera(), 1)
    expect(train.steam.visible).toBe(true)

    train.dispose()
    train.dispose()
    expect(train.root.parent).toBeNull()
    expect(textureDispose).toHaveBeenCalledTimes(1)
  })

  it('hides visual exhaust under reduced motion while keeping the train card available', async () => {
    const texture = new Texture()
    const train = createCinematicTrain({ reducedMotion: true })
    await train.load({ loadAsync: async () => texture })

    train.update(createCamera(), 5)
    expect(train.image.visible).toBe(true)
    expect(train.steam.visible).toBe(false)
  })
})
