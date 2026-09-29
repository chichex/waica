// Root `pnpm lint`: runs ESLint over the monorepo, fails on any error, and
// holds SHOULD-level warnings to the committed per-file, per-rule baseline.
// `--update-baseline` rewrites lint-baseline.json from the current counts.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import {
  compareToBaseline,
  countWarnings,
  formatBaseline,
  parseBaseline,
  type Regression,
} from './ratchet.ts'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const configFile = fileURLToPath(new URL('../eslint.config.mjs', import.meta.url))
const baselineFile = fileURLToPath(new URL('../lint-baseline.json', import.meta.url))

const LINT_PATTERNS = [
  'packages/*/src/**/*.{ts,tsx}',
  'examples/*/src/**/*.ts',
  'scripts/**/*.mjs',
]

function describeRegression(regression: Regression): string {
  const { file, rule, allowed, actual } = regression
  return `  ${file}: ${rule} has ${actual} warning(s), baseline allows ${allowed}`
}

async function main(): Promise<void> {
  const started = performance.now()
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: configFile })
  const results = await eslint.lintFiles(LINT_PATTERNS)
  const errors = ESLint.getErrorResults(results)
  const errorCount = errors.reduce((sum, result) => sum + result.errorCount, 0)
  if (errorCount > 0) {
    const formatter = await eslint.loadFormatter('stylish')
    process.stdout.write(await formatter.format(errors))
  }

  const counts = countWarnings(results, repoRoot)
  const warningCount = Object.values(counts)
    .flatMap((perRule) => Object.values(perRule))
    .reduce((sum, count) => sum + count, 0)

  if (process.argv.includes('--update-baseline')) {
    writeFileSync(baselineFile, formatBaseline(counts))
    process.stdout.write(`lint: baseline rewritten with ${warningCount} warning(s)\n`)
  }

  const regressions = compareToBaseline(counts, parseBaseline(readFileSync(baselineFile, 'utf8')))
  if (regressions.length > 0) {
    process.stdout.write(
      `lint: SHOULD warnings grew past lint-baseline.json:\n${regressions.map(describeRegression).join('\n')}\n`,
    )
  }

  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  process.stdout.write(
    `lint: ${results.length} files, ${errorCount} error(s), ${warningCount} warning(s), ${regressions.length} ratchet regression(s) in ${seconds}s\n`,
  )
  if (errorCount > 0 || regressions.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  process.stderr.write(`lint: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
