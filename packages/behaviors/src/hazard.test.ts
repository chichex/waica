import { describe, expect, it } from 'vitest'
import { resolveHazardTouch } from './hazard'

describe('resolveHazardTouch', () => {
  it('cayendo desde arriba → stomp', () => {
    expect(resolveHazardTouch(-5, 0.5, 0, true)).toBe('stomp')
  })

  it('subiendo → hurt (no se pisa desde abajo)', () => {
    expect(resolveHazardTouch(6, 0.5, 0, true)).toBe('hurt')
  })

  it('de costado, con los pies por debajo del centro → hurt', () => {
    expect(resolveHazardTouch(-1, -0.4, 0, true)).toBe('hurt')
  })

  it('no stompable siempre lastima', () => {
    expect(resolveHazardTouch(-5, 0.5, 0, false)).toBe('hurt')
  })
})
