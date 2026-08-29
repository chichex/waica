import { describe, expect, it } from 'vitest'
import { ISOMETRIC_ACTION_LABELS, ISOMETRIC_BINDINGS } from './controls'

describe('isometric controls', () => {
  it('binds screen-relative movement and interaction exactly', () => {
    expect(ISOMETRIC_BINDINGS).toEqual({
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      interact: ['KeyE', 'Space'],
      attack: ['KeyX', 'KeyJ'],
    })
  })

  it('labels every bound action once', () => {
    expect(ISOMETRIC_ACTION_LABELS).toEqual({
      up: 'Move up',
      down: 'Move down',
      left: 'Move left',
      right: 'Move right',
      interact: 'Interact',
      attack: 'Attack',
    })
    expect(Object.keys(ISOMETRIC_ACTION_LABELS).sort()).toEqual(
      Object.keys(ISOMETRIC_BINDINGS).sort(),
    )
  })
})
