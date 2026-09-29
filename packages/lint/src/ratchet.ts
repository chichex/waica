import { relative, sep } from 'node:path'

/** Warning counts per repo-relative file path, then per rule id. */
export type WarningCounts = Record<string, Record<string, number>>

/** The slice of an ESLint result the ratchet reads. */
export interface LintResultLike {
  readonly filePath: string
  readonly messages: readonly { readonly ruleId: string | null; readonly severity: number }[]
}

export interface Regression {
  readonly file: string
  readonly rule: string
  readonly allowed: number
  readonly actual: number
}

const WARNING = 1
const NO_RULE = '(no-rule)'

function toPosixRelative(root: string, filePath: string): string {
  return relative(root, filePath).split(sep).join('/')
}

/** Counts SHOULD-level findings (ESLint warnings) per file and rule. */
export function countWarnings(results: readonly LintResultLike[], root: string): WarningCounts {
  const counts: WarningCounts = {}
  for (const result of results) {
    for (const message of result.messages) {
      if (message.severity !== WARNING) continue
      const file = toPosixRelative(root, result.filePath)
      const rule = message.ruleId ?? NO_RULE
      const perRule = (counts[file] ??= {})
      perRule[rule] = (perRule[rule] ?? 0) + 1
    }
  }
  return counts
}

/**
 * Lists every file and rule whose warning count grew past the committed
 * baseline. A file or rule the baseline does not list is allowed zero.
 */
export function compareToBaseline(current: WarningCounts, baseline: WarningCounts): Regression[] {
  const regressions: Regression[] = []
  for (const [file, perRule] of Object.entries(current)) {
    for (const [rule, actual] of Object.entries(perRule)) {
      const allowed = baseline[file]?.[rule] ?? 0
      if (actual > allowed) regressions.push({ file, rule, allowed, actual })
    }
  }
  return regressions
}

/** Parses a committed baseline, rejecting anything but file → rule → count. */
export function parseBaseline(text: string): WarningCounts {
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed)) throw new Error('lint baseline must be a JSON object')
  const baseline: WarningCounts = {}
  for (const [file, perRule] of Object.entries(parsed)) {
    if (!isRecord(perRule)) throw new Error(`lint baseline entry ${file} must be an object`)
    const counts: Record<string, number> = {}
    for (const [rule, count] of Object.entries(perRule)) {
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        throw new Error(`lint baseline count ${file} ${rule} must be a non-negative integer`)
      }
      counts[rule] = count
    }
    baseline[file] = counts
  }
  return baseline
}

/** Serializes counts with sorted keys so baseline diffs stay reviewable. */
export function formatBaseline(counts: WarningCounts): string {
  const sorted: WarningCounts = {}
  for (const file of Object.keys(counts).sort()) {
    const perRule = counts[file] ?? {}
    const rules: Record<string, number> = {}
    for (const rule of Object.keys(perRule).sort()) rules[rule] = perRule[rule] ?? 0
    sorted[file] = rules
  }
  return `${JSON.stringify(sorted, null, 2)}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
