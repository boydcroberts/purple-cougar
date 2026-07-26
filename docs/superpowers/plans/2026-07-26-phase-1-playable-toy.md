# Purple Cougar — Phase 1: Playable Toy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable 3D web toy — a purple cougar with an orange-and-blue skip-ball cuffed to his ankle, where tapping anywhere makes him hop the cord, clears increment a counter that never resets, and misses make him tumble over harmlessly.

**Architecture:** All game logic is pure TypeScript with zero three.js imports — orbit math (`skipball.ts`), hop resolution (`hop.ts`), and a small mutable state machine (`gameplay.ts`) that emits events. The three.js layer is a passive renderer that reads game state and drains events; it never decides anything. This split is what makes the timing unit-testable in node, and the timing is the entire product.

**Tech Stack:** Vite, TypeScript, three.js, vitest (unit), playwright (e2e), WebAudio (synthesized SFX, no audio assets).

**Spec:** `docs/superpowers/specs/2026-07-26-purple-cougar-design.md`

## Global Constraints

- **Target: iPad, touch-first.** Full-bleed canvas, portrait and landscape. Click and spacebar stay wired for Mac QA.
- **No text carries meaning.** The player is 3 and cannot read. The hop counter is a numeral only — no labels, no instructions, no menus.
- **No fail state.** The counter is cumulative and persisted; it never resets. A miss costs nothing but a tumble.
- **Phase 1 uses primitives only.** No GLB, no external art assets, no audio files. The cougar is capsules and boxes.
- **All tunables live in `src/constants.ts`.** No magic numbers anywhere else in the codebase.
- **Pure modules import nothing from three.** `constants.ts`, `skipball.ts`, `hop.ts`, `gameplay.ts`, `counter.ts` must run in a bare node vitest environment.
- **Playwright on darwin requires `--use-angle=metal`** in `launchOptions.args`, or headless Chromium falls back to SwiftShader at ~3fps and every rAF-driven wait times out.
- **Chrome only.** Brave's Shields block WebGL and the character will not render.
- **Boyd controls all pushes.** Commit freely; never `git push` without being asked.

## File Structure

| File | Responsibility |
|---|---|
| `src/constants.ts` | Every tunable number. No logic. |
| `src/skipball.ts` | Pure orbit math: advance θ, time until the cord reaches the free foot, crossing detection. |
| `src/hop.ts` | Pure clear/bonk resolution from a single number. |
| `src/counter.ts` | Cumulative total, `localStorage` persistence, injectable storage for tests. |
| `src/gameplay.ts` | Mutable state machine. Owns phases, streak, speed ramp, bonk recovery, tap buffering. Emits events. |
| `src/scene.ts` | three.js renderer, camera, lights, ground, sky, resize. Knows nothing about the game. |
| `src/cougarStub.ts` | Primitive cougar group + hop/tumble/idle posing. |
| `src/ballView.ts` | Striped ball mesh + cord mesh, positioned from θ. |
| `src/ui.ts` | DOM counter overlay. |
| `src/audio.ts` | Synthesized WebAudio SFX bus. |
| `src/main.ts` | Bootstrap, rAF loop, input, event drain, `window.__pc` QA hook. |
| `tools/capture.mjs` | Screenshot QA harness with its own browser. |

---

### Task 1: Scaffold and orbit math

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src/constants.ts`, `src/skipball.ts`
- Test: `test/skipball.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `constants.ts` exports (all `number`): `HOP_DUR`, `AIRBORNE_START`, `AIRBORNE_END`, `BASE_PERIOD`, `MIN_PERIOD`, `RAMP_PER_CLEAR`, `BUFFER_WINDOW`, `TRAVEL_EVERY`, `THETA_PASS`, `CORD_LENGTH`, `BONK_TUMBLE_DUR`, `BONK_PAUSE`, `BONK_RESPIN`, `RESPIN_START_PERIOD`, `HOP_HEIGHT`, `ANKLE`, `BALL_Y`, `BALL_Y_TILT`
  - `interface BallState { theta: number; period: number; spinning: boolean }`
  - `createBall(period?: number): BallState`
  - `advance(b: BallState, dt: number): number` — mutates `b.theta`, returns the swept arc in radians
  - `timeToPass(b: BallState): number` — seconds until θ next reaches `THETA_PASS`
  - `crossedPass(before: number, sweep: number): boolean`
  - `TAU: number`

- [ ] **Step 1: Initialize the project**

```bash
cd /Users/boydroberts/Documents/projects/purple-cougar
npm init -y
npm i three
npm i -D vite typescript @types/three vitest @playwright/test
```

- [ ] **Step 2: Write the config files**

`package.json` — replace the `"scripts"` block (leave the generated `"name"`, `"version"`, dependency blocks alone):

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "validate": "npm run typecheck && npm run test"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "test", "e2e"]
}
```

`vite.config.ts` — note the import is from `vitest/config`, not `vite`; the plain
`vite` `defineConfig` has no `test` key and will fail typecheck:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: { host: true, port: 5183 },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <title>Purple Cougar</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        background: #7fd0ef;
        overscroll-behavior: none;
        touch-action: none;
        -webkit-user-select: none;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      #app {
        position: fixed;
        inset: 0;
      }
      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules
dist
.DS_Store
test-results
playwright-report
```

- [ ] **Step 3: Write `src/constants.ts`**

```ts
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
/** Cord length, world units. */
export const CORD_LENGTH = 1.15

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
```

- [ ] **Step 4: Write the failing test**

`test/skipball.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BASE_PERIOD, TAU, THETA_PASS } from '../src/constants'
import { advance, createBall, crossedPass, timeToPass } from '../src/skipball'

describe('createBall', () => {
  it('starts at angle zero, spinning, at the base period', () => {
    const b = createBall()
    expect(b.theta).toBe(0)
    expect(b.period).toBe(BASE_PERIOD)
    expect(b.spinning).toBe(true)
  })

  it('accepts an explicit period', () => {
    expect(createBall(2).period).toBe(2)
  })
})

describe('advance', () => {
  it('sweeps a full revolution in exactly one period', () => {
    const b = createBall(2)
    const swept = advance(b, 2)
    expect(swept).toBeCloseTo(TAU, 10)
    expect(b.theta).toBeCloseTo(0, 10)
  })

  it('wraps theta into [0, TAU)', () => {
    const b = createBall(1)
    advance(b, 1.25)
    expect(b.theta).toBeGreaterThanOrEqual(0)
    expect(b.theta).toBeLessThan(TAU)
    expect(b.theta).toBeCloseTo(TAU * 0.25, 10)
  })

  it('does not move a ball that is not spinning', () => {
    const b = createBall(1)
    b.theta = 1
    b.spinning = false
    expect(advance(b, 0.5)).toBe(0)
    expect(b.theta).toBe(1)
  })
})

describe('timeToPass', () => {
  it('is zero when sitting exactly on the pass angle', () => {
    const b = createBall(1.4)
    b.theta = THETA_PASS
    expect(timeToPass(b)).toBeCloseTo(0, 10)
  })

  it('is half a period from the antipode', () => {
    const b = createBall(1.4)
    b.theta = 0
    expect(timeToPass(b)).toBeCloseTo(0.7, 10)
  })

  it('wraps forward rather than going negative', () => {
    const b = createBall(1.4)
    b.theta = THETA_PASS + 0.1
    expect(timeToPass(b)).toBeGreaterThan(0)
    expect(timeToPass(b)).toBeCloseTo(((TAU - 0.1) / TAU) * 1.4, 10)
  })

  it('is Infinity when the ball is not spinning', () => {
    const b = createBall(1.4)
    b.spinning = false
    expect(timeToPass(b)).toBe(Infinity)
  })
})

describe('crossedPass', () => {
  it('is true when the sweep reaches the pass angle', () => {
    expect(crossedPass(THETA_PASS - 0.1, 0.2)).toBe(true)
  })

  it('is false when the sweep stops short', () => {
    expect(crossedPass(THETA_PASS - 0.3, 0.2)).toBe(false)
  })

  it('does not re-trigger when starting exactly on the pass angle', () => {
    expect(crossedPass(THETA_PASS, 0.2)).toBe(false)
  })

  it('re-triggers a full revolution later', () => {
    expect(crossedPass(THETA_PASS, TAU + 0.001)).toBe(true)
  })

  it('detects a crossing that wraps through zero', () => {
    expect(crossedPass(TAU - 0.05, 0.1 + THETA_PASS)).toBe(true)
  })

  it('is false for a zero-length sweep', () => {
    expect(crossedPass(THETA_PASS - 0.1, 0)).toBe(false)
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/skipball"`

- [ ] **Step 6: Write `src/skipball.ts`**

```ts
import { BASE_PERIOD, TAU, THETA_PASS } from './constants'

export interface BallState {
  /** Orbit angle in radians, always normalized to [0, TAU). */
  theta: number
  /** Seconds per revolution. */
  period: number
  /** False while he's face-down and the ball is lying still. */
  spinning: boolean
}

export function createBall(period: number = BASE_PERIOD): BallState {
  return { theta: 0, period, spinning: true }
}

/** Positive modulo — JS `%` keeps the sign of the dividend, which breaks wrapping. */
function wrap(v: number): number {
  return ((v % TAU) + TAU) % TAU
}

/**
 * Advance the orbit by `dt` seconds.
 * Mutates `b.theta`. Returns the arc swept, in radians (0 if not spinning).
 */
export function advance(b: BallState, dt: number): number {
  if (!b.spinning) return 0
  const swept = (TAU * dt) / b.period
  b.theta = wrap(b.theta + swept)
  return swept
}

/** Seconds until the cord next sweeps over the free foot. Infinity if stopped. */
export function timeToPass(b: BallState): number {
  if (!b.spinning) return Infinity
  const delta = wrap(THETA_PASS - b.theta)
  return (delta / TAU) * b.period
}

/**
 * Did an arc starting at `before` and sweeping `sweep` radians pass the free foot?
 *
 * Starting exactly on THETA_PASS does NOT count as an immediate crossing —
 * otherwise a bonk would re-fire on the frame after it resolved. A full
 * revolution from that position does count.
 */
export function crossedPass(before: number, sweep: number): boolean {
  if (sweep <= 0) return false
  let delta = wrap(THETA_PASS - before)
  if (delta === 0) delta = TAU
  return delta <= sweep
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run validate`
Expected: typecheck clean, all skipball tests PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffold and skip-ball orbit math"
```

---

### Task 2: Hop resolution and the persistent counter

**Files:**
- Create: `src/hop.ts`, `src/counter.ts`
- Test: `test/hop.test.ts`, `test/counter.test.ts`

**Interfaces:**
- Consumes: `constants.ts` (`AIRBORNE_START`, `AIRBORNE_END`)
- Produces:
  - `type HopOutcome = 'clear' | 'bonk'`
  - `resolveHop(secondsUntilPass: number): HopOutcome`
  - `interface CounterStore { getItem(k: string): string | null; setItem(k: string, v: string): void }`
  - `loadTotal(store?: CounterStore | null): number`
  - `saveTotal(total: number, store?: CounterStore | null): void`
  - `COUNTER_KEY: string`

- [ ] **Step 1: Write the failing tests**

`test/hop.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AIRBORNE_END, AIRBORNE_START } from '../src/constants'
import { resolveHop } from '../src/hop'

describe('resolveHop', () => {
  it('clears when the cord arrives mid-flight', () => {
    expect(resolveHop((AIRBORNE_START + AIRBORNE_END) / 2)).toBe('clear')
  })

  it('clears exactly at takeoff', () => {
    expect(resolveHop(AIRBORNE_START)).toBe('clear')
  })

  it('clears exactly at touchdown', () => {
    expect(resolveHop(AIRBORNE_END)).toBe('clear')
  })

  it('bonks when he hops too late', () => {
    expect(resolveHop(AIRBORNE_START - 0.01)).toBe('bonk')
  })

  it('bonks when he hops far too early', () => {
    expect(resolveHop(AIRBORNE_END + 0.01)).toBe('bonk')
  })

  it('bonks when the cord is most of a revolution away', () => {
    expect(resolveHop(1.2)).toBe('bonk')
  })

  it('bonks when the ball is stopped', () => {
    expect(resolveHop(Infinity)).toBe('bonk')
  })
})
```

`test/counter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { COUNTER_KEY, loadTotal, saveTotal, type CounterStore } from '../src/counter'

function memoryStore(seed: Record<string, string> = {}): CounterStore {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

describe('counter persistence', () => {
  it('starts at zero when nothing is stored', () => {
    expect(loadTotal(memoryStore())).toBe(0)
  })

  it('round-trips a total', () => {
    const store = memoryStore()
    saveTotal(37, store)
    expect(loadTotal(store)).toBe(37)
  })

  it('reads a pre-seeded total', () => {
    expect(loadTotal(memoryStore({ [COUNTER_KEY]: '412' }))).toBe(412)
  })

  it('falls back to zero on garbage', () => {
    expect(loadTotal(memoryStore({ [COUNTER_KEY]: 'banana' }))).toBe(0)
  })

  it('falls back to zero on a negative stored value', () => {
    expect(loadTotal(memoryStore({ [COUNTER_KEY]: '-5' }))).toBe(0)
  })

  it('floors fractional stored values', () => {
    expect(loadTotal(memoryStore({ [COUNTER_KEY]: '9.8' }))).toBe(9)
  })

  it('survives a store with no localStorage at all', () => {
    expect(loadTotal(null)).toBe(0)
    expect(() => saveTotal(5, null)).not.toThrow()
  })

  it('survives a store that throws on write', () => {
    const hostile: CounterStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => saveTotal(5, hostile)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/hop` and `../src/counter`

- [ ] **Step 3: Write `src/hop.ts`**

```ts
import { AIRBORNE_END, AIRBORNE_START } from './constants'

export type HopOutcome = 'clear' | 'bonk'

/**
 * The whole timing rule, in one function.
 *
 * At the instant of the tap we know how many seconds remain until the cord
 * sweeps the free foot. The foot is off the ground over
 * [AIRBORNE_START, AIRBORNE_END] relative to that tap. If the cord arrives
 * during that window he's over it; anything else and it catches him.
 */
export function resolveHop(secondsUntilPass: number): HopOutcome {
  return secondsUntilPass >= AIRBORNE_START && secondsUntilPass <= AIRBORNE_END
    ? 'clear'
    : 'bonk'
}
```

- [ ] **Step 4: Write `src/counter.ts`**

```ts
export const COUNTER_KEY = 'purple-cougar:total'

/** The slice of `Storage` we actually use, so tests can pass a plain object. */
export interface CounterStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStore(): CounterStore | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Safari throws on localStorage access in some privacy modes.
    return null
  }
}

/**
 * The lifetime hop count. Never resets — this is the entire no-fail promise.
 * Any unreadable or nonsensical stored value degrades to 0 rather than throwing.
 */
export function loadTotal(store: CounterStore | null = defaultStore()): number {
  if (!store) return 0
  try {
    const raw = store.getItem(COUNTER_KEY)
    if (raw === null) return 0
    const n = Math.floor(Number(raw))
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function saveTotal(
  total: number,
  store: CounterStore | null = defaultStore(),
): void {
  if (!store) return
  try {
    store.setItem(COUNTER_KEY, String(Math.floor(total)))
  } catch {
    // A full or disabled store must never interrupt play.
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run validate`
Expected: typecheck clean, all skipball, hop, and counter tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: hop resolution and persistent lifetime counter"
```

---

### Task 3: The game state machine

The heart of the toy. Every behavioral promise in the spec is enforced here.

**Files:**
- Create: `src/gameplay.ts`
- Test: `test/gameplay.test.ts`

**Interfaces:**
- Consumes: `skipball.ts` (`BallState`, `createBall`, `advance`, `timeToPass`, `crossedPass`), `hop.ts` (`resolveHop`, `HopOutcome`), `counter.ts` (`loadTotal`, `saveTotal`, `CounterStore`), `constants.ts`
- Produces:
  - `type Phase = 'ready' | 'hopping' | 'tumbling' | 'respin'`
  - `type GameEvent = { type: 'hop' } | { type: 'clear'; total: number; streak: number } | { type: 'bonk' } | { type: 'respin' }`
  - `interface GameState { ball: BallState; phase: Phase; phaseT: number; pending: HopOutcome | null; buffered: boolean; streak: number; total: number; events: GameEvent[]; store: CounterStore | null }`
  - `createGame(store?: CounterStore | null): GameState`
  - `tap(g: GameState): void`
  - `step(g: GameState, dt: number): void`
  - `drainEvents(g: GameState): GameEvent[]`
  - `hopProgress(g: GameState): number` — 0..1, 0 when not hopping
  - `tumbleProgress(g: GameState): number` — 0..1, 0 when not tumbling

**Behavioral contract (what the tests below pin down):**

| Rule | Behavior |
|---|---|
| Tap while ready | Enters `hopping`, resolves the outcome immediately, emits `hop` |
| Tap while hopping, >BUFFER_WINDOW from landing | Ignored entirely |
| Tap while hopping, ≤BUFFER_WINDOW from landing | Buffered; fires the instant he lands |
| Tap while tumbling or respinning | Ignored |
| Cord crosses while `pending === 'clear'` | `clear`: total++, streak++, period shortens, saved |
| Cord crosses any other time | `bonk`: streak → 0, period → base, enters `tumbling`. **Total untouched.** |
| No tap at all | The cord crosses with `pending === null` → bonk. Idle is slapstick, not safety. |
| Period floor | Never drops below `MIN_PERIOD` no matter how long the streak |
| Tumble sequence | ball stops → `BONK_TUMBLE_DUR + BONK_PAUSE` still → `respin` eases `RESPIN_START_PERIOD` → `BASE_PERIOD` over `BONK_RESPIN` → `ready` |

- [ ] **Step 1: Write the failing test**

`test/gameplay.test.ts`:

```ts
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
})

describe('mashing', () => {
  it('ignores a tap early in an existing hop', () => {
    const g = createGame(store)
    armAt(g, GOOD)
    tap(g)
    drainEvents(g)
    run(g, 0.05)
    tap(g)
    expect(drainEvents(g)).toEqual([])
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/gameplay`

- [ ] **Step 3: Write `src/gameplay.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run validate`
Expected: typecheck clean, all unit tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: game state machine with no-fail bonk recovery"
```

---

### Task 4: Scene, camera, lighting, ground

**Files:**
- Create: `src/scene.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `interface Stage { renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera; render(): void; resize(): void }`
  - `createStage(host: HTMLElement): Stage`

No unit test — this is pure three.js wiring with nothing to assert that isn't better covered by the e2e smoke test in Task 9. It is verified by eye.

- [ ] **Step 1: Write `src/scene.ts`**

```ts
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three'

export interface Stage {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  render(): void
  resize(): void
}

const SKY = 0x7fd0ef
const GRASS = 0x6cc24a

export function createStage(host: HTMLElement): Stage {
  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(SKY)
  scene.fog = new Fog(SKY, 14, 34)

  const camera = new PerspectiveCamera(42, 1, 0.1, 100)
  camera.position.set(0, 1.7, 5.4)
  camera.lookAt(0, 1.0, 0)

  scene.add(new AmbientLight(0xffffff, 1.15))

  const sun = new DirectionalLight(0xfff4e0, 2.1)
  sun.position.set(3.5, 6, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 20
  sun.shadow.camera.left = -6
  sun.shadow.camera.right = 6
  sun.shadow.camera.top = 6
  sun.shadow.camera.bottom = -6
  scene.add(sun)

  const ground = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: GRASS, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  function resize(): void {
    const w = host.clientWidth
    const h = host.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / Math.max(1, h)
    // Portrait on an iPad crops the sides badly at a fixed FOV, so widen it.
    camera.fov = camera.aspect < 1 ? 58 : 42
    camera.updateProjectionMatrix()
  }

  resize()

  return {
    renderer,
    scene,
    camera,
    render: () => renderer.render(scene, camera),
    resize,
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: three.js stage with sky, sun, and ground"
```

---

### Task 5: The primitive cougar

Capsules and boxes. The entire point of Phase 1 is proving the hop feels good *before* anyone authors a rig.

**Files:**
- Create: `src/cougarStub.ts`

**Interfaces:**
- Consumes: `constants.ts` (`ANKLE`, `HOP_HEIGHT`)
- Produces:
  - `interface Cougar { group: Group; ankleWorld: Vector3; pose(hopP: number, tumbleP: number): void }`
  - `createCougar(): Cougar`

`pose()` is called every frame with `hopProgress(g)` and `tumbleProgress(g)` from Task 3. `ankleWorld` is a live `Vector3` that Task 6 reads to anchor the cord — `pose()` keeps it current.

- [ ] **Step 1: Write `src/cougarStub.ts`**

```ts
import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { ANKLE, HOP_HEIGHT } from './constants'

const PURPLE = 0x8b5cf6
const PURPLE_DARK = 0x6d3fd1
const CREAM = 0xfde68a

export interface Cougar {
  group: Group
  /** Live world position of the cuffed ankle. Updated by pose(). */
  ankleWorld: Vector3
  pose(hopP: number, tumbleP: number): void
}

export function createCougar(): Cougar {
  const fur = new MeshStandardMaterial({ color: PURPLE, roughness: 0.85 })
  const furDark = new MeshStandardMaterial({
    color: PURPLE_DARK,
    roughness: 0.85,
  })
  const muzzle = new MeshStandardMaterial({ color: CREAM, roughness: 0.9 })

  const group = new Group()

  // Body — upright, cartoon proportions. A quadruped cannot use a skip-ball.
  const body = new Mesh(new CapsuleGeometry(0.34, 0.62, 6, 16), fur)
  body.position.y = 1.02
  body.castShadow = true
  group.add(body)

  const head = new Mesh(new SphereGeometry(0.32, 20, 16), fur)
  head.position.y = 1.62
  head.castShadow = true
  group.add(head)

  const snout = new Mesh(new SphereGeometry(0.15, 16, 12), muzzle)
  snout.position.set(0, 1.54, 0.26)
  group.add(snout)

  for (const side of [-1, 1]) {
    const ear = new Mesh(new SphereGeometry(0.1, 12, 10), furDark)
    ear.position.set(side * 0.2, 1.85, -0.02)
    group.add(ear)

    const arm = new Mesh(new CapsuleGeometry(0.1, 0.4, 4, 10), fur)
    arm.position.set(side * 0.44, 1.06, 0)
    arm.rotation.z = side * 0.35
    arm.castShadow = true
    group.add(arm)
  }

  // Legs. The right one wears the cuff; the left one is what has to clear the cord.
  const legs: Mesh[] = []
  for (const side of [-1, 1]) {
    const leg = new Mesh(new CapsuleGeometry(0.13, 0.44, 4, 10), fur)
    leg.position.set(side * ANKLE.x, 0.52, 0)
    leg.castShadow = true
    group.add(leg)
    legs.push(leg)

    const foot = new Mesh(new BoxGeometry(0.24, 0.12, 0.34), furDark)
    foot.position.set(side * ANKLE.x, 0.06, 0.06)
    foot.castShadow = true
    group.add(foot)
  }
  const leftLeg = legs[0]!
  const rightLeg = legs[1]!

  const tail = new Mesh(new CapsuleGeometry(0.07, 0.7, 4, 10), fur)
  tail.position.set(0, 0.95, -0.42)
  tail.rotation.x = 0.7
  group.add(tail)

  const ankleWorld = new Vector3(ANKLE.x, ANKLE.y, ANKLE.z)

  function pose(hopP: number, tumbleP: number): void {
    // --- Hop: a sine arc up and back down, with a squash on takeoff and landing.
    const lift = hopP > 0 ? Math.sin(Math.PI * hopP) * HOP_HEIGHT : 0
    const squash = hopP > 0 ? 1 - Math.sin(Math.PI * hopP) * 0.12 : 1

    // --- Tumble: fall flat, lie there, then pop back upright at the very end.
    // tumbleP runs across the whole tumble+pause beat.
    let roll = 0
    let drop = 0
    if (tumbleP > 0) {
      const fall = Math.min(1, tumbleP / 0.28)
      const rise = tumbleP > 0.86 ? (tumbleP - 0.86) / 0.14 : 0
      const down = fall * (1 - rise)
      roll = down * (Math.PI / 2)
      drop = down * -0.34
    }

    group.position.y = lift + drop
    group.rotation.z = roll
    group.scale.set(1 / squash, squash, 1 / squash)

    // Free (left) leg tucks up during the hop — this is the leg clearing the cord.
    leftLeg.position.y = 0.52 + (hopP > 0 ? Math.sin(Math.PI * hopP) * 0.12 : 0)
    rightLeg.position.y = 0.52

    // The cuffed ankle rides with the body; the cord anchors here.
    ankleWorld.set(ANKLE.x, ANKLE.y + group.position.y, ANKLE.z)
    if (roll !== 0) ankleWorld.applyAxisAngle(new Vector3(0, 0, 1), roll)

    tail.rotation.z = Math.sin(hopP * Math.PI) * 0.3
  }

  pose(0, 0)

  return { group, ankleWorld, pose }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: primitive purple cougar with hop and tumble posing"
```

---

### Task 6: The ball and cord

**Files:**
- Create: `src/ballView.ts`

**Interfaces:**
- Consumes: `constants.ts` (`BALL_Y`, `BALL_Y_TILT`, `CORD_LENGTH`), `skipball.ts` (`BallState`)
- Produces:
  - `interface BallView { group: Group; update(ball: BallState, ankle: Vector3): void }`
  - `createBallView(): BallView`

The ball is orange with blue stripes, generated as a `CanvasTexture` — no image assets in Phase 1.

- [ ] **Step 1: Write `src/ballView.ts`**

```ts
import {
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { BALL_Y, BALL_Y_TILT, CORD_LENGTH } from './constants'
import type { BallState } from './skipball'

const ORANGE = '#ff7a1a'
const BLUE = '#1b57d6'

/** Orange ball, blue stripes — drawn, not loaded. */
function stripedTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = ORANGE
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = BLUE
  for (let i = 0; i < 4; i++) g.fillRect(0, i * 64 + 22, 256, 18)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export interface BallView {
  group: Group
  update(ball: BallState, ankle: Vector3): void
}

export function createBallView(): BallView {
  const group = new Group()

  const ball = new Mesh(
    new SphereGeometry(0.17, 24, 18),
    new MeshStandardMaterial({ map: stripedTexture(), roughness: 0.6 }),
  )
  ball.castShadow = true
  group.add(ball)

  // Unit-height cylinder along +Y, scaled and aimed at the ball each frame.
  const cord = new Mesh(
    new CylinderGeometry(0.012, 0.012, 1, 6),
    new MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9 }),
  )
  cord.geometry.translate(0, 0.5, 0)
  group.add(cord)

  const ballPos = new Vector3()
  const dir = new Vector3()
  const up = new Vector3(0, 1, 0)

  function update(state: BallState, ankle: Vector3): void {
    ballPos.set(
      ankle.x + Math.cos(state.theta) * CORD_LENGTH,
      BALL_Y + Math.sin(state.theta) * BALL_Y_TILT,
      ankle.z + Math.sin(state.theta) * CORD_LENGTH,
    )
    ball.position.copy(ballPos)
    ball.rotation.z -= 0.14
    ball.rotation.x -= 0.06

    cord.position.copy(ankle)
    dir.copy(ballPos).sub(ankle)
    cord.scale.set(1, dir.length(), 1)
    cord.quaternion.setFromUnitVectors(up, dir.normalize())
  }

  return { group, update }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: striped skip-ball and cord view"
```

---

### Task 7: Counter overlay and synthesized audio

**Files:**
- Create: `src/ui.ts`, `src/audio.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `interface Hud { setTotal(n: number): void; pop(): void }`
  - `createHud(host: HTMLElement): Hud`
  - `interface Sfx { unlock(): void; whoosh(): void; bonk(): void; cheer(): void; respin(): void }`
  - `createSfx(): Sfx`

Audio is synthesized with WebAudio oscillators and noise buffers — no files. `unlock()` must be called from inside a real user gesture or iOS keeps the context suspended.

- [ ] **Step 1: Write `src/ui.ts`**

```ts
/** The only text on screen is a numeral. The player cannot read. */
export interface Hud {
  setTotal(n: number): void
  pop(): void
}

export function createHud(host: HTMLElement): Hud {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  Object.assign(el.style, {
    position: 'fixed',
    top: 'max(16px, env(safe-area-inset-top))',
    left: '0',
    right: '0',
    textAlign: 'center',
    font: '700 84px/1 system-ui, -apple-system, sans-serif',
    color: '#fffdf5',
    textShadow: '0 4px 0 rgba(0,0,0,0.22)',
    pointerEvents: 'none',
    transition: 'transform 120ms ease-out',
    transform: 'scale(1)',
  } satisfies Partial<CSSStyleDeclaration>)
  host.appendChild(el)

  let popTimer: number | undefined

  return {
    setTotal(n) {
      el.textContent = String(n)
    },
    pop() {
      el.style.transform = 'scale(1.28)'
      window.clearTimeout(popTimer)
      popTimer = window.setTimeout(() => {
        el.style.transform = 'scale(1)'
      }, 120)
    },
  }
}
```

- [ ] **Step 2: Write `src/audio.ts`**

```ts
/** Every sound is synthesized. Phase 1 ships no audio assets. */
export interface Sfx {
  unlock(): void
  whoosh(): void
  bonk(): void
  cheer(): void
  respin(): void
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null

  function ac(): AudioContext | null {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    return ctx
  }

  function tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
  ): void {
    const c = ac()
    if (!c) return
    const osc = c.createOscillator()
    const amp = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, c.currentTime)
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur)
    }
    amp.gain.setValueAtTime(gain, c.currentTime)
    amp.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
    osc.connect(amp).connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + dur)
  }

  function noise(dur: number, gain: number, cutoff: number): void {
    const c = ac()
    if (!c) return
    const frames = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, frames, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
    }
    const src = c.createBufferSource()
    src.buffer = buf
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(cutoff, c.currentTime)
    const amp = c.createGain()
    amp.gain.setValueAtTime(gain, c.currentTime)
    src.connect(filter).connect(amp).connect(c.destination)
    src.start()
  }

  return {
    unlock() {
      const c = ac()
      if (c && c.state === 'suspended') void c.resume()
    },
    whoosh() {
      noise(0.16, 0.16, 1400)
    },
    bonk() {
      tone(180, 0.22, 'sine', 0.28, 60)
      noise(0.12, 0.1, 320)
    },
    cheer() {
      const notes = [523, 659, 784, 1046]
      notes.forEach((f, i) => {
        window.setTimeout(() => tone(f, 0.14, 'triangle', 0.14), i * 70)
      })
    },
    respin() {
      tone(300, 0.3, 'triangle', 0.1, 620)
    },
  }
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: counter overlay and synthesized sfx"
```

---

### Task 8: Wire it together — the playable gate

**Files:**
- Create: `src/main.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7
- Produces:
  - `window.__pc: { game: GameState; tap(): void; step(dt: number): void; armAt(seconds: number): void }` — the QA hook, used by Task 9's e2e suite and by `tools/capture.mjs`

- [ ] **Step 1: Write `src/main.ts`**

```ts
import { createSfx } from './audio'
import { createBallView } from './ballView'
import { createCougar } from './cougarStub'
import { TAU, THETA_PASS } from './constants'
import {
  createGame,
  drainEvents,
  hopProgress,
  step,
  tap,
  tumbleProgress,
  type GameState,
} from './gameplay'
import { createStage } from './scene'
import { createHud } from './ui'

const host = document.getElementById('app')
if (!host) throw new Error('#app missing from index.html')

const stage = createStage(host)
const cougar = createCougar()
const ballView = createBallView()
stage.scene.add(cougar.group, ballView.group)

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

  cougar.pose(hopProgress(game), tumbleProgress(game))
  ballView.update(game.ball, cougar.ankleWorld)
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
```

- [ ] **Step 2: Verify it typechecks and builds**

Run: `npm run typecheck && npm run build`
Expected: both clean

- [ ] **Step 3: Play it**

Run: `npm run dev`, open **Chrome** at `http://localhost:5183` (not Brave — Shields block WebGL).

Confirm by eye and by ear:
- A purple cougar stands on green grass under a blue sky.
- An orange ball with blue stripes orbits his right ankle on a white cord.
- Doing nothing makes him trip over the cord roughly once per revolution, flop down, lie there, then get up as the ball respins.
- Spacebar or a click makes him hop; well-timed hops go *whoosh* and the big numeral climbs.
- The numeral survives a page reload.

**This is the gate the whole spec named.** If the hop does not feel good here, stop and tune `src/constants.ts` before going near Phase 2. Nothing downstream fixes a bad-feeling hop.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire the playable toy together"
```

---

### Task 9: End-to-end suite and capture harness

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`, `tools/capture.mjs`

**Interfaces:**
- Consumes: `window.__pc` from Task 8

- [ ] **Step 1: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

// --- Without --use-angle=metal, headless Chromium on darwin silently falls back
// --- to SwiftShader at ~3fps and every rAF-driven wait times out.
const darwinGpuArgs = process.platform === 'darwin' ? ['--use-angle=metal'] : []

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5183',
    ...devices['Desktop Chrome'],
    launchOptions: { args: darwinGpuArgs },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
```

- [ ] **Step 2: Write the failing e2e test**

`e2e/smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__pc))
  expect(errors, 'console must be clean on boot').toEqual([])
})

test('renders a canvas', async ({ page }) => {
  await expect(page.locator('#app canvas')).toBeVisible()
  const size = await page.locator('#app canvas').boundingBox()
  expect(size?.width).toBeGreaterThan(100)
  expect(size?.height).toBeGreaterThan(100)
})

test('a well-timed tap clears and increments the counter', async ({ page }) => {
  const total = await page.evaluate(() => {
    const pc = window.__pc
    pc.armAt(0.22)
    pc.tap()
    for (let i = 0; i < 30; i++) pc.step(1 / 120)
    return pc.game.total
  })
  expect(total).toBe(1)
})

test('a mistimed tap tumbles him without costing the counter', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const pc = window.__pc
    pc.armAt(0.22)
    pc.tap()
    for (let i = 0; i < 30; i++) pc.step(1 / 120)
    const before = pc.game.total

    pc.armAt(0.9)
    pc.tap()
    for (let i = 0; i < 130; i++) pc.step(1 / 120)
    return { before, after: pc.game.total, phase: pc.game.phase }
  })
  expect(result.phase).toBe('tumbling')
  expect(result.after).toBe(result.before)
})

test('the counter survives a reload', async ({ page }) => {
  await page.evaluate(() => {
    const pc = window.__pc
    for (let n = 0; n < 3; n++) {
      pc.armAt(0.22)
      pc.tap()
      for (let i = 0; i < 30; i++) pc.step(1 / 120)
      for (let i = 0; i < 40; i++) pc.step(1 / 120)
    }
  })
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__pc))
  expect(await page.evaluate(() => window.__pc.game.total)).toBe(3)
})

test('a real screen tap drives a hop', async ({ page }) => {
  await page.evaluate(() => window.__pc.armAt(0.22))
  await page.locator('#app canvas').click({ position: { x: 200, y: 200 } })
  const phase = await page.evaluate(() => window.__pc.game.phase)
  expect(['hopping', 'ready', 'tumbling']).toContain(phase)
})

test('the frame loop actually runs at real-time speed', async ({ page }) => {
  // Guards against the SwiftShader fallback: if this is slow, the GPU flag is wrong.
  const rate = await page.evaluate(async () => {
    const t0 = performance.now()
    let frames = 0
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (++frames >= 60) return resolve()
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    return frames / ((performance.now() - t0) / 1000)
  })
  expect(rate, 'frames per second').toBeGreaterThan(20)
})
```

- [ ] **Step 3: Run the e2e suite**

Run: `npx playwright install chromium && npm run e2e`

This is the first run against already-written code, so it is a verification pass, not a red-green step. Any wiring mistake from Task 8 surfaces here.

- [ ] **Step 4: Fix whatever the suite catches, then re-run**

Run: `npm run e2e`
Expected: 6 tests PASS

- [ ] **Step 5: Write `tools/capture.mjs`**

```js
#!/usr/bin/env node
/**
 * Screenshot QA harness.
 *
 * Launches its OWN headless Chrome via playwright-core rather than reusing the
 * shared ms-playwright-mcp profile, which locks when another Claude session
 * holds the browser. Never kill the other session's Chrome — use this instead.
 *
 * Usage:
 *   node tools/capture.mjs <prefix> "arm:0.22,tap:1,step:30,shot:clear"
 *
 * Commands:
 *   arm:<seconds>   park the orbit so the cord arrives in <seconds>
 *   tap:1           tap once
 *   step:<n>        advance <n> fixed 1/120s slices
 *   wait:<seconds>  let the real rAF loop run
 *   shot:<name>     write a png
 *   eval:<expr>     evaluate an expression and log the result
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const OUT = join(homedir(), 'agents', 'screenshots', 'purple-cougar')
const URL = process.env.PC_URL ?? 'http://localhost:5183'

const [prefix = 'shot', script = 'wait:1,shot:default'] = process.argv.slice(2)

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => console.log(`[${m.type()}]`, m.text()))
page.on('pageerror', (e) => console.error('[pageerror]', e.message))

await page.goto(URL)
await page.waitForFunction(() => Boolean(window.__pc))

for (const raw of script.split(',')) {
  const [cmd, arg = ''] = raw.trim().split(':')
  switch (cmd) {
    case 'arm':
      await page.evaluate((s) => window.__pc.armAt(s), Number(arg))
      break
    case 'tap':
      await page.evaluate(() => window.__pc.tap())
      break
    case 'step':
      await page.evaluate((n) => {
        for (let i = 0; i < n; i++) window.__pc.step(1 / 120)
      }, Number(arg))
      break
    case 'wait':
      await page.waitForTimeout(Number(arg) * 1000)
      break
    case 'shot': {
      const path = join(OUT, `${prefix}-${arg}.png`)
      await page.screenshot({ path })
      console.log('wrote', path)
      break
    }
    case 'eval':
      console.log(arg, '=>', await page.evaluate(arg))
      break
    default:
      console.warn('unknown command:', raw)
  }
}

await browser.close()
```

- [ ] **Step 6: Capture the money shots**

Run:

```bash
npm run dev &
node tools/capture.mjs phase1 "wait:1,shot:idle,arm:0.22,tap:1,step:20,shot:midhop,arm:0.9,tap:1,step:130,shot:tumble"
```

Expected: three PNGs in `~/agents/screenshots/purple-cougar/` showing him standing, mid-hop, and face-down. Look at them.

- [ ] **Step 7: Full gate and commit**

Run: `npm run validate && npm run e2e`
Expected: typecheck clean, all unit tests PASS, all 6 e2e PASS

```bash
git add -A
git commit -m "test: e2e smoke suite and screenshot capture harness"
```

---

## Done when

- `npm run validate && npm run e2e` is green, with the output pasted as evidence.
- Screenshots exist in `~/agents/screenshots/purple-cougar/` and have been looked at.
- The toy has been played in Chrome and the hop feels good.
- Nothing has been pushed.

## Not in this plan

Phases 2–5 from the spec — the authored GLB cougar, the three worlds, the juice pass, and deployment — each get their own plan, written after a real 3-year-old has played this.

The most likely outcome of that first play session is that the numbers in `src/constants.ts` are wrong. That is the expected result, not a failure: the table exists precisely so tuning it requires no structural change.
