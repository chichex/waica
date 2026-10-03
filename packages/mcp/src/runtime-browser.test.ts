import { afterEach, describe, expect, it } from 'vitest'
import {
  RUNTIME_BRIDGE_SYMBOL_KEY,
  installRuntimeBridgeActivation,
  runtimeChromeArgs,
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

describe('a Game whose renderer cannot initialize (ADR 0025)', () => {
  it('records the first failure it reports, so readiness stops waiting', () => {
    installRuntimeBridgeActivation()
    const hook = activation()

    hook.fail({ code: 'render-backend-failed', message: 'neither webgpu nor webgl2' })
    hook.fail({ code: 'render-backend-failed', message: 'a later one' })

    expect(hook.failure).toEqual({ code: 'render-backend-failed', message: 'neither webgpu nor webgl2' })
  })
})

describe('extra Chrome arguments for the e2e legs (internal, undocumented)', () => {
  it('launches with none unless WAICA_RUNTIME_CHROME_ARGS names some', () => {
    expect(runtimeChromeArgs({})).toEqual([])
    expect(runtimeChromeArgs({ WAICA_RUNTIME_CHROME_ARGS: '' })).toEqual([])
  })

  it('reads a JSON array of strings', () => {
    expect(runtimeChromeArgs({ WAICA_RUNTIME_CHROME_ARGS: '["--enable-unsafe-webgpu"]' })).toEqual([
      '--enable-unsafe-webgpu',
    ])
  })

  it.each(['--enable-unsafe-webgpu', '[1]', '{"a":1}', '[null]'])('rejects %s instead of guessing', (value) => {
    expect(() => runtimeChromeArgs({ WAICA_RUNTIME_CHROME_ARGS: value })).toThrow(/WAICA_RUNTIME_CHROME_ARGS/)
  })
})
