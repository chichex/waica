/**
 * Spritesheet slicing geometry shared by the runtime (UV math) and the
 * editor (grid overlay + previews). A sheet is a cols×rows grid of cells;
 * the optional params handle sheets whose frames don't fill the image:
 * a margin before the first cell, gaps between cells, or an explicit
 * cell size. All values are in source-image pixels and may be fractional
 * (downscaled exports often land on half pixels).
 */
export interface SheetGridParams {
  /** Top-left corner of the first cell. */
  gridOffsetX?: number
  gridOffsetY?: number
  /** Gap between adjacent cells. */
  spacingX?: number
  spacingY?: number
  /** Explicit cell size; unset/0 = split what the offset leaves evenly. */
  cellWidth?: number
  cellHeight?: number
}

/** One cell's pixel rect within the sheet image. */
export interface SheetCell {
  x: number
  y: number
  width: number
  height: number
}

/**
 * One spritesheet: its image plus how it slices into frames — a uniform
 * cols×rows grid, or explicit per-frame `cells` (auto-detected or hand-drawn)
 * for packed sheets whose frames don't sit on a grid. When `cells` is present
 * it wins over the grid.
 */
export interface SheetDef extends SheetGridParams {
  texture: string
  cols: number
  rows: number
  cells?: SheetCell[]
}

/** How many frames a sheet yields: its cell count, else the grid, at least 1. */
export function sheetFrameCount(sheet: {
  cols: number
  rows: number
  cells?: SheetCell[]
}): number {
  if (sheet.cells?.length) return sheet.cells.length
  return Math.max(1, Math.floor(sheet.cols)) * Math.max(1, Math.floor(sheet.rows))
}

/**
 * Maps a global frame index to its sheet and the frame within it. Sheets
 * are numbered consecutively: sheet 0 owns frames 0..n0-1, sheet 1 the next
 * n1, and so on. Out-of-range indices clamp to the nearest valid frame.
 */
export function locateFrame(
  sheets: readonly { cols: number; rows: number; cells?: SheetCell[] }[],
  frame: number,
): { sheet: number; frame: number } {
  let rest = Math.max(0, Math.floor(frame))
  for (let i = 0; i < sheets.length; i++) {
    const count = sheetFrameCount(sheets[i]!)
    if (rest < count || i === sheets.length - 1) return { sheet: i, frame: Math.min(rest, count - 1) }
    rest -= count
  }
  return { sheet: 0, frame: 0 }
}

const positive = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0

/**
 * The pixel rect of `frame` (row-major index) in a sheet image. Explicit
 * `cells` win when present (out-of-range indices clamp); otherwise the grid:
 * with no params, the image divided evenly into cols×rows.
 */
export function sheetCell(
  imageWidth: number,
  imageHeight: number,
  cols: number,
  rows: number,
  frame: number,
  params: SheetGridParams & { cells?: SheetCell[] } = {},
): SheetCell {
  if (params.cells?.length) {
    const index = Math.min(Math.max(0, Math.floor(frame)), params.cells.length - 1)
    return params.cells[index]!
  }
  const c = Math.max(1, Math.floor(cols))
  const r = Math.max(1, Math.floor(rows))
  const ox = positive(params.gridOffsetX)
  const oy = positive(params.gridOffsetY)
  const sx = positive(params.spacingX)
  const sy = positive(params.spacingY)
  const width = positive(params.cellWidth) || Math.max(1, (imageWidth - ox - sx * (c - 1)) / c)
  const height = positive(params.cellHeight) || Math.max(1, (imageHeight - oy - sy * (r - 1)) / r)
  const col = frame % c
  const row = Math.floor(frame / c)
  return { x: ox + col * (width + sx), y: oy + row * (height + sy), width, height }
}
