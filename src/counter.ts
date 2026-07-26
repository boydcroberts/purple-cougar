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
