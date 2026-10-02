/** Prefix of the single stdout line that carries a run's results JSON. */
export const RESULTS_MARKER = 'WAICA_BENCH_RESULTS '

/** The three benchmark scenarios, in run order. */
export const SCENARIOS = ['static-sprites', 'spawn-churn', 'animated-sprites'] as const
export type ScenarioName = (typeof SCENARIOS)[number]

/** Deterministic: same commit and inputs give the same values on any host. */
export interface ScenarioCounters {
  /** Draw calls of the last rendered frame. */
  drawCalls: number
  meshes: number
  visibleMeshes: number
  geometries: number
  materials: number
  textures: number
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
  /** Wall time of one stepped-and-rendered frame. */
  medianMs: number
  p95Ms: number
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
}

export interface ScenarioResult {
  scenario: ScenarioName
  commit: string
  host: BenchHost
  counters: ScenarioCounters
  timings: ScenarioTimings
}

/** What the page reports for one scenario, before the runner adds host data. */
export interface PageScenarioReport {
  scenario: ScenarioName
  counters: ScenarioCounters
  frameMs: number[]
}
