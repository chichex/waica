// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from '../authoring-defaults.js'
import { loadScene } from '../scene.js'
import { ready3dGame, registryOf, scene3d, use3dTestEnvironment } from '../test-game-3d.js'
import { defined } from '../test-support.js'
import { PointLight } from './point-light.js'
import { Sun } from './sun.js'

use3dTestEnvironment()

const LIGHTS = [{ name: 'Sun', Light: Sun }, { name: 'PointLight', Light: PointLight }]
const BOOLEAN_CASES = [
  { value: false, expected: false }, { value: true, expected: true },
  { value: undefined, expected: true }, { value: null, expected: true },
  { value: 0, expected: true }, { value: 1, expected: true },
  { value: '', expected: true }, { value: 'false', expected: true },
  { value: [], expected: true }, { value: {}, expected: true },
]
const NUMERIC_OVERRIDES = [
  { name: 'shadowMaxDistance', cases: [[0.01, 0.01], [1000, 1000], [37.5, 37.5], [-20, 0.01], [2000, 1000]] },
  { name: 'shadowBias', cases: [[-0.1, -0.1], [0.1, 0.1], [-0.003, -0.003], [-2, -0.1], [2, 0.1], [0, 0]] },
  { name: 'shadowNormalBias', cases: [[0, 0], [1, 1], [0.04, 0.04], [-2, 0], [2, 1]] },
  { name: 'shadowRadius', cases: [[0, 0], [8, 8], [2.5, 2.5], [-2, 0], [20, 8]] },
] as const
const SCENE_CASES = [
  {
    label: 'finite overrides',
    props: {
      castShadows: false, shadowMapSize: 1024, shadowMaxDistance: 0,
      shadowBias: -2, shadowNormalBias: 2, shadowRadius: 9,
    },
    expected: {
      castShadows: false, shadowMapSize: 1024, shadowMaxDistance: 0.01,
      shadowBias: -0.1, shadowNormalBias: 1, shadowRadius: 8,
    },
  },
  {
    label: 'malformed values',
    props: {
      castShadows: 'false', shadowMapSize: '512', shadowMaxDistance: '40',
      shadowBias: '0', shadowNormalBias: {}, shadowRadius: [],
    },
    expected: {
      castShadows: true, shadowMapSize: null, shadowMaxDistance: null,
      shadowBias: null, shadowNormalBias: null, shadowRadius: null,
    },
  },
  {
    label: 'zero flag and omitted overrides',
    props: { castShadows: 0 },
    expected: {
      castShadows: true, shadowMapSize: null, shadowMaxDistance: null,
      shadowBias: null, shadowNormalBias: null, shadowRadius: null,
    },
  },
]

describe.each(LIGHTS)('$name shadow authoring', ({ Light }) => {
  it('casts shadows by default and accepts only actual booleans', () => {
    const light = new Light()
    expect(authoringDefaults(Light)).toMatchObject({ castShadows: true })

    for (const { value, expected } of BOOLEAN_CASES) {
      Object.assign(light, { castShadows: false })
      Object.assign(light, { castShadows: value })
      expect(light).toMatchObject({ castShadows: expected })
    }
  })

  it('inherits map size unless the override is one of the five supported resolutions', () => {
    const light = new Light()
    expect(authoringDefaults(Light)).toMatchObject({ shadowMapSize: null })

    for (const value of [256, 512, 1024, 2048, 4096]) {
      Object.assign(light, { shadowMapSize: value })
      expect(light).toMatchObject({ shadowMapSize: value })
    }
    for (const value of [null, undefined, 0, 128, 1024.5, 8192, '512', false, {}, [], NaN, Infinity, -Infinity]) {
      Object.assign(light, { shadowMapSize: 512 })
      Object.assign(light, { shadowMapSize: value })
      expect(light).toMatchObject({ shadowMapSize: null })
    }
  })
})

describe.each(LIGHTS)('$name numeric shadow overrides', ({ Light }) => {
  it.each(NUMERIC_OVERRIDES)('inherits $name or clamps a finite override to its range', ({ name, cases }) => {
    const light = new Light()
    expect(authoringDefaults(Light)).toHaveProperty(name, null)

    for (const [value, expected] of cases) {
      Object.assign(light, { [name]: value })
      expect(light).toHaveProperty(name, expected)
    }
    for (const value of [null, undefined, NaN, Infinity, -Infinity, '3', '', false, true, {}, []]) {
      Object.assign(light, { [name]: 0.05 })
      Object.assign(light, { [name]: value })
      expect(light).toHaveProperty(name, null)
    }
  })
})

describe.each(LIGHTS)('$name shadow metadata', ({ Light }) => {
  it('reflects inherited null values with numeric ranges for every override', () => {
    expect(authoringDefaults(Light)).toMatchObject({
      castShadows: true, shadowMapSize: null, shadowMaxDistance: null,
      shadowBias: null, shadowNormalBias: null, shadowRadius: null,
    })
    expect(Light.params).toMatchObject({
      castShadows: { label: 'Cast shadows' },
      shadowMapSize: { min: 256, max: 4096, step: 256 },
      shadowMaxDistance: { min: 0.01, max: 1000, step: 0.01 },
      shadowBias: { min: -0.1, max: 0.1, step: 0.0001 },
      shadowNormalBias: { min: 0, max: 1, step: 0.01 },
      shadowRadius: { min: 0, max: 8, step: 0.1 },
    })
  })
})

describe.each(LIGHTS)('$name shadow properties from scene JSON', ({ Light }) => {
  it.each(SCENE_CASES)('normalizes $label through its setters', async ({ props, expected }) => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([
      { name: 'Authored', components: [{ type: Light.componentName, props }] },
    ]), registryOf({ [Light.componentName]: Light }))

    const light = defined(defined(game.find('Authored')).get<Sun | PointLight>(Light))
    expect(light).toMatchObject(expected)
  })
})

describe.each(LIGHTS)('$name shadow authoring isolation', ({ Light }) => {
  it('keeps every shadow property independent between two lights', () => {
    const first = new Light()
    const second = new Light()
    first.castShadows = false
    first.shadowMapSize = 4096
    first.shadowMaxDistance = 12
    first.shadowBias = -0.01
    first.shadowNormalBias = 0.1
    first.shadowRadius = 3

    expect(second).toMatchObject({
      castShadows: true, shadowMapSize: null, shadowMaxDistance: null,
      shadowBias: null, shadowNormalBias: null, shadowRadius: null,
    })
    second.shadowRadius = 0
    expect(first.shadowRadius).toBe(3)
  })

  it('does not activate renderer shadows in the authoring-only layer', async () => {
    const { game } = await ready3dGame()
    loadScene(game, scene3d([]), registryOf({ [Light.componentName]: Light }))
    const light = game.spawn('Light').add<Sun | PointLight>(Light)
    expect(light.castShadows).toBe(true)
    expect(defined(light.light).castShadow).toBe(false)

    light.castShadows = false
    light.castShadows = true
    light.shadowMapSize = 4096
    light.shadowRadius = 8
    expect(defined(light.light).castShadow).toBe(false)
  })
})
