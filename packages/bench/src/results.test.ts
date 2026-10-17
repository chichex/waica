import { expect, it } from 'vitest'
import { resultFromReport, shadowTimingDeltas, type PageScenarioReport } from './results.ts'

const report: PageScenarioReport = {
  scenario: 'shadows-point-on-50', backend: 'webgpu', renderer: 'WebGPU: test adapter',
  counters: {
    drawCalls: 7, meshes: 51, visibleMeshes: 51, geometries: 2, materials: 2,
    textures: 0, textureSources: 0, entitiesSpawned: 52, entitiesDestroyed: 0,
    materialsCreated: 2, geometriesCreated: 2,
  },
  frameMs: [1, 2, 3],
  shadow: { composition: 'point', enabled: true, quality: 'medium', casters: 50, lights: 1, warmupFrames: 5, measuredFrames: 60 },
}

it('forwards page shadow metadata exactly and records actual backend and renderer with measured timings', () => {
  const result = resultFromReport(report, { commit: 'abc1234', host: { platform: 'linux', cpus: 8, chrome: 'Chrome 150' } }, '')
  expect(result.shadow).toBe(report.shadow)
  expect(result.backend).toBe('webgpu')
  expect(result.host.renderer).toBe('WebGPU: test adapter')
  expect(result.timings.frames).toBe(3)
  expect(result.timings.medianMs).toBe(2)
  expect(result.timings.gcPauses).toBeNull()
})

it('reports informational on/off timing deltas only for matching same-backend workload pairs', () => {
  const provenance = { commit: 'abc1234', host: { platform: 'linux', cpus: 8, chrome: 'Chrome 150' } }
  const on = resultFromReport(report, provenance, '')
  const off = {
    ...on, scenario: 'shadows-point-off-50' as const,
    shadow: { composition: 'point' as const, enabled: false, quality: 'off' as const, casters: 50, lights: 1, warmupFrames: 5, measuredFrames: 60 },
  }
  const slow = { ...on, timings: { ...on.timings, medianMs: 100, p95Ms: 200, overBudget: true } }
  expect(shadowTimingDeltas([slow, { ...off, backend: 'webgl2' }])).toEqual([])
  expect(shadowTimingDeltas([slow, off])).toEqual([
    { backend: 'webgpu', scenario: 'shadows-point-on-50', controlScenario: 'shadows-point-off-50', medianDeltaMs: 98, p95DeltaMs: 197 },
  ])
})
