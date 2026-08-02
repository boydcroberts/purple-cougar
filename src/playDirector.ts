/**
 * The child-facing story controller for the first playable vertical slice.
 *
 * It deliberately owns no meshes, audio nodes, or browser state. The render
 * layer turns its small event stream into animation, sound, and scenery.
 * Keeping this pure makes the no-fail sequence easy to verify and prevents a
 * visual frame-rate hiccup from changing the child's progression.
 */
import { BOUNCES_TO_RAMP, CELEBRATE_DUR, WAKE_DUR } from './constants'

export type PlayPhase =
  | 'sleeping'
  | 'waking'
  | 'invite'
  | 'playing'
  | 'ramp-ready'
  | 'celebrating'
  | 'free-play'

export type PlayEvent =
  | { type: 'wake' }
  | { type: 'invite-ball' }
  | { type: 'ball-tapped' }
  | { type: 'bounce'; count: number }
  | { type: 'ramp-ready' }
  | { type: 'bell-rung' }
  | { type: 'celebrate' }
  | { type: 'train-tease' }

export interface PlaySnapshot {
  phase: PlayPhase
  bounces: number
  rampReady: boolean
}

/**
 * A gentle, repeat-safe opening sequence. Any extra tap remains rewarding,
 * while the one-time milestones only advance forward — no wrong input can
 * lose progress or reset a child back to the beginning.
 */
export class BouncingBallDirector {
  private phase: PlayPhase = 'sleeping'
  private phaseTime = 0
  private bounces = 0

  snapshot(): PlaySnapshot {
    return {
      phase: this.phase,
      bounces: this.bounces,
      rampReady: this.phase === 'ramp-ready' || this.phase === 'celebrating' || this.phase === 'free-play',
    }
  }

  tap(): PlayEvent[] {
    switch (this.phase) {
      case 'sleeping':
        this.phase = 'waking'
        this.phaseTime = 0
        return [{ type: 'wake' }]
      case 'waking':
        // A mash during the wake beat is acknowledged by the renderer but
        // cannot skip the character's readable stretch and eye contact.
        return []
      case 'invite':
        this.phase = 'playing'
        return [{ type: 'ball-tapped' }]
      default:
        return [{ type: 'ball-tapped' }]
    }
  }

  /**
   * Completes the third-bounce beat when a scene intentionally omits the
   * optional physical ramp and bell. It never emits a fake bell event.
   */
  completeWithoutCourse(): PlayEvent[] {
    if (this.phase !== 'ramp-ready') return []
    this.phase = 'celebrating'
    this.phaseTime = 0
    return [{ type: 'celebrate' }]
  }

  /** Advance narrative time and feed in the two meaningful physical events. */
  update(dt: number, ballBounced: boolean, bellHit: boolean): PlayEvent[] {
    const events: PlayEvent[] = []
    this.phaseTime += Math.max(0, dt)

    if (this.phase === 'waking' && this.phaseTime >= WAKE_DUR) {
      this.phase = 'invite'
      this.phaseTime = 0
      events.push({ type: 'invite-ball' })
    }

    // The first three bounces are a short, intentional discovery beat — not
    // a score that keeps climbing while the child watches the ramp sequence.
    if (ballBounced && this.phase === 'playing') {
      this.bounces += 1
      events.push({ type: 'bounce', count: this.bounces })
      if (this.phase === 'playing' && this.bounces >= BOUNCES_TO_RAMP) {
        this.phase = 'ramp-ready'
        this.phaseTime = 0
        events.push({ type: 'ramp-ready' })
      }
    }

    if (bellHit && this.phase === 'ramp-ready') {
      this.phase = 'celebrating'
      this.phaseTime = 0
      events.push({ type: 'bell-rung' }, { type: 'celebrate' })
    }

    if (this.phase === 'celebrating' && this.phaseTime >= CELEBRATE_DUR) {
      this.phase = 'free-play'
      this.phaseTime = 0
      events.push({ type: 'train-tease' })
    }

    return events
  }
}
