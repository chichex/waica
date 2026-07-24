import { describe, expect, it } from 'vitest'
import { cameraViewSize, cornerResize, imageSizeInUnits } from './box-math'

describe('cornerResize', () => {
  it('pins the anchor: dragging one corner never moves the opposite one', () => {
    // Anchor at (0, 0), pointer at (4, 2): the box spans exactly that rectangle.
    const r = cornerResize(0, 0, 4, 2)
    expect(r).toEqual({ width: 4, height: 2, centerX: 2, centerY: 1 })
    // The anchor corner stays put: center - half size lands back on it.
    expect(r.centerX - r.width / 2).toBe(0)
    expect(r.centerY - r.height / 2).toBe(0)
  })

  it('works dragging toward negative space', () => {
    const r = cornerResize(1, 1, -3, -1)
    expect(r).toEqual({ width: 4, height: 2, centerX: -1, centerY: 0 })
    expect(r.centerX + r.width / 2).toBe(1)
    expect(r.centerY + r.height / 2).toBe(1)
  })

  it('clamps to the minimum size on the pointer side of the anchor', () => {
    const r = cornerResize(0, 0, -0.01, 0.02)
    expect(r.width).toBe(0.1)
    expect(r.height).toBe(0.1)
    expect(r.centerX).toBe(-0.05)
    expect(r.centerY).toBe(0.05)
  })

  it('crossing the anchor flips the box to the other side', () => {
    const r = cornerResize(2, 2, 5, -1)
    expect(r).toEqual({ width: 3, height: 3, centerX: 3.5, centerY: 0.5 })
  })
})

describe('imageSizeInUnits', () => {
  it('divides pixel dimensions by pixels per unit', () => {
    expect(imageSizeInUnits(1920, 1080, 16)).toEqual({ width: 120, height: 67.5 })
  })

  it('uses one frame of a sprite sheet', () => {
    expect(imageSizeInUnits(64, 64, 16, 4, 4)).toEqual({ width: 1, height: 1 })
  })

  it('rounds to two decimals', () => {
    expect(imageSizeInUnits(100, 100, 3)).toEqual({ width: 33.33, height: 33.33 })
  })

  it('guards against a broken scale', () => {
    expect(imageSizeInUnits(10, 10, 0)).toEqual({ width: 10, height: 10 })
  })
})

describe('cameraViewSize', () => {
  it('height is the zoom, width follows the aspect', () => {
    expect(cameraViewSize(14, 1920 / 1080)).toEqual({ width: 24.89, height: 14 })
  })
})
