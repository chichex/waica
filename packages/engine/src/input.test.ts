// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_BINDINGS, Input } from './input'

const inputs: Input[] = []

function makeInput(bindings: Record<string, string[]>): Input {
  const input = new Input(bindings)
  inputs.push(input)
  return input
}

function key(type: 'keydown' | 'keyup', code: string): void {
  window.dispatchEvent(new KeyboardEvent(type, { code }))
}

afterEach(() => {
  for (const input of inputs.splice(0)) input.dispose()
})

describe('Input bindings', () => {
  it('keeps the engine default neutral and installs only handed-in actions', () => {
    expect(DEFAULT_BINDINGS).toEqual({})
    const input = makeInput({ up: ['KeyW'] })

    key('keydown', 'Space')
    key('keydown', 'KeyW')

    expect(input.held('up')).toBe(true)
    expect(input.held('jump')).toBe(false)
  })

  it('releases every held action when the window loses focus', () => {
    const input = makeInput({ left: ['KeyA'], up: ['KeyW'] })
    key('keydown', 'KeyA')
    key('keydown', 'KeyW')
    expect(input.held('left')).toBe(true)
    expect(input.held('up')).toBe(true)

    window.dispatchEvent(new Event('blur'))

    expect(input.held('left')).toBe(false)
    expect(input.held('up')).toBe(false)
    expect(input.justPressed('left')).toBe(false)
  })

  it('releases every held action when the document becomes hidden', () => {
    let visibility: DocumentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })
    const input = makeInput({ right: ['KeyD'], down: ['KeyS'] })
    key('keydown', 'KeyD')
    key('keydown', 'KeyS')
    visibility = 'hidden'

    document.dispatchEvent(new Event('visibilitychange'))

    expect(input.held('right')).toBe(false)
    expect(input.held('down')).toBe(false)
  })
})
