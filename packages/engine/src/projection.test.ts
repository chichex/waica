import { describe, expect, it } from 'vitest'
import { projectIsometric, screenInputToLogical, unprojectIsometric } from './projection'

describe('screenInputToLogical', () => {
  it('maps screen cardinal input to unit logical vectors on pure screen axes', () => {
    const right = screenInputToLogical(1, 0)
    const up = screenInputToLogical(0, 1)

    expect(right.x).toBeCloseTo(Math.SQRT1_2, 12)
    expect(right.y).toBeCloseTo(-Math.SQRT1_2, 12)
    expect(projectIsometric(right.x, right.y).x).toBeGreaterThan(0)
    expect(projectIsometric(right.x, right.y).y).toBeCloseTo(0, 12)

    expect(up.x).toBeCloseTo(-Math.SQRT1_2, 12)
    expect(up.y).toBeCloseTo(-Math.SQRT1_2, 12)
    expect(projectIsometric(up.x, up.y).x).toBeCloseTo(0, 12)
    expect(projectIsometric(up.x, up.y).y).toBeGreaterThan(0)
  })

  it('preserves lengths and right angles before clamping', () => {
    const horizontal = screenInputToLogical(0.6, 0)
    const vertical = screenInputToLogical(0, 0.8)

    expect(Math.hypot(horizontal.x, horizontal.y)).toBeCloseTo(0.6, 12)
    expect(Math.hypot(vertical.x, vertical.y)).toBeCloseTo(0.8, 12)
    expect(horizontal.x * vertical.x + horizontal.y * vertical.y).toBeCloseTo(0, 12)
  })

  it('clamps fully pressed diagonals to one logical tile axis', () => {
    const diagonal = screenInputToLogical(1, 1)

    expect(diagonal.x).toBeCloseTo(0, 12)
    expect(diagonal.y).toBeCloseTo(-1, 12)
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 12)
    expect(projectIsometric(diagonal.x, diagonal.y)).toEqual({ x: 1, y: 0.5 })
  })

  it('keeps zero and short vectors unchanged in magnitude, and normalizes long ones', () => {
    expect(screenInputToLogical(0, 0)).toEqual({ x: 0, y: 0 })
    expect(Math.hypot(...Object.values(screenInputToLogical(0.25, 0)))).toBeCloseTo(0.25, 12)
    expect(screenInputToLogical(2, 0)).toEqual(screenInputToLogical(1, 0))
  })

  it('is deliberately different from point unprojection', () => {
    expect(unprojectIsometric(1, 0)).toEqual({ x: 0.5, y: -0.5 })
    expect(screenInputToLogical(1, 0)).not.toEqual(unprojectIsometric(1, 0))
  })
})

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
