import { describe, expect, it } from 'vitest'
import { resolveHazardTouch } from './hazard'

describe('resolveHazardTouch', () => {
  it('falling from above → stomp', () => {
    expect(resolveHazardTouch(-5, 0.5, 0, true)).toBe('stomp')
  })

  it('rising → hurt (no stomping from below)', () => {
    expect(resolveHazardTouch(6, 0.5, 0, true)).toBe('hurt')
  })

  it('from the side, with feet below the center → hurt', () => {
    expect(resolveHazardTouch(-1, -0.4, 0, true)).toBe('hurt')
  })

  it('non-stompable always hurts', () => {
    expect(resolveHazardTouch(-5, 0.5, 0, false)).toBe('hurt')
  })
})
