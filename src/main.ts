import { createSfx } from './audio'
import { createBallView } from './ballView'
import { createPalette } from './cougar/materials'
import { createQuadruped } from './cougar/quadruped'
import { FLING_SCALE, PHYS_DT } from './constants'
import { loadTotal, saveTotal } from './counter'
import {
  atRest,
  createBall,
  kick,
  speed,
  stepBall,
  type BallPhysics,
} from './physics'
import { Vector3 } from 'three'
import { createStage } from './scene'
import { createHud } from './ui'

const host = document.getElementById('app')
if (!host) throw new Error('#app missing from index.html')

const stage = createStage(host)
const cougar = createQuadruped(createPalette())
const ballView = createBallView()
stage.scene.add(cougar.root, ballView.group)

const hud = createHud(document.body)
const sfx = createSfx()

const store = (() => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
})()

cougar.syncCuff()
const ball: BallPhysics = createBall(cougar.cuffWorld)

let total = loadTotal(store)
hud.setTotal(total)

/**
 * Successive bats go different directions so it never feels like a machine,
 * but by a fixed golden-angle step rather than Math.random — the sim has to
 * stay reproducible for screenshot QA and the tests.
 */
let batCount = 0
const GOLDEN = 2.399963229728653

function bat(power = 1): void {
  const a = batCount++ * GOLDEN
  const lift = 3.1 + (batCount % 3) * 0.45
  kick(
    ball,
    Math.cos(a) * 4.6 * power,
    lift * power,
    Math.sin(a) * 4.6 * power,
  )
  total += 1
  saveTotal(total, store)
  hud.setTotal(total)
  hud.pop()
  sfx.whoosh()
  if (total % 10 === 0) sfx.cheer()
}

// --- Input. The whole screen is the button; a drag flings. ---
let downAt: { x: number; y: number; t: number } | null = null

host.addEventListener('pointerdown', (e) => {
  sfx.unlock() // iOS keeps the context suspended until a real gesture.
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() }
})

host.addEventListener('pointerup', (e) => {
  if (!downAt) return
  const dx = e.clientX - downAt.x
  const dy = e.clientY - downAt.y
  const dist = Math.hypot(dx, dy)
  downAt = null

  if (dist < 24) {
    bat()
    return
  }

  // A drag throws the ball the way you swiped. Screen-right is mapped through
  // the camera's own basis so the throw goes where the gesture looked like it
  // went, rather than along a fixed world axis.
  const fwd = new Vector3()
  stage.camera.getWorldDirection(fwd)
  const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize()
  const flat = new Vector3(fwd.x, 0, fwd.z).normalize()
  const s = Math.min(dist / 160, 2.2) * FLING_SCALE
  const ux = dx / dist
  const uy = -dy / dist
  kick(
    ball,
    (right.x * ux + flat.x * uy) * s,
    Math.max(0.4, uy) * s * 0.55 + 1.4,
    (right.z * ux + flat.z * uy) * s,
  )
  total += 1
  saveTotal(total, store)
  hud.setTotal(total)
  hud.pop()
  sfx.whoosh()
})

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    sfx.unlock()
    bat()
  }
})
window.addEventListener('resize', () => stage.resize())

// --- Loop: fixed-step physics behind a variable-rate render. ---
let last = performance.now()
let acc = 0
let wasMoving = false

function frame(now: number): void {
  // Clamp, so a backgrounded tab does not try to catch up hundreds of steps.
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  acc += dt

  while (acc >= PHYS_DT) {
    // Pose first: the cuff is the ball's anchor, so it must be current for
    // this step or the ball lags the paw.
    cougar.syncCuff()
    stepBall(ball, cougar.cuffWorld, PHYS_DT)
    acc -= PHYS_DT
  }

  // A soft thump the moment it finally settles.
  const moving = !atRest(ball)
  if (wasMoving && !moving) sfx.bonk()
  wasMoving = moving

  ballView.update(ball, cougar.cuffWorld)
  stage.render()

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

// --- QA hook: deterministic control for the capture harness and e2e. ---
declare global {
  interface Window {
    __pc: {
      ball: BallPhysics
      cougar: typeof cougar
      total(): number
      tap(): void
      bat(power?: number): void
      fling(x: number, y: number): void
      stepPhysics(n?: number): void
      speed(): number
      atRest(): boolean
      setCameraAzimuth(deg: number): void
    }
  }
}

window.__pc = {
  ball,
  cougar,
  total: () => total,
  tap: () => bat(),
  bat,
  fling: (x: number, y: number) => {
    kick(ball, x * FLING_SCALE * 0.5, Math.abs(y) * FLING_SCALE * 0.4 + 2, -y * FLING_SCALE * 0.5)
  },
  stepPhysics: (n = 1) => {
    for (let i = 0; i < n; i++) {
      cougar.syncCuff()
      stepBall(ball, cougar.cuffWorld, PHYS_DT)
    }
  },
  speed: () => speed(ball),
  atRest: () => atRest(ball),
  setCameraAzimuth: (deg: number) => stage.setAzimuth(deg),
}
