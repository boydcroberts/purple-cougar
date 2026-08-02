import { createSfx } from './audio'
import { createBallView } from './ballView'
import { createFollowCamera } from './cameraController'
import {
  createCougarBehavior,
  type CougarReaction,
} from './cougar/behavior'
import {
  createHeroDriverQuadruped,
  loadHeroBillboard,
  type HeroBillboard,
} from './cougar/heroBillboard'
import { createPalette } from './cougar/materials'
import type { Quadruped } from './cougar/quadruped'
import { BALL_RADIUS, FLING_SCALE, PHYS_DT } from './constants'
import { loadTotal, saveTotal } from './counter'
import { BouncingBallDirector, type PlayEvent } from './playDirector'
import {
  atRest,
  createBall,
  kick,
  speed,
  stepBall,
  type BallPhysics,
} from './physics'
import { createRoarRings } from './roarRings'
import { createStage } from './scene'
import { createPlayUi } from './playUi'
import { createCinematicButterfly } from './worlds/cinematicButterfly'
import {
  CINEMATIC_ENVIRONMENT_DISTANCE,
  cinematicGardenRailHeadY,
  createCinematicEnvironment,
} from './worlds/cinematicEnvironment'
import { createCinematicSquirrel } from './worlds/cinematicSquirrel'
import {
  CINEMATIC_TRAIN_DISTANCE,
  cinematicTrainWheelContactY,
  createCinematicTrain,
} from './worlds/cinematicTrain'
import { GARDEN_DISCOVERIES } from './worlds/gardenDiscoveries'
import type { ParkBackdrop } from './worlds/parkBackdrop'
import type { MeadowSlice } from './worlds/meadowSlice'
import type { StonePath } from './worlds/stonePath'
import type { WhiteSquirrel } from './worlds/whiteSquirrel'
import type { WncGarden } from './worlds/wncGarden'
import type { ForegroundFringe } from './worlds/foregroundFringe'
import type { WncTrees } from './worlds/wncTrees'
import { Raycaster, Vector2, Vector3 } from 'three'

declare global {
  interface Window {
    __pc: {
      ball: BallPhysics
      cougar: Quadruped
      phase(): string
      total(): number
      tap(): void
      bat(power?: number): void
      fling(x: number, y: number): void
      stepPhysics(n?: number): void
      speed(): number
      atRest(): boolean
      setCameraAzimuth(deg: number): void
      roar(): void
      cameraPos(): [number, number, number]
      squirrelDash(): void
      project(x: number, y: number, z: number): [number, number]
    }
  }
}

async function start(): Promise<void> {
const host = document.getElementById('app')
if (!host) throw new Error('#app missing from index.html')

const stage = createStage(host)
const camera = createFollowCamera(stage.camera)
// The reference-matched cutout is the default desktop presentation. A tiny
// compatible rig remains underneath for behavior and physics; `?model=1`,
// `?model=v2`, and `?procedural=1` are narrow visual-debug escape hatches.
const searchParams = new URLSearchParams(window.location.search)
const forceProcedural = searchParams.get('procedural') === '1'
const modelDebugTarget = searchParams.get('model')
const forceModel = modelDebugTarget === '1' || modelDebugTarget === 'v2'
// The cinematic plate now has more garden and train information worth seeing.
// Scale the invisible physics driver with the visible hero so the cuff, ball,
// contact shadow, and pointer target remain a single coherent character.
const DESKTOP_HERO_SCALE = 0.8
// The prior primitive-heavy landscape remains available for diagnosis, but the
// shipping desktop experience uses a coherent authored environment so the
// world can meet the cougar's image quality without crowding her.
const useCinematicScenery = searchParams.get('legacyScenery') !== '1'
// Keep the dependable procedural sky and meadow visible until the authored
// scenic plate has actually loaded. This avoids a black fullscreen card on a
// slow connection or an unavailable asset.
stage.setCinematicEnvironmentMode(false)

// Every world module honours this mutable preference. It must exist before
// asset work starts so the garden, train, and hero can begin loading in
// parallel without losing a live OS-motion update.
const motion = { reducedMotion: false }
const reducedMotionQuery =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null
motion.reducedMotion = reducedMotionQuery?.matches === true
reducedMotionQuery?.addEventListener('change', (event) => {
  motion.reducedMotion = event.matches
})

const cinematicEnvironment = useCinematicScenery ? createCinematicEnvironment() : null
const cinematicTrain = useCinematicScenery
  ? createCinematicTrain({
      // Keep this as a live getter instead of spreading `motion`: the OS
      // preference can change while the page is open, and the train must stop
      // with the butterfly and squirrel on the following frame.
      get reducedMotion() {
        return motion.reducedMotion
      },
      screenY: (activeCamera) => {
        const camera = activeCamera as typeof stage.camera
        const railY = cinematicGardenRailHeadY(camera.fov, camera.aspect)
        // Cards at different camera depths align in projected screen space,
        // not by copying their local y coordinate directly.
        return (
          railY * (CINEMATIC_TRAIN_DISTANCE / CINEMATIC_ENVIRONMENT_DISTANCE) -
          cinematicTrainWheelContactY()
        )
      },
    })
  : null
const cinematicSquirrel = useCinematicScenery ? createCinematicSquirrel() : null
const cinematicButterfly = useCinematicScenery ? createCinematicButterfly(motion) : null
let cinematicSceneryReady = false
let cinematicSquirrelActivated = false
let cinematicButterflyActivated = false

function syncCinematicCardVisibility(): void {
  if (!useCinematicScenery) return
  cinematicTrain!.root.visible = cinematicSceneryReady
  cinematicSquirrel!.root.visible = cinematicSceneryReady && cinematicSquirrelActivated
  cinematicButterfly!.root.visible = cinematicSceneryReady && cinematicButterflyActivated
}

if (useCinematicScenery) {
  // The fallback sky/meadow is rendered immediately. The real garden and its
  // dependent cards load in parallel with the hero, but cannot appear until
  // that garden has faded fully in.
  syncCinematicCardVisibility()
  stage.scene.add(
    cinematicEnvironment!.root,
    cinematicTrain!.root,
    cinematicSquirrel!.root,
    cinematicButterfly!.root,
  )
  void cinematicEnvironment!.load()
  void cinematicTrain!.load()
  void cinematicButterfly!.load()
  stage.render()
}

const modelAssetUrl =
  modelDebugTarget === 'v2'
    ? '/assets/purple-cougar-v2.glb'
    : '/assets/purple-cougar.glb'
const palette = createPalette({ uvCountershade: forceProcedural })
let cougar: Quadruped
let heroVisual: HeroBillboard | null = null

if (forceProcedural) {
  const { createQuadruped } = await import('./cougar/quadruped')
  cougar = createQuadruped(palette)
} else if (forceModel) {
  const { loadHeroQuadruped } = await import('./cougar/modelAsset')
  cougar = await loadHeroQuadruped(palette, modelAssetUrl)
  if (modelDebugTarget === 'v2') {
    // The v2 armature is authored at Blender's full character scale. Keep its
    // quarantined comparison route framed inside the existing desktop stage.
    cougar.root.scale.setScalar(0.86)
  }
} else {
  cougar = createHeroDriverQuadruped()
  try {
    heroVisual = await loadHeroBillboard(cougar.root)
    cougar.root.scale.setScalar(DESKTOP_HERO_SCALE)
    stage.setFlatHeroMode(true)
  } catch (error) {
    console.warn(
      'Reference-matched Purple Cougar could not load; falling back to 3D.',
      error,
    )
    const { loadHeroQuadruped } = await import('./cougar/modelAsset')
    cougar = await loadHeroQuadruped(palette)
  }
}

const behavior = createCougarBehavior(cougar, {
  initialMood: 'calm',
  neckPivot: { x: 0, y: 0.62, z: 0.34 },
  tailPivot: { x: 0, y: 0.61, z: -0.75 },
})
const ballView = createBallView()
const roarRings = createRoarRings()
let meadow: MeadowSlice | null = null
let backdrop: ParkBackdrop | null = null
let trees: WncTrees | null = null
let garden: WncGarden | null = null
let stonePath: StonePath | null = null
let squirrel: WhiteSquirrel | null = null
let foregroundFringe: ForegroundFringe | null = null
const ui = createPlayUi(document.body)
ui.setReducedMotion(motion.reducedMotion)
ui.setExplorationEnabled(false)
reducedMotionQuery?.addEventListener('change', (event) => {
  ui.setReducedMotion(event.matches)
})
const sfx = createSfx()

if (!useCinematicScenery) {
  // Keep the prior procedural world reachable for visual comparison without
  // shipping its 1,700+ mesh construction cost to the default desktop scene.
  const [
    { createMeadowSlice },
    { createParkBackdrop },
    { createWncTrees },
    { createWncGarden },
    { createStonePath },
    { createWhiteSquirrel },
    { createForegroundFringe },
  ] = await Promise.all([
    import('./worlds/meadowSlice'),
    import('./worlds/parkBackdrop'),
    import('./worlds/wncTrees'),
    import('./worlds/wncGarden'),
    import('./worlds/stonePath'),
    import('./worlds/whiteSquirrel'),
    import('./worlds/foregroundFringe'),
  ])
  meadow = createMeadowSlice(motion)
  backdrop = createParkBackdrop(motion)
  trees = createWncTrees(motion)
  garden = createWncGarden(motion)
  stonePath = createStonePath(motion)
  squirrel = createWhiteSquirrel(motion)
  foregroundFringe = createForegroundFringe(motion)
  stage.scene.add(
    backdrop.root,
    trees.root,
    garden.root,
    stonePath.root,
    meadow.root,
    squirrel.root,
    foregroundFringe.root,
  )
  squirrel.onDashStart(() => sfx.chitter())
}
stage.scene.add(cougar.root, ballView.group, roarRings.group)
if (heroVisual) stage.scene.add(heroVisual.root)

const store = (() => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
})()

const SOUND_MUTED_KEY = 'purple-cougar:sound-muted'

function loadSoundMuted(): boolean {
  if (!store) return false
  try {
    return store.getItem(SOUND_MUTED_KEY) === 'true'
  } catch {
    return false
  }
}

function saveSoundMuted(muted: boolean): void {
  if (!store) return
  try {
    store.setItem(SOUND_MUTED_KEY, muted ? 'true' : 'false')
  } catch {
    // Settings storage is a convenience; failed persistence must not stop play.
  }
}

const initialSoundMuted = loadSoundMuted()
sfx.setMuted(initialSoundMuted)
ui.setSoundMuted(initialSoundMuted)
ui.onSoundToggle((muted) => {
  sfx.setMuted(muted)
  saveSoundMuted(muted)
})

// The transparent hero faces the camera, so its painted cuff is a presentation
// anchor rather than a stable physics point. Keep both explicitly: camera
// movement can move the rendered cord endpoint without injecting energy into
// the tethered ball simulation.
const physicsCuff = new Vector3()
const visualCuff = new Vector3()

function syncCuffs(): void {
  cougar.syncCuff()
  physicsCuff.copy(cougar.cuffWorld)
  visualCuff.copy(physicsCuff)
  heroVisual?.syncCuff(visualCuff)
}

heroVisual?.update(0, stage.camera, cougar.root)
syncCuffs()
const ball: BallPhysics = createBall(physicsCuff)
const story = new BouncingBallDirector()
// The authored ramp/bell course is intentionally out of the current desktop
// composition. Keep its controller code available, but do not let invisible
// surfaces or guidance impulses affect free ball play.
const COURSE_ENABLED = false

// The old total survives in local storage as a private continuity signal, but
// is intentionally not displayed as a giant unexplained score to the child.
let total = loadTotal(store)

/** Deterministic variation keeps repeated taps playful without simulation RNG. */
let batCount = 0
const GOLDEN = 2.399963229728653
let elapsed = 0
let rampReadyAt = Number.NEGATIVE_INFINITY
let launchedFromRamp = false
let lastBellGuidanceAt = Number.NEGATIVE_INFINITY

function reactCougar(reaction: CougarReaction, intensity = 1): void {
  behavior.react(reaction, intensity)
  heroVisual?.react(reaction, intensity)
}

function addPlayMemory(): void {
  total += 1
  saveTotal(total, store)
}

function bat(power = 1): void {
  const a = batCount++ * GOLDEN
  const lift = 3.2 + (batCount % 3) * 0.42
  kick(
    ball,
    Math.cos(a) * 4.45 * power,
    lift * power,
    Math.sin(a) * 4.45 * power,
  )
  addPlayMemory()
  sfx.whoosh()
}

function launchFromGesture(dx: number, dy: number): void {
  const dist = Math.hypot(dx, dy)
  if (dist < 1) {
    bat()
    return
  }

  // Screen-right maps through the camera's own basis, so the throw follows
  // what the child saw rather than a hidden world-space coordinate system.
  const forward = new Vector3()
  stage.camera.getWorldDirection(forward)
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize()
  const flatForward = new Vector3(forward.x, 0, forward.z).normalize()
  const strength = Math.min(dist / 160, 2.2) * FLING_SCALE
  const unitX = dx / dist
  const unitY = -dy / dist
  kick(
    ball,
    (right.x * unitX + flatForward.x * unitY) * strength,
    Math.max(0.4, unitY) * strength * 0.55 + 1.4,
    (right.z * unitX + flatForward.z * unitY) * strength,
  )
  addPlayMemory()
  reactCougar('surprised', 0.8)
  sfx.whoosh()
}

function guideBallToRamp(): void {
  if (!COURSE_ENABLED || !meadow) return
  const target = meadow.ramp.center
  const dx = target.x - ball.pos.x
  const dz = target.z - ball.pos.z
  const length = Math.max(0.001, Math.hypot(dx, dz))
  // A soft guided toss is more generous than requiring a three-year-old to
  // aim precisely at a newly revealed ramp.
  kick(ball, (dx / length) * 4.2, 2.15, (dz / length) * 4.2)
}

function launchTowardBell(force = false): void {
  if (!COURSE_ENABLED || !meadow) return
  if (launchedFromRamp && !force) return
  launchedFromRamp = true
  lastBellGuidanceAt = elapsed
  const target = meadow.bellTarget
  const dx = target.x - ball.pos.x
  const dy = target.y - ball.pos.y
  const dz = target.z - ball.pos.z
  // Aim by a short flight time rather than an approximate direction. This is
  // still a bounded impulse, but it gives the child the promised bell result
  // even if a tiny hand did not fling from an ideal ramp angle.
  const travel = Math.max(0.24, Math.min(0.46, Math.hypot(dx, dz) / 4.1))
  const desiredVx = dx / travel
  const desiredVz = dz / travel
  const desiredVy = dy / travel + 0.5 * 14 * travel
  kick(
    ball,
    desiredVx - ball.vel.x,
    desiredVy - ball.vel.y,
    desiredVz - ball.vel.z,
  )
}

function isOverRamp(): boolean {
  if (!meadow) return false
  const { center, width, depth } = meadow.ramp
  return (
    Math.abs(ball.pos.x - center.x) <= width * 0.5 + BALL_RADIUS &&
    Math.abs(ball.pos.z - center.z) <= depth * 0.5 + BALL_RADIUS
  )
}

/** A simple, bounded surface assist for the authored first-playable ramp. */
function applyRampSurface(): void {
  if (!COURSE_ENABLED || !meadow || !story.snapshot().rampReady || !isOverRamp()) return
  const { center, depth, rise } = meadow.ramp
  const localZ = ball.pos.z - center.z
  const normalized = Math.max(0, Math.min(1, 0.5 - localZ / depth))
  const surface = normalized * rise
  if (ball.pos.y <= surface + BALL_RADIUS + 0.05) {
    ball.pos.y = Math.max(ball.pos.y, surface + BALL_RADIUS)
    if (ball.vel.y < 0) ball.vel.y = 0
    // Downhill points toward +Z in the meadow's authored orientation.
    ball.vel.z += PHYS_DT * 2.5
    if (Math.abs(ball.vel.x) > 0.02) ball.vel.x *= 0.997
    launchTowardBell()
  }
}

function handleStoryEvents(events: readonly PlayEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case 'wake':
        behavior.setMood('curious', 0.35)
        reactCougar('happy', 0.85)
        sfx.wake()
        ui.announce('Purple Cougar woke up.')
        break
      case 'invite-ball':
        behavior.setMood('curious', 0.3)
        ballView.setInviting(true)
        sfx.purr()
        ui.showBallInvite()
        break
      case 'ball-tapped':
        ballView.setInviting(false)
        behavior.setMood('excited', 0.2)
        reactCougar('surprised', 0.8)
        ui.setExplorationEnabled(true)
        if (useCinematicScenery && !cinematicSquirrelActivated) {
          cinematicSquirrelActivated = true
          // Its first run belongs to the discoverable world, not the inactive
          // opening sequence where a child cannot tap it yet.
          cinematicSquirrel!.activate(elapsed)
        }
        if (useCinematicScenery && !cinematicButterflyActivated) {
          cinematicButterflyActivated = true
        }
        if (useCinematicScenery) syncCinematicCardVisibility()
        break
      case 'bounce':
        sfx.bounce()
        ui.showBounce(event.count)
        reactCougar(event.count >= 3 ? 'happy' : 'surprised', 0.72)
        break
      case 'ramp-ready':
        rampReadyAt = elapsed
        launchedFromRamp = false
        behavior.setMood('excited', 0.18)
        ballView.celebrate()
        if (COURSE_ENABLED) {
          ui.showRampReady()
          guideBallToRamp()
        } else {
          // The ramp is deliberately absent from the focused desktop scene.
          // Complete the play loop without inventing an invisible bell target.
          handleStoryEvents(story.completeWithoutCourse())
        }
        break
      case 'bell-rung':
        sfx.bell()
        break
      case 'celebrate':
        // The celebration IS the roar moment: a proud call first, then the
        // happy wag as the cheer lands.
        roarNow(1.3)
        window.setTimeout(() => reactCougar('happy', 1.25), 1150)
        ballView.celebrate()
        ui.celebrate()
        break
      case 'train-tease':
        behavior.setMood('curious', 0.5)
        ui.announce('Purple Mountain Express is rolling through the mountains.')
        break
    }
  }
}

function handleTap(): void {
  sfx.unlock()
  const events = story.tap()
  handleStoryEvents(events)
  if (events.some((event) => event.type === 'ball-tapped')) bat()
}

// --- The mighty friendly roar. Tapping Purple Cougar herself makes her call
// out — chin up, chest puffed, rings bursting from her muzzle. Rate-limited so
// a delighted mash becomes purrs instead of a broken, restarting animation.
const ROAR_COOLDOWN = 2.2
let lastRoarAt = Number.NEGATIVE_INFINITY
const tapRaycaster = new Raycaster()
const tapNdc = new Vector2()
const roarOrigin = new Vector3()
const cameraRight = new Vector3()
const cameraToward = new Vector3()
let lastButterflyDiscoveryAt = Number.NEGATIVE_INFINITY
let gardenDiscoveryCursor = 0

function canExploreWorld(): boolean {
  const phase = story.snapshot().phase
  return (
    phase === 'playing' ||
    phase === 'ramp-ready' ||
    phase === 'celebrating' ||
    phase === 'free-play'
  )
}

function roarNow(intensity = 1.2): void {
  lastRoarAt = elapsed
  reactCougar('roar', intensity)
  sfx.roar()
  behavior.setMood('excited', 0.3)
  // Burst the rings by her muzzle: her head is painted on the camera-left
  // side of the hero card, so offset along the camera's own basis.
  cameraRight.setFromMatrixColumn(stage.camera.matrixWorld, 0)
  cameraToward.subVectors(stage.camera.position, cougar.root.position).normalize()
  roarOrigin
    .copy(cougar.root.position)
    .addScaledVector(cameraRight, -0.44)
    .addScaledVector(cameraToward, 0.3)
  roarOrigin.y += 0.8
  roarRings.burst(roarOrigin)
}

/**
 * Returns true when the tap was spent on the cougar (roar or cooldown purr),
 * so it must not also launch the ball.
 */
function tryCougarTap(clientX: number, clientY: number): boolean {
  if (!heroVisual) return false
  const phase = story.snapshot().phase
  // The wake and invite beats keep their authored meaning; the roar joins
  // once real play has begun.
  if (phase === 'sleeping' || phase === 'waking' || phase === 'invite') return false

  const rect = stage.renderer.domElement.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  tapNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
  tapRaycaster.setFromCamera(tapNdc, stage.camera)
  // The ball always wins a close call — it is the story's co-star.
  if (tapRaycaster.ray.distanceToPoint(ballPoint.set(ball.pos.x, ball.pos.y, ball.pos.z)) < BALL_RADIUS * 2.4) {
    return false
  }
  if (!heroVisual.hitTest(tapRaycaster)) return false

  if (elapsed - lastRoarAt < ROAR_COOLDOWN) {
    // Mid-roar pats get a warm purr rather than dead silence.
    sfx.purr()
    return true
  }
  roarNow()
  return true
}
const ballPoint = new Vector3()

/**
 * A tap on the living world should teach or delight before it turns into a
 * generic ball tap. These targets live at the garden edges or far depth, so
 * they never steal the cougar/ball's central play space.
 */
function tryCinematicWorldTap(clientX: number, clientY: number): boolean {
  // The wake and first ball beat establish Purple Cougar as the hero. World
  // facts intentionally unlock only once that compact story is in play.
  if (!useCinematicScenery || !cinematicSceneryReady || !canExploreWorld()) return false
  const rect = stage.renderer.domElement.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false

  const normalizedX = (clientX - rect.left) / rect.width
  const normalizedY = (clientY - rect.top) / rect.height
  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) return false

  tapNdc.set(normalizedX * 2 - 1, -normalizedY * 2 + 1)
  tapRaycaster.setFromCamera(tapNdc, stage.camera)

  // The ball is the core toy. A world layer can be visually behind it, but a
  // plain geometric raycast cannot see the depth buffer, so preserve ball
  // priority explicitly before comparing background discovery cards.
  if (
    tapRaycaster.ray.distanceToPoint(ballPoint.set(ball.pos.x, ball.pos.y, ball.pos.z)) <
    BALL_RADIUS * 2.4
  ) {
    return false
  }

  // Each card filters its own transparent padding using authored UV regions.
  // Sort the remaining actual subject hits by camera distance so a near
  // butterfly never loses to a farther train merely due to code order.
  const squirrelHit = cinematicSquirrel?.hitTest(tapRaycaster)
  const butterflyHit = cinematicButterfly?.hitTest(tapRaycaster)
  const trainHit = cinematicTrain?.hitTest(tapRaycaster)
  const cardCandidates = [
    squirrelHit ? { kind: 'squirrel' as const, distance: squirrelHit.distance } : null,
    butterflyHit ? { kind: 'butterfly' as const, distance: butterflyHit.distance } : null,
    trainHit ? { kind: 'train' as const, distance: trainHit.distance } : null,
  ].filter((candidate): candidate is { kind: 'squirrel' | 'butterfly' | 'train'; distance: number } => candidate !== null)
  const nearestCard = cardCandidates.reduce<typeof cardCandidates[number] | null>(
    (nearest, candidate) => (!nearest || candidate.distance < nearest.distance ? candidate : nearest),
    null,
  )

  switch (nearestCard?.kind) {
    case 'squirrel':
      if (!cinematicSquirrel?.discover(elapsed)) return false
      sfx.chitter()
      behavior.setMood('curious', 0.38)
      ui.showDiscovery(
        'You found the white squirrel!',
        'Brevard white squirrel',
        'A squirrel uses its big fluffy tail to balance while it leaps.',
      )
      return true
    case 'butterfly':
      // Keep a freshly found butterfly magical rather than repeatedly opening
      // the same card while it hovers over a flower.
      if (elapsed - lastButterflyDiscoveryAt < 5.7) return true
      lastButterflyDiscoveryAt = elapsed
      sfx.whoosh()
      behavior.setMood('curious', 0.3)
      ui.showDiscovery(
        'Eastern tiger swallowtail',
        'Papilio glaucus',
        'A butterfly tastes with its feet before it sips nectar from a flower.',
      )
      return true
    case 'train':
      sfx.whistle()
      behavior.setMood('curious', 0.45)
      ui.showDiscovery(
        'Purple Mountain Express',
        'Steam excursion train',
        'Steam pushes the pistons, and the pistons turn the train wheels.',
      )
      return true
  }

  // Background scenery is intentionally visual-only. Invisible broad zones
  // made ordinary ball taps feel unreliable; only real train/animal artwork
  // and the explicit Explore control may open a learning fact.
  return false
}

function exploreNextGardenFact(): void {
  if (!canExploreWorld()) {
    ui.announce('Play with Purple Cougar and the ball first.')
    return
  }
  const discovery = GARDEN_DISCOVERIES[gardenDiscoveryCursor % GARDEN_DISCOVERIES.length]
  if (!discovery) return
  gardenDiscoveryCursor += 1
  behavior.setMood('curious', 0.22)
  ui.showDiscovery(discovery.commonName, discovery.botanicalName, discovery.fact)
}

ui.onExplore(exploreNextGardenFact)

function targetsInteractiveControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('button, input, select, textarea, a[href], [role="button"]') !== null
  )
}

// --- Input. The full playfield stays forgiving; a drag becomes a controlled fling. ---
let downAt: { x: number; y: number; pointerId: number } | null = null

host.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (targetsInteractiveControl(event.target)) return
  sfx.unlock()
  downAt = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  try {
    host.setPointerCapture(event.pointerId)
  } catch {
    // A lost capture should degrade to a tap, never leave input stuck.
  }
})

host.addEventListener('pointerup', (event) => {
  if (!downAt || downAt.pointerId !== event.pointerId) return
  const dx = event.clientX - downAt.x
  const dy = event.clientY - downAt.y
  downAt = null
  const isTap = Math.hypot(dx, dy) < 24
  // A plain tap may discover a world detail or belong to Purple Cougar herself.
  // Drags always stay ball gestures so flinging across her body keeps working.
  if (isTap && tryCougarTap(event.clientX, event.clientY)) return
  if (isTap && tryCinematicWorldTap(event.clientX, event.clientY)) return
  const storyEvents = story.tap()
  handleStoryEvents(storyEvents)
  if (!storyEvents.some((entry) => entry.type === 'ball-tapped')) return

  if (isTap) bat()
  else launchFromGesture(dx, dy)
})

host.addEventListener('pointercancel', (event) => {
  if (downAt?.pointerId === event.pointerId) downAt = null
})
host.addEventListener('lostpointercapture', () => {
  downAt = null
})

window.addEventListener('keydown', (event) => {
  if (targetsInteractiveControl(event.target)) return
  if (event.repeat) return
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault()
    handleTap()
  }
})
window.addEventListener('resize', () => stage.resize())

// --- Loop: deterministic fixed-step physics behind a smooth render layer. ---
let lastFrame = performance.now()
let accumulator = 0
let wasMoving = false
let wasOnGround = ball.onGround

function frame(now: number): void {
  // A just-loaded or hot-reloaded tab can occasionally hand rAF a timestamp
  // slightly earlier than the module's initial performance.now(). Treat it
  // as a zero-length frame instead of propagating a negative delta into the
  // deterministic behavior controller.
  const frameDt = Math.max(0, Math.min(0.05, (now - lastFrame) / 1000))
  lastFrame = now
  elapsed += frameDt
  accumulator += frameDt

  // Behavior runs before cuff sync so the visual character and tether anchor
  // remain coupled even as the idle motion looks toward the ball.
  behavior.update(frameDt, { lookAt: ball.pos })
  heroVisual?.update(frameDt, stage.camera, cougar.root)
  roarRings.update(frameDt, stage.camera)
  if (!useCinematicScenery && meadow) {
    trees!.update(elapsed, frameDt)
    garden!.update(elapsed, frameDt)
    stonePath!.update(elapsed, frameDt)
    squirrel!.update(elapsed, frameDt)
  }
  syncCuffs()

  while (accumulator >= PHYS_DT) {
    cougar.syncCuff()
    physicsCuff.copy(cougar.cuffWorld)
    stepBall(ball, physicsCuff, PHYS_DT)
    applyRampSurface()
    const bounced = !wasOnGround && ball.onGround && ball.vel.y > 0.45
    wasOnGround = ball.onGround
    handleStoryEvents(story.update(PHYS_DT, bounced, false))
    accumulator -= PHYS_DT
  }

  if (!useCinematicScenery && meadow) {
    const bellStrike = meadow.update(elapsed, frameDt, {
      position: ball.pos,
      velocity: ball.vel,
      radius: BALL_RADIUS,
    })
    if (bellStrike && story.snapshot().rampReady) {
      handleStoryEvents(story.update(0, false, true))
    }
  }

  // If the gentle ramp toss never finds its surface, guide it toward the bell
  // after a short beat. The child still gets the promised outcome; no aiming
  // precision or recovery chore is ever required.
  if (
    COURSE_ENABLED &&
    story.snapshot().phase === 'ramp-ready' &&
    ((!launchedFromRamp && elapsed - rampReadyAt > 1.4) ||
      (launchedFromRamp && elapsed - lastBellGuidanceAt > 1.1))
  ) {
    launchTowardBell(launchedFromRamp)
  }

  const moving = !atRest(ball)
  if (wasMoving && !moving) sfx.bonk()
  wasMoving = moving

  ballView.update(ball, visualCuff, frameDt)
  camera.update(frameDt, { x: 0, y: 0.52, z: -0.18 }, ball.pos, speed(ball))
  if (useCinematicScenery) {
    cinematicEnvironment!.update(stage.camera, elapsed, motion.reducedMotion)
    if (!cinematicSceneryReady && cinematicEnvironment!.isFullyVisible()) {
      stage.setCinematicEnvironmentMode(true)
      cinematicSceneryReady = true
      syncCinematicCardVisibility()
    }
    cinematicTrain!.update(stage.camera, elapsed)
    cinematicSquirrel!.update(stage.camera, elapsed, motion.reducedMotion)
    cinematicButterfly!.update(stage.camera, elapsed)
  } else {
    backdrop!.update(elapsed, frameDt)
    foregroundFringe!.update(elapsed, frameDt)
  }
  stage.render()

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

// --- QA hook: deterministic handles for the capture harness and future E2E. ---
window.__pc = {
  ball,
  cougar,
  phase: () => story.snapshot().phase,
  total: () => total,
  tap: handleTap,
  bat,
  fling: (x, y) => {
    sfx.unlock()
    launchFromGesture(x, -y)
  },
  stepPhysics: (n = 1) => {
    for (let i = 0; i < n; i++) {
      cougar.syncCuff()
      physicsCuff.copy(cougar.cuffWorld)
      stepBall(ball, physicsCuff, PHYS_DT)
      applyRampSurface()
    }
    visualCuff.copy(physicsCuff)
    heroVisual?.syncCuff(visualCuff)
  },
  speed: () => speed(ball),
  atRest: () => atRest(ball),
  setCameraAzimuth: (deg) => camera.setAzimuth(deg),
  roar: () => roarNow(),
  cameraPos: () => stage.camera.position.toArray() as [number, number, number],
  squirrelDash: () => {
    if (useCinematicScenery) cinematicSquirrel!.dashNow(elapsed)
    else squirrel!.dashNow()
  },
  // Where does a world point land on screen? Scene dressing has to be framed
  // against the live camera, not against the authored constants — the follow
  // camera moves. -1..1, x right, y up.
  project: (x, y, z) => {
    const point = new Vector3(x, y, z).project(stage.camera)
    return [point.x, point.y]
  },
}
}

void start().catch((error: unknown) => {
  console.error('Purple Cougar could not start.', error)
})
