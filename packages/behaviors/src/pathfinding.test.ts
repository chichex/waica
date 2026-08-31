import { describe, expect, it } from 'vitest'
import { findPath, nearestReachableCell, planPath, reachableCells } from './pathfinding'
import type { GridCell, GridPoint, NavigationGrid } from './navigation-grid'

/**
 * A NavigationGrid from ASCII rows: '#' blocked, anything else walkable.
 * Row 0 is the top row (row index increases downward, matching the array).
 */
function gridFromRows(rows: readonly string[]): NavigationGrid {
  const height = rows.length
  const width = Math.max(...rows.map((r) => r.length))
  const blocked = new Set<string>()
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      if (row[c] === '#') blocked.add(`${c},${r}`)
    }
  })
  return {
    spec: { mapWidth: width, mapHeight: height, cellSize: 1, originX: 0, originY: 0 },
    columns: width,
    rows: height,
    isWalkable(cell: GridCell): boolean {
      if (cell.column < 0 || cell.row < 0 || cell.column >= width || cell.row >= height) return false
      return !blocked.has(`${cell.column},${cell.row}`)
    },
    cellAt(point: GridPoint): GridCell | null {
      const column = Math.floor(point.x)
      const row = Math.floor(point.y)
      if (column < 0 || row < 0 || column >= width || row >= height) return null
      return { column, row }
    },
    cellCenter(cell: GridCell): GridPoint | null {
      if (cell.column < 0 || cell.row < 0 || cell.column >= width || cell.row >= height) return null
      return { x: cell.column + 0.5, y: cell.row + 0.5 }
    },
  }
}

describe('findPath — A* over the Navigation Grid', () => {
  it('routes around an L-shaped wall', () => {
    const grid = gridFromRows([
      '.....',
      '.###.',
      '.#...',
      '.#.#.',
      '.....',
    ])

    const path = findPath(grid, { column: 0, row: 2 }, { column: 4, row: 2 })

    expect(path).not.toBeNull()
    // Every step must land on a walkable cell, and the path must end at the goal.
    for (const cell of path!) expect(grid.isWalkable(cell)).toBe(true)
    expect(path![path!.length - 1]).toEqual({ column: 4, row: 2 })
    // It has to detour: a straight 4-step line is blocked by the wall.
    expect(path!.length).toBeGreaterThan(4)
  })

  it('returns an empty path when already at the goal', () => {
    const grid = gridFromRows(['...'])
    expect(findPath(grid, { column: 1, row: 0 }, { column: 1, row: 0 })).toEqual([])
  })

  it('returns null when the goal is not walkable', () => {
    const grid = gridFromRows(['.#.'])
    expect(findPath(grid, { column: 0, row: 0 }, { column: 1, row: 0 })).toBeNull()
  })

  it('forbids the diagonal step when both adjacent cardinals are blocked, with no route around', () => {
    // (0,0) is only diagonally adjacent to (1,1); both cardinals between them
    // — (1,0) and (0,1) — are blocked, so a corner-cutting A* would still
    // take the diagonal in one step. Without corner-cutting there is no path.
    const grid = gridFromRows(['.#', '#.'])

    const path = findPath(grid, { column: 0, row: 0 }, { column: 1, row: 1 })

    expect(path).toBeNull()
  })

  it('forbids the diagonal step when only one adjacent cardinal is blocked, forcing a detour', () => {
    const grid = gridFromRows(['.#', '..'])

    const path = findPath(grid, { column: 0, row: 0 }, { column: 1, row: 1 })

    // (1,0) is blocked, so the diagonal is forbidden even though (0,1) is
    // open — the rule requires BOTH cardinals, not just one.
    expect(path).toEqual([
      { column: 0, row: 1 },
      { column: 1, row: 1 },
    ])
  })

  it('allows the diagonal step when both adjacent cardinals are open', () => {
    const grid = gridFromRows(['..', '..'])

    const path = findPath(grid, { column: 0, row: 0 }, { column: 1, row: 1 })

    expect(path).toEqual([{ column: 1, row: 1 }])
  })
})

describe('reachableCells / nearestReachableCell', () => {
  it('enumerates every cell connected to the start, excluding walls', () => {
    const grid = gridFromRows(['.#.', '.#.', '...'])

    const reachable = reachableCells(grid, { column: 0, row: 0 })

    expect(reachable).toContainEqual({ column: 2, row: 0 }) // around via row 2
    expect(reachable).not.toContainEqual({ column: 1, row: 0 }) // the wall itself
  })

  it('resolves the nearest reachable cell to an unreachable point', () => {
    const grid = gridFromRows(['...', '###', '...'])

    // The bottom row is walled off from the top by a solid middle row.
    const nearest = nearestReachableCell(grid, { column: 1, row: 0 }, { x: 1.5, y: 2.5 })

    expect(nearest).not.toBeNull()
    expect(grid.isWalkable(nearest!)).toBe(true)
    // Must be on the reachable (top) side, not the walled-off bottom row.
    expect(nearest!.row).not.toBe(2)
  })
})

describe('planPath — click resolution (CA-3)', () => {
  it('paths straight to a reachable, walkable destination', () => {
    const grid = gridFromRows(['.....'])

    const plan = planPath(grid, { x: 0.5, y: 0.5 }, { x: 4.5, y: 0.5 })

    expect(plan).not.toBeNull()
    expect(plan!.targetCell).toEqual({ column: 4, row: 0 })
    expect(plan!.target).toEqual({ x: 4.5, y: 0.5 })
  })

  it('resolves a click on a blocked cell (e.g. water) to the nearest walkable cell', () => {
    const grid = gridFromRows(['..#..'])

    const plan = planPath(grid, { x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 })

    expect(plan).not.toBeNull()
    expect(grid.isWalkable(plan!.targetCell)).toBe(true)
    expect(plan!.targetCell).not.toEqual({ column: 2, row: 0 })
  })

  it('resolves a click outside the grid to the nearest walkable cell inside it', () => {
    const grid = gridFromRows(['...'])

    const plan = planPath(grid, { x: 0.5, y: 0.5 }, { x: 50, y: 50 })

    expect(plan).not.toBeNull()
    expect(grid.isWalkable(plan!.targetCell)).toBe(true)
    expect(plan!.targetCell.column).toBeLessThan(3)
  })

  it('returns null when the mover itself is not standing on a walkable cell', () => {
    const grid = gridFromRows(['#..'])

    const plan = planPath(grid, { x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 })

    expect(plan).toBeNull()
  })
})
