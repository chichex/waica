import { expect, it } from 'vitest'
import * as engine from './index.js'
import type { LightShadowOverrides, ResolvedLightShadow, ResolvedSceneShadows, SceneRenderJson, SceneShadowsJson, ShadowOverrideName, ShadowQuality } from './index.js'

it('exports the shadow policy, typed scene block, numeric metadata and helpers through the engine entry point', () => {
  const quality: ShadowQuality = 'high'
  const shadows: SceneShadowsJson = { quality, maxDistance: 40 }
  const render: SceneRenderJson = { space: '3d', shadows }
  const scene: ResolvedSceneShadows = engine.resolveSceneShadows(render.shadows)
  const overrides: LightShadowOverrides = { shadowBias: 0 }
  const resolved: ResolvedLightShadow = engine.resolveLightShadow('sun', scene, overrides)
  expect(resolved).toEqual({ enabled: true, mapSize: 4096, maxDistance: 40, bias: 0, normalBias: 0.02, radius: 1 })
  expect(engine.SHADOW_QUALITIES).toEqual(['off', 'low', 'medium', 'high'])
  expect(engine.SHADOW_MAP_SIZES).toEqual([256, 512, 1024, 2048, 4096])
  expect(engine.SHADOW_DEFAULTS).toEqual({ quality: 'medium', maxDistance: 40, bias: -0.0005, normalBias: 0.02, radius: 1 })
  const ranges: [ShadowOverrideName, number, number][] = [
    ['shadowMapSize', 256, 4096], ['shadowMaxDistance', 0.01, 1000], ['shadowBias', -0.1, 0.1],
    ['shadowNormalBias', 0, 1], ['shadowRadius', 0, 8],
  ]
  for (const [name, min, max] of ranges) {
    expect(engine.SHADOW_OVERRIDE_PARAMS[name]).toMatchObject({ min, max })
    expect(engine.SHADOW_OVERRIDE_PARAMS[name].label).toEqual(expect.any(String))
    expect(engine.SHADOW_OVERRIDE_PARAMS[name].step).toEqual(expect.any(Number))
    expect(engine.SHADOW_OVERRIDE_PARAMS[name].step).toBeGreaterThan(0)
  }
  expect(engine.normalizeShadowBoolean(false)).toBe(false)
  expect(engine.normalizeShadowOverride('shadowBias', 0)).toBe(0)
  expect(engine.sceneShadowIssues(render)).toEqual([])
  expect(engine.shadowComponentIssues('Sun', overrides)).toEqual([])
  expect(() => engine.assertShadowMapCapacity(resolved, 4096)).not.toThrow()
})
