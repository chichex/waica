// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { PointLight } from './components/point-light.js'
import { SpotLight } from './components/spot-light.js'
import { Sun } from './components/sun.js'
import { loadScene } from './scene.js'
import { ready3dGame, registryOf, runtimeBridgeOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { defined } from './test-support.js'

use3dTestEnvironment()

const REGISTRY = registryOf({ Sun, PointLight, SpotLight })
const SPOT_SHADOWS = {
  enabled: true, mapSize: 1024, maxDistance: 40, bias: -0.0005, normalBias: 0.02, radius: 1,
  requested: {
    castShadows: true, shadowMapSize: null, shadowMaxDistance: null, shadowBias: null, shadowNormalBias: null, shadowRadius: null,
  },
}
const EXPECTED_SPOTS = [
  {
    entity: 'Beam', id: 'entity-1', position: [3, 3, -2], direction: [-1, 0, 0], color: '#ff8800',
    intensity: 6, distance: 12, angle: 40, penumbra: 0.5,
    shadows: { ...SPOT_SHADOWS, maxDistance: 12 },
  },
  {
    entity: 'Down', id: 'entity-2', position: [0, 0, 0], direction: [0, -1, 0], color: '#ffffff',
    intensity: 1, distance: 0, angle: 30, penumbra: 0.2,
    shadows: { ...SPOT_SHADOWS, enabled: false, requested: { ...SPOT_SHADOWS.requested, castShadows: false } },
  },
]

describe('Runtime Snapshot spot lights (issue #204 CA-10)', () => {
  it('reports each SpotLight in spawn order with its world position, world unit direction and look', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([
      {
        name: 'Beam',
        position: [3, 1, -2],
        components: [{
          type: 'SpotLight',
          props: { color: 0xff8800, intensity: 6, distance: 12, angle: 40, penumbra: 0.5, direction: [0, 0, -2], offsetY: 2 },
        }],
      },
      { name: 'Down', components: [{ type: 'SpotLight', props: { castShadows: false } }] },
    ]), REGISTRY)
    defined(game.find('Beam')).node.rotation.set(0, Math.PI / 2, 0)

    const { lighting } = runtimeBridgeOf(game).inspect({})

    expect(lighting.spotLights).toEqual(EXPECTED_SPOTS)
    expect(lighting.sun).toEqual([])
    expect(lighting.pointLights).toEqual([])
    const json: unknown = JSON.parse(JSON.stringify(lighting))
    expect(lighting).toStrictEqual(json)
  })

  it('reports an empty list in a 3D scene without spots and no key in a 2D scene', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([{ name: 'Lamp', components: [{ type: 'PointLight' }] }]), REGISTRY)
    const bridge = runtimeBridgeOf(game)
    expect(bridge.inspect({}).lighting.spotLights).toEqual([])

    loadScene(game, { waicaScene: 3, entities: [{ name: 'Spot', components: [{ type: 'SpotLight' }] }] }, REGISTRY)
    const { lighting } = bridge.inspect({})
    expect(Object.keys(lighting).sort()).toEqual(['ambient', 'lights'])
  })
})
