import type { ScenarioCounters, ScenarioName, ScenarioResult } from './results.ts'

export interface CounterDiff {
  scenario: ScenarioName
  counter: keyof ScenarioCounters
  baseline: number
  actual: number
}

/** Differences in deterministic counters only; timings, commit and host never count. */
export function compareCounters(baseline: ScenarioResult, actual: ScenarioResult): CounterDiff[] {
  if (baseline.scenario !== actual.scenario) {
    throw new Error(`bench: cannot compare baseline ${baseline.scenario} with results of ${actual.scenario}`)
  }
  const diffs: CounterDiff[] = []
  const keys = Object.keys(baseline.counters) as (keyof ScenarioCounters)[]
  for (const counter of keys) {
    if (baseline.counters[counter] === actual.counters[counter]) continue
    diffs.push({
      scenario: baseline.scenario,
      counter,
      baseline: baseline.counters[counter],
      actual: actual.counters[counter],
    })
  }
  return diffs
}

export function formatCounterDiffs(diffs: readonly CounterDiff[]): string {
  return diffs
    .map((d) => `  ${d.scenario}: ${d.counter} ${d.baseline} -> ${d.actual}`)
    .join('\n')
}
