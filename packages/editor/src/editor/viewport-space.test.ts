import { describe, expect, it } from 'vitest'
import {
  logicalPoint,
  logicalVertices,
  pickRenderBounds,
  renderPoint,
} from './viewport-space'

const ISO = 'isometric' as const

describe('viewport projection space', () => {
  it('turns a projected drop point back into logical scene coordinates', () => {
    expect(logicalPoint(ISO, 1, -1.5)).toEqual([2, 1])
    expect(logicalPoint(null, 1, -1.5)).toEqual([1, -1.5])
  })

  it('projects logical entity positions for selection and picking', () => {
    expect(renderPoint(ISO, 2, 1)).toEqual([1, -1.5])
    expect(
      pickRenderBounds(
        ISO,
        { x: 1, y: -1.5 },
        { x: 2, y: 1 },
        { centerX: 0, centerY: 1, width: 2, height: 2 },
      ),
    ).toBe(true)
    expect(
      pickRenderBounds(
        null,
        { x: 2, y: 1 },
        { x: 2, y: 1 },
        { centerX: 0, centerY: 0, width: 1, height: 1 },
      ),
    ).toBe(true)
  })

  it('projects logical collision vertices into a screen-space diamond', () => {
    expect(
      logicalVertices(ISO, [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ]),
    ).toEqual([
      [0, 0.5],
      [1, 0],
      [0, -0.5],
      [-1, 0],
    ])
  })
})
