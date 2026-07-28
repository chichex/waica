import { describe, expect, it } from 'vitest'
import {
  PLATFORMER_ACTION_LABELS,
  PLATFORMER_BINDINGS,
} from './controls'

describe('platformer controls manifest', () => {
  it('declares the legacy platformer key map exactly', () => {
    expect(PLATFORMER_BINDINGS).toEqual({
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      jump: ['Space', 'ArrowUp', 'KeyW'],
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
