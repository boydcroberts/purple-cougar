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

  it('survives a store that throws on read', () => {
    const hostile: CounterStore = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(() => loadTotal(hostile)).not.toThrow()
    expect(loadTotal(hostile)).toBe(0)
  })
})

describe('defaultStore (zero-argument calls)', () => {
  it('is safe when localStorage is undefined, as in this bare-node test environment', () => {
    expect(loadTotal()).toBe(0)
    expect(() => saveTotal(5)).not.toThrow()
  })

  it('is safe when merely accessing localStorage throws, as Safari private mode does', () => {
    const hadOwnProperty = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
    const originalDescriptor = hadOwnProperty
      ? Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
      : undefined

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: localStorage access is disabled')
      },
    })

    try {
      expect(loadTotal()).toBe(0)
      expect(() => saveTotal(5)).not.toThrow()
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage')
      }
    }
  })
})
