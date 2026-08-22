import { describe, expect, it } from 'vitest'
import { projectIsometric, unprojectIsometric } from './projection'

describe('isometric projection', () => {
  it.each([
    [1, 0, 1, -0.5],
    [0, 1, -1, -0.5],
    [1, 1, 0, -1],
    [2, 1, 1, -1.5],
  ])('projects the logical lattice point (%s, %s)', (lx, ly, x, y) => {
    expect(projectIsometric(lx, ly)).toEqual({ x, y })
    expect(unprojectIsometric(x, y)).toEqual({ x: lx, y: ly })
  })

  it('round-trips deterministic pseudo-random points within 1e-9', () => {
    let state = 0x1a2b3c4d
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
      return state / 0x1_0000_0000
    }
    for (let index = 0; index < 200; index++) {
      const lx = random() * 2_000 - 1_000
      const ly = random() * 2_000 - 1_000
      const screen = projectIsometric(lx, ly)
      const logical = unprojectIsometric(screen.x, screen.y)
      expect(Math.abs(logical.x - lx)).toBeLessThan(1e-9)
      expect(Math.abs(logical.y - ly)).toBeLessThan(1e-9)
    }
  })

  it('is linear over vector addition', () => {
    const a = { x: 3.25, y: -7.5 }
    const b = { x: -2, y: 4.75 }
    const sum = projectIsometric(a.x + b.x, a.y + b.y)
    const pa = projectIsometric(a.x, a.y)
    const pb = projectIsometric(b.x, b.y)

    expect(sum.x).toBeCloseTo(pa.x + pb.x, 12)
    expect(sum.y).toBeCloseTo(pa.y + pb.y, 12)
  })
})
