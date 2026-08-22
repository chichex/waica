import { describe, expect, it } from 'vitest'
import { componentBox, entityBounds } from './appearance-bounds'

describe('appearance bounds', () => {
  it('uses the engine placement for declared anchors', () => {
    expect(
      componentBox(
        {
          width: 2,
          height: 2,
          offsetX: 0,
          offsetY: 0,
          anchorX: 0.5,
          anchorY: 0,
        },
        'appearance',
      ),
    ).toEqual({ centerX: 0, centerY: 1, width: 2, height: 2 })

    expect(
      componentBox(
        {
          width: 1,
          height: 2,
          offsetX: 0,
          offsetY: 0,
          anchorX: 0.5,
          anchorY: 0.25,
        },
        'appearance',
      )?.centerY,
    ).toBe(0.5)
  })

  it('accounts for mirrored and shrunk animated frames', () => {
    expect(
      componentBox(
        {
          width: 4,
          height: 4,
          offsetX: 1,
          offsetY: 0,
          anchorX: 0.5,
          anchorY: 0.5,
          flipX: true,
          frameScaleX: 0.5,
          frameScaleY: 0.25,
        },
        'appearance',
      ),
    ).toEqual({ centerX: -1, centerY: -1.5, width: 2, height: 1 })
  })

  it('keeps collision boxes on their logical offsets', () => {
    expect(
      componentBox({ width: 3, height: 2, offsetX: -1, offsetY: 4 }, 'collision'),
    ).toEqual({ centerX: -1, centerY: 4, width: 3, height: 2 })
  })

  it('unions component boxes instead of assuming they are entity-centered', () => {
    expect(
      entityBounds([
        {
          role: 'appearance',
          box: { width: 2, height: 2, anchorX: 0.5, anchorY: 0 },
        },
        {
          role: 'collision',
          box: { width: 1, height: 1, offsetX: -2, offsetY: 0 },
        },
      ]),
    ).toEqual({ centerX: -0.75, centerY: 0.75, width: 3.5, height: 2.5 })
  })
})
