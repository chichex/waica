import { expect, it } from 'vitest'
import { sceneShadowIssues, shadowComponentIssues } from './scene-shadows.js'

function messageContaining(text: string): unknown {
  return expect.stringContaining(text)
}

it('keeps malformed JSON objects and arrays visible in shadow diagnostics', () => {
  expect(shadowComponentIssues('Sun', { shadowBias: [] })).toEqual([
    { field: 'shadowBias', message: 'shadowBias must be a finite number from -0.1 to 0.1; got [].' },
  ])
  expect(sceneShadowIssues({ space: '3d', shadows: [] })).toEqual([
    { field: 'render.shadows', message: 'render.shadows must be an object; got [].' },
  ])
  expect(sceneShadowIssues({ space: '3d', shadows: { quality: {} } })).toEqual([
    { field: 'render.shadows.quality', message: 'render.shadows.quality must be off, low, medium or high; got {}.' },
  ])
})

it('reports malformed shadow blocks and every invalid scene field without changing authored data', () => {
  expect(sceneShadowIssues(undefined)).toEqual([])
  expect(sceneShadowIssues({ space: '3d' })).toEqual([])
  expect(sceneShadowIssues({ space: '3d', shadows: {} })).toEqual([])
  for (const shadows of [null, [], false, 12, 'off']) {
    expect(sceneShadowIssues({ space: '3d', shadows })).toEqual([
      { field: 'render.shadows', message: messageContaining('must be an object') },
    ])
  }
  const shadows = Object.freeze({ quality: 'bad', maxDistance: 1001 })
  expect(sceneShadowIssues({ space: '3d', shadows })).toEqual([
    { field: 'render.shadows.quality', message: messageContaining('"bad"') },
    { field: 'render.shadows.maxDistance', message: messageContaining('1001') },
  ])
  for (const maxDistance of [null, '40', false, Number.NaN, Infinity, -Infinity, 0, 1000.01]) {
    expect(sceneShadowIssues({ space: '3d', shadows: { maxDistance } })).toEqual([
      { field: 'render.shadows.maxDistance', message: messageContaining('0.01 to 1000') },
    ])
  }
  expect(shadows).toEqual({ quality: 'bad', maxDistance: 1001 })
  expect(sceneShadowIssues({ space: '3d', shadows: { quality: 'low', maxDistance: 0.01 } })).toEqual([])
  expect(sceneShadowIssues({ space: '3d', shadows: { quality: 'high', maxDistance: 1000 } })).toEqual([])
})

it('validates independent Model flags, accepts nullable light inheritance, and never truthy-coerces boolean data', () => {
  expect(shadowComponentIssues('Model', { castShadows: null, receiveShadows: 'false', shadowBias: 'ignored' })).toEqual([
    { field: 'castShadows', message: 'castShadows must be a boolean; got null.' },
    { field: 'receiveShadows', message: 'receiveShadows must be a boolean; got "false".' },
  ])
  expect(shadowComponentIssues('Model', { castShadows: false, receiveShadows: true })).toEqual([])
  expect(shadowComponentIssues('Model', { castShadows: true, receiveShadows: false })).toEqual([])
  for (const type of ['Sun', 'PointLight', 'Model']) {
    expect(shadowComponentIssues(type, undefined)).toEqual([])
    expect(shadowComponentIssues(type, null)).toEqual([])
    expect(shadowComponentIssues(type, [])).toEqual([])
    for (const castShadows of [null, 0, 1, '', 'false', [], {}]) {
      expect(shadowComponentIssues(type, { castShadows })).toEqual([
        { field: 'castShadows', message: messageContaining('must be a boolean') },
      ])
    }
  }
  for (const type of ['Sun', 'PointLight']) {
    expect(shadowComponentIssues(type, {
      shadowMapSize: null, shadowMaxDistance: null, shadowBias: null, shadowNormalBias: null, shadowRadius: null,
    })).toEqual([])
    expect(shadowComponentIssues(type, {
      shadowMapSize: 256, shadowMaxDistance: 1000, shadowBias: -0.1, shadowNormalBias: 1, shadowRadius: 8,
    })).toEqual([])
  }
})

it('validates numeric overrides and strict cast flags only on Sun and PointLight, without normalizing authored data', () => {
  const props = Object.freeze({ castShadows: 'false', shadowMapSize: 768, shadowMaxDistance: 0, shadowBias: -0.2, shadowNormalBias: 2, shadowRadius: Infinity })
  for (const type of ['Sun', 'PointLight']) {
    expect(shadowComponentIssues(type, props)).toEqual([
      { field: 'castShadows', message: messageContaining('"false"') },
      { field: 'shadowMapSize', message: messageContaining('256, 512, 1024, 2048, 4096') },
      { field: 'shadowMaxDistance', message: messageContaining('0.01 to 1000') },
      { field: 'shadowBias', message: messageContaining('-0.1 to 0.1') },
      { field: 'shadowNormalBias', message: messageContaining('0 to 1') },
      { field: 'shadowRadius', message: messageContaining('Infinity') },
    ])
    expect(shadowComponentIssues(type, { castShadows: false, shadowMapSize: null, shadowMaxDistance: null, shadowBias: 0, shadowNormalBias: 0, shadowRadius: 0 })).toEqual([])
    expect(shadowComponentIssues(type, {})).toEqual([])
    expect(shadowComponentIssues(type, { receiveShadows: 'bad' })).toEqual([])
    for (const shadowMapSize of [256, 512, 1024, 2048, 4096]) {
      expect(shadowComponentIssues(type, { shadowMapSize })).toEqual([])
    }
    for (const shadowBias of ['0', Number.NaN, Infinity, false, {}, []]) {
      expect(shadowComponentIssues(type, { shadowBias })).toEqual([
        { field: 'shadowBias', message: messageContaining('a finite number') },
      ])
    }
  }
  expect(props).toEqual({ castShadows: 'false', shadowMapSize: 768, shadowMaxDistance: 0, shadowBias: -0.2, shadowNormalBias: 2, shadowRadius: Infinity })
  expect(shadowComponentIssues('Light', props)).toEqual([])
  expect(shadowComponentIssues('CustomSun', props)).toEqual([])
})

it('requires 3D for configured scene shadows and diagnoses invalid fields even when globally Off', () => {
  for (const space of [undefined, '2d']) {
    expect(sceneShadowIssues({ space, shadows: { quality: 'off' } })).toEqual([
      { field: 'render.shadows', message: messageContaining("render.space '3d'") },
    ])
  }
  expect(sceneShadowIssues({ space: '3d', shadows: { quality: 'off', maxDistance: -2 } })).toEqual([
    { field: 'render.shadows.maxDistance', message: messageContaining('-2') },
  ])
  expect(sceneShadowIssues({ space: '2d', shadows: { quality: 'off', maxDistance: -2 } })).toEqual([
    { field: 'render.shadows', message: messageContaining("render.space '3d'") },
    { field: 'render.shadows.maxDistance', message: messageContaining('-2') },
  ])
  expect(sceneShadowIssues({ space: '3d', shadows: { quality: 'off' } })).toEqual([])
})
