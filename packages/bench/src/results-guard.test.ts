import { describe, expect, it } from 'vitest'
import { parseScenarioResult, parseScenarioResults } from './results-guard.ts'

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

describe('parseScenarioResults', () => {
  it('accepts an array of results and rejects anything else', () => {
    expect(parseScenarioResults([valid])).toEqual([valid])
    expect(() => parseScenarioResults(valid)).toThrow(/array/)
  })
})
