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
