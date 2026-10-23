// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const gpu = vi.hoisted((): { autoReset: unknown; onSync: (() => void) | null } => ({ autoReset: true, onSync: null }))

vi.mock('three/webgpu', async (importOriginal) => {
  const fake = await import('../../../engine/src/test-renderer.js')
  class BenchmarkRenderer extends fake.FakeWebGPURenderer {
    override init(): Promise<this> {
      Object.assign(this.info, { autoReset: gpu.autoReset })
      Object.assign(this.backend.gl, {
        RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, RENDERER: 1,
        readPixels: () => gpu.onSync?.(), getExtension: () => null,
        getParameter: (name: number) => name === 0x0d33 ? 8192 : 'Fake GPU boundary',
      })
      return super.init()
    }
  }
  return { ...fake.withFakeRenderer(await importOriginal()), WebGPURenderer: BenchmarkRenderer }
})

import { fakeRendering, lastFakeRenderer } from '../../../engine/src/test-renderer.js'
import { use3dTestEnvironment } from '../../../engine/src/test-game-3d.js'
import { RUNTIME_BRIDGE_SYMBOL, THREE, type RuntimeBridge, type RuntimeBridgeActivation } from '@waica/engine'
import { runScenario } from './harness.ts'

use3dTestEnvironment()

beforeEach(() => {
  gpu.autoReset = true
  gpu.onSync = null
  fakeRendering.init = 'webgl2'
  document.body.innerHTML = '<canvas id="game" width="1280" height="720"></canvas>'
})

afterEach(() => { Reflect.deleteProperty(globalThis, RUNTIME_BRIDGE_SYMBOL) })

/** Observe the public host registration, without replacing any engine implementation. */
function observeBridge(): () => RuntimeBridge {
  let hook: RuntimeBridgeActivation | undefined
  let captured: RuntimeBridge | undefined
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, {
    configurable: true,
    get: () => hook,
    set(activation: RuntimeBridgeActivation) {
      hook = activation
      const register = activation.register.bind(activation)
      activation.register = (bridge) => { captured = bridge; register(bridge) }
    },
  })
  return () => {
    if (!captured) throw new Error('Game did not register its public Runtime Bridge')
    return captured
  }
}

async function serveRig(): Promise<void> {
  const bytes = new Uint8Array(await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../engine/fixtures/rig.glb')))
  vi.stubGlobal('fetch', (request: RequestInfo | URL) => {
    const url = request instanceof Request ? request.url : String(request)
    return Promise.resolve(url.endsWith('/rig.glb') ? new Response(bytes) : new Response('not found', { status: 404 }))
  })
}

function observeResizeDisconnect(): () => boolean {
  let disconnected = false
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void { disconnected = true }
  })
  return () => disconnected
}

it.each([undefined, 'true'])('disposes the real Game and clears the bridge hook when autoReset is invalid (%s)', async (autoReset) => {
  const disconnected = observeResizeDisconnect()
  gpu.autoReset = autoReset
  await expect(runScenario('falling-boxes-200')).rejects.toThrow(/renderer.info.autoReset is unavailable/)

  expect(lastFakeRenderer().disposed).toBe(true)
  expect(disconnected()).toBe(true)
  expect(Reflect.has(globalThis, RUNTIME_BRIDGE_SYMBOL)).toBe(false)
})

it('disposes the real Game and removes the bridge activation when renderer readiness fails', async () => {
  const disconnected = observeResizeDisconnect()
  fakeRendering.init = new Error('GPU initialization failed')
  await expect(runScenario('falling-boxes-200')).rejects.toThrow('GPU initialization failed')

  expect(disconnected()).toBe(true)
  // A failed backend allocated nothing: Game.dispose deliberately skips renderer.dispose.
  expect(lastFakeRenderer().disposed).toBe(false)
  expect(Reflect.has(globalThis, RUNTIME_BRIDGE_SYMBOL)).toBe(false)
})

it('removes the bridge activation and renderer capture when the canvas is missing', async () => {
  document.body.innerHTML = ''
  const originalInit = Object.getOwnPropertyDescriptor(THREE.WebGPURenderer.prototype, 'init')
  await expect(runScenario('falling-boxes-200')).rejects.toThrow(/#game canvas missing/)

  expect(Reflect.has(globalThis, RUNTIME_BRIDGE_SYMBOL)).toBe(false)
  expect(Object.getOwnPropertyDescriptor(THREE.WebGPURenderer.prototype, 'init')).toEqual(originalInit)
})

it('starts a real paused Game before reading its bridge and always disposes it after measurement', async () => {
  const report = await runScenario('falling-boxes-200')

  expect(report.backend).toBe('webgl2')
  expect(report.frameMs).toHaveLength(300)
  expect(report.counters.meshes).toBe(200)
  expect(lastFakeRenderer().disposed).toBe(true)
  expect(Reflect.has(globalThis, RUNTIME_BRIDGE_SYMBOL)).toBe(false)
})

it('propagates draw failures and still releases the counters, Game and public bridge hook', async () => {
  const bridge = observeBridge()
  const error = new Error('GPU draw failed')
  fakeRendering.onRender = () => { throw error }
  await expect(runScenario('falling-boxes-200')).rejects.toBe(error)

  expect(Reflect.get(lastFakeRenderer().info, 'autoReset')).toBe(true)
  expect(lastFakeRenderer().disposed).toBe(true)
  expect(bridge().inspect().entities).toEqual([])
  expect(Reflect.has(globalThis, RUNTIME_BRIDGE_SYMBOL)).toBe(false)
})

it('rejects a bridge resumed before the actual shadow warmup render', async () => {
  await serveRig()
  const bridge = observeBridge()
  fakeRendering.onRender = () => {
    fakeRendering.onRender = null
    bridge().control({ operation: 'resume' })
  }
  await expect(runScenario('shadows-point-on-50')).rejects.toThrow(/warmup requires a paused Runtime Bridge/)
  expect(lastFakeRenderer().disposed).toBe(true)
  expect(Reflect.has(globalThis, RUNTIME_BRIDGE_SYMBOL)).toBe(false)
})

it('rejects a missing activation before warmup can start a free-running Game loop', async () => {
  await serveRig()
  fakeRendering.onRender = () => {
    fakeRendering.onRender = null
    Reflect.deleteProperty(globalThis, RUNTIME_BRIDGE_SYMBOL)
  }
  await expect(runScenario('shadows-point-on-50')).rejects.toThrow(/Runtime Bridge activation is unavailable/)
  expect(lastFakeRenderer().renders).toBe(1)
  expect(lastFakeRenderer().loop).toBe(null)
  expect(lastFakeRenderer().disposed).toBe(true)
})

it.each(['step', 'resume'] as const)('rejects a bridge %s during the actual shadow warmup render', async (operation) => {
  await serveRig()
  const bridge = observeBridge()
  let renders = 0
  fakeRendering.onRender = () => {
    if (++renders !== 2) return
    fakeRendering.onRender = null
    bridge().control({ operation })
  }
  await expect(runScenario('shadows-point-on-50')).rejects.toThrow(/warmup render changed Runtime Bridge state/)
  expect(lastFakeRenderer().disposed).toBe(true)
  expect(bridge().inspect().entities).toEqual([])
  expect(Reflect.has(globalThis, RUNTIME_BRIDGE_SYMBOL)).toBe(false)
})

it('warms five render-only frames on the real paused shadow Game before sixty measured steps', async () => {
  await serveRig()
  const bridge = observeBridge()
  const synced: { mode: string; frame: number; simulationTime: number }[] = []
  gpu.onSync = () => {
    const { mode, frame, simulationTime, assets } = bridge().metadata()
    expect(assets.failed).toBe(0)
    expect(lastFakeRenderer().loop).toBe(null)
    synced.push({ mode, frame, simulationTime })
  }

  const report = await runScenario('shadows-point-on-50')

  expect(report.shadow).toEqual({ composition: 'point', enabled: true, quality: 'medium', casters: 50, lights: 1, warmupFrames: 5, measuredFrames: 60 })
  expect(report.frameMs).toHaveLength(60)
  expect(report.counters.meshes).toBe(51)
  expect(synced).toHaveLength(65)
  expect(synced.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => ({ mode: 'paused', frame: 0, simulationTime: 0 })))
  expect(synced.slice(5).map(({ frame }) => frame)).toEqual(Array.from({ length: 60 }, (_, index) => index + 1))
  expect(synced.at(-1)).toEqual({ mode: 'paused', frame: 60, simulationTime: 1 })
  expect(bridge().inspect().entities).toEqual([])
  expect(lastFakeRenderer().disposed).toBe(true)
  expect(Reflect.get(lastFakeRenderer().info, 'autoReset')).toBe(true)
  expect(Reflect.has(globalThis, RUNTIME_BRIDGE_SYMBOL)).toBe(false)
})
