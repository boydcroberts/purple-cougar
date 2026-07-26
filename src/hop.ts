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
