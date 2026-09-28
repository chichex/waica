import { describe, expect, it } from 'vitest'
import {
  compareToBaseline,
  countWarnings,
  formatBaseline,
  parseBaseline,
  type LintResultLike,
} from './ratchet.ts'

const root = '/repo'

function result(filePath: string, ruleIds: (string | null)[], severity: 1 | 2 = 1): LintResultLike {
  return { filePath, messages: ruleIds.map((ruleId) => ({ ruleId, severity })) }
}

describe('countWarnings', () => {
  it('counts warnings per repo-relative file and rule, ignoring errors', () => {
    const counts = countWarnings(
      [
        result('/repo/packages/a/src/x.ts', ['complexity', 'complexity', 'max-params']),
        result('/repo/packages/a/src/y.ts', ['complexity'], 2),
        result('/repo/packages/a/src/z.ts', []),
      ],
      root,
    )
    expect(counts).toEqual({
      'packages/a/src/x.ts': { complexity: 2, 'max-params': 1 },
    })
  })

  it('files warnings without a rule id under a stable key', () => {
    expect(countWarnings([result('/repo/a.ts', [null])], root)).toEqual({
      'a.ts': { '(no-rule)': 1 },
    })
  })
})

describe('compareToBaseline', () => {
  const baseline = { 'packages/a/src/x.ts': { complexity: 2 } }

  it('passes when every count is at or below its baseline', () => {
    expect(compareToBaseline({ 'packages/a/src/x.ts': { complexity: 1 } }, baseline)).toEqual([])
    expect(compareToBaseline({ 'packages/a/src/x.ts': { complexity: 2 } }, baseline)).toEqual([])
  })

  it('fails when a file exceeds its baseline for a rule', () => {
    expect(compareToBaseline({ 'packages/a/src/x.ts': { complexity: 3 } }, baseline)).toEqual([
      { file: 'packages/a/src/x.ts', rule: 'complexity', allowed: 2, actual: 3 },
    ])
  })

  it('fails on a warning in a file or rule the baseline does not list', () => {
    expect(
      compareToBaseline(
        {
          'packages/a/src/x.ts': { complexity: 2, 'max-depth': 1 },
          'packages/a/src/new.ts': { complexity: 1 },
        },
        baseline,
      ),
    ).toEqual([
      { file: 'packages/a/src/x.ts', rule: 'max-depth', allowed: 0, actual: 1 },
      { file: 'packages/a/src/new.ts', rule: 'complexity', allowed: 0, actual: 1 },
    ])
  })
})

describe('baseline file', () => {
  it('round-trips with sorted keys', () => {
    const text = formatBaseline({ 'b.ts': { z: 1, a: 2 }, 'a.ts': { complexity: 3 } })
    expect(text).toBe(
      '{\n  "a.ts": {\n    "complexity": 3\n  },\n  "b.ts": {\n    "a": 2,\n    "z": 1\n  }\n}\n',
    )
    expect(parseBaseline(text)).toEqual({ 'a.ts': { complexity: 3 }, 'b.ts': { a: 2, z: 1 } })
  })

  it('rejects counts that are not non-negative integers', () => {
    expect(() => parseBaseline('{"a.ts":{"complexity":-1}}')).toThrow(/non-negative integer/)
    expect(() => parseBaseline('{"a.ts":{"complexity":"2"}}')).toThrow(/non-negative integer/)
    expect(() => parseBaseline('[]')).toThrow(/JSON object/)
    expect(() => parseBaseline('{"a.ts":3}')).toThrow(/must be an object/)
  })
})
