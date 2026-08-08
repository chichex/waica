import { afterEach, describe, expect, it } from 'vitest'
import {
  RUNTIME_BRIDGE_SYMBOL_KEY,
  installRuntimeBridgeActivation,
  type BrowserBridgeActivation,
} from './runtime-browser.js'

function activation(): BrowserBridgeActivation {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for(RUNTIME_BRIDGE_SYMBOL_KEY)
  ] as BrowserBridgeActivation
}

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[Symbol.for(RUNTIME_BRIDGE_SYMBOL_KEY)]
})

describe('browser Runtime Bridge activation', () => {
  it('enforces zero/one/two live Games and replacement after unregister', () => {
    installRuntimeBridgeActivation()
    const hook = activation()
    const first = { metadata: () => ({ bridgeVersion: 1 }) }
    const second = { metadata: () => ({ bridgeVersion: 1 }) }

    expect(hook.current).toBeNull()
    hook.register(first)
    expect(hook.current).toBe(first)
    expect(hook.failure).toBeNull()

    hook.register(second)
    expect(hook.current).toBe(first)
    expect(hook.failure).toEqual({
      code: 'multiple-games',
      message: 'Exactly one live Game may register with a Run Session.',
    })

    installRuntimeBridgeActivation()
    const replacementHook = activation()
    replacementHook.register(first)
    replacementHook.unregister(first)
    replacementHook.register(second)
    expect(replacementHook.current).toBe(second)
    expect(replacementHook.failure).toBeNull()
  })
})
