import { describe, expect, it } from 'vitest'
import {
  beginStroke,
  finishStroke,
  paintCell,
  reduceStroke,
} from './tilemap-brush'

describe('paintCell', () => {
  it('returns a fresh, empty-padded row-major map with one painted cell', () => {
    const source = [2]
    const next = paintCell(source, 3, 2, 1, 1, 7)
    expect(next).toEqual([2, -1, -1, -1, 7, -1])
    expect(next).not.toBe(source)
  })

  it('uses -1 for erase and no-ops outside the map', () => {
    expect(paintCell([0, 1], 2, 1, 0, 0, -1)).toEqual([-1, 1])
    expect(paintCell([0, 1], 2, 1, -1, 0, 3)).toBeNull()
    expect(paintCell([0, 1], 2, 1, 2, 0, 3)).toBeNull()
  })
})

describe('tilemap stroke reducer', () => {
  it('accumulates a drag and yields one final cells value', () => {
    const initial = [0, -1, -1]
    let stroke = beginStroke(initial, 3, 1)
    stroke = reduceStroke(stroke, 1, 0, 4)
    stroke = reduceStroke(stroke, 2, 0, 4)

    expect(finishStroke(stroke)).toEqual([0, 4, 4])
    expect(initial).toEqual([0, -1, -1])
  })

  it('ignores repeated visits and returns null when nothing changed', () => {
    let stroke = beginStroke([2], 1, 1)
    stroke = reduceStroke(stroke, 0, 0, 2)
    stroke = reduceStroke(stroke, 0, 0, 3)
    expect(finishStroke(stroke)).toBeNull()
  })

  it('supports erasing during a stroke', () => {
    const stroke = reduceStroke(beginStroke([5, 5], 2, 1), 1, 0, -1)
    expect(finishStroke(stroke)).toEqual([5, -1])
  })
})
