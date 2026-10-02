import { describe, expect, it } from 'vitest'
import {
  PLATFORMER_ACTION_LABELS,
  PLATFORMER_BINDINGS,
} from './controls'

describe('platformer controls manifest', () => {
  it('declares the legacy platformer key map plus its pad sources exactly (issue #75 CA-14)', () => {
    expect(PLATFORMER_BINDINGS).toEqual({
      left: ['ArrowLeft', 'KeyA', 'Gamepad:LeftStickLeft', 'Gamepad:DPadLeft'],
      right: ['ArrowRight', 'KeyD', 'Gamepad:LeftStickRight', 'Gamepad:DPadRight'],
      jump: ['Space', 'ArrowUp', 'KeyW', 'Gamepad:A'],
    })
  })

  it('declares a label for every stock action', () => {
    expect(PLATFORMER_ACTION_LABELS).toEqual({
      left: 'Move left',
      right: 'Move right',
      jump: 'Jump',
    })
  })
})
