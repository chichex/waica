// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Input } from './input'
import { fakeGamepads, fakePad, key, type FakePad } from './test-input-gamepad'

/** Issue #75 CA-7..CA-9 and injected values: which pad, how sources combine and release. */

const pads = fakeGamepads()
const { makeInput } = pads
const A = 0
const DPAD_RIGHT = 15

beforeEach(() => pads.install())
afterEach(() => pads.uninstall())

describe("Input reads player 1's pad (issue #75 CA-7)", () => {
  it('ignores later and non-standard pads', () => {
    const odd = fakePad(0, '')
    const first = fakePad(1)
    pads.state.pads = [odd, first]
    const input = makeInput({ jump: ['Gamepad:A'] })
    input.pollGamepad()

    const second = fakePad(2)
    pads.state.pads = [odd, first, second]
    odd.buttons[A] = { value: 1 }
    second.buttons[A] = { value: 1 }
    input.pollGamepad()
    expect(input.held('jump')).toBe(false)

    first.buttons[A] = { value: 1 }
    input.pollGamepad()
    expect(input.held('jump')).toBe(true)
  })

  it('hands over to the next pad on disconnect, re-arming a control held across the switch', () => {
    const first = fakePad(0)
    const second = fakePad(1)
    pads.state.pads = [first, second]
    const input = makeInput({ jump: ['Gamepad:A'] })
    first.buttons[A] = { value: 1 }
    second.buttons[A] = { value: 1 }
    input.pollGamepad()
    expect(input.held('jump')).toBe(true)

    pads.state.pads = [null, second]
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
    pads.state.pads = [pad]
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
    pads.state.pads = [pad]
    const input = makeInput({ right: ['Gamepad:DPadRight'] })
    pad.buttons[DPAD_RIGHT] = { value: 1 }
    input.pollGamepad()
    expect(input.held('right')).toBe(true)
    return { input, pad }
  }

  function hideDocument(): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Reflect.deleteProperty(document, 'visibilityState')
  }

  it.each([
    ['blur', () => window.dispatchEvent(new Event('blur'))],
    ['visibilitychange to hidden', hideDocument],
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
  it('below 0.5 an injected hold has a value but is not held', () => {
    const input = makeInput({ right: ['KeyD'] })

    expect(input.injectAction('right', 'hold', 0.3)).toBe(true)
    expect(input.value('right')).toBeCloseTo(0.3)
    expect(input.held('right')).toBe(false)
    expect(input.justPressed('right')).toBe(false)
    expect(input.heldActions()).toEqual([])
    expect(input.actionValues()).toEqual({})
  })

  it('at 0.5 or above it is held, pressed once, and reported by value', () => {
    const input = makeInput({ right: ['KeyD'], left: ['KeyA'] })
    input.injectAction('right', 'hold', 0.3)

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

  it.each([Number.NaN, 0, -0.5, 3, Number.POSITIVE_INFINITY])(
    'rejects a hold at %s with a RangeError and leaves the state unchanged',
    (value) => {
      const input = makeInput({ right: ['KeyD'] })
      input.injectAction('right', 'hold', 0.4)

      expect(() => input.injectAction('right', 'hold', value)).toThrow(
        new RangeError('value must be a finite number greater than 0 and at most 1.'),
      )
      expect(input.value('right')).toBeCloseTo(0.4)
      expect(input.held('right')).toBe(false)
      expect(input.justPressed('right')).toBe(false)
    },
  )

  it('rejects a value on press or release, as the Runtime Bridge does', () => {
    const input = makeInput({ jump: ['Space'], right: ['KeyD'] })
    input.injectAction('right', 'hold')

    expect(() => input.injectAction('jump', 'press', 0.3)).toThrow(
      new RangeError('press does not accept a value; only hold does.'),
    )
    expect(() => input.injectAction('right', 'release', 1)).toThrow(
      new RangeError('release does not accept a value; only hold does.'),
    )
    expect(input.held('jump')).toBe(false)
    expect(input.justPressed('jump')).toBe(false)
    expect(input.value('right')).toBe(1)
    expect(input.injectAction('jump', 'press')).toBe(true)
    expect(input.injectAction('right', 'hold', 1)).toBe(true)
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
