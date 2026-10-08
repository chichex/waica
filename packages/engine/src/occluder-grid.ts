import type { OccluderGrid } from './light-field.js'

/** What a Tilemap contributes to occlusion: its logical grid and which of its tiles are solid. */
export interface OccluderSource {
  originX: number
  originY: number
  cellSize: number
  mapWidth: number
  mapHeight: number
  cells: readonly number[]
  solidTiles: readonly number[]
}

/** A solid tile's logical box. */
interface SolidBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Floating-point slack so a tile edge lying on a grid line covers no neighbouring cell. */
const EDGE = 1e-6

function solidBoxes(source: OccluderSource): SolidBox[] {
  const solid = new Set(source.solidTiles)
  const width = Math.max(0, Math.floor(source.mapWidth))
  const height = Math.max(0, Math.floor(source.mapHeight))
  const size = source.cellSize
  const boxes: SolidBox[] = []
  if (!(size > 0) || solid.size === 0) return boxes
  for (let index = 0; index < width * height; index += 1) {
    if (!solid.has(source.cells[index] ?? -1)) continue
    const minX = source.originX + (index % width) * size
    const minY = source.originY + Math.floor(index / width) * size
    boxes.push({ minX, minY, maxX: minX + size, maxY: minY + size })
  }
  return boxes
}

/**
 * Every Tilemap's solid tiles rasterized onto one logical grid (inference 8):
 * the finest cell size among them, spanning all their maps. With a single
 * Tilemap — or several sharing a cell size and an aligned origin — each grid
 * cell is exactly one tile. Null when no solid tile is placed anywhere: the
 * lights then cast no shadow at all.
 */
export function buildOccluderGrid(sources: readonly OccluderSource[]): OccluderGrid | null {
  const contributing = sources.map((source) => ({ source, boxes: solidBoxes(source) })).filter(({ boxes }) => boxes.length > 0)
  if (contributing.length === 0) return null
  const cellSize = Math.min(...contributing.map(({ source }) => source.cellSize))
  const originX = Math.min(...contributing.map(({ source }) => source.originX))
  const originY = Math.min(...contributing.map(({ source }) => source.originY))
  const right = Math.max(...contributing.map(({ source }) => source.originX + Math.floor(source.mapWidth) * source.cellSize))
  const top = Math.max(...contributing.map(({ source }) => source.originY + Math.floor(source.mapHeight) * source.cellSize))
  const columns = Math.max(1, Math.ceil((right - originX) / cellSize - EDGE))
  const rows = Math.max(1, Math.ceil((top - originY) / cellSize - EDGE))
  const solid = new Uint8Array(columns * rows)
  for (const { boxes } of contributing) {
    for (const box of boxes) {
      const fromColumn = Math.max(0, Math.floor((box.minX - originX) / cellSize + EDGE))
      const toColumn = Math.min(columns, Math.ceil((box.maxX - originX) / cellSize - EDGE))
      const fromRow = Math.max(0, Math.floor((box.minY - originY) / cellSize + EDGE))
      const toRow = Math.min(rows, Math.ceil((box.maxY - originY) / cellSize - EDGE))
      for (let row = fromRow; row < toRow; row += 1) solid.fill(1, row * columns + fromColumn, row * columns + toColumn)
    }
  }
  return { originX, originY, cellSize, columns, rows, solid }
}
