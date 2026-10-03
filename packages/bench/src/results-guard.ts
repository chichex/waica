import {
  SCENARIOS,
  type BenchHost,
  type GcPauses,
  type ScenarioCounters,
  type ScenarioResult,
  type ScenarioTimings,
} from './results.ts'

/**
 * Validates results read back from outside the process — a committed
 * baseline file or the remote host's stdout — before anything compares them.
 */
type Fields = Record<string, unknown>

function record(value: unknown, path: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`bench: invalid result: ${path} must be an object`)
  }
  return value as Fields
}

function numberAt(fields: Fields, key: string, path: string): number {
  const value = fields[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`bench: invalid result: ${path}.${key} must be a number`)
  }
  return value
}

function booleanAt(fields: Fields, key: string, path: string): boolean {
  const value = fields[key]
  if (typeof value !== 'boolean') throw new Error(`bench: invalid result: ${path}.${key} must be a boolean`)
  return value
}

function stringAt(fields: Fields, key: string, path: string): string {
  const value = fields[key]
  if (typeof value !== 'string') throw new Error(`bench: invalid result: ${path}.${key} must be a string`)
  return value
}

function parseCounters(value: unknown): ScenarioCounters {
  const fields = record(value, 'counters')
  const counter = (key: keyof ScenarioCounters): number => numberAt(fields, key, 'counters')
  return {
    drawCalls: counter('drawCalls'),
    meshes: counter('meshes'),
    visibleMeshes: counter('visibleMeshes'),
    geometries: counter('geometries'),
    materials: counter('materials'),
    textures: counter('textures'),
    textureSources: counter('textureSources'),
    entitiesSpawned: counter('entitiesSpawned'),
    entitiesDestroyed: counter('entitiesDestroyed'),
    materialsCreated: counter('materialsCreated'),
    geometriesCreated: counter('geometriesCreated'),
  }
}

function parseGcPauses(value: unknown): GcPauses | null {
  if (value === null) return null
  const fields = record(value, 'timings.gcPauses')
  return { count: numberAt(fields, 'count', 'timings.gcPauses'), totalMs: numberAt(fields, 'totalMs', 'timings.gcPauses') }
}

function parseTimings(value: unknown): ScenarioTimings {
  const fields = record(value, 'timings')
  return {
    frames: numberAt(fields, 'frames', 'timings'),
    medianMs: numberAt(fields, 'medianMs', 'timings'),
    p95Ms: numberAt(fields, 'p95Ms', 'timings'),
    overBudget: booleanAt(fields, 'overBudget', 'timings'),
    gcPauses: parseGcPauses(fields.gcPauses),
  }
}

function parseHost(value: unknown): BenchHost {
  const fields = record(value, 'host')
  return {
    platform: stringAt(fields, 'platform', 'host'),
    cpus: numberAt(fields, 'cpus', 'host'),
    chrome: stringAt(fields, 'chrome', 'host'),
    renderer: stringAt(fields, 'renderer', 'host'),
  }
}

function backendAt(fields: Fields): ScenarioResult['backend'] {
  const value = fields.backend
  if (value !== 'webgpu' && value !== 'webgl2') {
    throw new Error('bench: invalid result: result.backend must be "webgpu" or "webgl2"')
  }
  return value
}

export function parseScenarioResult(value: unknown): ScenarioResult {
  const fields = record(value, 'result')
  const scenario = SCENARIOS.find((name) => name === fields.scenario)
  if (!scenario) throw new Error(`bench: invalid result: unknown scenario ${JSON.stringify(fields.scenario)}`)
  return {
    scenario,
    commit: stringAt(fields, 'commit', 'result'),
    backend: backendAt(fields),
    host: parseHost(fields.host),
    counters: parseCounters(fields.counters),
    timings: parseTimings(fields.timings),
  }
}

export function parseScenarioResults(value: unknown): ScenarioResult[] {
  if (!Array.isArray(value)) throw new Error('bench: invalid results: expected an array')
  return value.map(parseScenarioResult)
}
