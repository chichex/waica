import { describe, expect, it } from 'vitest'
import { buildOccluderGrid, type OccluderSource } from './occluder-grid.js'
import { lightVisibility, type LightField } from './light-field.js'

/** A 3x2 map whose tile 4 is solid: row 0 = [0, 4, 0], row 1 = [4, 0, 0]. */
function map(overrides: Partial<OccluderSource> = {}): OccluderSource {
  return {
    originX: 0,
    originY: 0,
    cellSize: 1,
    mapWidth: 3,
    mapHeight: 2,
    cells: [0, 4, 0, 4, 0, 0],
    solidTiles: [4],
    ...overrides,
  }
}

const light: LightField = {
  x: 0.5,
  y: 0.5,
  radius: 10,
  color: [1, 1, 1],
  intensity: 1,
  bands: 0,
  softness: 0,
  castShadows: true,
}

describe('buildOccluderGrid (CA-7, inference 8)', () => {
  it('is null when no Tilemap declares a solid tile that is placed', () => {
    expect(buildOccluderGrid([])).toBeNull()
    expect(buildOccluderGrid([map({ solidTiles: [] })])).toBeNull()
    expect(buildOccluderGrid([map({ solidTiles: [7] })])).toBeNull()
  })

  it('marks exactly the cells holding a solid tile, on the map’s own grid', () => {
    const grid = buildOccluderGrid([map({ originX: 2, originY: -1, cellSize: 0.5 })])
    expect(grid).toMatchObject({ originX: 2, originY: -1, cellSize: 0.5, columns: 3, rows: 2 })
    expect([...(grid?.solid ?? [])]).toEqual([0, 1, 0, 1, 0, 0])
  })

  it('merges every Tilemap of the scene into one grid', () => {
    const left = map()
    const right = map({ originX: 5, cells: [4, 0, 0, 0, 0, 0] })
    const grid = buildOccluderGrid([left, right])
    expect(grid).toMatchObject({ originX: 0, originY: 0, cellSize: 1, columns: 8, rows: 2 })
    const solidCells = [...(grid?.solid ?? [])].flatMap((value, index) => (value === 1 ? [index] : []))
    expect(solidCells).toEqual([1, 5, 8])
  })

  it('casts the shadow of each map’s walls', () => {
    const grid = buildOccluderGrid([map()])
    // A light in the open cell (2, 1): the wall at column 1, row 0 hides
    // (0.5, 0.5); straight down, (2.5, 0.5) crosses no wall.
    const corner = { ...light, x: 2.5, y: 1.5 }
    expect(lightVisibility(grid, corner, 0.5, 0.5)).toBe(0)
    expect(lightVisibility(grid, corner, 2.5, 0.5)).toBe(1)
  })
})
