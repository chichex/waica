import { expect, it } from 'vitest'
import { assertShadowMapCapacity, normalizeShadowBoolean, normalizeShadowOverride, resolveLightShadow, resolveSceneShadows, type ShadowOverrideName, type ShadowQuality } from './scene-shadows.js'

it('defaults an absent or unreadable shadows block to Medium and 40 world units', () => {
  for (const value of [undefined, null, {}, [], 42, false, 'off']) {
    expect(resolveSceneShadows(value)).toEqual({ quality: 'medium', maxDistance: 40 })
  }
})

it('rejects unsupported active shadow maps explicitly but never requires capacity for inactive maps', () => {
  const active = Object.freeze({ enabled: true, mapSize: 4096, maxDistance: 40, bias: -0.0005, normalBias: 0.02, radius: 1 })
  expect(() => assertShadowMapCapacity(active, 2048)).toThrow(/4096.*2048/)
  expect(() => assertShadowMapCapacity(active, 4096)).not.toThrow()
  expect(() => assertShadowMapCapacity(active, 8192)).not.toThrow()
  for (const limit of [0, -1, Number.NaN, Infinity]) {
    expect(() => assertShadowMapCapacity(active, limit)).toThrow(/shadow.*capacity/i)
    expect(() => assertShadowMapCapacity({ ...active, enabled: false }, limit)).not.toThrow()
  }
  expect(active.mapSize).toBe(4096)
})

it('caps PointLight shadows by positive finite light distance without mutating any inputs', () => {
  const block = Object.freeze({ quality: 'medium', maxDistance: 40 })
  const scene = Object.freeze(resolveSceneShadows(block))
  const overrides = Object.freeze({ shadowMaxDistance: 2, shadowBias: 0 })
  expect(resolveLightShadow('point', scene, { ...overrides, distance: 9 })).toEqual({
    enabled: true, mapSize: 512, maxDistance: 2, bias: 0, normalBias: 0.02, radius: 1,
  })
  expect(resolveLightShadow('point', scene, { ...overrides, distance: 1 }).maxDistance).toBe(1)
  expect(resolveLightShadow('point', scene, { distance: 9 }).maxDistance).toBe(9)
  expect(resolveLightShadow('sun', scene, { ...overrides, distance: 1 }).maxDistance).toBe(2)
  for (const distance of [0, -1, undefined, Number.NaN, Infinity, -Infinity]) {
    expect(resolveLightShadow('point', scene, { ...overrides, distance }).maxDistance).toBe(2)
  }
  expect(resolveLightShadow('point', scene, { distance: 0 }).maxDistance).toBe(40)
  expect(resolveLightShadow('point', scene, { ...overrides, distance: 9 })).toEqual({
    enabled: true, mapSize: 512, maxDistance: 2, bias: 0, normalBias: 0.02, radius: 1,
  })
  expect(block).toEqual({ quality: 'medium', maxDistance: 40 })
  expect(scene).toEqual({ quality: 'medium', maxDistance: 40 })
  expect(overrides).toEqual({ shadowMaxDistance: 2, shadowBias: 0 })
})

it('lets global Off dominate enabled lights and preserves independent per-light opt-outs', () => {
  for (const kind of ['sun', 'point'] as const) {
    const overrides = { castShadows: true, shadowMapSize: 4096, shadowBias: 0 }
    expect(resolveLightShadow(kind, { quality: 'off', maxDistance: 40 }, overrides)).toMatchObject({
      enabled: false, mapSize: 4096, maxDistance: 40, bias: 0,
    })
    expect(resolveLightShadow(kind, { quality: 'medium', maxDistance: 40 }, { castShadows: false }).enabled).toBe(false)
    expect(resolveLightShadow(kind, { quality: 'medium', maxDistance: 40 }, {}).enabled).toBe(true)
    for (const value of [undefined, null, 0, '', 'false']) {
      const malformed = Object.fromEntries([['castShadows', value]])
      expect(resolveLightShadow(kind, { quality: 'medium', maxDistance: 40 }, malformed).enabled).toBe(true)
    }
  }
})

it('inherits null or absent fields, honors explicit zero and normalizes malformed light overrides', () => {
  const scene = { quality: 'high', maxDistance: 22 } as const
  expect(resolveLightShadow('sun', scene, {
    shadowMapSize: 512, shadowMaxDistance: 2, shadowBias: 0, shadowNormalBias: 0, shadowRadius: 0,
  })).toEqual({ enabled: true, mapSize: 512, maxDistance: 2, bias: 0, normalBias: 0, radius: 0 })
  expect(resolveLightShadow('sun', scene, {
    shadowMapSize: null, shadowMaxDistance: null, shadowBias: null, shadowNormalBias: null, shadowRadius: null,
  })).toEqual({ enabled: true, mapSize: 4096, maxDistance: 22, bias: -0.0005, normalBias: 0.02, radius: 1 })
  const malformed = Object.fromEntries<unknown>([
    ['shadowMapSize', 768], ['shadowMaxDistance', '2'], ['shadowBias', Number.NaN],
    ['shadowNormalBias', Infinity], ['shadowRadius', false],
  ])
  expect(resolveLightShadow('point', scene, malformed)).toEqual({
    enabled: true, mapSize: 1024, maxDistance: 22, bias: -0.0005, normalBias: 0.02, radius: 1,
  })
  expect(resolveLightShadow('sun', scene, {
    shadowMaxDistance: -1, shadowBias: 2, shadowNormalBias: -1, shadowRadius: 20,
  })).toEqual({ enabled: true, mapSize: 4096, maxDistance: 0.01, bias: 0.1, normalBias: 0, radius: 8 })
})

it('resolves the exact Sun and per-face PointLight profiles with shared antiartefact defaults', () => {
  const profiles: [ShadowQuality, number, number][] = [
    ['low', 1024, 256], ['medium', 2048, 512], ['high', 4096, 1024],
  ]
  for (const [quality, sunSize, pointSize] of profiles) {
    expect(resolveLightShadow('sun', { quality, maxDistance: 40 }, {})).toEqual({
      enabled: true, mapSize: sunSize, maxDistance: 40, bias: -0.0005, normalBias: 0.02, radius: 1,
    })
    expect(resolveLightShadow('point', { quality, maxDistance: 40 }, {})).toEqual({
      enabled: true, mapSize: pointSize, maxDistance: 40, bias: -0.0005, normalBias: 0.02, radius: 1,
    })
  }
})

it('normalizes nullable numeric shadow overrides without coercion or invented map sizes', () => {
  const fields: ShadowOverrideName[] = ['shadowMapSize', 'shadowMaxDistance', 'shadowBias', 'shadowNormalBias', 'shadowRadius']
  for (const name of fields) {
    for (const value of [undefined, null, false, true, '512', '', [], {}, Number.NaN, Infinity, -Infinity]) {
      expect(normalizeShadowOverride(name, value)).toBeNull()
    }
  }
  for (const value of [256, 512, 1024, 2048, 4096]) {
    expect(normalizeShadowOverride('shadowMapSize', value)).toBe(value)
  }
  for (const value of [0, -1, 128, 768, 512.5, 8192]) {
    expect(normalizeShadowOverride('shadowMapSize', value)).toBeNull()
  }
  expect(normalizeShadowOverride('shadowMaxDistance', 0)).toBe(0.01)
  expect(normalizeShadowOverride('shadowMaxDistance', 2000)).toBe(1000)
  expect(normalizeShadowOverride('shadowBias', -1)).toBe(-0.1)
  expect(normalizeShadowOverride('shadowBias', 1)).toBe(0.1)
  expect(normalizeShadowOverride('shadowBias', 0)).toBe(0)
  expect(normalizeShadowOverride('shadowNormalBias', -1)).toBe(0)
  expect(normalizeShadowOverride('shadowNormalBias', 2)).toBe(1)
  expect(normalizeShadowOverride('shadowRadius', -1)).toBe(0)
  expect(normalizeShadowOverride('shadowRadius', 9)).toBe(8)
  expect(normalizeShadowOverride('shadowRadius', 0.5)).toBe(0.5)
})

it('normalizes shadow flags without truthy coercion and preserves only strict false', () => {
  expect(normalizeShadowBoolean(false)).toBe(false)
  for (const value of [true, undefined, null, 0, 1, '', 'false', 'true', Number.NaN, [], {}]) {
    expect(normalizeShadowBoolean(value)).toBe(true)
  }
})

it('reads every scene profile from the shadows block and clamps only finite distances', () => {
  for (const quality of ['off', 'low', 'medium', 'high']) {
    expect(resolveSceneShadows({ quality, maxDistance: 12 })).toEqual({ quality, maxDistance: 12 })
  }
  expect(resolveSceneShadows({ quality: 'unknown', maxDistance: 0 })).toEqual({ quality: 'medium', maxDistance: 0.01 })
  expect(resolveSceneShadows({ quality: false, maxDistance: 1001 })).toEqual({ quality: 'medium', maxDistance: 1000 })
  expect(resolveSceneShadows({ maxDistance: -8 }).maxDistance).toBe(0.01)
  for (const maxDistance of [null, undefined, '12', Number.NaN, Infinity, -Infinity, false, {}]) {
    expect(resolveSceneShadows({ maxDistance }).maxDistance).toBe(40)
  }
  expect(resolveSceneShadows({ shadows: { quality: 'off', maxDistance: 12 } })).toEqual({ quality: 'medium', maxDistance: 40 })
})
