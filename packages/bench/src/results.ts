/** Prefix of the single stdout line that carries a run's results JSON. */
export const RESULTS_MARKER = 'WAICA_BENCH_RESULTS '

import type { RenderBackendName } from './draw-counter.ts'
import type { ScenarioName } from './sweep.ts'

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
  /** The WebGL renderer string: a real GPU, or a software one such as SwiftShader. */
  renderer: string
}

export interface ScenarioResult {
  scenario: ScenarioName
  commit: string
  /** The Render Backend the scenario drew through (ADR 0025): the browser's choice, recorded. */
  backend: RenderBackendName
  host: BenchHost
  counters: ScenarioCounters
  timings: ScenarioTimings
}

/** What the page reports for one scenario, before the runner adds host data. */
export interface PageScenarioReport {
  scenario: ScenarioName
  backend: RenderBackendName
  renderer: string
  counters: ScenarioCounters
  frameMs: number[]
}
