import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyBaselineFlags, baselineFile, counterDiffsFromBaselines, writeBaselines } from './baseline-files.ts'
import { SCENARIOS, type ScenarioName, type ScenarioResult } from './results.ts'
import type { ShadowResourceReport } from './shadow-resources.ts'

let directory = ''
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'waica-baseline-test-')) })
afterEach(() => {
  vi.restoreAllMocks()
  if (directory) rmSync(directory, { recursive: true })
  directory = ''
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

function result(backend: ScenarioResult['backend'] = 'webgl2', scenario: ScenarioName = 'static-sprites-1000'): ScenarioResult {
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
}

function resourceReport(): ShadowResourceReport {
  const phases = ['low', 'low-edited', 'medium', 'high', 'resized', 'off', 'reactivated', 'light-destroyed', 'scene-2d', 'scene-3d', 'empty']
  const memory = {
    attributes: 8, attributesSize: 128, geometries: 2, indexAttributes: 2, indexAttributesSize: 48,
    indirectStorageAttributes: 0, indirectStorageAttributesSize: 0, programs: 3, programsSize: 64,
    readbackBuffers: 0, readbackBuffersSize: 0, renderTargets: 2, storageAttributes: 0,
    storageAttributesSize: 0, textures: 4, texturesSize: 1024, uniformBuffers: 3, uniformBuffersSize: 256, total: 1520,
  }
  return {
    backend: 'webgl2', cycles: 10, warmupCycles: 3, passed: true, measuredBeforeDispose: true, phases,
    checkpoints: Array.from({ length: 11 }, (_, cycle) => phases.map((phase, index) => {
      const liveTargets = ['off', 'scene-2d', 'empty'].includes(phase) ? 0 : phase === 'light-destroyed' ? 4 : 5
      const retiredTargets = (cycle * 11 + index + 1) * 5
      return {
        phase, cycle, memory,
        shadow: {
          liveTargets, liveTextures: liveTargets * 2,
          createdTextures: (retiredTargets + liveTargets) * 2, destroyedTextures: retiredTargets * 2,
          initializedTargets: retiredTargets + liveTargets, targetDisposals: retiredTargets,
        },
      }
    })).flat(),
  }
}

it('writes only the counter baseline envelope while retaining raw resources in the live result', () => {
  const measured: ScenarioResult = {
    ...result(), scenario: 'shadows-sun-on-50', resources: resourceReport(),
    shadow: { composition: 'sun', enabled: true, quality: 'medium', casters: 50, lights: 1, warmupFrames: 5, measuredFrames: 60 },
  }
  writeBaselines([measured], directory)
  const { resources, ...baseline } = measured
  const stored: unknown = JSON.parse(readFileSync(baselineFile(measured.scenario, measured.backend, directory), 'utf8'))
  expect(stored).not.toHaveProperty('resources')
  expect(stored).toEqual(baseline)
  expect(measured.resources).toBe(resources)
  expect(measured.resources?.checkpoints).toHaveLength(121)
})

it('still validates live GPU evidence before writing any counter baselines', () => {
  const invalid: ScenarioResult = {
    ...result('webgl2', 'shadows-sun-on-50'), resources: { ...resourceReport(), checkpoints: [] },
  }
  expect(() => writeBaselines([result(), invalid], directory)).toThrow(/resource evidence/)
  expect(readdirSync(directory)).toEqual([])
})

it.each(['read', 'update'] as const)('ignores obsolete, unused resource schemas during baseline %s', (operation) => {
  const current: ScenarioResult = {
    ...result(), scenario: 'shadows-sun-on-50',
    shadow: { composition: 'sun', enabled: true, quality: 'medium', casters: 50, lights: 1, warmupFrames: 5, measuredFrames: 60 },
  }
  const file = baselineFile(current.scenario, current.backend, directory)
  const historical = { ...current, resources: { phases: ['obsolete'], checkpoints: [{ memory: { oldMetric: 3 } }] } }
  const bytes = JSON.stringify(historical)
  writeFileSync(file, bytes)
  if (operation === 'read') {
    expect(counterDiffsFromBaselines([current], directory)).toEqual([])
    expect(readFileSync(file, 'utf8')).toBe(bytes)
  } else {
    const updated = { ...current, commit: 'fff0000' }
    writeBaselines([updated], directory)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(updated)
  }
})

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
  expect(() => counterDiffsFromBaselines([result('webgpu')], directory)).toThrow(/no baseline for webgpu--static-sprites-1000/)
  writeBaselines([result('webgpu')], directory)
  expect(counterDiffsFromBaselines([result('webgpu')], directory)).toEqual([])
  writeBaselines([{ ...result(), counters: { ...result().counters, drawCalls: 2 } }], directory)
  expect(counterDiffsFromBaselines([result()], directory)).toEqual([
    { scenario: 'static-sprites-1000', counter: 'drawCalls', baseline: 2, actual: 1 },
  ])
  expect(readFileSync(legacy, 'utf8')).toBe(legacyBytes)
})

it('ignores obsolete resources in a matching legacy baseline without rewriting it', () => {
  const current = result('webgl2', 'shadows-sun-on-50')
  const legacy = join(directory, `${current.scenario}.json`)
  const bytes = JSON.stringify({ ...current, resources: { phases: ['obsolete'] } })
  writeFileSync(legacy, bytes)
  expect(counterDiffsFromBaselines([current], directory)).toEqual([])
  expect(readFileSync(legacy, 'utf8')).toBe(bytes)
})

it('does not validate an unused legacy schema from another backend', () => {
  writeFileSync(join(directory, 'static-sprites-1000.json'), JSON.stringify({ backend: 'webgl2' }))
  expect(() => counterDiffsFromBaselines([result('webgpu')], directory)).toThrow(/no baseline for webgpu--static-sprites-1000/)
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
  const matrix = (['webgl2', 'webgpu'] as const).flatMap((backend) => SCENARIOS.map((scenario) => result(backend, scenario)))
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
  const corruptBytes = readFileSync(qualified, 'utf8')
  expect(() => writeBaselines([result('webgpu'), result()], directory)).toThrow(/static-sprites-1000/)
  expect(readFileSync(qualified, 'utf8')).toBe(corruptBytes)
  expect(readdirSync(directory).sort()).toEqual(['static-sprites-1000.json', 'webgl2--static-sprites-1000.json'])
  writeFileSync(qualified, '{}')
  expect(() => counterDiffsFromBaselines([result()], directory)).toThrow(/invalid result/)
})
