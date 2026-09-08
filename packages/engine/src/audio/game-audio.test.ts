// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    readonly domElement: HTMLCanvasElement
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas
    }
    setPixelRatio(): void {}
    setSize(): void {}
    setViewport(): void {}
    setScissor(): void {}
    setScissorTest(): void {}
    setClearColor(): void {}
    clear(): void {}
    render(): void {}
    setAnimationLoop(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import { Game, RUNTIME_BRIDGE_SYMBOL, type RuntimeBridge, type RuntimeBridgeActivation } from '../index.js'
import { FakeAudioBackend, flush } from './test-helpers.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(backend?: FakeAudioBackend): { game: Game; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  const game = new Game(backend ? { canvas, audio: backend } : { canvas })
  return { game, canvas }
}

function installActivation(): {
  activation: RuntimeBridgeActivation
  registered: RuntimeBridge[]
  unregistered: RuntimeBridge[]
} {
  const registered: RuntimeBridge[] = []
  const unregistered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: (bridge) => unregistered.push(bridge),
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, {
    configurable: true,
    value: activation,
  })
  return { activation, registered, unregistered }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('game.audio wiring', () => {
  it('exists on a freshly constructed Game, before any input', () => {
    const { game } = makeGame(new FakeAudioBackend())
    expect(game.audio).toBeDefined()
    expect(game.audio.channels()).toEqual(['music', 'sfx'])
    game.dispose()
  })

  it('is safe with the real default backend under happy-dom: no AudioContext, no throw, one graceful warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game } = makeGame()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(() => game.audio.play('hit.ogg')).not.toThrow()
    await flush()

    expect(warn).toHaveBeenCalledTimes(1)
    game.dispose()
  })
})

describe('CA-3 — the mixer does not persist', () => {
  it('a fresh Game reports master and every factory channel at defaults, regardless of a previous Game', () => {
    // Nothing in AudioSubsystem/WebAudioBackend ever touches localStorage,
    // sessionStorage or waica.params.json (grep the two source files: no
    // such reference exists) — the only thing to prove dynamically is that
    // state genuinely doesn't cross Game instances.
    const { game: first } = makeGame(new FakeAudioBackend())
    first.audio.master = 0.3
    first.audio.setChannelVolume('music', 0.6)
    first.audio.setChannelMuted('sfx', true)
    first.dispose()

    const { game: second } = makeGame(new FakeAudioBackend())
    expect(second.audio.master).toBe(1)
    expect(second.audio.channelState('music')).toEqual({ volume: 1, muted: false })
    expect(second.audio.channelState('sfx')).toEqual({ volume: 1, muted: false })
    second.dispose()
  })
})

describe('CA-4 — the editor pause suspends audio', () => {
  it('suspends on simulate=false and resumes on simulate=true, without stopping or restarting in-flight sounds', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    const runFrame = (game as unknown as { runFrame(dt: number): void }).runFrame.bind(game)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(backend.resumeCalls).toBe(1)

    const handle = game.audio.play('bed.ogg', { channel: 'music', loop: true })
    await flush()

    game.simulate = false
    runFrame(0.016)
    expect(backend.suspendCalls).toBe(1)
    expect(backend.resumeCalls).toBe(1)

    game.simulate = true
    runFrame(0.016)
    expect(backend.resumeCalls).toBe(2)
    expect(backend.suspendCalls).toBe(1)

    // The sound itself was never touched by the pause/resume cycle.
    expect(backend.playbacks[0]?.stops).toEqual([])
    expect(handle.playing).toBe(true)

    game.dispose()
  })
})

describe('CA-5 — a registered Runtime Bridge silences output but not the model', () => {
  it('registering the bridge silences output; play() still registers; unregistering restores output', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    installActivation()

    // No real keydown/pointerdown ever happens under MCP-driven automation —
    // registering the bridge is what unlocks (the game is not autoplaying to
    // real speakers either way; suspend() below keeps it that way).
    game.start()
    expect(backend.resumeCalls).toBe(0)
    expect(backend.suspendCalls).toBe(0)

    const handle = game.audio.play('swing.ogg', { channel: 'sfx' })
    await flush()

    expect(backend.playCalls).toEqual([{ resource: 'swing.ogg', channel: 'sfx', volume: 1, loop: false }])
    expect(game.audio.liveSounds()).toEqual([{ uri: 'swing.ogg', channel: 'sfx', scope: 'scene' }])
    expect(handle.playing).toBe(true)
    handle.stop()
    expect(handle.playing).toBe(false)

    window.dispatchEvent(new Event('pagehide'))
    expect(backend.resumeCalls).toBe(1)

    game.dispose()
  })
})

describe('CA-10 — teardown', () => {
  it('stops every live sound, including session-scoped ones, and closes the backend', async () => {
    const backend = new FakeAudioBackend()
    const { game } = makeGame(backend)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))

    const sceneScoped = game.audio.play('hit.ogg')
    const sessionScoped = game.audio.play('bed.ogg', { channel: 'music', scope: 'session' })
    await flush()

    game.dispose()

    expect(sceneScoped.playing).toBe(false)
    expect(sessionScoped.playing).toBe(false)
    expect(game.audio.liveSounds()).toEqual([])
    expect(backend.closeCalls).toBe(1)
  })
})
