import type { CSSProperties } from 'react'
import type { SheetCell } from '@waica/engine'

/**
 * Geometry of hand-editing a sheet's cells, in image pixels: where the
 * pointer is on the image, and the cell a draw, move or resize drag makes.
 */

/** An in-flight pointer interaction over the cell overlay (edit mode). */
export type CellDrag =
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'move'; index: number; grabX: number; grabY: number }
  | { kind: 'resize'; index: number; anchorX: number; anchorY: number }

/** Drawn or resized cells smaller than this (image px) on either axis are not cells. */
export const MIN_CELL = 3

export interface ImagePoint {
  x: number
  y: number
}

/** The pointer's position in image pixels, rounded and clamped to the image. */
export function imagePoint(
  pointer: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  dims: [number, number],
): ImagePoint {
  const x = ((pointer.clientX - rect.left) / rect.width) * dims[0]
  const y = ((pointer.clientY - rect.top) / rect.height) * dims[1]
  return {
    x: Math.round(Math.min(Math.max(0, x), dims[0])),
    y: Math.round(Math.min(Math.max(0, y), dims[1])),
  }
}

/** The box spanned from a draw drag's start to `p`. */
export function drawnBox(start: ImagePoint, p: ImagePoint): SheetCell {
  return {
    x: Math.min(start.x, p.x),
    y: Math.min(start.y, p.y),
    width: Math.abs(p.x - start.x),
    height: Math.abs(p.y - start.y),
  }
}

/** `cell` moved so its top-left sits at `topLeft`, kept inside the image. */
export function movedCell(cell: SheetCell, topLeft: ImagePoint, dims: [number, number]): SheetCell {
  return {
    ...cell,
    x: Math.min(Math.max(0, topLeft.x), dims[0] - cell.width),
    y: Math.min(Math.max(0, topLeft.y), dims[1] - cell.height),
  }
}

/** The cell between a resize's fixed anchor corner and `p`, never under MIN_CELL. */
export function resizedCell(anchor: ImagePoint, p: ImagePoint): SheetCell {
  return {
    x: Math.min(anchor.x, p.x),
    y: Math.min(anchor.y, p.y),
    width: Math.max(MIN_CELL, Math.abs(p.x - anchor.x)),
    height: Math.max(MIN_CELL, Math.abs(p.y - anchor.y)),
  }
}

/**
 * The drag that resizes cell `index` by one corner ('nw' | 'ne' | 'sw' |
 * 'se'): the opposite corner stays anchored.
 */
export function resizeDrag(index: number, cell: SheetCell, corner: string): CellDrag {
  return {
    kind: 'resize',
    index,
    anchorX: corner.includes('w') ? cell.x + cell.width : cell.x,
    anchorY: corner.includes('n') ? cell.y + cell.height : cell.y,
  }
}

/**
 * A cell's overlay box. The overlays live in percentages of the image, so
 * they survive the pane's responsive scaling.
 */
export function cellBoxStyle(cell: SheetCell, dims: [number, number] | undefined): CSSProperties {
  if (!dims) return {}
  const pct = (value: number, total: number): string => `${(value / total) * 100}%`
  return {
    left: pct(cell.x, dims[0]),
    top: pct(cell.y, dims[1]),
    width: pct(cell.width, dims[0]),
    height: pct(cell.height, dims[1]),
  }
}
