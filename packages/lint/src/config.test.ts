import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint, type Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const configFile = fileURLToPath(new URL('../eslint.config.mjs', import.meta.url))
const readmeFile = fileURLToPath(new URL('../README.md', import.meta.url))

const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: configFile })

type Severity = 'off' | 'warn' | 'error'

const SEVERITY_NAMES: readonly Severity[] = ['off', 'warn', 'error']

function severityOf(entry: Linter.RuleEntry | undefined): Severity {
  const raw = Array.isArray(entry) ? entry[0] : entry
  if (raw === undefined) return 'off'
  if (typeof raw === 'number') return SEVERITY_NAMES[raw] ?? 'off'
  return raw
}

function optionsOf(entry: Linter.RuleEntry | undefined): unknown {
  return Array.isArray(entry) ? entry[1] : undefined
}

async function rulesFor(file: string): Promise<Partial<Linter.RulesRecord>> {
  const config: unknown = await eslint.calculateConfigForFile(file)
  if (typeof config !== 'object' || config === null || !('rules' in config)) {
    throw new Error(`no resolved config for ${file}`)
  }
  return (config as { rules: Partial<Linter.RulesRecord> }).rules
}

interface RuleMapRow {
  readonly policy: string
  readonly rule: string
  readonly severity: Severity
  readonly file: string
}

function isSeverity(value: string): value is Severity {
  return value === 'off' || value === 'warn' || value === 'error'
}

// The committed rule map is the independent source of truth: each row pairs
// a policy line with the ESLint rule, severity and representative file.
function readRuleMap(): RuleMapRow[] {
  const rows: RuleMapRow[] = []
  for (const line of readFileSync(readmeFile, 'utf8').split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length < 7 || !/^L\d+/.test(cells[1] ?? '')) continue
    const rule = (cells[3] ?? '').replace(/`/g, '')
    const severity = (cells[4] ?? '').replace(/`/g, '')
    const file = (cells[5] ?? '').replace(/`/g, '')
    if (!isSeverity(severity)) throw new Error(`bad severity in row: ${line}`)
    rows.push({ policy: cells[1] ?? '', rule, severity, file })
  }
  return rows
}

describe('lint rule map (CA-2)', () => {
  const rows = readRuleMap()

  it('lists the policy rules that name a lint gate', () => {
    const rules = new Set(rows.map((row) => row.rule))
    for (const rule of [
      'max-lines-per-function',
      'max-lines',
      'complexity',
      'max-depth',
      'max-params',
      '@typescript-eslint/no-non-null-assertion',
      '@typescript-eslint/no-explicit-any',
      '@typescript-eslint/no-unsafe-assignment',
      '@typescript-eslint/no-unsafe-argument',
      '@typescript-eslint/no-unsafe-call',
      '@typescript-eslint/no-unsafe-member-access',
      '@typescript-eslint/no-unsafe-return',
      '@typescript-eslint/switch-exhaustiveness-check',
      '@typescript-eslint/no-unnecessary-type-parameters',
      '@typescript-eslint/unified-signatures',
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/no-misused-promises',
      '@typescript-eslint/consistent-type-imports',
      '@typescript-eslint/ban-ts-comment',
      'react-hooks/rules-of-hooks',
      'react-hooks/exhaustive-deps',
      'react-hooks/purity',
      'react-hooks/refs',
      'react-hooks/static-components',
      'jsx-a11y/click-events-have-key-events',
      'jsx-a11y/no-static-element-interactions',
      '@eslint-community/eslint-comments/require-description',
    ]) {
      expect(rules, rule).toContain(rule)
    }
  })

  it('maps SHOULD rules to warn', () => {
    const text = readFileSync(readmeFile, 'utf8')
    for (const line of text.split('\n')) {
      const cells = line.split('|').map((cell) => cell.trim())
      if (cells.length < 7 || !/^L\d+/.test(cells[1] ?? '')) continue
      if (cells[2] === 'SHOULD') expect((cells[4] ?? '').replace(/`/g, ''), line).toBe('warn')
    }
  })

  it.each(rows.map((row) => [row.policy, row.rule, row.severity, row.file] as const))(
    '%s %s resolves to %s on %s',
    async (_policy, rule, severity, file) => {
      const rules = await rulesFor(file)
      expect(severityOf(rules[rule])).toBe(severity)
    },
  )
})

describe('size thresholds (CA-3)', () => {
  // The MUST severity of these two rules is checked through the rule map.
  it('limits source to 60 lines per function and 600 per file', async () => {
    const rules = await rulesFor('packages/engine/src/game.ts')
    expect(optionsOf(rules['max-lines-per-function'])).toMatchObject({
      max: 60,
      skipBlankLines: true,
      skipComments: true,
    })
    expect(optionsOf(rules['max-lines'])).toMatchObject({
      max: 600,
      skipBlankLines: true,
      skipComments: true,
    })
  })

  it('warns at 40 lines per function, 300 per file, complexity 10, depth 3 and 3 params', async () => {
    const rules = await rulesFor('packages/editor/src/editor/Editor.tsx')
    expect(severityOf(rules['waica/soft-max-lines-per-function'])).toBe('warn')
    expect(optionsOf(rules['waica/soft-max-lines-per-function'])).toMatchObject({
      max: 40,
      skipBlankLines: true,
      skipComments: true,
    })
    expect(severityOf(rules['waica/soft-max-lines'])).toBe('warn')
    expect(optionsOf(rules['waica/soft-max-lines'])).toMatchObject({
      max: 300,
      skipBlankLines: true,
      skipComments: true,
    })
    expect(rules['complexity']).toEqual([1, { max: 10 }])
    expect(rules['max-depth']).toEqual([1, { max: 3 }])
    expect(rules['max-params']).toEqual([1, { max: 3 }])
  })

  it('keeps size and complexity at warn in tests while type and promise rules keep their severity', async () => {
    const rules = await rulesFor('packages/engine/src/game.test.ts')
    for (const rule of [
      'max-lines-per-function',
      'max-lines',
      'waica/soft-max-lines-per-function',
      'waica/soft-max-lines',
      'complexity',
      'max-depth',
      'max-params',
    ]) {
      expect(severityOf(rules[rule]), rule).toBe('warn')
    }
    const source = await rulesFor('packages/engine/src/game.ts')
    for (const rule of [
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/no-misused-promises',
      '@typescript-eslint/no-unsafe-member-access',
      '@typescript-eslint/no-unsafe-assignment',
      '@typescript-eslint/no-non-null-assertion',
      '@typescript-eslint/no-explicit-any',
    ]) {
      expect(severityOf(rules[rule]), rule).toBe(severityOf(source[rule]))
      expect(severityOf(rules[rule]), rule).not.toBe('off')
    }
  })
})

describe('documented suppressions (CA-5)', () => {
  it('requires a description on every eslint directive', async () => {
    const rules = await rulesFor('packages/editor/src/editor/Viewport.tsx')
    expect(severityOf(rules['@eslint-community/eslint-comments/require-description'])).toBe(
      'error',
    )
  })

  it('reports unused disable directives as errors', async () => {
    const [result] = await eslint.lintText('// eslint-disable-next-line no-console -- demo\nexport const value = 1\n', {
      filePath: 'scripts/unused-directive-probe.mjs',
    })
    const messages = result?.messages ?? []
    expect(messages.some((message) => message.severity === 2 && /Unused eslint-disable/.test(message.message))).toBe(true)
  })

  it('rejects a directive without a reason', async () => {
    const [result] = await eslint.lintText(
      '// eslint-disable-next-line no-console\nconsole.log(1)\n',
      { filePath: 'scripts/undocumented-directive-probe.mjs' },
    )
    const ids = (result?.messages ?? []).map((message) => message.ruleId)
    expect(ids).toContain('@eslint-community/eslint-comments/require-description')
  })
})
