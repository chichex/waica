import { describe, expect, it } from 'vitest'
import { TOPDOWN_ACTION_LABELS, TOPDOWN_BINDINGS } from './controls'

describe('topdown controls manifest', () => {
  it('declares the four directions plus interact, keys and pad, exactly (issue #75 CA-14)', () => {
    expect(TOPDOWN_BINDINGS).toEqual({
      up: ['ArrowUp', 'KeyW', 'Gamepad:LeftStickUp', 'Gamepad:DPadUp'],
      down: ['ArrowDown', 'KeyS', 'Gamepad:LeftStickDown', 'Gamepad:DPadDown'],
      left: ['ArrowLeft', 'KeyA', 'Gamepad:LeftStickLeft', 'Gamepad:DPadLeft'],
      right: ['ArrowRight', 'KeyD', 'Gamepad:LeftStickRight', 'Gamepad:DPadRight'],
      interact: ['KeyE', 'Space', 'Gamepad:A'],
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
