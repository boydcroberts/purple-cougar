import { describe, expect, it } from 'vitest'
import { BOUNCES_TO_RAMP, CELEBRATE_DUR, WAKE_DUR } from '../src/constants'
import { BouncingBallDirector } from '../src/playDirector'

describe('BouncingBallDirector', () => {
  it('moves through the no-fail opening sequence without resetting on extra taps', () => {
    const story = new BouncingBallDirector()
    expect(story.snapshot().phase).toBe('sleeping')
    expect(story.tap()).toEqual([{ type: 'wake' }])
    expect(story.tap()).toEqual([])

    expect(story.update(WAKE_DUR, false, false)).toEqual([{ type: 'invite-ball' }])
    expect(story.snapshot().phase).toBe('invite')
    expect(story.tap()).toEqual([{ type: 'ball-tapped' }])

    for (let i = 1; i <= BOUNCES_TO_RAMP; i++) {
      const events = story.update(0, true, false)
      expect(events).toContainEqual({ type: 'bounce', count: i })
    }
    expect(story.snapshot().phase).toBe('ramp-ready')

    expect(story.update(0, false, true)).toEqual([
      { type: 'bell-rung' },
      { type: 'celebrate' },
    ])
    expect(story.update(CELEBRATE_DUR, false, false)).toEqual([{ type: 'train-tease' }])
    expect(story.snapshot().phase).toBe('free-play')
  })

  it('does not count bounces before the child has tapped the invited ball', () => {
    const story = new BouncingBallDirector()
    story.tap()
    story.update(WAKE_DUR, false, false)
    expect(story.update(0, true, false)).toEqual([])
    expect(story.snapshot().bounces).toBe(0)
  })
})
