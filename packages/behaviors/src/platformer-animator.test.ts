import { describe, expect, it } from 'vitest'
import { pickClip } from './platformer-animator'

describe('pickClip', () => {
  it('still on the ground → idle', () => {
    expect(pickClip({ grounded: true, vx: 0.2, vy: 0 }, 0.5)).toBe('idle')
  })

  it('moving on the ground → run', () => {
    expect(pickClip({ grounded: true, vx: 6, vy: 0 }, 0.5)).toBe('run')
    expect(pickClip({ grounded: true, vx: -6, vy: 0 }, 0.5)).toBe('run')
  })

  it('airborne going up → jump, going down → fall', () => {
    expect(pickClip({ grounded: false, vx: 0, vy: 8 }, 0.5)).toBe('jump')
    expect(pickClip({ grounded: false, vx: 0, vy: -3 }, 0.5)).toBe('fall')
  })

  it('respects the run threshold', () => {
    expect(pickClip({ grounded: true, vx: 2, vy: 0 }, 3)).toBe('idle')
    expect(pickClip({ grounded: true, vx: 4, vy: 0 }, 3)).toBe('run')
  })
})
