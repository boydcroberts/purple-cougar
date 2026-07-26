import {
  BASE_PERIOD,
  BONK_PAUSE,
  BONK_RESPIN,
  BONK_TUMBLE_DUR,
  BUFFER_WINDOW,
  HOP_DUR,
  MIN_PERIOD,
  RAMP_PER_CLEAR,
  RESPIN_START_PERIOD,
} from './constants'
import { loadTotal, saveTotal, type CounterStore } from './counter'
import { resolveHop, type HopOutcome } from './hop'
import {
  advance,
  createBall,
  crossedPass,
  timeToPass,
  type BallState,
} from './skipball'

export type Phase = 'ready' | 'hopping' | 'tumbling' | 'respin'

export type GameEvent =
  | { type: 'hop' }
  | { type: 'clear'; total: number; streak: number }
  | { type: 'bonk' }
  | { type: 'respin' }

export interface GameState {
  ball: BallState
  phase: Phase
  /** Seconds elapsed in the current phase. */
  phaseT: number
  /** Outcome decided at tap time, consumed by the next crossing. */
  pending: HopOutcome | null
  /** A late tap waiting for touchdown. */
  buffered: boolean
  streak: number
  total: number
  events: GameEvent[]
  store: CounterStore | null
}

export function createGame(store: CounterStore | null = null): GameState {
  return {
    ball: createBall(),
    phase: 'ready',
    phaseT: 0,
    pending: null,
    buffered: false,
    streak: 0,
    total: loadTotal(store),
    events: [],
    store,
  }
}

export function drainEvents(g: GameState): GameEvent[] {
  const out = g.events
  g.events = []
  return out
}

function enter(g: GameState, phase: Phase): void {
  g.phase = phase
  g.phaseT = 0
}

function beginHop(g: GameState): void {
  // Decide the outcome the instant he commits. The crossing detector below
  // then plays it out at the moment the cord actually arrives.
  g.pending = resolveHop(timeToPass(g.ball))
  g.buffered = false
  enter(g, 'hopping')
  g.events.push({ type: 'hop' })
}

export function tap(g: GameState): void {
  if (g.phase === 'ready') {
    beginHop(g)
    return
  }
  if (g.phase === 'hopping' && HOP_DUR - g.phaseT <= BUFFER_WINDOW) {
    // Close enough to touchdown that he clearly meant the next one.
    g.buffered = true
  }
  // Taps while tumbling or respinning are simply absorbed. He is busy.
}

function onClear(g: GameState): void {
  g.total += 1
  g.streak += 1
  g.ball.period = Math.max(MIN_PERIOD, g.ball.period - RAMP_PER_CLEAR)
  saveTotal(g.total, g.store)
  g.events.push({ type: 'clear', total: g.total, streak: g.streak })
}

function onBonk(g: GameState): void {
  // The total is deliberately untouched. Missing costs nothing.
  g.streak = 0
  g.ball.period = BASE_PERIOD
  g.ball.spinning = false
  g.pending = null
  g.buffered = false
  enter(g, 'tumbling')
  g.events.push({ type: 'bonk' })
}

export function step(g: GameState, dt: number): void {
  g.phaseT += dt

  const before = g.ball.theta
  const swept = advance(g.ball, dt)

  if (crossedPass(before, swept)) {
    if (g.phase === 'hopping' && g.pending === 'clear') {
      g.pending = null
      onClear(g)
    } else {
      onBonk(g)
      return
    }
  }

  switch (g.phase) {
    case 'hopping':
      if (g.phaseT >= HOP_DUR) {
        g.pending = null
        enter(g, 'ready')
        if (g.buffered) beginHop(g)
      }
      break

    case 'tumbling':
      if (g.phaseT >= BONK_TUMBLE_DUR + BONK_PAUSE) {
        g.ball.spinning = true
        g.ball.period = RESPIN_START_PERIOD
        enter(g, 'respin')
        g.events.push({ type: 'respin' })
      }
      break

    case 'respin': {
      const p = Math.min(1, g.phaseT / BONK_RESPIN)
      g.ball.period =
        RESPIN_START_PERIOD + (BASE_PERIOD - RESPIN_START_PERIOD) * p
      if (p >= 1) {
        g.ball.period = BASE_PERIOD
        enter(g, 'ready')
      }
      break
    }

    case 'ready':
      break
  }
}

/** 0..1 through the current hop; 0 when he is not hopping. */
export function hopProgress(g: GameState): number {
  if (g.phase !== 'hopping') return 0
  return Math.min(1, g.phaseT / HOP_DUR)
}

/** 0..1 through the tumble-and-lie-there beat; 0 when he is upright. */
export function tumbleProgress(g: GameState): number {
  if (g.phase !== 'tumbling') return 0
  return Math.min(1, g.phaseT / (BONK_TUMBLE_DUR + BONK_PAUSE))
}
