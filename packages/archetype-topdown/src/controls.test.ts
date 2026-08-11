import { describe, expect, it } from 'vitest'
import { TOPDOWN_ACTION_LABELS, TOPDOWN_BINDINGS } from './controls'

describe('topdown controls manifest', () => {
  it('declares the four directions plus interact exactly', () => {
    expect(TOPDOWN_BINDINGS).toEqual({
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      interact: ['KeyE', 'Space'],
    })
  })

  it('declares a label for every stock action', () => {
    expect(TOPDOWN_ACTION_LABELS).toEqual({
      up: 'Move up',
      down: 'Move down',
      left: 'Move left',
      right: 'Move right',
      interact: 'Interact',
    })
    expect(Object.keys(TOPDOWN_ACTION_LABELS).sort()).toEqual(
      Object.keys(TOPDOWN_BINDINGS).sort(),
    )
  })
})
