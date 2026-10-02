import { describe, expect, it } from 'vitest'
import { compareCounters, formatCounterDiffs } from './baseline.ts'
import type { ScenarioResult } from './results.ts'

function result(overrides: Partial<ScenarioResult['counters']> = {}, median = 1): ScenarioResult {
  return {
    scenario: 'static-sprites',
    commit: 'abc1234',
    host: { platform: 'linux', cpus: 8, chrome: 'Google Chrome 150' },
    counters: {
      drawCalls: 1000,
      meshes: 1000,
      visibleMeshes: 1000,
      geometries: 1000,
      materials: 1000,
      textures: 1000,
      entitiesSpawned: 1000,
      entitiesDestroyed: 0,
      materialsCreated: 1000,
      geometriesCreated: 1000,
      ...overrides,
    },
    timings: { frames: 60, medianMs: median, p95Ms: median * 2, gcPauses: null },
  }
}

describe('compareCounters', () => {
  it('passes when every counter matches', () => {
    expect(compareCounters(result(), result())).toEqual([])
  })

  it('reports the scenario, counter, baseline and new value of each change', () => {
    const diffs = compareCounters(result(), result({ drawCalls: 1 }))
    expect(diffs).toEqual([
      { scenario: 'static-sprites', counter: 'drawCalls', baseline: 1000, actual: 1 },
    ])
    expect(formatCounterDiffs(diffs)).toContain('static-sprites: drawCalls 1000 -> 1')
  })

  it('refuses to compare results of different scenarios', () => {
    const other = { ...result(), scenario: 'spawn-churn' as const }
    expect(() => compareCounters(result(), other)).toThrow(/static-sprites.*spawn-churn/)
  })

  it('ignores timings, commit and host', () => {
    const moved = { ...result({}, 99), commit: 'fff0000' }
    moved.host = { platform: 'darwin', cpus: 1, chrome: 'other' }
    expect(compareCounters(result(), moved)).toEqual([])
  })
})
