import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { compareCounters, formatCounterDiffs, type CounterDiff } from './baseline.ts'
import { assertResultMatrix } from './backend-matrix.ts'
import type { BackendSelection } from './bench-args.ts'
import { parseScenarioResult } from './results-guard.ts'
import type { ScenarioName, ScenarioResult } from './results.ts'

const BASELINE_DIRECTORY = fileURLToPath(new URL('../baselines/', import.meta.url))

/** New baselines always identify both the Render Backend and scenario. */
export function baselineFile(scenario: ScenarioName, backend: ScenarioResult['backend'], directory = BASELINE_DIRECTORY): string {
  return join(directory, `${backend}--${scenario}.json`)
}

export function writeBaselines(results: readonly ScenarioResult[], directory = BASELINE_DIRECTORY): void {
  const seen = new Set<string>()
  // Validate every destination before writing any: counter updates are allowed,
  // but an existing file with another identity must never be overwritten.
  for (const result of results) {
    parseScenarioResult(result)
    const file = baselineFile(result.scenario, result.backend, directory)
    if (seen.has(file)) throw new Error(`bench: duplicate baseline ${result.backend}--${result.scenario}`)
    seen.add(file)
    if (!existsSync(file)) continue
    const existing: unknown = JSON.parse(readFileSync(file, 'utf8'))
    compareCounters(parseScenarioResult(existing), result)
  }
  for (const result of results) {
    writeFileSync(baselineFile(result.scenario, result.backend, directory), `${JSON.stringify(result, null, 2)}\n`)
  }
}

export function counterDiffsFromBaselines(results: readonly ScenarioResult[], directory = BASELINE_DIRECTORY): CounterDiff[] {
  return results.flatMap((result) => {
    const qualified = baselineFile(result.scenario, result.backend, directory)
    const file = existsSync(qualified) ? qualified : join(directory, `${result.scenario}.json`)
    if (!existsSync(file)) throw new Error(`bench: no baseline for ${result.backend}--${result.scenario} (${file})`)
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const baseline = parseScenarioResult(parsed)
    return compareCounters(baseline, result)
  })
}

/** Applies --update-baseline and --check to a run's results; returns false when the check failed. */
export function applyBaselineFlags(
  results: readonly ScenarioResult[],
  flags: { check: boolean; updateBaseline: boolean; backend?: BackendSelection },
  directory = BASELINE_DIRECTORY,
): boolean {
  assertResultMatrix(results, flags.backend)
  if (flags.updateBaseline) writeBaselines(results, directory)
  if (!flags.check) return true
  const diffs = counterDiffsFromBaselines(results, directory)
  if (diffs.length === 0) {
    process.stderr.write('bench: counters match the baselines\n')
    return true
  }
  process.stderr.write(`bench: counters differ from the baselines:\n${formatCounterDiffs(diffs)}\n`)
  return false
}
