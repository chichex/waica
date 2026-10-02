import { describe, expect, it } from 'vitest'
import { parseScenarioResult, parseScenarioResults } from './results-guard.ts'

const valid = {
  scenario: 'spawn-churn',
  commit: 'abc1234',
  host: { platform: 'linux', cpus: 8, chrome: 'Google Chrome 150' },
  counters: {
    drawCalls: 300,
    meshes: 300,
    visibleMeshes: 300,
    geometries: 300,
    materials: 300,
    textures: 300,
    entitiesSpawned: 6000,
    entitiesDestroyed: 5700,
    materialsCreated: 6000,
    geometriesCreated: 6000,
  },
  timings: { frames: 600, medianMs: 1.2, p95Ms: 2.5, gcPauses: { count: 3, totalMs: 4.5 } },
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
