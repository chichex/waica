// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Input } from './input'
import { fakeGamepads, fakePad, key } from './test-input-gamepad'

/** Issue #75 CA-1..CA-6: pad codes, Action values, the held threshold and polling. */

const pads = fakeGamepads()
const { makeInput } = pads

/** One Simulation Step as the Game runs it: poll first, behaviors read, the frame ends. */
function step(input: Input, read: () => void): void {
  input.pollGamepad()
  read()
  input.endFrame()
}

beforeEach(() => pads.install())
afterEach(() => pads.uninstall())

describe('Input gamepad bindings (issue #75 CA-1)', () => {
  it('binds Gamepad: codes beside keys and ignores an unknown one, warning once per code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({
      jump: ['Space', 'Gamepad:A', 'Gamepad:Turbo'],
      dash: ['Gamepad:Turbo', 'Gamepad:Nitro'],
    })

    pad.buttons[0] = { value: 1 }
    input.pollGamepad()
    expect(input.held('jump')).toBe(true)
    expect(input.held('dash')).toBe(false)
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringMatching(/^\[waica\] .*"Gamepad:Turbo"/),
      expect.stringMatching(/^\[waica\] .*"Gamepad:Nitro"/),
    ])
    expect(input.bindingsFor('jump')).toEqual(['Space', 'Gamepad:A', 'Gamepad:Turbo'])
  })

  it('keeps keyboard codes working exactly as before', () => {
    const input = makeInput({ left: ['KeyA'], right: ['KeyD', 'Gamepad:DPadRight'] })
    key('keydown', 'KeyD')
    expect(input.held('right')).toBe(true)
    expect(input.justPressed('right')).toBe(true)
    expect(input.axis('left', 'right')).toBe(1)
    key('keydown', 'KeyA')
    expect(input.axis('left', 'right')).toBe(0)
    key('keyup', 'KeyD')
    expect(input.axis('left', 'right')).toBe(-1)
    key('keyup', 'KeyA')
  })
})

describe('Input.value (issue #75 CA-2)', () => {
  it('reads keys as 1, buttons by value, stick halves dead-zoned, the max across sources', () => {
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({
      left: ['KeyA', 'Gamepad:LeftStickLeft'],
      right: ['KeyD', 'Gamepad:LeftStickRight'],
      fire: ['Gamepad:RT', 'Gamepad:LT'],
    })

    pad.axes[0] = 0.6
    pad.buttons[6] = { value: 0.3 }
    pad.buttons[7] = { value: 0.7 }
    input.pollGamepad()

    expect(input.value('right')).toBeCloseTo(0.5)
    expect(input.value('left')).toBe(0)
    expect(input.value('fire')).toBeCloseTo(0.7)
    expect(input.value('missing')).toBe(0)
    key('keydown', 'KeyD')
    expect(input.value('right')).toBe(1)
    key('keyup', 'KeyD')
  })
})

describe('Input.axis (issue #75 CA-3)', () => {
  it('is exactly -1, 0 or 1 with only a keyboard, and analog with the stick', () => {
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({
      left: ['KeyA', 'Gamepad:LeftStickLeft'],
      right: ['KeyD', 'Gamepad:LeftStickRight'],
    })
    expect(input.axis('left', 'right')).toBe(0)
    key('keydown', 'KeyA')
    expect(input.axis('left', 'right')).toBe(-1)
    key('keyup', 'KeyA')

    pad.axes[0] = 0.6
    input.pollGamepad()
    expect(input.axis('left', 'right')).toBeCloseTo(0.5)
    pad.axes[0] = -0.6
    input.pollGamepad()
    expect(input.axis('left', 'right')).toBeCloseTo(-0.5)
  })
})

describe('Input dead zone (issue #75 CA-4)', () => {
  it('applies GameOptions.gamepadDeadZone, falling back to 0.2 with a warning when invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const pad = fakePad()
    pads.state.pads = [pad]
    pad.axes[0] = 0.3
    const loose = makeInput({ right: ['Gamepad:LeftStickRight'] }, { gamepadDeadZone: 0 })
    const fallback = makeInput({ right: ['Gamepad:LeftStickRight'] }, { gamepadDeadZone: 1.5 })
    loose.pollGamepad()
    fallback.pollGamepad()

    expect(loose.value('right')).toBeCloseTo(0.3)
    expect(fallback.value('right')).toBeCloseTo(0.125)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[waica\] gamepadDeadZone/)
  })
})

describe('Input held threshold (issue #75 CA-5)', () => {
  it('holds at value 0.5 and reports justPressed once per press across steps', () => {
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({ fire: ['Gamepad:RT'] })
    const seen: [boolean, boolean][] = []
    const read = (): void => {
      seen.push([input.held('fire'), input.justPressed('fire')])
    }

    for (const value of [0.49, 0.5, 0.5, 0.2, 1]) {
      pad.buttons[7] = { value }
      step(input, read)
    }

    expect(seen).toEqual([
      [false, false],
      [true, true],
      [true, false],
      [false, false],
      [true, true],
    ])
  })

  it('consumes a pad press for its step exactly like a key press', () => {
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({ jump: ['Gamepad:A'] })
    pad.buttons[0] = { value: 1 }

    input.pollGamepad()
    expect(input.consumed('jump')).toBe(false)
    input.consume('jump')
    expect(input.consumed('jump')).toBe(true)
    input.endFrame()
    input.pollGamepad()
    expect(input.consumed('jump')).toBe(false)
    expect(input.justPressed('jump')).toBe(false)
  })
})

describe('Input justPressed when a second source joins (issue #75 CA-5)', () => {
  it('reports no press when a key joins a pad that already holds the Action', () => {
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({ jump: ['Space', 'Gamepad:A'] })
    pad.buttons[0] = { value: 1 }
    step(input, () => undefined)

    key('keydown', 'Space')
    input.pollGamepad()
    expect(input.held('jump')).toBe(true)
    expect(input.justPressed('jump')).toBe(false)
    input.endFrame()
    key('keyup', 'Space')
  })

  it('reports no press when the pad joins a key that already holds the Action', () => {
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({ jump: ['Space', 'Gamepad:A'] })
    key('keydown', 'Space')
    step(input, () => undefined)

    pad.buttons[0] = { value: 1 }
    input.pollGamepad()
    expect(input.held('jump')).toBe(true)
    expect(input.justPressed('jump')).toBe(false)
    input.endFrame()
    key('keyup', 'Space')
  })
})

describe('Input justPressed from no held source (issue #75 CA-5)', () => {
  it('reports one consumable press when a key and the pad rise on the same step', () => {
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({ jump: ['Space', 'Gamepad:A'] })

    key('keydown', 'Space')
    pad.buttons[0] = { value: 1 }
    input.pollGamepad()
    expect(input.justPressed('jump')).toBe(true)
    expect(input.consumed('jump')).toBe(false)
    input.consume('jump')
    expect(input.consumed('jump')).toBe(true)
    input.endFrame()

    input.pollGamepad()
    expect(input.justPressed('jump')).toBe(false)
    expect(input.consumed('jump')).toBe(false)
    key('keyup', 'Space')
  })

  it('reports a press again once every source was released at the end of a step', () => {
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({ jump: ['Space', 'Gamepad:A'] })
    pad.buttons[0] = { value: 1 }
    step(input, () => undefined)
    pad.buttons[0] = { value: 0 }
    step(input, () => undefined)

    key('keydown', 'Space')
    key('keyup', 'Space')
    input.pollGamepad()
    expect(input.justPressed('jump')).toBe(true)
    input.endFrame()
  })
})

describe('Input pad polling (issue #75 CA-6)', () => {
  it('reads nothing until polled, then sees the state of that poll', () => {
    const pad = fakePad()
    pads.state.pads = [pad]
    const input = makeInput({ jump: ['Gamepad:A'] })
    pad.buttons[0] = { value: 1 }
    expect(input.held('jump')).toBe(false)
    expect(pads.getGamepads).not.toHaveBeenCalled()

    input.pollGamepad()
    expect(pads.getGamepads).toHaveBeenCalledTimes(1)
    expect(input.held('jump')).toBe(true)
  })

  it('works keyboard-only without the Gamepad API', () => {
    Reflect.deleteProperty(navigator, 'getGamepads')
    const input = makeInput({ jump: ['Space', 'Gamepad:A'] })
    expect(() => input.pollGamepad()).not.toThrow()
    key('keydown', 'Space')
    expect(input.held('jump')).toBe(true)
    key('keyup', 'Space')
  })
})
