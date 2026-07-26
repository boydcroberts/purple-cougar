import { beforeEach, describe, expect, it } from 'vitest'
import {
  AIRBORNE_END,
  AIRBORNE_START,
  BASE_PERIOD,
  BONK_PAUSE,
  BONK_RESPIN,
  BONK_TUMBLE_DUR,
  BUFFER_WINDOW,
  HOP_DUR,
  MIN_PERIOD,
  RAMP_PER_CLEAR,
  TAU,
  THETA_PASS,
} from '../src/constants'
import type { CounterStore } from '../src/counter'
import { COUNTER_KEY, loadTotal } from '../src/counter'
import {
  createGame,
  drainEvents,
  hopProgress,
  step,
  tap,
  tumbleProgress,
  type GameState,
} from '../src/gameplay'

function memoryStore(seed: Record<string, string> = {}): CounterStore {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

/** Park the orbit so the cord arrives `seconds` from now. */
function armAt(g: GameState, seconds: number): void {
  g.ball.theta = (THETA_PASS - (TAU * seconds) / g.ball.period + TAU * 2) % TAU
}

/** Run the sim forward in small fixed slices, the way the rAF loop does. */
function run(g: GameState, seconds: number, slice = 1 / 120): void {
  let left = seconds
  while (left > 1e-9) {
    const dt = Math.min(slice, left)
    step(g, dt)
    left -= dt
  }
}

/** A tap timed to clear cleanly. */
const GOOD = (AIRBORNE_START + AIRBORNE_END) / 2

let store: CounterStore

beforeEach(() => {
  store = memoryStore()
})

describe('createGame', () => {
  it('starts ready, at zero, with the ball spinning at the base period', () => {
    const g = createGame(store)
    expect(g.phase).toBe('ready')
    expect(g.total).toBe(0)
    expect(g.streak).toBe(0)
    expect(g.ball.spinning).toBe(true)
    expect(g.ball.period).toBe(BASE_PERIOD)
  })

  it('resumes the lifetime total from storage', () => {
    expect(createGame(memoryStore({ [COUNTER_KEY]: '250' })).total).toBe(250)
  })
})

describe('a well-timed hop', () => {
  it('clears, counts, and emits', () => {
    const g = createGame(store)
    armAt(g, GOOD)
    tap(g)
    expect(g.phase).toBe('hopping')
    expect(drainEvents(g)).toEqual([{ type: 'hop' }])

    run(g, GOOD + 0.02)
    expect(g.total).toBe(1)
    expect(g.streak).toBe(1)
    expect(drainEvents(g)).toEqual([{ type: 'clear', total: 1, streak: 1 }])
  })

  it('persists the new total immediately', () => {
    const g = createGame(store)
    armAt(g, GOOD)
    tap(g)
    run(g, GOOD + 0.02)
    expect(loadTotal(store)).toBe(1)
  })

  it('returns to ready after the hop finishes', () => {
    const g = createGame(store)
    armAt(g, GOOD)
    tap(g)
    run(g, HOP_DUR + 0.02)
    expect(g.phase).toBe('ready')
  })

  it('speeds the ball up by one ramp step', () => {
    const g = createGame(store)
    armAt(g, GOOD)
    tap(g)
    run(g, GOOD + 0.02)
    expect(g.ball.period).toBeCloseTo(BASE_PERIOD - RAMP_PER_CLEAR, 10)
  })

  it('never speeds past the floor', () => {
    const g = createGame(store)
    g.streak = 500
    g.ball.period = MIN_PERIOD
    armAt(g, GOOD)
    tap(g)
    run(g, GOOD + 0.02)
    expect(g.ball.period).toBe(MIN_PERIOD)
  })

  it('clamps to the floor when a ramp step would cross it', () => {
    const g = createGame(store)
    g.ball.period = MIN_PERIOD + RAMP_PER_CLEAR / 2
    armAt(g, GOOD)
    tap(g)
    run(g, GOOD + 0.02)
    expect(g.ball.period).toBe(MIN_PERIOD)
  })
})

describe('a mistimed hop', () => {
  it('bonks and starts the tumble', () => {
    const g = createGame(store)
    armAt(g, AIRBORNE_END + 0.2)
    tap(g)
    run(g, AIRBORNE_END + 0.25)
    expect(g.phase).toBe('tumbling')
    expect(drainEvents(g)).toContainEqual({ type: 'bonk' })
  })

  it('leaves the lifetime total untouched — there is no losing', () => {
    const g = createGame(memoryStore({ [COUNTER_KEY]: '99' }))
    armAt(g, AIRBORNE_END + 0.2)
    tap(g)
    run(g, AIRBORNE_END + 0.25)
    expect(g.total).toBe(99)
  })

  it('resets the streak and the ball speed', () => {
    const g = createGame(store)
    g.streak = 12
    g.ball.period = MIN_PERIOD
    armAt(g, AIRBORNE_END + 0.2)
    tap(g)
    run(g, AIRBORNE_END + 0.25)
    expect(g.streak).toBe(0)
    expect(g.ball.period).toBe(BASE_PERIOD)
  })

  it('stops the ball dead while he is down', () => {
    const g = createGame(store)
    armAt(g, AIRBORNE_END + 0.2)
    tap(g)
    run(g, AIRBORNE_END + 0.25)
    expect(g.ball.spinning).toBe(false)
  })
})

describe('doing nothing', () => {
  it('trips him when the cord comes around untapped', () => {
    const g = createGame(store)
    run(g, BASE_PERIOD + 0.05)
    expect(g.phase).toBe('tumbling')
    expect(g.total).toBe(0)
  })
})

describe('bonk recovery', () => {
  function bonkAndSettle(g: GameState): void {
    armAt(g, AIRBORNE_END + 0.2)
    tap(g)
    run(g, AIRBORNE_END + 0.25)
  }

  it('stays down for the full tumble and pause', () => {
    const g = createGame(store)
    bonkAndSettle(g)
    run(g, BONK_TUMBLE_DUR + BONK_PAUSE - 0.05)
    expect(g.phase).toBe('tumbling')
  })

  it('respins, then returns to ready at the base period', () => {
    const g = createGame(store)
    bonkAndSettle(g)
    run(g, BONK_TUMBLE_DUR + BONK_PAUSE + 0.02)
    expect(g.phase).toBe('respin')
    expect(g.ball.spinning).toBe(true)

    run(g, BONK_RESPIN + 0.02)
    expect(g.phase).toBe('ready')
    expect(g.ball.period).toBeCloseTo(BASE_PERIOD, 6)
  })

  it('emits a respin event when the ball starts moving again', () => {
    const g = createGame(store)
    bonkAndSettle(g)
    drainEvents(g)
    run(g, BONK_TUMBLE_DUR + BONK_PAUSE + 0.02)
    expect(drainEvents(g)).toContainEqual({ type: 'respin' })
  })

  it('ignores taps while he is down', () => {
    const g = createGame(store)
    bonkAndSettle(g)
    drainEvents(g)
    tap(g)
    expect(drainEvents(g)).toEqual([])
    expect(g.phase).toBe('tumbling')
  })

  it('ignores taps while he is respinning back to his feet', () => {
    const g = createGame(store)
    bonkAndSettle(g)
    run(g, BONK_TUMBLE_DUR + BONK_PAUSE + 0.02)
    expect(g.phase).toBe('respin')
    drainEvents(g)
    tap(g)
    expect(drainEvents(g)).toEqual([])
    expect(g.phase).toBe('respin')
  })

  it('does not bonk on a cord crossing while respinning', () => {
    const g = createGame(store)
    bonkAndSettle(g)
    run(g, BONK_TUMBLE_DUR + BONK_PAUSE + 0.02)
    expect(g.phase).toBe('respin')
    drainEvents(g)

    // Force an imminent crossing regardless of how fast the ball is easing
    // back up — the respin phase itself must be immune, not just lucky.
    g.ball.theta = (THETA_PASS - 0.001 + TAU) % TAU
    step(g, 0.01)

    expect(g.phase).toBe('respin')
    expect(drainEvents(g)).not.toContainEqual({ type: 'bonk' })
    expect(g.total).toBe(0)

    run(g, BONK_RESPIN + 0.02)
    expect(g.phase).toBe('ready')
  })
})

describe('mashing', () => {
  it('ignores a tap early in an existing hop, and only the original hop ever fires', () => {
    const g = createGame(store)
    armAt(g, GOOD)
    tap(g)
    let hops = drainEvents(g).filter((e) => e.type === 'hop').length

    run(g, 0.05)
    tap(g) // well outside BUFFER_WINDOW of landing — must be dropped, not buffered
    expect(drainEvents(g)).toEqual([])

    // Run through landing and back to ready. If the early tap were wrongly
    // buffered, a second 'hop' would fire here.
    run(g, HOP_DUR - 0.05 + 0.02)
    hops += drainEvents(g).filter((e) => e.type === 'hop').length
    expect(g.phase).toBe('ready')
    expect(hops).toBe(1)
  })

  it('buffers a tap near touchdown and fires it on landing', () => {
    const g = createGame(store)
    armAt(g, GOOD)
    tap(g)
    run(g, HOP_DUR - BUFFER_WINDOW + 0.01)
    drainEvents(g)
    tap(g)
    expect(g.buffered).toBe(true)

    run(g, BUFFER_WINDOW)
    expect(g.phase).toBe('hopping')
    expect(drainEvents(g)).toContainEqual({ type: 'hop' })
  })

  it('never lets mashing decrease the total', () => {
    const g = createGame(store)
    for (let i = 0; i < 400; i++) {
      tap(g)
      step(g, 1 / 60)
    }
    expect(g.total).toBeGreaterThanOrEqual(0)
    expect(g.total).toBe(loadTotal(store))
  })
})

describe('progress helpers', () => {
  it('reports hop progress from 0 to 1 and zero otherwise', () => {
    const g = createGame(store)
    expect(hopProgress(g)).toBe(0)
    armAt(g, GOOD)
    tap(g)
    expect(hopProgress(g)).toBeCloseTo(0, 6)
    run(g, HOP_DUR / 2)
    expect(hopProgress(g)).toBeCloseTo(0.5, 1)
  })

  it('reports tumble progress only while down', () => {
    const g = createGame(store)
    expect(tumbleProgress(g)).toBe(0)
    armAt(g, AIRBORNE_END + 0.2)
    tap(g)
    run(g, AIRBORNE_END + 0.25)
    expect(tumbleProgress(g)).toBeGreaterThan(0)
    expect(tumbleProgress(g)).toBeLessThanOrEqual(1)
  })
})
