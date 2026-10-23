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

/** Counter baselines never consume GPU evidence; old probe schemas must not lock updates. */
function parseCounterBaseline(value: unknown): ScenarioResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return parseScenarioResult(value)
  const baseline: Record<string, unknown> = { ...value }
  delete baseline.resources
  return parseScenarioResult(baseline)
}

export function writeBaselines(results: readonly ScenarioResult[], directory = BASELINE_DIRECTORY): void {
  const validated = results.map((result) => parseScenarioResult(result))
  const seen = new Set<string>()
  // Validate every destination before writing any: counter updates are allowed,
  // but an existing file with another identity must never be overwritten.
  for (const result of validated) {
    const file = baselineFile(result.scenario, result.backend, directory)
    if (seen.has(file)) throw new Error(`bench: duplicate baseline ${result.backend}--${result.scenario}`)
    seen.add(file)
    if (!existsSync(file)) continue
    const existing: unknown = JSON.parse(readFileSync(file, 'utf8'))
    compareCounters(parseCounterBaseline(existing), result)
  }
  for (const result of validated) {
    const baseline = { ...result }
    delete baseline.resources
    writeFileSync(baselineFile(result.scenario, result.backend, directory), `${JSON.stringify(baseline, null, 2)}\n`)
  }
}

export function counterDiffsFromBaselines(results: readonly ScenarioResult[], directory = BASELINE_DIRECTORY): CounterDiff[] {
  return results.flatMap((result) => {
    const qualified = baselineFile(result.scenario, result.backend, directory)
    const hasQualified = existsSync(qualified)
    const file = hasQualified ? qualified : join(directory, `${result.scenario}.json`)
    const missing = `bench: no baseline for ${result.backend}--${result.scenario} (${qualified})`
    if (!existsSync(file)) throw new Error(missing)
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!hasQualified && (typeof parsed !== 'object' || parsed === null || !('backend' in parsed) || parsed.backend !== result.backend)) {
      throw new Error(missing)
    }
    const baseline = parseCounterBaseline(parsed)
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
