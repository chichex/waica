import { describe, expect, it } from 'vitest'
import { ClipPlayer } from './clip-player'

describe('ClipPlayer', () => {
  it('advances frames according to fps', () => {
    const p = new ClipPlayer()
    p.set({ frames: [10, 11, 12, 13], fps: 4 })
    expect(p.advance(0)).toBe(10)
    expect(p.advance(0.25)).toBe(11)
    expect(p.advance(0.25)).toBe(12)
  })

  it('loops by default', () => {
    const p = new ClipPlayer()
    p.set({ frames: [0, 1], fps: 2 })
    expect(p.advance(1.0)).toBe(0) // idx 2 % 2 = 0
    expect(p.advance(0.5)).toBe(1)
  })

  it('without loop it sticks on the last frame', () => {
    const p = new ClipPlayer()
    p.set({ frames: [8, 9], fps: 8, loop: false })
    expect(p.advance(10)).toBe(9)
    expect(p.advance(10)).toBe(9)
  })

  it('holds each frame for a flat, even step count under fixed-step float summation (regression)', () => {
    // this.t is a sum of SIMULATION_STEP-sized dts: float error skews
    // floor(t * fps) instead of holding every frame for a flat step count
    // (fps 12 at a 60 Hz fixed step: 5 steps per frame).
    const p = new ClipPlayer()
    p.set({ frames: [0, 1, 2, 3, 4, 5], fps: 12, loop: false })
    const DT = 1 / 60
    const seen: number[] = []
    for (let step = 0; step < 24; step += 1) seen.push(p.advance(DT))

    expect(seen).toEqual([
      0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4,
    ])
  })

  it('set resets the clock', () => {
    const p = new ClipPlayer()
    p.set({ frames: [0, 1, 2, 3], fps: 4 })
    p.advance(0.6)
    p.set({ frames: [5, 6], fps: 2 })
    expect(p.advance(0)).toBe(5)
  })
})
