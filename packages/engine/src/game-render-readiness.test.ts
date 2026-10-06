// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import {
  Game,
  RUNTIME_BRIDGE_CAPABILITIES,
  RUNTIME_BRIDGE_SYMBOL,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
  type RuntimeBridgeFailure,
} from './index'
import { fakeRendering, lastFakeRenderer, resetFakeRendering } from './test-renderer'
import { defined } from './test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  return new Game({ canvas, resolution: { width: 640, height: 360 } })
}

/** An MCP-style activation: the started Game registers its bridge, a failed renderer reports through `fail`. */
function installActivation(): { bridges: RuntimeBridge[]; failures: RuntimeBridgeFailure[] } {
  const bridges: RuntimeBridge[] = []
  const failures: RuntimeBridgeFailure[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => bridges.push(bridge),
    unregister: () => {},
    fail: (failure) => failures.push(failure),
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, { configurable: true, value: activation })
  return { bridges, failures }
}

/** A started Game behind a Runtime Bridge, counting its host updates. */
function startedGame(): { game: Game; bridge: RuntimeBridge; updates: { count: number } } {
  const { bridges } = installActivation()
  const game = makeGame()
  const updates = { count: 0 }
  game.onUpdate(() => {
    updates.count += 1
  })
  game.start()
  return { game, bridge: defined(bridges[0], 'a registered Runtime Bridge'), updates }
}

beforeEach(() => {
  resetFakeRendering()
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
})

describe('game.ready(): the renderer initializes asynchronously (ADR 0025)', () => {
  it('simulates frames before ready() resolves but draws nothing, then draws the first frame after it', async () => {
    fakeRendering.init = 'pending'
    const { game, bridge, updates } = startedGame()

    const before = bridge.control({ operation: 'step', frames: 2 })
    expect(before.frame).toBe(2)
    expect(updates.count).toBe(2)
    expect(lastFakeRenderer().renders).toBe(0)

    lastFakeRenderer().resolveInit('webgpu')
    await game.ready()
    // The paused frame is drawn once the renderer is ready (review #1), then every step draws.
    expect(lastFakeRenderer().renders).toBe(1)
    bridge.control({ operation: 'step', frames: 1 })

    expect(updates.count).toBe(3)
    expect(lastFakeRenderer().renders).toBe(2)
  })

  it('draws the paused frame of a Game started before ready() as soon as the renderer is ready, without advancing it (review #1)', async () => {
    fakeRendering.init = 'pending'
    const { game, bridge } = startedGame()
    expect(lastFakeRenderer().renders).toBe(0)

    lastFakeRenderer().resolveInit('webgpu')
    await game.ready()

    expect(lastFakeRenderer().renders).toBe(1)
    expect(bridge.metadata().frame).toBe(0)
  })

  it('returns the same settled outcome on every call', async () => {
    fakeRendering.init = 'pending'
    const game = makeGame()
    const first = game.ready()
    lastFakeRenderer().resolveInit('webgl2')

    await expect(first).resolves.toBeUndefined()
    await expect(game.ready()).resolves.toBeUndefined()
    expect(game.ready()).toBe(first)
  })

})

describe('a renderer that cannot initialize (ADR 0025)', () => {
  it('rejects naming both Render Backends when the renderer cannot initialize, and never draws', async () => {
    fakeRendering.init = new Error('THREE.WebGPUBackend: Unable to create WebGPU adapter.')
    const { game, bridge } = startedGame()

    await expect(game.ready()).rejects.toThrow(/webgpu.*webgl2/)
    await expect(game.ready()).rejects.toThrow(/Unable to create WebGPU adapter/)
    bridge.control({ operation: 'step', frames: 3 })

    expect(lastFakeRenderer().renders).toBe(0)
  })

  it('leaves no unhandled rejection when a failed Game is never asked for ready()', async () => {
    fakeRendering.init = new Error('no adapter')
    const game = makeGame()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(game.backend).toBeNull()
  })

  it('tells an MCP activation that the renderer failed, naming both Render Backends', async () => {
    const { failures } = installActivation()
    fakeRendering.init = new Error('no adapter')
    const game = makeGame()

    await expect(game.ready()).rejects.toThrow()

    expect(failures).toEqual([{ code: 'render-backend-failed', message: expect.stringMatching(/webgpu.*webgl2/) as unknown }])
  })
})

describe('Render Backend', () => {
  it.each(['webgpu', 'webgl2'] as const)('reports %s after ready(), in game.backend and the bridge metadata', async (backend) => {
    fakeRendering.init = 'pending'
    const { game, bridge } = startedGame()

    expect(game.backend).toBeNull()
    expect(bridge.metadata().backend).toBeNull()

    lastFakeRenderer().resolveInit(backend)
    await game.ready()

    expect(game.backend).toBe(backend)
    expect(bridge.metadata().backend).toBe(backend)
    expect(bridge.inspect().backend).toBe(backend)
  })

  it('is announced as a Runtime Bridge capability', () => {
    expect(RUNTIME_BRIDGE_CAPABILITIES).toContain('render-backend')
  })
})

describe('dispose() while ready() is pending', () => {
  it('starts no loop, disposes the renderer once init settles, and still settles ready()', async () => {
    fakeRendering.init = 'pending'
    const game = makeGame()
    game.start()
    game.dispose()
    const renderer = lastFakeRenderer()

    expect(renderer.loop).toBeNull()
    expect(renderer.disposed).toBe(false)

    renderer.resolveInit('webgpu')
    await expect(game.ready()).resolves.toBeUndefined()
    await Promise.resolve()

    expect(renderer.disposed).toBe(true)
    expect(renderer.loop).toBeNull()
    expect(renderer.renders).toBe(0)
  })
})

describe('canvas output (ADR 0025)', () => {
  it('draws straight to the canvas in sRGB like WebGLRenderer, with the background as the canvas stores it', () => {
    const game = makeGame()
    const renderer = lastFakeRenderer()
    const byte = (channel: number): number => Math.round(channel * 255)
    const background = game.scene.background as { r: number; g: number; b: number }

    expect(renderer.outputColorSpace).toBe('srgb-linear')
    expect(typeof renderer.contextNode.value.getOutput).toBe('function')
    expect(typeof renderer.contextNode.value.getUV).toBe('function')
    expect([byte(background.r), byte(background.g), byte(background.b)]).toEqual([0x1a, 0x1a, 0x2e])
  })
})

describe('the fake renderer installs a loop only once init() settled, as three does (review #5)', () => {
  it('queues start() and stop() behind a pending init, in order', async () => {
    fakeRendering.init = 'pending'
    const game = makeGame()
    game.start()
    expect(lastFakeRenderer().loop).toBeNull()

    lastFakeRenderer().resolveInit('webgpu')
    await game.ready()
    await Promise.resolve()
    expect(lastFakeRenderer().loop).not.toBeNull()

    game.stop()
    await Promise.resolve()
    expect(lastFakeRenderer().loop).toBeNull()
  })
})

describe('a disposed Game (review #3)', () => {
  it('ignores start() after dispose(): no bridge, no loop', async () => {
    const { bridges } = installActivation()
    const game = makeGame()
    await game.ready()
    game.dispose()

    game.start()
    await Promise.resolve()

    expect(bridges).toHaveLength(0)
    expect(lastFakeRenderer().loop).toBeNull()
    expect(lastFakeRenderer().renders).toBe(0)
  })

  it('never starts when a host disposes it while ready() is pending', async () => {
    const { bridges } = installActivation()
    fakeRendering.init = 'pending'
    const game = makeGame()
    const started = game.ready().then(() => game.start())
    game.dispose()

    lastFakeRenderer().resolveInit('webgpu')
    await started

    expect(bridges).toHaveLength(0)
    expect(lastFakeRenderer().renders).toBe(0)
  })

  it('does not report a renderer failure to the activation once disposed', async () => {
    const { failures } = installActivation()
    fakeRendering.init = 'pending'
    const game = makeGame()
    game.dispose()

    lastFakeRenderer().rejectInit(new Error('no adapter'))
    await expect(game.ready()).rejects.toThrow()

    expect(failures).toEqual([])
  })
})
