import { describe, expect, it } from 'vitest'
import { facingForInput, facingVector, logicalDirection, SCREEN_FACINGS } from './facing'
import { defined } from '../../engine/src/test-support'

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

  it('reads every keyboard combination exactly as the eight sign pairs (issue #75 CA-11)', () => {
    const expected: Record<string, string | undefined> = {
      '-1,-1': 'sw', '-1,0': 'w', '-1,1': 'nw',
      '0,-1': 's', '0,0': undefined, '0,1': 'n',
      '1,-1': 'se', '1,0': 'e', '1,1': 'ne',
    }
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) expect(facingForInput(x, y), `${x},${y}`).toBe(expected[`${x},${y}`])
    }
  })

  it.each([
    [0.05, 0.9, 'n'],
    [0.2, -0.9, 's'],
    [-0.9, 0.1, 'w'],
    [0.5, 0.45, 'ne'],
    [0.38, 0.92, 'n'], // 67.6°: just past the n/ne border at 67.5°
    [0.39, 0.92, 'ne'], // 67.0°
  ] as const)('reads analog input (%d, %d) by its 45° sector as %s (issue #75 CA-11)', (x, y, facing) => {
    expect(facingForInput(x, y)).toBe(facing)
  })
})

describe('facingVector', () => {
  it('round-trips every declared facing through facingForInput', () => {
    for (const facing of SCREEN_FACINGS) {
      const vector = facingVector(facing)
      expect(vector, facing).toBeDefined()
      expect(facingForInput(defined(vector).x, defined(vector).y)).toBe(facing)
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
    const ne = defined(logicalDirection('ne', null))
    expect(ne.x).toBeCloseTo(ROOT_HALF)
    expect(ne.y).toBeCloseTo(ROOT_HALF)
  })

  it('maps screen facings onto the logical diamond under isometric projection', () => {
    const east = defined(logicalDirection('e', 'isometric'))
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
