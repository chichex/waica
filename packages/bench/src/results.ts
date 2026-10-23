import type { RenderBackend } from '@waica/engine'
import type { ShadowResourceReport } from './shadow-resources.ts'
import type { ScenarioName } from './sweep.ts'
import type { ShadowWorkloadInfo } from './shadow-workload.ts'
import { LOOP_END_MARK, LOOP_START_MARK, gcPausesFromTrace, isOverBudget, summarizeFrames } from './timings.ts'

/** Prefix of the single stdout line that carries a run's results JSON. */
export const RESULTS_MARKER = 'WAICA_BENCH_RESULTS '

export { SCENARIOS, type ScenarioName } from './sweep.ts'

/** Deterministic: same commit and inputs give the same values on any host. */
export interface ScenarioCounters {
  /** Draw calls of the last rendered frame, as three's renderer.info counts them. */
  drawCalls: number
  meshes: number
  visibleMeshes: number
  geometries: number
  materials: number
  /** Texture objects; clones of one base each count. */
  textures: number
  /** Distinct `texture.source`: the image data that actually uploads to the GPU. */
  textureSources: number
  entitiesSpawned: number
  entitiesDestroyed: number
  materialsCreated: number
  geometriesCreated: number
}

export interface GcPauses {
  count: number
  totalMs: number
}

/** Host-dependent and informational: never compared by --check. */
export interface ScenarioTimings {
  frames: number
  /** Wall time of one stepped, rendered and GPU-finished frame. */
  medianMs: number
  p95Ms: number
  /** p95Ms over one 60 fps frame (timings.ts FRAME_BUDGET_MS). */
  overBudget: boolean
  /**
   * GC events from a Chrome trace inside the measured step loop only (between
   * the timings.ts loop marks), so setup and teardown do not count; null when
   * the trace or its marks were unavailable.
   */
  gcPauses: GcPauses | null
}

export interface BenchHost {
  platform: string
  cpus: number
  chrome: string
  /** What the scenario drew on: the WebGPU adapter (`WebGPU: …`), or the WebGL renderer string — a real GPU, or a software one such as SwiftShader. */
  renderer: string
}

export interface ScenarioResult {
  resources?: ShadowResourceReport
  scenario: ScenarioName
  commit: string
  /** The Render Backend the scenario drew through (ADR 0025): the browser's choice, recorded. */
  backend: RenderBackend
  host: BenchHost
  counters: ScenarioCounters
  timings: ScenarioTimings
  shadow?: ShadowWorkloadInfo
}

/** What the page reports for one scenario, before the runner adds host data. */
export interface PageScenarioReport {
  resources?: ShadowResourceReport
  scenario: ScenarioName
  backend: RenderBackend
  renderer: string
  counters: ScenarioCounters
  frameMs: number[]
  shadow?: ShadowWorkloadInfo
}

export interface ResultProvenance {
  commit: string
  host: Omit<BenchHost, 'renderer'>
}

/** The Node-side envelope; workload metadata is forwarded without reinterpretation. */
export function resultFromReport(report: PageScenarioReport, provenance: ResultProvenance, trace: string): ScenarioResult {
  const frames = summarizeFrames(report.frameMs)
  return {
    scenario: report.scenario, commit: provenance.commit, backend: report.backend,
    host: { ...provenance.host, renderer: report.renderer }, counters: report.counters,
    timings: {
      ...frames, overBudget: isOverBudget(frames.p95Ms),
      gcPauses: gcPausesFromTrace(trace, { start: LOOP_START_MARK, end: LOOP_END_MARK }),
    },
    ...(report.shadow !== undefined ? { shadow: report.shadow } : {}),
    ...(report.resources !== undefined ? { resources: report.resources } : {}),
  }
}

export interface ShadowTimingDelta {
  backend: RenderBackend
  scenario: ScenarioName
  controlScenario: ScenarioName
  medianDeltaMs: number
  p95DeltaMs: number
}

function shadowPairKey(result: ScenarioResult, shadow: ShadowWorkloadInfo): string {
  return [result.backend, result.commit, shadow.composition, shadow.casters, shadow.lights, shadow.warmupFrames, shadow.measuredFrames].join('/')
}

/** Informational only: no FPS threshold and no cross-backend timing comparisons. */
export function shadowTimingDeltas(results: readonly ScenarioResult[]): ShadowTimingDelta[] {
  const controls = new Map<string, ScenarioResult>()
  for (const result of results) {
    if (result.shadow && !result.shadow.enabled) controls.set(shadowPairKey(result, result.shadow), result)
  }
  const deltas: ShadowTimingDelta[] = []
  for (const result of results) {
    if (!result.shadow?.enabled) continue
    const control = controls.get(shadowPairKey(result, result.shadow))
    if (!control) continue
    deltas.push({
      backend: result.backend, scenario: result.scenario, controlScenario: control.scenario,
      medianDeltaMs: result.timings.medianMs - control.timings.medianMs,
      p95DeltaMs: result.timings.p95Ms - control.timings.p95Ms,
    })
  }
  return deltas
}
