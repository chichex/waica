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

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas })
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
