export interface TilemapBrushSelection {
  entity: string
  tile: number
  paint: boolean
}

export interface TilemapStroke {
  readonly original: readonly number[]
  readonly cells: readonly number[]
  readonly mapWidth: number
  readonly mapHeight: number
  readonly visited: ReadonlySet<number>
}

function dimensions(mapWidth: number, mapHeight: number): [number, number] | null {
  const width = Math.floor(mapWidth)
  const height = Math.floor(mapHeight)
  return width > 0 && height > 0 ? [width, height] : null
}

function normalizedCells(cells: readonly number[], width: number, height: number): number[] {
  return Array.from({ length: width * height }, (_, index) => cells[index] ?? -1)
}

/** One immutable paint operation, or null when the cell is outside the map. */
export function paintCell(
  cells: readonly number[],
  mapWidth: number,
  mapHeight: number,
  column: number,
  row: number,
  tile: number,
): number[] | null {
  const size = dimensions(mapWidth, mapHeight)
  if (!size || !Number.isInteger(column) || !Number.isInteger(row)) return null
  const [width, height] = size
  if (column < 0 || row < 0 || column >= width || row >= height) return null
  const next = normalizedCells(cells, width, height)
  next[row * width + column] = tile
  return next
}

export function beginStroke(
  cells: readonly number[],
  mapWidth: number,
  mapHeight: number,
): TilemapStroke {
  const size = dimensions(mapWidth, mapHeight)
  const normalized = size ? normalizedCells(cells, size[0], size[1]) : []
  return {
    original: normalized,
    cells: normalized,
    mapWidth,
    mapHeight,
    visited: new Set(),
  }
}

/** Paints each visited cell at most once during one pointer stroke. */
export function reduceStroke(
  stroke: TilemapStroke,
  column: number,
  row: number,
  tile: number,
): TilemapStroke {
  const width = Math.floor(stroke.mapWidth)
  const index = row * width + column
  if (stroke.visited.has(index)) return stroke
  const cells = paintCell(
    stroke.cells,
    stroke.mapWidth,
    stroke.mapHeight,
    column,
    row,
    tile,
  )
  if (!cells) return stroke
  return {
    ...stroke,
    cells,
    visited: new Set([...stroke.visited, index]),
  }
}

/** One cells value for the regular scene commit, or null for a no-change stroke. */
export function finishStroke(stroke: TilemapStroke): number[] | null {
  const changed = stroke.cells.some((cell, index) => cell !== stroke.original[index])
  return changed ? [...stroke.cells] : null
}
