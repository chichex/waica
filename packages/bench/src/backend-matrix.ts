import { SCENARIOS, type PageScenarioReport, type ScenarioName, type ScenarioResult } from './results.ts'
import type { BackendSelection } from './bench-args.ts'
import type { ShadowWorkloadInfo } from './shadow-workload.ts'
import { isShadowResourceReport } from './shadow-resources.ts'

type Backend = ScenarioResult['backend']

export interface PageExpectation {
  scenario: ScenarioName
  backend: Backend | undefined
  errors: readonly string[]
}

/** Required for live/remote runs, not for reading one historical counter baseline. */
export function assertShadowResourceSweep(results: readonly ScenarioResult[]): void {
  if (!results.length) throw new Error('bench: missing GPU resource evidence')
  for (const backend of new Set(results.map((result) => result.backend))) {
    const carrier = results.find((result) => result.backend === backend && result.scenario === 'shadows-sun-on-50')
    if (!isShadowResourceReport(carrier?.resources) || carrier.resources.backend !== backend) {
      throw new Error(`bench: missing or invalid ${backend} GPU resource evidence`)
    }
  }
}

/** Assert the actual report after every page, before accepting any measurements. */
export function assertPageReport(report: PageScenarioReport, expected: PageExpectation): void {
  if (expected.errors.length > 0) {
    throw new Error(`bench: page failed for ${expected.scenario}:\n${expected.errors.join('\n')}`)
  }
  if (report.scenario !== expected.scenario) {
    throw new Error(`bench: scenario expected ${expected.scenario}, got ${report.scenario}`)
  }
  if (expected.backend !== undefined && report.backend !== expected.backend) {
    throw new Error(`bench: backend expected ${expected.backend}, got ${report.backend} for ${expected.scenario}; fallback is not accepted`)
  }
  if (report.frameMs.length === 0 || report.frameMs.some((ms) => !Number.isFinite(ms) || ms < 0)) {
    throw new Error(`bench: invalid measured frames for ${expected.scenario}`)
  }
  if (report.scenario === 'shadows-sun-on-50' && (!isShadowResourceReport(report.resources) || report.resources.backend !== report.backend)) {
    throw new Error('bench: missing or invalid GPU resource evidence for shadow sweep')
  }
}

/** Each selected capability set needs its own browser, not a Game option. */
export async function runBackendMatrix(
  selection: BackendSelection | undefined,
  runLeg: (backend: Backend | undefined) => Promise<ScenarioResult[]>,
): Promise<ScenarioResult[]> {
  const backends: (Backend | undefined)[] = selection === 'both' ? ['webgl2', 'webgpu'] : [selection]
  const results: ScenarioResult[] = []
  for (const backend of backends) {
    const leg = await runLeg(backend)
    assertResultMatrix(leg, backend)
    results.push(...leg)
  }
  assertResultMatrix(results, selection)
  return results
}

function matrixResultKeys(results: readonly ScenarioResult[], backends: readonly string[]): Set<string> {
  const seen = new Set<string>()
  for (const result of results) {
    if (!backends.includes(result.backend)) {
      throw new Error(`bench: backend expected ${backends.join(' or ')}, got ${result.backend} for ${result.scenario}; fallback is not accepted`)
    }
    const key = `${result.backend}--${result.scenario}`
    if (seen.has(key)) throw new Error(`bench: duplicate result ${key}`)
    seen.add(key)
  }
  return seen
}

const SHADOW_FIELDS: readonly (keyof ShadowWorkloadInfo)[] = [
  'composition', 'enabled', 'quality', 'casters', 'lights', 'warmupFrames', 'measuredFrames',
]

function assertMatchingShadowWorkloads(results: readonly ScenarioResult[]): void {
  const workloads = new Map<ScenarioName, ShadowWorkloadInfo>()
  for (const { scenario, shadow } of results) {
    if (!shadow) continue
    const previous = workloads.get(scenario)
    if (previous && !SHADOW_FIELDS.every((key) => previous[key] === shadow[key])) {
      throw new Error(`bench: shadow metadata differs across backend matrix for ${scenario}`)
    }
    workloads.set(scenario, shadow)
  }
}

/** A run is a complete sweep; an individual historical baseline is not. */
export function assertResultMatrix(results: readonly ScenarioResult[], selection?: BackendSelection): void {
  const backend = results[0]?.backend
  if (!backend) throw new Error('bench: empty result matrix')
  const backends = selection === 'both' ? ['webgl2', 'webgpu'] : [selection ?? backend]
  const seen = matrixResultKeys(results, backends)
  assertMatchingShadowWorkloads(results)
  for (const selected of backends) {
    for (const scenario of SCENARIOS) {
      if (!seen.has(`${selected}--${scenario}`)) {
        throw new Error(`bench: missing result ${selected}--${scenario}`)
      }
    }
  }
}
