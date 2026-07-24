import { describe, expect, it } from 'vitest'
import { locateFrame, sheetCell, sheetFrameCount } from './sheet'

describe('sheetCell', () => {
  it('splits the image evenly with no params', () => {
    expect(sheetCell(1024, 128, 8, 1, 2)).toEqual({ x: 256, y: 0, width: 128, height: 128 })
  })

  it('maps row-major indices across rows', () => {
    expect(sheetCell(100, 100, 4, 2, 5)).toEqual({ x: 25, y: 50, width: 25, height: 50 })
  })

  it('offsets the grid and splits what remains', () => {
    const cell = sheetCell(110, 60, 2, 1, 1, { gridOffsetX: 10, gridOffsetY: 20 })
    expect(cell).toEqual({ x: 60, y: 20, width: 50, height: 40 })
  })

  it('leaves gaps between cells out of the split', () => {
    const cell = sheetCell(110, 50, 3, 1, 2, { spacingX: 10 })
    expect(cell).toEqual({ x: 80, y: 0, width: 30, height: 50 })
  })

  it('honours an explicit cell size, fractions included', () => {
    const cell = sheetCell(1024, 128, 11, 1, 1, {
      gridOffsetX: 44,
      gridOffsetY: 28,
      spacingX: 14.5,
      cellWidth: 72,
      cellHeight: 74,
    })
    expect(cell).toEqual({ x: 130.5, y: 28, width: 72, height: 74 })
  })

  it('ignores non-positive params and clamps the auto cell to 1px', () => {
    expect(sheetCell(100, 100, 1, 1, 0, { gridOffsetX: -5, cellWidth: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    expect(sheetCell(10, 10, 1, 1, 0, { gridOffsetX: 50 }).width).toBe(1)
  })
})

describe('sheetFrameCount', () => {
  it('multiplies the grid, clamped to at least 1×1', () => {
    expect(sheetFrameCount({ cols: 4, rows: 2 })).toBe(8)
    expect(sheetFrameCount({ cols: 0, rows: 5 })).toBe(5)
  })

  it('explicit cells win over the grid', () => {
    const cells = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 12, y: 0, width: 8, height: 10 },
      { x: 22, y: 0, width: 12, height: 10 },
    ]
    expect(sheetFrameCount({ cols: 4, rows: 2, cells })).toBe(3)
  })
})

describe('sheetCell with explicit cells', () => {
  const cells = [
    { x: 61, y: 37, width: 66, height: 78 },
    { x: 146, y: 37, width: 89, height: 79 },
  ]

  it('returns the cell rect, ignoring the grid', () => {
    expect(sheetCell(1024, 256, 4, 4, 1, { cells })).toEqual(cells[1])
  })

  it('clamps out-of-range frames to the nearest cell', () => {
    expect(sheetCell(1024, 256, 4, 4, 9, { cells })).toEqual(cells[1])
    expect(sheetCell(1024, 256, 4, 4, -1, { cells })).toEqual(cells[0])
  })
})

describe('locateFrame', () => {
  const sheets = [
    { cols: 4, rows: 1 }, // frames 0-3
    { cols: 2, rows: 2 }, // frames 4-7
  ]

  it('keeps early frames on the first sheet', () => {
    expect(locateFrame(sheets, 0)).toEqual({ sheet: 0, frame: 0 })
    expect(locateFrame(sheets, 3)).toEqual({ sheet: 0, frame: 3 })
  })

  it('continues the numbering onto later sheets', () => {
    expect(locateFrame(sheets, 4)).toEqual({ sheet: 1, frame: 0 })
    expect(locateFrame(sheets, 7)).toEqual({ sheet: 1, frame: 3 })
  })

  it('clamps out-of-range indices to the nearest valid frame', () => {
    expect(locateFrame(sheets, 99)).toEqual({ sheet: 1, frame: 3 })
    expect(locateFrame(sheets, -2)).toEqual({ sheet: 0, frame: 0 })
    expect(locateFrame([], 5)).toEqual({ sheet: 0, frame: 0 })
  })

  it('counts cell sheets by their cell count', () => {
    const packed = [
      { cols: 1, rows: 1, cells: [{ x: 0, y: 0, width: 5, height: 5 }] }, // frame 0
      { cols: 8, rows: 8, cells: Array.from({ length: 3 }, (_, i) => ({ x: i * 6, y: 0, width: 5, height: 5 })) }, // frames 1-3
    ]
    expect(locateFrame(packed, 2)).toEqual({ sheet: 1, frame: 1 })
  })
})
