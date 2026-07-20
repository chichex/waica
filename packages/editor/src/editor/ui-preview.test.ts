import { describe, expect, it } from 'vitest'
import { uiFrameLayout } from './ui-preview'

const view16x9 = (x: number, y: number, height: number) => {
  const halfH = height / 2
  const halfW = halfH * (16 / 9)
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH, x, y }
}

describe('uiFrameLayout', () => {
  it('fills the canvas when the editor view matches the camera frame', () => {
    const layout = uiFrameLayout(
      view16x9(0, 0, 9),
      { x: 0, y: 0, width: 16, height: 9 },
      { width: 1600, height: 900 },
      { width: 1600, height: 900 },
    )
    expect(layout).toEqual({ left: 0, top: 0, width: 1600, height: 900, scale: 1 })
  })

  it('shrinks and centers the frame when the editor zooms out', () => {
    const layout = uiFrameLayout(
      view16x9(0, 0, 18),
      { x: 0, y: 0, width: 16, height: 9 },
      { width: 1600, height: 900 },
      { width: 1600, height: 900 },
    )
    expect(layout).toEqual({ left: 400, top: 225, width: 800, height: 450, scale: 0.5 })
  })

  it('offsets the frame opposite to the editor pan', () => {
    // 18 world units tall on 900px: 50px per unit. Editor panned right and
    // up, so the frame moves left and down on screen.
    const layout = uiFrameLayout(
      view16x9(2, 1, 18),
      { x: 0, y: 0, width: 16, height: 9 },
      { width: 1600, height: 900 },
      { width: 1600, height: 900 },
    )
    expect(layout.left).toBe(400 - 2 * 50)
    expect(layout.top).toBe(225 + 1 * 50)
  })

  it('tracks the frame center (a followed target off-origin)', () => {
    const layout = uiFrameLayout(
      view16x9(0, 0, 18),
      { x: 4, y: -2, width: 16, height: 9 },
      { width: 1600, height: 900 },
      { width: 1600, height: 900 },
    )
    expect(layout.left).toBe(400 + 4 * 50)
    expect(layout.top).toBe(225 + 2 * 50)
  })

  it('scales against a fixed game resolution instead of the canvas', () => {
    // Frame lands at 450px tall; play renders the HTML on a 360px canvas.
    const layout = uiFrameLayout(
      view16x9(0, 0, 18),
      { x: 0, y: 0, width: 16, height: 9 },
      { width: 1600, height: 900 },
      { width: 640, height: 360 },
    )
    expect(layout.scale).toBe(450 / 360)
  })
})
