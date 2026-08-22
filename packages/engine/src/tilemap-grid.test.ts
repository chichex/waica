import { describe, expect, it } from 'vitest'
import { cellAt, cellBounds, cellIndex, type TilemapGridSpec } from './tilemap-grid'

const GRID: TilemapGridSpec = {
  mapWidth: 3,
  mapHeight: 2,
  cellSize: 2,
  originX: 10,
  originY: -4,
}

describe('Tilemap grid helpers', () => {
  it('indexes cells row-major and rejects cells outside the map', () => {
    expect(cellIndex(3, 2, 0, 0)).toBe(0)
    expect(cellIndex(3, 2, 2, 0)).toBe(2)
    expect(cellIndex(3, 2, 0, 1)).toBe(3)
    expect(cellIndex(3, 2, 2, 1)).toBe(5)
    expect(cellIndex(3, 2, -1, 0)).toBeNull()
    expect(cellIndex(3, 2, 3, 0)).toBeNull()
    expect(cellIndex(3, 2, 0, 2)).toBeNull()
  })

  it('finds the cell containing a logical point from the entity origin', () => {
    expect(cellAt(GRID, 10.1, -3.9)).toEqual({ column: 0, row: 0, index: 0 })
    expect(cellAt(GRID, 13.9, -0.1)).toEqual({ column: 1, row: 1, index: 4 })
    expect(cellAt(GRID, 16, -2)).toBeNull()
    expect(cellAt(GRID, 9.99, -4)).toBeNull()
  })

  it('derives exact logical bounds and center for a cell', () => {
    expect(cellBounds(GRID, 1, 1)).toEqual({
      left: 12,
      right: 14,
      bottom: -2,
      top: 0,
      centerX: 13,
      centerY: -1,
    })
    expect(cellBounds(GRID, 3, 0)).toBeNull()
  })

  it('treats invalid dimensions and cell sizes as an empty map', () => {
    expect(cellIndex(0, 2, 0, 0)).toBeNull()
    expect(cellAt({ ...GRID, cellSize: 0 }, 10, -4)).toBeNull()
    expect(cellBounds({ ...GRID, mapHeight: -1 }, 0, 0)).toBeNull()
  })
})
