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

import {
  Game,
  RUNTIME_BRIDGE_SYMBOL,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
} from './index'
import { FakeAudioBackend, flush } from './audio/test-helpers.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(backend?: FakeAudioBackend): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game(backend ? { canvas, audio: backend } : { canvas })
}

function installActivation(): { registered: RuntimeBridge[] } {
  const registered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: () => {},
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, {
    configurable: true,
    value: activation,
  })
  return { registered }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
})

describe('RuntimeSnapshot.scene (CA-9)', () => {
  it('is null with no scene loaded', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.start()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.scene).toBeNull()
    game.dispose()
  })

  it('reports the live scene name alongside stats', () => {
    const { registered } = installActivation()
    const game = makeGame()
    game.registerSceneCatalog({
      scenes: { cave: { waicaScene: 3, entities: [{ name: 'Torch' }] } },
      registry: { components: {} },
    })
    game.loadSceneByName('cave')
    game.start()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.scene).toBe('cave')
    expect(snapshot.stats).toEqual({})
    game.dispose()
  })
})

describe('RuntimeSnapshot.audio (CA-15)', () => {
  it('reports master and every factory channel at their defaults, and no live sounds, on a fresh Game', () => {
    const { registered } = installActivation()
    const game = makeGame(new FakeAudioBackend())
    game.start()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.audio).toEqual({
      master: 1,
      channels: { music: { volume: 1, muted: false }, sfx: { volume: 1, muted: false } },
      playing: [],
    })
    game.dispose()
  })

  it('reflects mixer changes and lists every live sound with its channel and scope, sorted by uri', async () => {
    const { registered } = installActivation()
    const game = makeGame(new FakeAudioBackend())
    game.start() // a registered Runtime Bridge satisfies the unlock (CA-5)

    game.audio.master = 0.5
    game.audio.setChannelMuted('music', true)
    game.audio.play('zzz.ogg', { channel: 'sfx' })
    game.audio.play('aaa.ogg', { channel: 'music', scope: 'session' })
    await flush()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.audio).toEqual({
      master: 0.5,
      channels: { music: { volume: 1, muted: true }, sfx: { volume: 1, muted: false } },
      playing: [
        { uri: 'aaa.ogg', channel: 'music', scope: 'session' },
        { uri: 'zzz.ogg', channel: 'sfx', scope: 'scene' },
      ],
    })
    game.dispose()
  })

  it('reports the resolved uri in `playing`, not the raw one passed to play() (CA-1)', async () => {
    const { registered } = installActivation()
    const game = makeGame(new FakeAudioBackend())
    game.registerSceneCatalog({
      scenes: {},
      registry: { components: {}, resolveAsset: (uri) => (uri === 'waica:theme' ? '/resolved/theme.ogg' : uri) },
    })
    game.start()

    game.audio.play('waica:theme', { channel: 'music' })
    await flush()

    const snapshot = registered[0]!.inspect()

    expect(snapshot.audio.playing).toEqual([{ uri: '/resolved/theme.ogg', channel: 'music', scope: 'scene' }])
    game.dispose()
  })

  it('sorts channel names alphabetically regardless of creation order', async () => {
    const { registered } = installActivation()
    const game = makeGame(new FakeAudioBackend())
    game.start()

    game.audio.play('bell.ogg', { channel: 'zeta' })
    await flush()

    const snapshot = registered[0]!.inspect()

    expect(Object.keys(snapshot.audio.channels)).toEqual(['music', 'sfx', 'zeta'])
    game.dispose()
  })
})
