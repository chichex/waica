import { describe, expect, it } from 'vitest'
import { pickClip } from './platformer-animator'

describe('pickClip', () => {
  it('quieto en el piso → idle', () => {
    expect(pickClip({ grounded: true, vx: 0.2, vy: 0 }, 0.5)).toBe('idle')
  })

  it('moviéndose en el piso → run', () => {
    expect(pickClip({ grounded: true, vx: 6, vy: 0 }, 0.5)).toBe('run')
    expect(pickClip({ grounded: true, vx: -6, vy: 0 }, 0.5)).toBe('run')
  })

  it('en el aire subiendo → jump, bajando → fall', () => {
    expect(pickClip({ grounded: false, vx: 0, vy: 8 }, 0.5)).toBe('jump')
    expect(pickClip({ grounded: false, vx: 0, vy: -3 }, 0.5)).toBe('fall')
  })

  it('respeta el umbral de correr', () => {
    expect(pickClip({ grounded: true, vx: 2, vy: 0 }, 3)).toBe('idle')
    expect(pickClip({ grounded: true, vx: 4, vy: 0 }, 3)).toBe('run')
  })
})
