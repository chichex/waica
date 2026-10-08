// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import {
  Game,
  Light,
  loadScene,
  RUNTIME_BRIDGE_SYMBOL,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
} from './index'
import { defined } from './test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function startedGame(): { game: Game; bridge: RuntimeBridge } {
  const registered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: () => {},
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, { configurable: true, value: activation })
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  const game = new Game({ canvas })
  game.start()
  return { game, bridge: defined(registered[0], 'a registered Runtime Bridge') }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
})

it('RuntimeSnapshot.lighting and .post (CA-12): full ambient, no lights and every effect off on an unlit scene', () => {
  const { game, bridge } = startedGame()
  loadScene(game, { waicaScene: 3, entities: [] }, { components: { Light } })
  const snapshot = bridge.inspect({ entity_names: ['nobody'] })
  expect(snapshot.lighting).toEqual({ ambient: { color: '#ffffff', intensity: 1 }, lights: [] })
  expect(snapshot.post).toEqual({ vignette: null, colorGrade: null })
  game.dispose()
})

it('RuntimeSnapshot.lighting and .post (CA-12): every live light in logical coordinates, and the active effects', () => {
  const { game, bridge } = startedGame()
  loadScene(game, {
    waicaScene: 3,
    render: {
      projection: 'isometric',
      lighting: { ambient: { color: '#102030', intensity: 0.2 } },
      post: { vignette: { intensity: 0.6, radius: 0.3 } },
    },
    entities: [
      {
        name: 'Torch',
        position: [3, 4],
        components: [{ type: 'Light', props: { radius: 5, color: 0xffaa00, intensity: 0.9, bands: 3, softness: 0.5, offsetY: 1 } }],
      },
      { name: 'Lamp', position: [-1, 0], components: [{ type: 'Light', props: { castShadows: false } }] },
    ],
  }, { components: { Light } })
  const snapshot = bridge.inspect({ entity_names: ['nobody'] })
  expect(snapshot.lighting).toEqual({
    ambient: { color: '#102030', intensity: 0.2 },
    lights: [
      { entity: 'Torch', id: 'entity-1', x: 3, y: 5, radius: 5, color: '#ffaa00', intensity: 0.9, bands: 3, softness: 0.5, castShadows: true },
      { entity: 'Lamp', id: 'entity-2', x: -1, y: 0, radius: 4, color: '#ffffff', intensity: 1, bands: 0, softness: 0, castShadows: false },
    ],
  })
  expect(snapshot.post).toEqual({ vignette: { intensity: 0.6, radius: 0.3 }, colorGrade: null })
  game.dispose()
})

it('RuntimeSnapshot.lighting (review): each light names its entity by the snapshot id, which is unique where names repeat', () => {
  const { game, bridge } = startedGame()
  loadScene(game, {
    waicaScene: 3,
    entities: [
      { name: 'Torch', position: [0, 0], components: [{ type: 'Light', props: {} }] },
      { name: 'Torch', position: [5, 0], components: [{ type: 'Light', props: {} }] },
    ],
  }, { components: { Light } })
  const snapshot = bridge.inspect()
  const ids = snapshot.entities.map((entity) => entity.id)
  expect(snapshot.lighting.lights.map((light) => light.id)).toEqual(ids)
  expect(new Set(ids).size).toBe(2)
  game.dispose()
})

it('RuntimeSnapshot.lighting (review): thousands of lights are truncated from the end, with a marker, to fit 1 MiB', () => {
  const { game, bridge } = startedGame()
  loadScene(game, {
    waicaScene: 3,
    // Long names make 400 lights weigh more than 1 MiB on their own.
    entities: Array.from({ length: 400 }, (_, i) => ({
      name: `Light-${String(i).padStart(3, '0')}-${'x'.repeat(3000)}`,
      position: [i, i] as [number, number],
      components: [{ type: 'Light', props: {} }],
    })),
  }, { components: { Light } })
  const snapshot = bridge.inspect()
  expect(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength).toBeLessThanOrEqual(1024 * 1024)
  expect(snapshot.lighting.lights.length).toBeGreaterThan(0)
  expect(snapshot.lighting.lights.length).toBeLessThan(400)
  expect(snapshot.projectionIssues.at(-1)).toEqual({
    path: `lighting.lights[${snapshot.lighting.lights.length}]`,
    marker: 'truncated',
    omitted: 400 - snapshot.lighting.lights.length,
  })
  game.dispose()
})
