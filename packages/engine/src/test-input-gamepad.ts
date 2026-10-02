import { vi } from 'vitest'
import type { GamepadLike } from './gamepad.js'
import { Input, type InputOptions } from './input.js'

/** A mutable standard pad tests move between polls, like a real one between steps. */
export interface FakePad extends GamepadLike {
  axes: number[]
  buttons: { value: number }[]
  connected: boolean
}

export function fakePad(index = 0, mapping = 'standard'): FakePad {
  return {
    index,
    id: `pad-${index}`,
    mapping,
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0 })),
  }
}

/**
 * A fake `navigator.getGamepads` serving `pads`, plus the Inputs a test made:
 * install it in `beforeEach` and call `uninstall` in `afterEach`.
 */
export function fakeGamepads() {
  const state = { pads: [] as (FakePad | null)[] }
  const getGamepads = vi.fn(() => state.pads)
  const inputs: Input[] = []
  return {
    state,
    getGamepads,
    install(): void {
      state.pads = []
      getGamepads.mockClear()
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads })
    },
    uninstall(): void {
      for (const input of inputs.splice(0)) input.dispose()
      Reflect.deleteProperty(navigator, 'getGamepads')
      vi.restoreAllMocks()
    },
    /** A new Input disposed by `uninstall`; an arrow so tests may destructure it. */
    makeInput: (bindings: Record<string, string[]>, options?: InputOptions): Input => {
      const input = new Input(bindings, options)
      inputs.push(input)
      return input
    },
  }
}

export function key(type: 'keydown' | 'keyup', code: string): void {
  window.dispatchEvent(new KeyboardEvent(type, { code }))
}
