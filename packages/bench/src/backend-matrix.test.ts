import { expect, it } from 'vitest'
import { assertPageReport, assertResultMatrix, assertShadowResourceSweep, runBackendMatrix } from './backend-matrix.ts'
import { SCENARIOS, type ScenarioResult } from './results.ts'

it('rejects transported sweeps without the actual same-backend resource report', () => {
  expect(() => assertShadowResourceSweep([])).toThrow(/resource evidence/)
  expect(() => assertShadowResourceSweep([{ backend: 'webgl2', scenario: 'shadows-sun-on-50' } as never])).toThrow(/resource evidence/)
})

it('requires complete before-disposal GPU resource evidence on the designated shadow leg', () => {
  const report = {
    scenario: 'shadows-sun-on-50' as const, backend: 'webgl2' as const, renderer: 'GPU', frameMs: [1],
    counters: { drawCalls: 1, meshes: 1, visibleMeshes: 1, materials: 1, geometries: 1, textures: 0, textureSources: 0, entitiesSpawned: 1, entitiesDestroyed: 0, materialsCreated: 1, geometriesCreated: 1 },
  }
  expect(() => assertPageReport(report, { scenario: report.scenario, backend: 'webgl2', errors: [] })).toThrow(/resource evidence/)
  expect(() => assertPageReport({ ...report, resources: { passed: true } as never }, { scenario: report.scenario, backend: 'webgl2', errors: [] })).toThrow(/resource evidence/)
})

const SHADOW_CASES = [
  ['shadows-sun-off-50', 'sun', false, 'off', 50, 1],
  ['shadows-sun-off-200', 'sun', false, 'off', 200, 1],
  ['shadows-sun-on-50', 'sun', true, 'medium', 50, 1],
  ['shadows-sun-on-200', 'sun', true, 'medium', 200, 1],
  ['shadows-point-off-50', 'point', false, 'off', 50, 1],
  ['shadows-point-off-200', 'point', false, 'off', 200, 1],
  ['shadows-point-on-50', 'point', true, 'medium', 50, 1],
  ['shadows-point-on-200', 'point', true, 'medium', 200, 1],
  ['shadows-four-point-off-50', 'four-point', false, 'off', 50, 4],
  ['shadows-four-point-off-200', 'four-point', false, 'off', 200, 4],
  ['shadows-four-point-on-50', 'four-point', true, 'medium', 50, 4],
  ['shadows-four-point-on-200', 'four-point', true, 'medium', 200, 4],
] as const

function leg(backend: ScenarioResult['backend']): ScenarioResult[] {
  return SCENARIOS.map((scenario) => {
    const fixture = SHADOW_CASES.find(([name]) => name === scenario)
    const shadow = fixture ? {
      composition: fixture[1], enabled: fixture[2], quality: fixture[3], casters: fixture[4], lights: fixture[5],
      warmupFrames: 5, measuredFrames: 60,
    } : undefined
    return {
      scenario, backend, commit: 'abc1234',
      host: { platform: 'linux', cpus: 8, chrome: 'Chrome 150', renderer: backend },
      counters: {
        drawCalls: 1, meshes: 1, visibleMeshes: 1, geometries: 1, materials: 1,
        textures: 0, textureSources: 0, entitiesSpawned: 1, entitiesDestroyed: 0,
        materialsCreated: 1, geometriesCreated: 1,
      },
      timings: { frames: 60, medianMs: 1, p95Ms: 2, overBudget: false, gcPauses: null },
      ...(shadow ? { shadow } : {}),
    }
  })
}

it.each(SCENARIOS.filter((scenario) => scenario.startsWith('shadows-')))('rejects a complete matrix missing metadata for %s', (scenario) => {
  const matrix = [...leg('webgl2'), ...leg('webgpu')].map((result) => {
    if (result.backend !== 'webgpu' || result.scenario !== scenario) return result
    const missing = { ...result }
    delete missing.shadow
    return missing
  })
  expect(() => assertResultMatrix(matrix, 'both')).toThrow(/shadow/)
})

it.each([
  { composition: 'point' }, { enabled: false }, { quality: 'off' },
  { casters: 50 }, { lights: 1 }, { measuredFrames: 59 },
] as const)('rejects equally incorrect metadata in both backend legs: %j', (changed) => {
  const matrix = [...leg('webgl2'), ...leg('webgpu')].map((result) => result.scenario === 'shadows-four-point-on-200' && result.shadow
    ? { ...result, shadow: { ...result.shadow, ...changed } } : result)
  expect(() => assertResultMatrix(matrix, 'both')).toThrow(/shadow/)
})

it('does not allow shadow metadata on a historical scenario in a complete matrix', () => {
  const matrix = leg('webgl2').map((result) => result.scenario === 'static-sprites-1000'
    ? { ...result, shadow: { composition: 'sun' as const, enabled: true, quality: 'medium' as const, casters: 50, lights: 1, warmupFrames: 5, measuredFrames: 60 } }
    : result)
  expect(() => assertResultMatrix(matrix, 'webgl2')).toThrow(/shadow.*scenario/)
})

it('runs complete sweeps on both selected backends, or preserves automatic selection', async () => {
  const requested: (ScenarioResult['backend'] | undefined)[] = []
  const launch = (backend: ScenarioResult['backend'] | undefined): Promise<ScenarioResult[]> => {
    requested.push(backend)
    return Promise.resolve(leg(backend ?? 'webgpu'))
  }
  expect(await runBackendMatrix('both', launch)).toEqual([...leg('webgl2'), ...leg('webgpu')])
  expect(requested).toEqual(['webgl2', 'webgpu'])
  requested.length = 0
  expect(await runBackendMatrix(undefined, launch)).toEqual(leg('webgpu'))
  expect(requested).toEqual([undefined])
})

it('rejects a wrong backend immediately after a page, including fallback, and checks scenario identity', () => {
  const [sample] = leg('webgl2')
  if (!sample) throw new Error('fixture needs a scenario')
  const report = {
    scenario: 'static-sprites-1000' as const, backend: 'webgl2' as const,
    renderer: 'SwiftShader', counters: sample.counters, frameMs: [1, 2],
  }
  expect(() => assertPageReport(report, { scenario: 'static-sprites-1000', backend: 'webgl2', errors: [] })).not.toThrow()
  expect(() => assertPageReport(report, { scenario: 'static-sprites-1000', backend: 'webgpu', errors: [] })).toThrow(/backend.*webgpu.*webgl2/)
  expect(() => assertPageReport(report, { scenario: 'spawn-churn-10', backend: undefined, errors: [] })).toThrow(/scenario/)
})

it('does not accept rendering failures as a valid zero-draw benchmark', () => {
  const [sample] = leg('webgl2')
  if (!sample) throw new Error('fixture needs a scenario')
  const report = { ...sample, renderer: 'SwiftShader', counters: { ...sample.counters, drawCalls: 0 }, frameMs: [1] }
  const expected = { scenario: sample.scenario, backend: sample.backend, errors: ['console: shader compilation failed'] }
  expect(() => assertPageReport(report, expected)).toThrow(/shader compilation failed/)
  expect(() => assertPageReport({ ...report, frameMs: [] }, { ...expected, errors: [] })).toThrow(/frames/)
})

it('rejects swapped or incomplete backend legs before accepting an apparently complete combined matrix', async () => {
  await expect(runBackendMatrix('both', (backend) => Promise.resolve(leg(backend === 'webgl2' ? 'webgpu' : 'webgl2')))).rejects.toThrow(/backend/)
  await expect(runBackendMatrix('webgl2', () => Promise.resolve(leg('webgl2').slice(1)))).rejects.toThrow(/missing/)
})
