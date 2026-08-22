import { describe, expect, it } from 'vitest'
import { gridCoverKey, gridLineVertices, snapActive, snapPoint, type GridSpec } from './grid'

const SQUARE: GridSpec = { type: 'square', size: 0.5 }
const ISOMETRIC: GridSpec = { type: 'isometric', size: 1 }

describe('snapActive', () => {
  it('follows the toggle', () => {
    expect(snapActive(true, false)).toBe(true)
    expect(snapActive(false, false)).toBe(false)
  })

  it('inverts while Shift is held', () => {
    expect(snapActive(true, true)).toBe(false)
    expect(snapActive(false, true)).toBe(true)
  })
})

describe('snapPoint', () => {
  it('snaps to the nearest cell vertex', () => {
    expect(snapPoint(SQUARE, 1.13, -0.7)).toEqual([1, -0.5])
    expect(snapPoint(SQUARE, 1.4, 0.26)).toEqual([1.5, 0.5])
  })

  it('leaves exact vertices in place', () => {
    expect(snapPoint({ type: 'square', size: 1 }, -3, 2)).toEqual([-3, 2])
  })

  it('snaps isometric screen points through the logical lattice', () => {
    expect(snapPoint(ISOMETRIC, 1.1, -1.4)).toEqual([1, -1.5])
    expect(snapPoint(ISOMETRIC, 1, -1.5)).toEqual([1, -1.5])
  })
})

describe('gridLineVertices', () => {
  it('covers the rect with one line per cell boundary', () => {
    const spec: GridSpec = { type: 'square', size: 1 }
    const verts = gridLineVertices(spec, { minX: 0, maxX: 2, minY: 0, maxY: 1 })
    // 3 vertical + 2 horizontal lines, 2 vertices × 3 components each.
    expect(verts.length).toBe(5 * 6)
    // First vertical line runs x=0 from y=0 to y=1.
    expect([...verts.slice(0, 6)]).toEqual([0, 0, 0, 0, 1, 0])
  })

  it('expands fractional rects outward to whole cells', () => {
    const spec: GridSpec = { type: 'square', size: 1 }
    const verts = gridLineVertices(spec, { minX: 0.2, maxX: 1.8, minY: 0.3, maxY: 0.7 })
    const xs = new Set<number>()
    for (let i = 0; i < verts.length; i += 6) {
      if (verts[i] === verts[i + 3]) xs.add(verts[i] ?? NaN)
    }
    expect([...xs].sort((a, b) => a - b)).toEqual([0, 1, 2])
  })

  it('draws both projected diagonal families over the logical cover', () => {
    const verts = gridLineVertices(ISOMETRIC, { minX: -2, maxX: 2, minY: -1, maxY: 0 })
    expect(verts).toHaveLength(8 * 6)
    for (let index = 0; index < verts.length; index += 6) {
      const dx = Math.abs((verts[index + 3] ?? 0) - (verts[index] ?? 0))
      const dy = Math.abs((verts[index + 4] ?? 0) - (verts[index + 1] ?? 0))
      expect(dx).toBeGreaterThan(0)
      expect(dy).toBeGreaterThan(0)
    }
  })
})

describe('gridCoverKey', () => {
  it('is stable across sub-cell pans', () => {
    const a = gridCoverKey(SQUARE, { minX: 0.1, maxX: 4.1, minY: 0.1, maxY: 2.1 })
    const b = gridCoverKey(SQUARE, { minX: 0.3, maxX: 4.3, minY: 0.2, maxY: 2.2 })
    expect(a).toBe(b)
  })

  it('changes when the view crosses a cell boundary', () => {
    const a = gridCoverKey(SQUARE, { minX: 0.1, maxX: 4.1, minY: 0, maxY: 2 })
    const b = gridCoverKey(SQUARE, { minX: 0.6, maxX: 4.6, minY: 0, maxY: 2 })
    expect(a).not.toBe(b)
  })

  it('changes with the cell size', () => {
    const rect = { minX: 0, maxX: 4, minY: 0, maxY: 2 }
    expect(gridCoverKey(SQUARE, rect)).not.toBe(
      gridCoverKey({ type: 'square', size: 1 }, rect),
    )
  })

  it('keeps an isometric logical cover stable across sub-cell screen pans', () => {
    const a = gridCoverKey(ISOMETRIC, { minX: -1.8, maxX: 1.8, minY: -0.8, maxY: 0.8 })
    const b = gridCoverKey(ISOMETRIC, { minX: -1.8, maxX: 1.8, minY: -0.85, maxY: 0.75 })
    expect(a).toBe(b)
  })
})
