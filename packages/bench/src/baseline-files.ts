import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compareCounters, formatCounterDiffs, type CounterDiff } from './baseline.ts'
import { parseScenarioResult } from './results-guard.ts'
import type { ScenarioName, ScenarioResult } from './results.ts'

/** The committed baseline of one scenario, recorded on the benchmark host. */
export function baselineFile(scenario: ScenarioName): string {
  return fileURLToPath(new URL(`../baselines/${scenario}.json`, import.meta.url))
}

export function writeBaselines(results: readonly ScenarioResult[]): void {
  for (const result of results) {
    writeFileSync(baselineFile(result.scenario), `${JSON.stringify(result, null, 2)}\n`)
  }
}

export function counterDiffsFromBaselines(results: readonly ScenarioResult[]): CounterDiff[] {
  return results.flatMap((result) => {
    const file = baselineFile(result.scenario)
    if (!existsSync(file)) throw new Error(`bench: no baseline for ${result.scenario} (${file})`)
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const baseline = parseScenarioResult(parsed)
    return compareCounters(baseline, result)
  })
}

/** Applies --update-baseline and --check to a run's results; returns false when the check failed. */
export function applyBaselineFlags(
  results: readonly ScenarioResult[],
  flags: { check: boolean; updateBaseline: boolean },
): boolean {
  if (flags.updateBaseline) writeBaselines(results)
  if (!flags.check) return true
  const diffs = counterDiffsFromBaselines(results)
  if (diffs.length === 0) {
    process.stderr.write('bench: counters match the baselines\n')
    return true
  }
  process.stderr.write(`bench: counters differ from the baselines:\n${formatCounterDiffs(diffs)}\n`)
  return false
}
