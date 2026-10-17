// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Model } from './components/model.js'
import { PointLight } from './components/point-light.js'
import { Sun } from './components/sun.js'
import { loadScene } from './scene.js'
import { ready3dGame, registryOf, runtimeBridgeOf, scene3d, use3dTestEnvironment } from './test-game-3d.js'
import { fakeRendering } from './test-renderer.js'
import { makeGame } from './test-sprite-batches.js'
import { defined } from './test-support.js'

use3dTestEnvironment()

const REGISTRY = registryOf({ Model, Sun, PointLight })
const INHERITED = {
  castShadows: true,
  shadowMapSize: null,
  shadowMaxDistance: null,
  shadowBias: null,
  shadowNormalBias: null,
  shadowRadius: null,
}
const MEDIUM_SUN = {
  enabled: true, mapSize: 2048, maxDistance: 40, bias: -0.0005, normalBias: 0.02, radius: 1,
  requested: INHERITED,
}
const OVERRIDES = {
  castShadows: true, shadowMapSize: 1024, shadowMaxDistance: 2, shadowBias: 0, shadowNormalBias: 0, shadowRadius: 0,
}
const OVERRIDDEN = {
  enabled: true, mapSize: 1024, maxDistance: 2, bias: 0, normalBias: 0, radius: 0,
  requested: OVERRIDES,
}

it('RuntimeSnapshot shadows (CA-9): reports Medium/40 and effective light defaults before drawing, even with entity filters', () => {
  fakeRendering.init = 'pending'
  const game = makeGame()
  loadScene(game, scene3d([
    { name: 'Sun', components: [{ type: 'Sun', props: { direction: [0, -1, 0] } }] },
    { name: 'Lamp', position: [2, 3, 4], components: [{ type: 'PointLight', props: { distance: 9 } }] },
  ]), REGISTRY)
  const snapshot = runtimeBridgeOf(game).inspect({ entity_names: ['absent'], component_types: ['Model'] })

  expect(snapshot.entities).toEqual([])
  expect(snapshot.lighting).toEqual({
    ambient: { color: '#ffffff', intensity: 1 },
    lights: [],
    shadows: { quality: 'medium', maxDistance: 40 },
    sun: [{ entity: 'Sun', id: 'entity-1', direction: [0, -1, 0], color: '#ffffff', intensity: 1, shadows: MEDIUM_SUN }],
    pointLights: [{
      entity: 'Lamp', id: 'entity-2', position: [2, 3, 4], color: '#ffffff', intensity: 1, distance: 9,
      shadows: { ...MEDIUM_SUN, mapSize: 512, maxDistance: 9 },
    }],
  })
  expect(fakeRendering.draws).toEqual([])
  expect(fakeRendering.renderTargets).toEqual([])
  game.dispose()
})

it.each([
  { type: 'Sun', inheritedMapSize: 4096 },
  { type: 'PointLight', inheritedMapSize: 1024 },
] as const)('RuntimeSnapshot shadows (CA-9): $type distinguishes zero overrides from null inheritance in live component edits', async ({ type, inheritedMapSize }) => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([
    { name: 'Light', components: [{ type, props: OVERRIDES }] },
  ], { shadows: { quality: 'high', maxDistance: 80 } }), REGISTRY)
  const bridge = runtimeBridgeOf(game)
  const { sun, pointLights } = bridge.inspect().lighting
  expect([...(sun ?? []), ...(pointLights ?? [])].map((light) => light.shadows)).toEqual([OVERRIDDEN])

  const entity = defined(game.find('Light'))
  const light = defined(type === 'Sun' ? entity.get(Sun) : entity.get(PointLight))
  light.shadowMapSize = null
  light.shadowMaxDistance = null
  light.shadowBias = null
  light.shadowNormalBias = null
  light.shadowRadius = null

  const lighting = bridge.inspect().lighting
  expect(lighting.shadows).toEqual({ quality: 'high', maxDistance: 80 })
  expect([...(lighting.sun ?? []), ...(lighting.pointLights ?? [])].map((entry) => entry.shadows)).toEqual([
    { ...MEDIUM_SUN, mapSize: inheritedMapSize, maxDistance: 80 },
  ])
  game.dispose()
})

it.each([
  { quality: 'high', castShadows: false },
  { quality: 'off', castShadows: true },
] as const)('RuntimeSnapshot shadows (CA-9): preserves requested flags and overrides with profile $quality and castShadows $castShadows', async ({ quality, castShadows }) => {
  const { game } = await ready3dGame()
  const props = { ...OVERRIDES, castShadows }
  loadScene(game, scene3d([
    { name: 'Sun', components: [{ type: 'Sun', props }] },
    { name: 'Lamp', components: [{ type: 'PointLight', props: { ...props, distance: 9 } }] },
  ], { shadows: { quality, maxDistance: 80 } }), REGISTRY)

  const { lighting } = runtimeBridgeOf(game).inspect()

  expect(lighting.shadows).toEqual({ quality, maxDistance: 80 })
  expect(lighting.sun?.map((light) => light.shadows)).toEqual([
    { ...OVERRIDDEN, enabled: false, requested: props },
  ])
  expect(lighting.pointLights?.map(({ shadows, distance }) => ({ shadows, distance }))).toEqual([
    { shadows: { ...OVERRIDDEN, enabled: false, requested: props }, distance: 9 },
  ])
  game.dispose()
})

it('RuntimeSnapshot shadows (CA-9): exposes independent Model participation flags through filtered component state', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([
    { name: 'Default', components: [{ type: 'Model' }] },
    { name: 'Receiver', components: [{ type: 'Model', props: { castShadows: false } }] },
  ]), REGISTRY)
  const bridge = runtimeBridgeOf(game)
  const filters = { component_types: ['Model'] }

  expect(bridge.inspect(filters).entities).toMatchObject([
    { name: 'Default', components: [{ type: 'Model', state: { castShadows: true, receiveShadows: true } }] },
    { name: 'Receiver', components: [{ type: 'Model', state: { castShadows: false, receiveShadows: true } }] },
  ])
  const model = defined(defined(game.find('Default')).get(Model))
  model.receiveShadows = false
  expect(bridge.inspect({ ...filters, entity_names: ['Default'] }).entities).toMatchObject([
    { name: 'Default', components: [{ type: 'Model', state: { castShadows: true, receiveShadows: false } }] },
  ])
  game.dispose()
})

it('RuntimeSnapshot shadows (CA-9): follows live scene policy edits without requiring a draw', () => {
  fakeRendering.init = 'pending'
  const game = makeGame()
  loadScene(game, scene3d([
    { name: 'Sun', components: [{ type: 'Sun' }] },
    { name: 'Lamp', components: [{ type: 'PointLight', props: { distance: 9 } }] },
  ]), REGISTRY)
  const bridge = runtimeBridgeOf(game)
  game.shadows.quality = 'low'
  game.shadows.maxDistance = 6

  const { lighting } = bridge.inspect()

  expect(lighting.shadows).toEqual({ quality: 'low', maxDistance: 6 })
  expect(lighting.sun?.map((light) => light.shadows)).toEqual([{ ...MEDIUM_SUN, mapSize: 1024, maxDistance: 6 }])
  expect(lighting.pointLights?.map((light) => light.shadows)).toEqual([{ ...MEDIUM_SUN, mapSize: 256, maxDistance: 6 }])
  expect(fakeRendering.draws).toEqual([])
  expect(fakeRendering.renderTargets).toEqual([])
  game.dispose()
})

it('RuntimeSnapshot shadows (CA-9): removes 3D-only data in 2D and restores default policy on the next 3D scene', async () => {
  const { game } = await ready3dGame()
  loadScene(game, scene3d([], { shadows: { quality: 'off', maxDistance: 80 } }), REGISTRY)
  const bridge = runtimeBridgeOf(game)
  loadScene(game, {
    waicaScene: 3,
    render: { shadows: { quality: 'high', maxDistance: 100 } },
    entities: [{ name: 'Accidental', components: [{ type: 'Sun' }, { type: 'PointLight' }] }],
  }, REGISTRY)

  expect(bridge.inspect().lighting).toEqual({ ambient: { color: '#ffffff', intensity: 1 }, lights: [] })

  loadScene(game, scene3d([]), REGISTRY)
  expect(bridge.inspect().lighting).toEqual({
    ambient: { color: '#ffffff', intensity: 1 }, lights: [], sun: [], pointLights: [],
    shadows: { quality: 'medium', maxDistance: 40 },
  })
  game.dispose()
})

it('RuntimeSnapshot shadows (CA-9): serializes only JSON data before drawing and refreshes policy and lights after scene reload', () => {
  fakeRendering.init = 'pending'
  const game = makeGame()
  loadScene(game, scene3d([
    { name: 'Old', components: [{ type: 'Sun', props: OVERRIDES }] },
  ], { shadows: { quality: 'high', maxDistance: 80 } }), REGISTRY)
  const bridge = runtimeBridgeOf(game)
  const before = bridge.inspect().lighting
  const beforeJson: unknown = JSON.parse(JSON.stringify(before))
  expect(before).toStrictEqual(beforeJson)
  expect(before.sun?.map((light) => light.shadows)).toEqual([OVERRIDDEN])

  loadScene(game, scene3d([
    { name: 'New', components: [{ type: 'PointLight' }] },
  ], { shadows: { quality: 'low', maxDistance: 15 } }), REGISTRY)
  const after = bridge.inspect().lighting
  const afterJson: unknown = JSON.parse(JSON.stringify(after))
  expect(after).toStrictEqual(afterJson)
  expect(after).toEqual({
    ambient: { color: '#ffffff', intensity: 1 }, lights: [], sun: [],
    shadows: { quality: 'low', maxDistance: 15 },
    pointLights: [{
      entity: 'New', id: 'entity-2', position: [0, 0, 0], color: '#ffffff', intensity: 1, distance: 0,
      shadows: { ...MEDIUM_SUN, mapSize: 256, maxDistance: 15 },
    }],
  })
  expect(before.sun?.map((light) => light.shadows)).toEqual([OVERRIDDEN])
  expect(fakeRendering.draws).toEqual([])
  expect(fakeRendering.renderTargets).toEqual([])
  game.dispose()
})
