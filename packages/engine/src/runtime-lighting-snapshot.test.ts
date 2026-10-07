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
      { entity: 'Torch', x: 3, y: 5, radius: 5, color: '#ffaa00', intensity: 0.9, bands: 3, softness: 0.5, castShadows: true },
      { entity: 'Lamp', x: -1, y: 0, radius: 4, color: '#ffffff', intensity: 1, bands: 0, softness: 0, castShadows: false },
    ],
  })
  expect(snapshot.post).toEqual({ vignette: { intensity: 0.6, radius: 0.3 }, colorGrade: null })
  game.dispose()
})
