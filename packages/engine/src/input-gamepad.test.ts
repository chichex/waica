// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamepadLike } from './gamepad'
import { Input, type InputOptions } from './input'

/** A mutable standard pad the tests move between polls, like a real one between steps. */
interface FakePad extends GamepadLike {
  axes: number[]
  buttons: { value: number }[]
  connected: boolean
}

function fakePad(index = 0, mapping = 'standard'): FakePad {
  return {
    index,
    id: `pad-${index}`,
    mapping,
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
  }
}

let pads: (FakePad | null)[] = []
const getGamepads = vi.fn(() => pads)
const inputs: Input[] = []

function makeInput(bindings: Record<string, string[]>, options?: InputOptions): Input {
  const input = new Input(bindings, options)
  inputs.push(input)
  return input
}

/** One Simulation Step as the Game runs it: poll first, behaviors read, the frame ends. */
function step(input: Input, read: () => void = () => undefined): void {
  input.pollGamepad()
  read()
  input.endFrame()
}

function key(type: 'keydown' | 'keyup', code: string): void {
  window.dispatchEvent(new KeyboardEvent(type, { code }))
}

const A = 0
const DPAD_RIGHT = 15

beforeEach(() => {
  pads = []
  getGamepads.mockClear()
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads })
})

afterEach(() => {
  for (const input of inputs.splice(0)) input.dispose()
  Reflect.deleteProperty(navigator, 'getGamepads')
  vi.restoreAllMocks()
})

describe('Input gamepad bindings (issue #75 CA-1)', () => {
  it('binds Gamepad: codes beside keys and ignores an unknown one, warning once per code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const pad = fakePad()
    pads = [pad]
    const input = makeInput({
      jump: ['Space', 'Gamepad:A', 'Gamepad:Turbo'],
      dash: ['Gamepad:Turbo', 'Gamepad:Nitro'],
    })

    pad.buttons[A] = { value: 1 }
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

describe('Input.value and axis (issue #75 CA-2, CA-3)', () => {
  it('reads keys as 1, buttons by value, stick halves dead-zoned, the max across sources', () => {
    const pad = fakePad()
    pads = [pad]
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

  it('is exactly -1, 0 or 1 with only a keyboard, and analog with the stick', () => {
    const pad = fakePad()
    pads = [pad]
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

  it('applies GameOptions.gamepadDeadZone, falling back to 0.2 with a warning when invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const pad = fakePad()
    pads = [pad]
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
    pads = [pad]
    const input = makeInput({ fire: ['Gamepad:RT'] })
    const seen: [boolean, boolean][] = []
    const read = (): void => {
      seen.push([input.held('fire'), input.justPressed('fire')])
    }

    pad.buttons[7] = { value: 0.49 }
    step(input, read)
    pad.buttons[7] = { value: 0.5 }
    step(input, read)
    step(input, read)
    pad.buttons[7] = { value: 0.2 }
    step(input, read)
    pad.buttons[7] = { value: 1 }
    step(input, read)

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
    pads = [pad]
    const input = makeInput({ jump: ['Gamepad:A'] })
    pad.buttons[A] = { value: 1 }

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

describe('Input pad polling (issue #75 CA-6)', () => {
  it('reads nothing until polled, then sees the state of that poll', () => {
    const pad = fakePad()
    pads = [pad]
    const input = makeInput({ jump: ['Gamepad:A'] })
    pad.buttons[A] = { value: 1 }
    expect(input.held('jump')).toBe(false)
    expect(getGamepads).not.toHaveBeenCalled()

    input.pollGamepad()
    expect(getGamepads).toHaveBeenCalledTimes(1)
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

describe("Input reads player 1's pad (issue #75 CA-7)", () => {
  it('ignores later and non-standard pads and hands over on disconnect', () => {
    const odd = fakePad(0, '')
    const first = fakePad(1)
    pads = [odd, first]
    const input = makeInput({ jump: ['Gamepad:A'] })
    input.pollGamepad()

    const second = fakePad(2)
    pads = [odd, first, second]
    odd.buttons[A] = { value: 1 }
    second.buttons[A] = { value: 1 }
    input.pollGamepad()
    expect(input.held('jump')).toBe(false)

    first.buttons[A] = { value: 1 }
    input.pollGamepad()
    expect(input.held('jump')).toBe(true)

    // The new pad's A was already down when it took over: it counts again only after release.
    pads = [odd, null, second]
    input.pollGamepad()
    expect(input.held('jump')).toBe(false)
    second.buttons[A] = { value: 0 }
    input.pollGamepad()
    second.buttons[A] = { value: 1 }
    input.pollGamepad()
    expect(input.held('jump')).toBe(true)
  })
})

describe('Input sources combine (issue #75 CA-8)', () => {
  it('keeps an Action held while any source still holds it', () => {
    const pad = fakePad()
    pads = [pad]
    const input = makeInput({ right: ['KeyD', 'Gamepad:LeftStickRight'] })
    key('keydown', 'KeyD')
    pad.axes[0] = 0.8
    input.pollGamepad()

    key('keyup', 'KeyD')
    expect(input.held('right')).toBe(true)
    expect(input.value('right')).toBeCloseTo(0.75)

    pad.axes[0] = 0
    input.pollGamepad()
    expect(input.held('right')).toBe(false)
  })
})

describe('Input releases the pad (issue #75 CA-9)', () => {
  function heldPad(): { input: Input; pad: FakePad } {
    const pad = fakePad()
    pads = [pad]
    const input = makeInput({ right: ['Gamepad:DPadRight'], jump: ['Gamepad:A'] })
    pad.buttons[DPAD_RIGHT] = { value: 1 }
    input.pollGamepad()
    expect(input.held('right')).toBe(true)
    return { input, pad }
  }

  it.each([
    ['blur', () => window.dispatchEvent(new Event('blur'))],
    [
      'visibilitychange to hidden',
      () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      },
    ],
  ])('on %s, until the source first drops below the threshold', (_name, release) => {
    const { input, pad } = heldPad()
    release()
    expect(input.held('right')).toBe(false)
    expect(input.value('right')).toBe(0)

    input.pollGamepad()
    expect(input.held('right')).toBe(false)

    pad.buttons[DPAD_RIGHT] = { value: 0.1 }
    input.pollGamepad()
    pad.buttons[DPAD_RIGHT] = { value: 1 }
    input.pollGamepad()
    expect(input.held('right')).toBe(true)
    expect(input.justPressed('right')).toBe(true)
    Reflect.deleteProperty(document, 'visibilityState')
  })

  it('when the active pad disconnects', () => {
    const { input, pad } = heldPad()
    pad.connected = false
    input.pollGamepad()
    expect(input.held('right')).toBe(false)
    expect(input.value('right')).toBe(0)
  })
})

describe('Input injected values (issue #75 CA-12, CA-13)', () => {
  it('holds an injected Action at a value; below 0.5 it has a value but is not held', () => {
    const input = makeInput({ right: ['KeyD'], left: ['KeyA'] })

    expect(input.injectAction('right', 'hold', 0.3)).toBe(true)
    expect(input.value('right')).toBeCloseTo(0.3)
    expect(input.held('right')).toBe(false)
    expect(input.justPressed('right')).toBe(false)
    expect(input.heldActions()).toEqual([])
    expect(input.actionValues()).toEqual({})

    input.injectAction('right', 'hold', 0.5)
    expect(input.held('right')).toBe(true)
    expect(input.justPressed('right')).toBe(true)
    expect(input.axis('left', 'right')).toBeCloseTo(0.5)
    input.injectAction('left', 'hold')
    expect(input.actionValues()).toEqual({ left: 1, right: 0.5 })
    expect(input.heldActions()).toEqual(['left', 'right'])

    input.endFrame()
    expect(input.held('right')).toBe(true)
    input.injectAction('right', 'release')
    expect(input.value('right')).toBe(0)
  })

  it('combines an injected hold with a key by the max', () => {
    const input = makeInput({ right: ['KeyD'] })
    input.injectAction('right', 'hold', 0.4)
    key('keydown', 'KeyD')
    expect(input.value('right')).toBe(1)
    key('keyup', 'KeyD')
    expect(input.value('right')).toBeCloseTo(0.4)
  })
})
