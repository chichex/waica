import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GAMEPAD_DEAD_ZONE,
  GAMEPAD_CODES,
  GamepadSlot,
  gamepadControl,
  gamepadValues,
  radialDeadZone,
  resolveGamepadDeadZone,
  type GamepadLike,
} from './gamepad'

/** A standard-mapping pad with every button released and both sticks centered. */
function pad(index: number, overrides: Partial<GamepadLike> = {}): GamepadLike {
  return {
    index,
    id: `pad-${index}`,
    mapping: 'standard',
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
    ...overrides,
  }
}

describe('Gamepad codes (issue #75 CA-1)', () => {
  it('names the 17 standard buttons by their W3C index', () => {
    const buttons = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LeftStick',
      'RightStick', 'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight', 'Home']
    buttons.forEach((name, index) => {
      expect(gamepadControl(`Gamepad:${name}`)).toEqual({ kind: 'button', index })
    })
  })

  it('names stick halves by axis, with Up on the negative Y axis', () => {
    expect(gamepadControl('Gamepad:LeftStickLeft')).toEqual({ kind: 'stick', axis: 0, sign: -1 })
    expect(gamepadControl('Gamepad:LeftStickRight')).toEqual({ kind: 'stick', axis: 0, sign: 1 })
    expect(gamepadControl('Gamepad:LeftStickUp')).toEqual({ kind: 'stick', axis: 1, sign: -1 })
    expect(gamepadControl('Gamepad:LeftStickDown')).toEqual({ kind: 'stick', axis: 1, sign: 1 })
    expect(gamepadControl('Gamepad:RightStickLeft')).toEqual({ kind: 'stick', axis: 2, sign: -1 })
    expect(gamepadControl('Gamepad:RightStickRight')).toEqual({ kind: 'stick', axis: 2, sign: 1 })
    expect(gamepadControl('Gamepad:RightStickUp')).toEqual({ kind: 'stick', axis: 3, sign: -1 })
    expect(gamepadControl('Gamepad:RightStickDown')).toEqual({ kind: 'stick', axis: 3, sign: 1 })
  })

  it('knows nothing about keyboard codes or unknown pad names', () => {
    expect(gamepadControl('KeyA')).toBeUndefined()
    expect(gamepadControl('Gamepad:Turbo')).toBeUndefined()
    expect(gamepadControl('Gamepad:')).toBeUndefined()
  })

  it('lists every known code once', () => {
    expect(GAMEPAD_CODES).toHaveLength(25)
    expect(new Set(GAMEPAD_CODES).size).toBe(25)
    for (const code of GAMEPAD_CODES) expect(gamepadControl(code)).toBeDefined()
  })
})

describe('radialDeadZone (issue #75 CA-4)', () => {
  it('zeroes a stick inside the dead zone on both axes', () => {
    expect(radialDeadZone(0.1, 0.15, 0.2)).toEqual({ x: 0, y: 0 })
  })

  it('keeps the direction and rescales the magnitude past the dead zone', () => {
    const { x, y } = radialDeadZone(0.6, 0, 0.2)
    expect(x).toBeCloseTo(0.5)
    expect(y).toBe(0)
    const diagonal = radialDeadZone(0.3, 0.4, 0.2) // magnitude 0.5 → 0.375
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(0.375)
    expect(diagonal.y / diagonal.x).toBeCloseTo(0.4 / 0.3)
  })

  it('clamps the rescaled magnitude to 1', () => {
    const { x, y } = radialDeadZone(1, 1, 0.2)
    expect(Math.hypot(x, y)).toBeCloseTo(1)
  })

  it('is the identity magnitude with a zero dead zone', () => {
    expect(radialDeadZone(0.6, 0, 0).x).toBeCloseTo(0.6)
  })
})

describe('resolveGamepadDeadZone (issue #75 CA-4)', () => {
  it('defaults to 0.2', () => {
    expect(DEFAULT_GAMEPAD_DEAD_ZONE).toBe(0.2)
    expect(resolveGamepadDeadZone(undefined, vi.fn())).toBe(0.2)
  })

  it('accepts a value in [0, 1)', () => {
    const warn = vi.fn()
    expect(resolveGamepadDeadZone(0, warn)).toBe(0)
    expect(resolveGamepadDeadZone(0.35, warn)).toBe(0.35)
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([1, -0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    'warns once and uses the default for %s',
    (value) => {
      const warn = vi.fn()
      expect(resolveGamepadDeadZone(value, warn)).toBe(0.2)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toMatch(/^\[waica\] .*gamepadDeadZone/)
    },
  )
})

describe('gamepadValues (issue #75 CA-2)', () => {
  it('reads buttons by value and stick halves by their dead-zoned component', () => {
    const buttons = Array.from({ length: 17 }, () => ({ value: 0 }))
    buttons[0] = { value: 1 }
    buttons[6] = { value: 0.3 }
    const values = gamepadValues(pad(0, { buttons, axes: [0.6, 0, 0, -1] }), 0.2)

    expect(values.get('Gamepad:A')).toBe(1)
    expect(values.get('Gamepad:LT')).toBe(0.3)
    expect(values.get('Gamepad:B')).toBe(0)
    expect(values.get('Gamepad:LeftStickRight')).toBeCloseTo(0.5)
    expect(values.get('Gamepad:LeftStickLeft')).toBe(0)
    expect(values.get('Gamepad:RightStickUp')).toBeCloseTo(1)
    expect(values.get('Gamepad:RightStickDown')).toBe(0)
  })

  it('reads a missing button or axis as 0', () => {
    const values = gamepadValues(pad(0, { buttons: [{ value: 1 }], axes: [] }), 0.2)
    expect(values.get('Gamepad:A')).toBe(1)
    expect(values.get('Gamepad:Home')).toBe(0)
    expect(values.get('Gamepad:LeftStickRight')).toBe(0)
  })
})

describe('GamepadSlot — player 1 (issue #75 CA-7)', () => {
  it('picks the first standard pad to connect and keeps it', () => {
    const slot = new GamepadSlot()
    const second = pad(1)
    expect(slot.poll([null, second])?.id).toBe('pad-1')

    const first = pad(0)
    expect(slot.poll([first, second])?.id).toBe('pad-1')
  })

  it('ignores non-standard pads entirely', () => {
    const slot = new GamepadSlot()
    expect(slot.poll([pad(0, { mapping: '' })])).toBeNull()
    expect(slot.poll([pad(0, { mapping: '' }), pad(1)])?.id).toBe('pad-1')
  })

  it('hands over to the next pad in connection order when the active one disconnects', () => {
    const slot = new GamepadSlot()
    slot.poll([null, null, pad(2)])
    slot.poll([null, pad(1), pad(2)])
    slot.poll([pad(0), pad(1), pad(2)])

    expect(slot.poll([pad(0), pad(1), null])?.id).toBe('pad-1')
    expect(slot.poll([pad(0), pad(1, { connected: false }), null])?.id).toBe('pad-0')
    expect(slot.poll([null, null, null])).toBeNull()
  })

  it('reports whether the active pad changed on the last poll', () => {
    const slot = new GamepadSlot()
    slot.poll([pad(0), pad(1)])
    expect(slot.poll([pad(0), pad(1)])?.id).toBe('pad-0')
    expect(slot.lostActive).toBe(false)

    slot.poll([null, pad(1)])
    expect(slot.lostActive).toBe(true)
    slot.poll([null, pad(1)])
    expect(slot.lostActive).toBe(false)
  })
})
