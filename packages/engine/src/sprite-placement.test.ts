import { describe, expect, it } from 'vitest'
import { spritePlacement } from './sprite-placement'

describe('spritePlacement', () => {
  it('reproduces the centered default placement', () => {
    expect(
      spritePlacement({
        width: 2,
        height: 4,
        offsetX: 3,
        offsetY: -2,
        anchorX: 0.5,
        anchorY: 0.5,
        flipX: false,
        frameScaleX: 1,
        frameScaleY: 1,
      }),
    ).toEqual({ x: 3, y: -2, scaleX: 2, scaleY: 4 })
  })

  it('puts the declared anchor point on the component offset', () => {
    const bottom = spritePlacement({
      width: 2,
      height: 2,
      offsetX: 0,
      offsetY: 0,
      anchorX: 0.5,
      anchorY: 0,
      flipX: false,
      frameScaleX: 1,
      frameScaleY: 1,
    })
    expect(bottom).toEqual({ x: 0, y: 1, scaleX: 2, scaleY: 2 })
    expect(bottom.y - bottom.scaleY / 2).toBe(0)

    expect(
      spritePlacement({
        width: 1,
        height: 2,
        offsetX: 0,
        offsetY: 0,
        anchorX: 0.5,
        anchorY: 0.25,
        flipX: false,
        frameScaleX: 1,
        frameScaleY: 1,
      }).y,
    ).toBe(0.5)
  })

  it('keeps a shrunk frame on the full-size box floor', () => {
    const placement = spritePlacement({
      width: 4,
      height: 4,
      offsetX: 1,
      offsetY: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      flipX: false,
      frameScaleX: 0.5,
      frameScaleY: 0.25,
    })
    expect(placement).toEqual({ x: 1, y: -1.5, scaleX: 2, scaleY: 1 })
    expect(placement.y - placement.scaleY / 2).toBe(-2)
  })

  it('mirrors the full box and horizontal scale around the entity axis', () => {
    const normal = spritePlacement({
      width: 2,
      height: 1,
      offsetX: 3,
      offsetY: 0,
      anchorX: 0.25,
      anchorY: 0.5,
      flipX: false,
      frameScaleX: 0.5,
      frameScaleY: 1,
    })
    const flipped = spritePlacement({
      width: 2,
      height: 1,
      offsetX: 3,
      offsetY: 0,
      anchorX: 0.25,
      anchorY: 0.5,
      flipX: true,
      frameScaleX: 0.5,
      frameScaleY: 1,
    })
    expect(normal).toEqual({ x: 3.5, y: 0, scaleX: 1, scaleY: 1 })
    expect(flipped).toEqual({ x: -3.5, y: 0, scaleX: -1, scaleY: 1 })
  })
})
