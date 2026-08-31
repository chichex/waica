import {
  aabbOverlap,
  cellAt as gridCellAt,
  cellBounds as gridCellBounds,
  sceneSolids,
  Tilemap,
  type Entity,
  type Game,
  type TilemapGridSpec,
} from '@waica/engine'

export interface GridCell {
  column: number
  row: number
}

export interface GridPoint {
  x: number
  y: number
}

/** How far past the covered points/Solids an authorless (Tilemap-less) grid extends. */
const AABB_MARGIN_CELLS = 1

/**
 * Transient lattice of walkable 1×1 logical cells, rasterized from a scene's
 * Solids — Tilemap-derived and entity-authored alike (CA-2). Aligned to the
 * first Tilemap found when one exists; otherwise covers the AABB of the
 * supplied points (player + destination, typically) and every Solid, plus a
 * margin. Always derived fresh — never authored, never cached across plans.
 */
export interface NavigationGrid {
  readonly spec: TilemapGridSpec
  readonly columns: number
  readonly rows: number
  isWalkable(cell: GridCell): boolean
  /** The cell containing a logical point, or null outside the grid. */
  cellAt(point: GridPoint): GridCell | null
  /** The logical center of a cell; null for a cell outside the grid. */
  cellCenter(cell: GridCell): GridPoint | null
}

function findTilemap(game: Game): Tilemap | undefined {
  for (const entity of game.entities) {
    const tilemap = entity.get(Tilemap)
    if (tilemap) return tilemap
  }
  return undefined
}

function tilemapSpec(tilemap: Tilemap): TilemapGridSpec {
  return {
    mapWidth: tilemap.mapWidth,
    mapHeight: tilemap.mapHeight,
    cellSize: tilemap.cellSize,
    originX: tilemap.entity.position.x,
    originY: tilemap.entity.position.y,
  }
}

/** AABB of every supplied point plus every Solid's bounds, +1 cell margin. */
function aabbSpec(game: Game, points: readonly GridPoint[], except?: Entity): TilemapGridSpec {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const consider = (x: number, y: number): void => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const point of points) consider(point.x, point.y)
  for (const solid of sceneSolids(game, except)) {
    consider(solid.left, solid.top)
    consider(solid.right, solid.bottom)
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 0
    maxY = 0
  }
  const originX = Math.floor(minX) - AABB_MARGIN_CELLS
  const originY = Math.floor(minY) - AABB_MARGIN_CELLS
  const mapWidth = Math.max(1, Math.ceil(maxX) + AABB_MARGIN_CELLS - originX)
  const mapHeight = Math.max(1, Math.ceil(maxY) + AABB_MARGIN_CELLS - originY)
  return { mapWidth, mapHeight, cellSize: 1, originX, originY }
}

/**
 * Rasterizes the live scene into a Navigation Grid (CA-2). `points` seeds
 * the AABB fallback when no Tilemap is present (topdown) — pass at least
 * the mover's position and the click/target point. `except` (typically the
 * mover's own entity) is excluded from the blocking Solids, mirroring
 * sceneSolids' own contract.
 */
export function buildNavigationGrid(
  game: Game,
  points: readonly GridPoint[],
  except?: Entity,
): NavigationGrid {
  const tilemap = findTilemap(game)
  const spec = tilemap ? tilemapSpec(tilemap) : aabbSpec(game, points, except)
  const columns = Math.max(0, Math.floor(spec.mapWidth))
  const rows = Math.max(0, Math.floor(spec.mapHeight))
  const solids = sceneSolids(game, except)
  const blocked = new Uint8Array(columns * rows)
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const bounds = gridCellBounds(spec, column, row)
      if (!bounds) continue
      const cellCx = bounds.centerX
      const cellCy = bounds.centerY
      for (const solid of solids) {
        const solidCx = (solid.left + solid.right) / 2
        const solidCy = (solid.top + solid.bottom) / 2
        const solidW = solid.right - solid.left
        const solidH = solid.top - solid.bottom
        if (aabbOverlap(cellCx, cellCy, spec.cellSize, spec.cellSize, solidCx, solidCy, solidW, solidH)) {
          blocked[row * columns + column] = 1
          break
        }
      }
    }
  }
  return {
    spec,
    columns,
    rows,
    isWalkable(cell) {
      if (cell.column < 0 || cell.row < 0 || cell.column >= columns || cell.row >= rows) return false
      return blocked[cell.row * columns + cell.column] === 0
    },
    cellAt(point) {
      const cell = gridCellAt(spec, point.x, point.y)
      return cell ? { column: cell.column, row: cell.row } : null
    },
    cellCenter(cell) {
      const bounds = gridCellBounds(spec, cell.column, cell.row)
      return bounds ? { x: bounds.centerX, y: bounds.centerY } : null
    },
  }
}
