import { describe, expect, it } from 'vitest'
import { ISOMETRIC_ACTION_LABELS, ISOMETRIC_BINDINGS } from './controls'

describe('isometric controls', () => {
  it('binds screen-relative movement and interaction, keys and pad, exactly (issue #75 CA-14)', () => {
    expect(ISOMETRIC_BINDINGS).toEqual({
      up: ['ArrowUp', 'KeyW', 'Gamepad:LeftStickUp', 'Gamepad:DPadUp'],
      down: ['ArrowDown', 'KeyS', 'Gamepad:LeftStickDown', 'Gamepad:DPadDown'],
      left: ['ArrowLeft', 'KeyA', 'Gamepad:LeftStickLeft', 'Gamepad:DPadLeft'],
      right: ['ArrowRight', 'KeyD', 'Gamepad:LeftStickRight', 'Gamepad:DPadRight'],
      interact: ['KeyE', 'Space', 'Gamepad:A'],
      attack: ['KeyX', 'KeyJ', 'Gamepad:X'],
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
