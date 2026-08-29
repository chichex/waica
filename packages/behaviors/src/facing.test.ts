import { describe, expect, it } from 'vitest'
import { facingForInput, facingVector, logicalDirection, SCREEN_FACINGS } from './facing'

const ROOT_HALF = Math.SQRT1_2

describe('facingForInput', () => {
  it.each([
    [1, 0, 'e'],
    [1, 1, 'ne'],
    [0, 1, 'n'],
    [-1, 1, 'nw'],
    [-1, 0, 'w'],
    [-1, -1, 'sw'],
    [0, -1, 's'],
    [1, -1, 'se'],
  ] as const)('reads screen input (%d, %d) as %s', (x, y, facing) => {
    expect(facingForInput(x, y)).toBe(facing)
  })

  it('reports nothing for no input, so the caller keeps its last facing', () => {
    expect(facingForInput(0, 0)).toBeUndefined()
  })

  it('only looks at the signs, not the magnitudes', () => {
    expect(facingForInput(0.2, -0.9)).toBe('se')
  })
})

describe('facingVector', () => {
  it('round-trips every declared facing through facingForInput', () => {
    for (const facing of SCREEN_FACINGS) {
      const vector = facingVector(facing)
      expect(vector, facing).toBeDefined()
      expect(facingForInput(vector!.x, vector!.y)).toBe(facing)
    }
  })

  it('rejects a facing the eight-way table does not know', () => {
    expect(facingVector('up')).toBeUndefined()
  })
})

describe('logicalDirection', () => {
  it('is the normalized screen vector when the scene has no projection', () => {
    expect(logicalDirection('e', null)).toEqual({ x: 1, y: 0 })
    expect(logicalDirection('n', null)).toEqual({ x: 0, y: 1 })
    const ne = logicalDirection('ne', null)!
    expect(ne.x).toBeCloseTo(ROOT_HALF)
    expect(ne.y).toBeCloseTo(ROOT_HALF)
  })

  it('maps screen facings onto the logical diamond under isometric projection', () => {
    const east = logicalDirection('e', 'isometric')!
    expect(east.x).toBeCloseTo(ROOT_HALF)
    expect(east.y).toBeCloseTo(-ROOT_HALF)
    expect(logicalDirection('se', 'isometric')).toEqual({ x: 1, y: 0 })
    expect(logicalDirection('nw', 'isometric')).toEqual({ x: -1, y: 0 })
    expect(logicalDirection('ne', 'isometric')).toEqual({ x: 0, y: -1 })
    expect(logicalDirection('sw', 'isometric')).toEqual({ x: 0, y: 1 })
  })

  it('is undefined for an unknown facing under either projection', () => {
    expect(logicalDirection('nowhere', null)).toBeUndefined()
    expect(logicalDirection('nowhere', 'isometric')).toBeUndefined()
  })
})
