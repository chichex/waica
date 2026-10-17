import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyBaselineFlags, baselineFile, counterDiffsFromBaselines, writeBaselines } from './baseline-files.ts'
import { SCENARIOS, type ScenarioResult } from './results.ts'

let directory = ''
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'waica-baseline-test-')) })
afterEach(() => {
  vi.restoreAllMocks()
  if (directory) rmSync(directory, { recursive: true })
  directory = ''
})

function result(backend: ScenarioResult['backend'] = 'webgl2'): ScenarioResult {
  return {
    scenario: 'static-sprites-1000', backend, commit: 'abc1234',
    host: { platform: 'linux', cpus: 8, chrome: 'Chrome 150', renderer: backend },
    counters: {
      drawCalls: 1, meshes: 1, visibleMeshes: 1, geometries: 1, materials: 1,
      textures: 0, textureSources: 0, entitiesSpawned: 1, entitiesDestroyed: 0,
      materialsCreated: 1, geometriesCreated: 1,
    },
    timings: { frames: 60, medianMs: 1, p95Ms: 2, overBudget: false, gcPauses: null },
  }
}

it('writes backend-qualified files without changing historical baselines or the other API', () => {
  const legacy = join(directory, 'static-sprites-1000.json')
  writeFileSync(legacy, 'historical bytes\n')
  writeBaselines([result(), result('webgpu')], directory)
  expect(readdirSync(directory).sort()).toEqual([
    'static-sprites-1000.json', 'webgl2--static-sprites-1000.json', 'webgpu--static-sprites-1000.json',
  ])
  expect(readFileSync(legacy, 'utf8')).toBe('historical bytes\n')
  expect(JSON.parse(readFileSync(baselineFile('static-sprites-1000', 'webgpu', directory), 'utf8'))).toEqual(result('webgpu'))
  const webgpuBytes = readFileSync(join(directory, 'webgpu--static-sprites-1000.json'), 'utf8')
  writeBaselines([{ ...result(), commit: 'fff0000' }], directory)
  expect(readFileSync(join(directory, 'webgpu--static-sprites-1000.json'), 'utf8')).toBe(webgpuBytes)
})

it('reads a legacy baseline only for its embedded backend, with qualified files taking precedence', () => {
  const legacy = join(directory, 'static-sprites-1000.json')
  const legacyBytes = `${JSON.stringify(result())}\n`
  writeFileSync(legacy, legacyBytes)
  expect(counterDiffsFromBaselines([result()], directory)).toEqual([])
  expect(() => counterDiffsFromBaselines([result('webgpu')], directory)).toThrow(/backend.*webgl2.*webgpu/)
  writeBaselines([result('webgpu')], directory)
  expect(counterDiffsFromBaselines([result('webgpu')], directory)).toEqual([])
  writeBaselines([{ ...result(), counters: { ...result().counters, drawCalls: 2 } }], directory)
  expect(counterDiffsFromBaselines([result()], directory)).toEqual([
    { scenario: 'static-sprites-1000', counter: 'drawCalls', baseline: 2, actual: 1 },
  ])
  expect(readFileSync(legacy, 'utf8')).toBe(legacyBytes)
})

it('refuses a qualified file with another embedded backend on read and before any writes', () => {
  const corrupt = join(directory, 'webgpu--static-sprites-1000.json')
  const bytes = JSON.stringify(result())
  writeFileSync(corrupt, bytes)
  expect(() => counterDiffsFromBaselines([result('webgpu')], directory)).toThrow(/backend/)
  expect(() => writeBaselines([result(), result('webgpu')], directory)).toThrow(/backend/)
  expect(readFileSync(corrupt, 'utf8')).toBe(bytes)
  expect(readdirSync(directory)).toEqual(['webgpu--static-sprites-1000.json'])
})

it('rejects duplicate write identities before creating files and reports missing baselines', () => {
  expect(() => writeBaselines([result(), result()], directory)).toThrow(/duplicate.*webgl2.*static-sprites-1000/)
  expect(readdirSync(directory)).toEqual([])
  expect(() => counterDiffsFromBaselines([result('webgpu')], directory)).toThrow(/no baseline.*webgpu.*static-sprites-1000/)
})

it('does not accept an incomplete run even when no baseline flag was requested', () => {
  expect(() => applyBaselineFlags([result()], { check: false, updateBaseline: false })).toThrow(/missing/)
})

it('updates and checks the complete selected matrix locally, ignoring timing changes', () => {
  vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const matrix = (['webgl2', 'webgpu'] as const).flatMap((backend) => SCENARIOS.map((scenario) => ({ ...result(backend), scenario })))
  expect(applyBaselineFlags(matrix, { check: false, updateBaseline: true, backend: 'both' }, directory)).toBe(true)
  expect(applyBaselineFlags(matrix, { check: true, updateBaseline: false, backend: 'both' }, directory)).toBe(true)
  const slower = matrix.map((entry) => ({ ...entry, timings: { ...entry.timings, medianMs: 100, p95Ms: 200, overBudget: true } }))
  expect(applyBaselineFlags(slower, { check: true, updateBaseline: false, backend: 'both' }, directory)).toBe(true)
  const changed = matrix.map((entry) => ({ ...entry, counters: { ...entry.counters, drawCalls: 2 } }))
  expect(applyBaselineFlags(changed, { check: true, updateBaseline: false, backend: 'both' }, directory)).toBe(false)
})

it('does not fall back to legacy when a qualified baseline has a wrong scenario or invalid contents', () => {
  writeFileSync(join(directory, 'static-sprites-1000.json'), JSON.stringify(result()))
  const qualified = baselineFile('static-sprites-1000', 'webgl2', directory)
  writeFileSync(qualified, JSON.stringify({ ...result(), scenario: 'spawn-churn-10' }))
  expect(() => counterDiffsFromBaselines([result()], directory)).toThrow(/static-sprites-1000/)
  expect(() => writeBaselines([result()], directory)).toThrow(/static-sprites-1000/)
  writeFileSync(qualified, '{}')
  expect(() => counterDiffsFromBaselines([result()], directory)).toThrow(/invalid result/)
})
