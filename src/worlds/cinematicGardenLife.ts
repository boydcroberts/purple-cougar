/**
 * Sparse camera-locked garden life for the authored cinematic plate.
 *
 * This layer intentionally lives only at the outer garden edges: the cougar,
 * tethered ball, and railway remain the readable play sentence. It uses two
 * tiny instanced draw calls instead of textures or a particle system: warm
 * pollen nearer to the garden and small lake glints farther back.
 */
import {
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'
import type { Camera } from 'three'

const DEFAULT_POLLEN_COUNT = 10
const DEFAULT_GLINT_COUNT = 4
const MAX_POLLEN_COUNT = 18
const MAX_GLINT_COUNT = 8
const DEFAULT_POLLEN_DISTANCE = 16.5
const DEFAULT_GLINT_DISTANCE = 26
const BURST_SECONDS = 0.78

export interface GardenLifeViewport {
  /** Camera-space viewport width at the layer's depth. */
  readonly width: number
  /** Camera-space viewport height at the layer's depth. */
  readonly height: number
}

export interface GardenLifeMotePose {
  /** Camera-local horizontal position. */
  readonly x: number
  /** Camera-local vertical position. */
  readonly y: number
  /** Radius for the unit-circle pollen geometry. */
  readonly radius: number
}

export interface GardenLifeGlintPose {
  /** Camera-local horizontal position. */
  readonly x: number
  /** Camera-local vertical position. */
  readonly y: number
  /** Width for the unit glint plane. */
  readonly width: number
  /** Height for the unit glint plane. */
  readonly height: number
}

export interface CinematicGardenLifeOptions {
  /** Sparse warm motes in the outer flower beds. Defaults to 10. */
  readonly pollenCount?: number
  /** Distant, low-contrast lake glints. Defaults to 4. */
  readonly glintCount?: number
  /** Camera-space pollen depth. It must remain behind the live hero. */
  readonly pollenDistance?: number
  /** Camera-space lake-glint depth. It should remain behind the train. */
  readonly glintDistance?: number
}

export interface CinematicGardenLife {
  /** Add once to the stage scene; update keeps its layers camera-locked. */
  readonly root: Group
  /** Warm outer-frame pollen; exposed for deliberate renderer tuning only. */
  readonly pollen: InstancedMesh<CircleGeometry, MeshBasicMaterial>
  /** Far lake-light slivers; exposed for deliberate renderer tuning only. */
  readonly glints: InstancedMesh<PlaneGeometry, MeshBasicMaterial>
  /** Advance the quiet ambient motion; reduced motion holds a stable pose. */
  update(camera: Camera, elapsedSeconds: number, reducedMotion?: boolean): void
  /** Trigger a short, optional shimmer after a joyful beat such as a bounce. */
  burst(elapsedSeconds?: number): void
  /** Release only geometry and materials created by this layer. */
  dispose(): void
}

interface PerspectiveCameraShape {
  readonly isPerspectiveCamera?: boolean
  readonly fov?: number
  readonly aspect?: number
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function count(value: number | undefined, fallback: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(maximum, Math.floor(value)))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function viewportAtDistance(camera: Camera, distance: number): GardenLifeViewport {
  const perspective = camera as Camera & PerspectiveCameraShape
  if (
    perspective.isPerspectiveCamera === true
    && Number.isFinite(perspective.fov)
    && Number.isFinite(perspective.aspect)
    && (perspective.fov ?? 0) > 0
    && (perspective.aspect ?? 0) > 0
  ) {
    const height = Math.max(
      0.1,
      Math.tan(((perspective.fov ?? 42) * Math.PI) / 360) * distance * 2,
    )
    return { width: height * (perspective.aspect ?? 1), height }
  }

  return { width: 20, height: 11 }
}

function seed(index: number): number {
  return Math.max(0, Math.floor(finite(index, 0)))
}

function edgeX(index: number, width: number): number {
  const safeIndex = seed(index)
  const side = safeIndex % 2 === 0 ? -1 : 1
  const lane = Math.floor(safeIndex / 2)
  // 35–46% of full viewport width keeps the central play corridor clear.
  return side * width * (0.35 + ((lane * 0.071) % 0.11))
}

/**
 * Deterministic outer-garden pollen sample, exposed so its spacing and
 * reduced-motion promise can be checked without a renderer.
 */
export function sampleCinematicGardenMote(
  index: number,
  viewport: GardenLifeViewport,
  elapsedSeconds: number,
  reducedMotion = false,
  burstStrength = 0,
): GardenLifeMotePose {
  const safeIndex = seed(index)
  const width = Math.max(0.1, finite(viewport.width, 20))
  const height = Math.max(0.1, finite(viewport.height, 11))
  const time = reducedMotion ? 0 : Math.max(0, finite(elapsedSeconds, 0))
  const phase = safeIndex * 2.399 + 0.47
  const verticalBand = -0.25 + ((safeIndex * 0.137) % 0.52)
  const driftX = reducedMotion ? 0 : Math.sin(time * 0.31 + phase) * width * 0.003
  const driftY = reducedMotion ? 0 : Math.cos(time * 0.43 + phase) * height * 0.006
  const twinkle = reducedMotion ? 0.74 : 0.7 + (Math.sin(time * 1.27 + phase) + 1) * 0.15
  const burst = reducedMotion ? 0 : clamp01(burstStrength)
  const baseRadius = Math.max(0.004, Math.min(height * 0.0016, width * 0.0011))

  return {
    x: edgeX(safeIndex, width) + driftX,
    y: height * verticalBand + driftY + burst * height * 0.004,
    radius: baseRadius * (twinkle + burst * 0.58),
  }
}

/** Distant lake-light sample; its position is also deliberately edge-biased. */
export function sampleCinematicGardenGlint(
  index: number,
  viewport: GardenLifeViewport,
  elapsedSeconds: number,
  reducedMotion = false,
  burstStrength = 0,
): GardenLifeGlintPose {
  const safeIndex = seed(index)
  const width = Math.max(0.1, finite(viewport.width, 20))
  const height = Math.max(0.1, finite(viewport.height, 11))
  const time = reducedMotion ? 0 : Math.max(0, finite(elapsedSeconds, 0))
  const phase = safeIndex * 1.791 + 0.8
  const side = safeIndex % 2 === 0 ? -1 : 1
  const baseX = side * width * (0.28 + ((safeIndex * 0.047) % 0.09))
  const baseY = height * (-0.05 + ((safeIndex * 0.109) % 0.16))
  const shimmer = reducedMotion ? 0.74 : 0.68 + (Math.sin(time * 0.94 + phase) + 1) * 0.16
  const burst = reducedMotion ? 0 : clamp01(burstStrength)
  const drift = reducedMotion ? 0 : Math.sin(time * 0.24 + phase) * width * 0.002

  return {
    x: baseX + drift,
    y: baseY,
    width: width * 0.009 * (shimmer + burst * 0.7),
    height: Math.max(0.004, height * 0.00105 * (0.8 + shimmer * 0.2 + burst * 0.25)),
  }
}

function burstEnvelope(elapsedSeconds: number, startedAt: number | null): number {
  if (startedAt === null) return 0
  const progress = (elapsedSeconds - startedAt) / BURST_SECONDS
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1) return 0
  return Math.sin(progress * Math.PI)
}

/**
 * Creates a few quiet, no-asset garden details. They are camera-locked so the
 * authored plate continues to read as the world and no particle can wander
 * across the cougar, ball, or railway during a follow-camera adjustment.
 */
export function createCinematicGardenLife(
  options: CinematicGardenLifeOptions = {},
): CinematicGardenLife {
  const pollenCount = count(options.pollenCount, DEFAULT_POLLEN_COUNT, MAX_POLLEN_COUNT)
  const glintCount = count(options.glintCount, DEFAULT_GLINT_COUNT, MAX_GLINT_COUNT)
  const pollenDistance = positive(options.pollenDistance, DEFAULT_POLLEN_DISTANCE)
  const glintDistance = positive(options.glintDistance, DEFAULT_GLINT_DISTANCE)

  const root = new Group()
  root.name = 'Cinematic garden life'
  root.userData.kind = 'cinematic-garden-life'

  const pollenLayer = new Group()
  pollenLayer.name = 'Cinematic garden pollen layer'
  const glintLayer = new Group()
  glintLayer.name = 'Cinematic garden lake-glint layer'
  root.add(pollenLayer, glintLayer)

  const pollenGeometry = new CircleGeometry(1, 10)
  const pollenMaterial = new MeshBasicMaterial({
    color: 0xffe9b5,
    transparent: true,
    opacity: 0.34,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const pollen = new InstancedMesh(pollenGeometry, pollenMaterial, pollenCount)
  pollen.name = 'Outer garden pollen motes'
  pollen.renderOrder = -5
  pollen.frustumCulled = false
  pollen.visible = false
  pollen.instanceMatrix.setUsage(DynamicDrawUsage)
  pollenLayer.add(pollen)

  const glintGeometry = new PlaneGeometry(1, 1)
  const glintMaterial = new MeshBasicMaterial({
    color: 0xffcf8a,
    transparent: true,
    opacity: 0.2,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const glints = new InstancedMesh(glintGeometry, glintMaterial, glintCount)
  glints.name = 'Distant warm garden glints'
  glints.renderOrder = -6
  glints.frustumCulled = false
  glints.visible = false
  glints.instanceMatrix.setUsage(DynamicDrawUsage)
  glintLayer.add(glints)

  const pollenColour = new Color()
  for (let index = 0; index < pollenCount; index++) {
    const warmth = 0.72 + (index % 3) * 0.12
    pollen.setColorAt(index, pollenColour.setRGB(1, warmth, 0.58 + warmth * 0.18))
  }
  if (pollen.instanceColor) pollen.instanceColor.needsUpdate = true

  const glintColour = new Color()
  for (let index = 0; index < glintCount; index++) {
    const warmth = 0.72 + (index % 2) * 0.16
    glints.setColorAt(index, glintColour.setRGB(1, warmth, 0.46 + warmth * 0.26))
  }
  if (glints.instanceColor) glints.instanceColor.needsUpdate = true

  const cameraPosition = new Vector3()
  const cameraForward = new Vector3()
  const cameraQuaternion = new Quaternion()
  const instancePosition = new Vector3()
  const instanceScale = new Vector3()
  const instanceQuaternion = new Quaternion()
  const instanceMatrix = new Matrix4()
  let burstStartedAt: number | null = null
  let lastElapsed = 0
  let disposed = false

  function placeLayer(layer: Group, distance: number): void {
    layer.position.copy(cameraPosition).addScaledVector(cameraForward, distance)
    layer.quaternion.copy(cameraQuaternion)
  }

  function update(camera: Camera, elapsedSeconds: number, reducedMotion = false): void {
    if (disposed) return
    const elapsed = Math.max(0, finite(elapsedSeconds, lastElapsed))
    lastElapsed = elapsed
    const burst = reducedMotion ? 0 : burstEnvelope(elapsed, burstStartedAt)
    if (burstStartedAt !== null && elapsed - burstStartedAt >= BURST_SECONDS) burstStartedAt = null

    camera.updateWorldMatrix(true, false)
    camera.getWorldPosition(cameraPosition)
    camera.getWorldQuaternion(cameraQuaternion)
    cameraForward.set(0, 0, -1).applyQuaternion(cameraQuaternion)
    placeLayer(pollenLayer, pollenDistance)
    placeLayer(glintLayer, glintDistance)

    const pollenViewport = viewportAtDistance(camera, pollenDistance)
    for (let index = 0; index < pollenCount; index++) {
      const pose = sampleCinematicGardenMote(index, pollenViewport, elapsed, reducedMotion, burst)
      instancePosition.set(pose.x, pose.y, -index * 0.0004)
      instanceScale.setScalar(pose.radius)
      instanceMatrix.compose(instancePosition, instanceQuaternion.identity(), instanceScale)
      pollen.setMatrixAt(index, instanceMatrix)
    }
    pollen.instanceMatrix.needsUpdate = true
    pollen.visible = pollenCount > 0

    const glintViewport = viewportAtDistance(camera, glintDistance)
    for (let index = 0; index < glintCount; index++) {
      const pose = sampleCinematicGardenGlint(index, glintViewport, elapsed, reducedMotion, burst)
      instancePosition.set(pose.x, pose.y, -index * 0.0004)
      instanceScale.set(pose.width, pose.height, 1)
      instanceMatrix.compose(instancePosition, instanceQuaternion.identity(), instanceScale)
      glints.setMatrixAt(index, instanceMatrix)
    }
    glints.instanceMatrix.needsUpdate = true
    glints.visible = glintCount > 0
  }

  function burst(elapsedSeconds = lastElapsed): void {
    if (disposed) return
    burstStartedAt = Math.max(0, finite(elapsedSeconds, lastElapsed))
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    root.removeFromParent()
    pollen.visible = false
    glints.visible = false
    pollenGeometry.dispose()
    pollenMaterial.dispose()
    glintGeometry.dispose()
    glintMaterial.dispose()
  }

  return { root, pollen, glints, update, burst, dispose }
}
