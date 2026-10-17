import { describe, expect, it } from 'vitest'
import { parseScenarioResult, parseScenarioResults } from './results-guard.ts'
import { SCENARIOS } from './results.ts'

const valid = {
  scenario: 'spawn-churn-10',
  commit: 'abc1234',
  backend: 'webgl2',
  host: { platform: 'linux', cpus: 8, chrome: 'Google Chrome 150', renderer: 'ANGLE (SwiftShader)' },
  counters: {
    drawCalls: 300,
    meshes: 300,
    visibleMeshes: 300,
    geometries: 300,
    materials: 300,
    textures: 300,
    textureSources: 1,
    entitiesSpawned: 6000,
    entitiesDestroyed: 5700,
    materialsCreated: 6000,
    geometriesCreated: 6000,
  },
  timings: { frames: 600, medianMs: 1.2, p95Ms: 2.5, overBudget: false, gcPauses: { count: 3, totalMs: 4.5 } },
}

describe('parseScenarioResult', () => {
  it('accepts a well-formed result, with or without GC pauses', () => {
    expect(parseScenarioResult(valid)).toEqual(valid)
    const noGc = { ...valid, timings: { ...valid.timings, gcPauses: null } }
    expect(parseScenarioResult(noGc)).toEqual(noGc)
  })

  it('rejects an unknown scenario', () => {
    expect(() => parseScenarioResult({ ...valid, scenario: 'tilemap' })).toThrow(/scenario/)
  })

  it('rejects a missing or non-numeric counter', () => {
    const withoutDrawCalls: Record<string, number> = { ...valid.counters }
    delete withoutDrawCalls.drawCalls
    expect(() => parseScenarioResult({ ...valid, counters: withoutDrawCalls })).toThrow(/counters.drawCalls/)
    expect(() => parseScenarioResult({ ...valid, counters: { ...valid.counters, meshes: '1' } })).toThrow(/counters.meshes/)
  })

  it('requires the WebGL renderer, textureSources and the budget verdict', () => {
    const hostWithoutRenderer: Record<string, unknown> = { ...valid.host }
    delete hostWithoutRenderer.renderer
    expect(() => parseScenarioResult({ ...valid, host: hostWithoutRenderer })).toThrow(/host.renderer/)
    expect(() => parseScenarioResult({ ...valid, counters: { ...valid.counters, textureSources: undefined } })).toThrow(/counters.textureSources/)
    expect(() => parseScenarioResult({ ...valid, timings: { ...valid.timings, overBudget: 'no' } })).toThrow(/timings.overBudget/)
  })

  it('requires the Render Backend the scenario drew through (ADR 0025)', () => {
    expect(parseScenarioResult({ ...valid, backend: 'webgpu' })).toEqual({ ...valid, backend: 'webgpu' })
    const withoutBackend: Record<string, unknown> = { ...valid }
    delete withoutBackend.backend
    expect(() => parseScenarioResult(withoutBackend)).toThrow(/result.backend/)
    expect(() => parseScenarioResult({ ...valid, backend: 'webgl' })).toThrow(/result.backend/)
  })

  it('rejects malformed host and timings', () => {
    expect(() => parseScenarioResult({ ...valid, host: null })).toThrow(/host/)
    expect(() => parseScenarioResult({ ...valid, timings: { ...valid.timings, p95Ms: null } })).toThrow(/timings.p95Ms/)
  })
})

it('preserves optional shadow workload metadata rather than discarding it', () => {
  const shadow = { composition: 'sun', enabled: true, quality: 'medium', casters: 50, lights: 1, warmupFrames: 5, measuredFrames: 60 }
  const measured = { ...valid, scenario: 'shadows-sun-on-50', timings: { ...valid.timings, frames: 60 }, shadow }
  expect(parseScenarioResult(measured)).toEqual(measured)
  const matrix = SCENARIOS.map((scenario) => scenario === measured.scenario ? measured : { ...valid, scenario })
  expect(parseScenarioResults(matrix, 'webgl2').find((result) => result.scenario === measured.scenario)?.shadow).toEqual(shadow)
})

const shadow = { composition: 'four-point', enabled: true, quality: 'medium', casters: 200, lights: 4, warmupFrames: 5, measuredFrames: 60 }
const measured = { ...valid, scenario: 'shadows-four-point-on-200', timings: { ...valid.timings, frames: 60 }, shadow }

it.each(Object.keys(shadow))('requires shadow.%s when metadata is present', (key) => {
  const incomplete: Record<string, unknown> = { ...shadow }
  delete incomplete[key]
  expect(() => parseScenarioResult({ ...measured, shadow: incomplete })).toThrow(new RegExp(`shadow.${key}`))
})

it.each([
  { composition: 'point' }, { enabled: false }, { quality: 'off' }, { casters: 50 },
  { lights: 1 }, { warmupFrames: 0 }, { measuredFrames: 59 }, { casters: 200.5 },
])('rejects shadow metadata inconsistent with its workload: %j', (changed) => {
  expect(() => parseScenarioResult({ ...measured, shadow: { ...shadow, ...changed } })).toThrow(/shadow/)
})

it('does not attach shadow metadata to an unrelated historical workload', () => {
  expect(() => parseScenarioResult({ ...valid, shadow })).toThrow(/shadow.*scenario/)
})

it.each(['webgl2', 'webgpu', undefined] as const)('rejects missing and duplicate results for selection %s', (selection) => {
  const matrix = SCENARIOS.map((scenario) => ({ ...valid, scenario, backend: selection ?? 'webgpu' }))
  expect(() => parseScenarioResults(matrix.slice(1), selection)).toThrow(/missing/)
  expect(() => parseScenarioResults([...matrix, matrix[0]], selection)).toThrow(/duplicate/)
})

it.each(Object.keys(valid.counters))('requires every deterministic counter: %s', (key) => {
  const counters: Record<string, unknown> = { ...valid.counters }
  delete counters[key]
  expect(() => parseScenarioResult({ ...valid, counters })).toThrow(new RegExp(`counters.${key}`))
})

it('requires matching shadow workload metadata across the same scenario in both backend legs', () => {
  const webgl = SCENARIOS.map((scenario) => scenario === measured.scenario ? measured : { ...valid, scenario })
  const webgpu = webgl.map((result) => ({ ...result, backend: 'webgpu' }))
  expect(parseScenarioResults([...webgl, ...webgpu], 'both')).toHaveLength(SCENARIOS.length * 2)
  const inconsistent = webgpu.map((result) => result.scenario === measured.scenario
    ? { ...result, shadow: { ...shadow, warmupFrames: 6 } } : result)
  expect(() => parseScenarioResults([...webgl, ...inconsistent], 'both')).toThrow(/shadow.*matrix|matrix.*shadow/)
})

describe('parseScenarioResults', () => {
  it('accepts an array of results and rejects anything else', () => {
    const matrix = SCENARIOS.map((scenario) => ({ ...valid, scenario }))
    expect(parseScenarioResults(matrix)).toEqual(matrix)
    expect(() => parseScenarioResults(valid)).toThrow(/array/)
  })

  it('rejects an incomplete sweep without imposing that requirement on a single baseline', () => {
    expect(parseScenarioResult(valid)).toEqual(valid)
    expect(() => parseScenarioResults([valid])).toThrow(/missing.*webgl2.*static-sprites-1000/)
    expect(() => parseScenarioResults([])).toThrow(/empty|missing/)
  })

  it('requires exactly one result per backend and scenario, including both selected legs', () => {
    const webgl = SCENARIOS.map((scenario) => ({ ...valid, scenario }))
    const webgpu = webgl.map((result) => ({ ...result, backend: 'webgpu' }))
    const both = [...webgl, ...webgpu]
    expect(parseScenarioResults(both, 'both')).toEqual(both)
    expect(parseScenarioResults(webgpu, 'webgpu')).toEqual(webgpu)
    expect(() => parseScenarioResults(webgl, 'both')).toThrow(/missing.*webgpu/)
    expect(() => parseScenarioResults([...webgl, valid], 'webgl2')).toThrow(/duplicate.*webgl2.*spawn-churn-10/)
    expect(() => parseScenarioResults(both.slice(0, -1), 'both')).toThrow(/missing.*webgpu/)
    expect(() => parseScenarioResults([...both, webgpu[0]], 'both')).toThrow(/duplicate.*webgpu/)
  })

  it('rejects fallback, unexpected legs and inconsistent automatic backend choice', () => {
    const webgl = SCENARIOS.map((scenario) => ({ ...valid, scenario }))
    const webgpu = webgl.map((result) => ({ ...result, backend: 'webgpu' }))
    expect(() => parseScenarioResults(webgl, 'webgpu')).toThrow(/backend.*webgpu.*webgl2/)
    expect(() => parseScenarioResults([...webgl, ...webgpu], 'webgl2')).toThrow(/backend/)
    expect(() => parseScenarioResults([...webgl, ...webgpu])).toThrow(/backend/)
    expect(() => parseScenarioResults(webgl.map((result, index) => index === 1 ? { ...result, backend: 'webgpu' } : result))).toThrow(/backend/)
    expect(parseScenarioResults(webgpu)).toEqual(webgpu)
  })
})
