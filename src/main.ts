import { createSfx } from './audio'
import { createBallView } from './ballView'
import { createPalette } from './cougar/materials'
import { createQuadruped } from './cougar/quadruped'
import { TAU, THETA_PASS } from './constants'
import {
  createGame,
  drainEvents,
  step,
  tap,
  type GameState,
} from './gameplay'
import { createStage } from './scene'
import { createHud } from './ui'

const host = document.getElementById('app')
if (!host) throw new Error('#app missing from index.html')

const stage = createStage(host)
const rig = createQuadruped(createPalette())
const ballView = createBallView()
stage.scene.add(rig.root, ballView.group)

const hud = createHud(document.body)
const sfx = createSfx()

const game = createGame(
  (() => {
    try {
      return globalThis.localStorage ?? null
    } catch {
      return null
    }
  })(),
)
hud.setTotal(game.total)

// --- Input. The entire screen is the button. ---
function onTap(): void {
  sfx.unlock() // iOS keeps the context suspended until a real gesture.
  tap(game)
}

host.addEventListener('pointerdown', onTap)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    onTap()
  }
})
window.addEventListener('resize', () => stage.resize())

// --- Loop ---
let last = performance.now()

function frame(now: number): void {
  // Clamp so a backgrounded tab does not resolve twenty passes at once.
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  step(game, dt)

  for (const ev of drainEvents(game)) {
    switch (ev.type) {
      case 'hop':
        sfx.whoosh()
        break
      case 'clear':
        hud.setTotal(ev.total)
        hud.pop()
        if (ev.streak > 0 && ev.streak % 10 === 0) sfx.cheer()
        break
      case 'bonk':
        sfx.bonk()
        break
      case 'respin':
        sfx.respin()
        break
    }
  }

  // Poses land in a later task; for now the rig stands at rest and the cord
  // anchors to the real cuff position rather than the retired stub's ankle.
  rig.syncCuff()
  ballView.update(game.ball, rig.cuffWorld)
  stage.render()

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

// --- QA hook. Deterministic control for e2e and the capture harness. ---
declare global {
  interface Window {
    __pc: {
      game: GameState
      tap(): void
      step(dt: number): void
      /** Park the orbit so the cord arrives `seconds` from now. */
      armAt(seconds: number): void
    }
  }
}

window.__pc = {
  game,
  tap: () => tap(game),
  step: (dt: number) => step(game, dt),
  armAt: (seconds: number) => {
    game.ball.theta =
      (THETA_PASS - (TAU * seconds) / game.ball.period + TAU * 2) % TAU
  },
}
