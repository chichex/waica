export interface TilemapGridSpec {
  mapWidth: number
  mapHeight: number
  cellSize: number
  originX?: number
  originY?: number
}

export interface TilemapCell {
  column: number
  row: number
  index: number
}

export interface TilemapCellBounds {
  left: number
  right: number
  bottom: number
  top: number
  centerX: number
  centerY: number
}

function dimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** Row-major index for a map cell, or null outside a valid map. */
export function cellIndex(
  mapWidth: number,
  mapHeight: number,
  column: number,
  row: number,
): number | null {
  const width = dimension(mapWidth)
  const height = dimension(mapHeight)
  if (!Number.isInteger(column) || !Number.isInteger(row)) return null
  if (column < 0 || row < 0 || column >= width || row >= height) return null
  return row * width + column
}

/** Cell containing a logical point, relative to the Tilemap entity origin. */
export function cellAt(
  spec: TilemapGridSpec,
  logicalX: number,
  logicalY: number,
): TilemapCell | null {
  const size = spec.cellSize
  if (!Number.isFinite(size) || size <= 0) return null
  const column = Math.floor((logicalX - (spec.originX ?? 0)) / size)
  const row = Math.floor((logicalY - (spec.originY ?? 0)) / size)
  const index = cellIndex(spec.mapWidth, spec.mapHeight, column, row)
  return index === null ? null : { column, row, index }
}

/** Logical bounds and center of one map cell. */
export function cellBounds(
  spec: TilemapGridSpec,
  column: number,
  row: number,
): TilemapCellBounds | null {
  if (cellIndex(spec.mapWidth, spec.mapHeight, column, row) === null) return null
  const size = spec.cellSize
  if (!Number.isFinite(size) || size <= 0) return null
  const left = (spec.originX ?? 0) + column * size
  const bottom = (spec.originY ?? 0) + row * size
  return {
    left,
    right: left + size,
    bottom,
    top: bottom + size,
    centerX: left + size / 2,
    centerY: bottom + size / 2,
  }
}
