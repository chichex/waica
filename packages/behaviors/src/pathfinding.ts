import type { GridCell, GridPoint, NavigationGrid } from './navigation-grid.js'

/** 8-way neighborhood; the first four are cardinal, the last four diagonal. */
const NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

function key(cell: GridCell): string {
  return `${cell.column},${cell.row}`
}

/**
 * Walkable neighbors of a cell, corner-cutting forbidden: a diagonal step is
 * only offered when both adjacent cardinal cells are walkable too (CA-3).
 */
function neighbors(grid: NavigationGrid, cell: GridCell): GridCell[] {
  const result: GridCell[] = []
  for (const [dc, dr] of NEIGHBORS) {
    const next = { column: cell.column + dc, row: cell.row + dr }
    if (!grid.isWalkable(next)) continue
    if (dc !== 0 && dr !== 0) {
      const cardinalA = { column: cell.column + dc, row: cell.row }
      const cardinalB = { column: cell.column, row: cell.row + dr }
      if (!grid.isWalkable(cardinalA) || !grid.isWalkable(cardinalB)) continue
    }
    result.push(next)
  }
  return result
}

function stepCost(dc: number, dr: number): number {
  return dc !== 0 && dr !== 0 ? Math.SQRT2 : 1
}

/** Octile distance: admissible heuristic for 8-way movement with unit/√2 costs. */
function octile(a: GridCell, b: GridCell): number {
  const dx = Math.abs(a.column - b.column)
  const dy = Math.abs(a.row - b.row)
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
}

/**
 * Every cell reachable from `start` under the same 8-way, corner-cut-forbidden
 * adjacency A* uses — a flood fill, cheapest way to answer "is X reachable"
 * and to enumerate candidates for the nearest-reachable fallback (CA-3).
 */
export function reachableCells(grid: NavigationGrid, start: GridCell): GridCell[] {
  if (!grid.isWalkable(start)) return []
  const visited = new Map<string, GridCell>([[key(start), start]])
  const queue: GridCell[] = [start]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const next of neighbors(grid, current)) {
      const k = key(next)
      if (visited.has(k)) continue
      visited.set(k, next)
      queue.push(next)
    }
  }
  return [...visited.values()]
}

/**
 * A* over the Navigation Grid, 8-way with corner-cutting forbidden (CA-3).
 * Returns the cell path from (excluding) `start` to (including) `goal`, or
 * null when `goal` isn't reachable from `start` under this adjacency.
 */
export function findPath(grid: NavigationGrid, start: GridCell, goal: GridCell): GridCell[] | null {
  if (!grid.isWalkable(start) || !grid.isWalkable(goal)) return null
  if (start.column === goal.column && start.row === goal.row) return []

  const startKey = key(start)
  const goalKey = key(goal)
  const gScore = new Map<string, number>([[startKey, 0]])
  const cameFrom = new Map<string, GridCell>()
  const open = new Map<string, GridCell>([[startKey, start]])
  const closed = new Set<string>()

  while (open.size > 0) {
    let currentKey = ''
    let current: GridCell | undefined
    let bestF = Infinity
    for (const [k, cell] of open) {
      const f = gScore.get(k)! + octile(cell, goal)
      if (f < bestF) {
        bestF = f
        currentKey = k
        current = cell
      }
    }
    if (!current) break
    if (currentKey === goalKey) {
      const path: GridCell[] = [current]
      let trace = currentKey
      while (cameFrom.has(trace)) {
        const previous = cameFrom.get(trace)!
        path.unshift(previous)
        trace = key(previous)
      }
      path.shift() // drop the start cell — the mover is already there.
      return path
    }
    open.delete(currentKey)
    closed.add(currentKey)
    const currentG = gScore.get(currentKey)!
    for (const next of neighbors(grid, current)) {
      const nextKey = key(next)
      if (closed.has(nextKey)) continue
      const tentativeG = currentG + stepCost(next.column - current.column, next.row - current.row)
      if (tentativeG < (gScore.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, current)
        gScore.set(nextKey, tentativeG)
        open.set(nextKey, next)
      }
    }
  }
  return null
}

function squaredDistance(a: GridPoint, b: GridPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/**
 * The reachable-from-`start` cell whose center is nearest the logical point
 * `to` — the CA-3 fallback for an unreachable or out-of-grid destination.
 * Ties keep the lowest row then column, for determinism.
 */
export function nearestReachableCell(
  grid: NavigationGrid,
  start: GridCell,
  to: GridPoint,
): GridCell | null {
  let best: GridCell | null = null
  let bestDistance = Infinity
  for (const cell of reachableCells(grid, start)) {
    const center = grid.cellCenter(cell)
    if (!center) continue
    const distance = squaredDistance(center, to)
    if (
      distance < bestDistance ||
      (distance === bestDistance &&
        best &&
        (cell.row < best.row || (cell.row === best.row && cell.column < best.column)))
    ) {
      best = cell
      bestDistance = distance
    }
  }
  return best
}

export interface PlannedPath {
  /** Cells from (excluding) the start to (including) the resolved target. */
  cells: GridCell[]
  /** The resolved target cell — the clicked cell if reachable, else nearest reachable. */
  targetCell: GridCell
  /** Logical center of the resolved target cell. */
  target: GridPoint
}

/**
 * Plans a route from a logical point to a logical destination over a fresh
 * Navigation Grid (CA-2/CA-3): an unreachable or out-of-grid destination
 * resolves to the nearest reachable cell to the clicked point, and the path
 * always ends there. Null only when the mover's own position isn't walkable
 * (should not happen for an entity already standing in the scene).
 */
export function planPath(grid: NavigationGrid, from: GridPoint, to: GridPoint): PlannedPath | null {
  const startCell = grid.cellAt(from)
  if (!startCell || !grid.isWalkable(startCell)) return null
  const rawTargetCell = grid.cellAt(to)
  const directPath = rawTargetCell ? findPath(grid, startCell, rawTargetCell) : null

  let targetCell: GridCell | null
  let cells: GridCell[]
  if (rawTargetCell && directPath !== null) {
    targetCell = rawTargetCell
    cells = directPath
  } else {
    targetCell = nearestReachableCell(grid, startCell, to)
    if (!targetCell) return null
    cells = findPath(grid, startCell, targetCell) ?? []
  }
  const target = grid.cellCenter(targetCell)
  if (!target) return null
  return { cells, targetCell, target }
}
