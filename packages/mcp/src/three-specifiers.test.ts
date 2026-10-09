import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THREE_SPECIFIERS } from './project-component-fallbacks.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const ENGINE_SRC = path.resolve(here, '../../engine/src')

/** Production sources of the engine: no tests and no test support (`test-*.ts`), which the build excludes. */
function engineSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return engineSources(file)
    const production = /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.startsWith('test-')
    return production ? [file] : []
  })
}

/** Every `three` specifier an engine source imports (static, type-only and dynamic). */
function engineThreeSpecifiers(): Set<string> {
  const found = new Set<string>()
  for (const file of engineSources(ENGINE_SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](three(?:\/[^'"]*)?)['"]/g)) {
      if (match[1]) found.add(match[1])
    }
  }
  return found
}

/**
 * The runner is a standalone forked child that cannot import siblings, so
 * its list is read from its source: the `three` entries of FALLBACK_SPECIFIERS.
 */
function runnerThreeSpecifiers(): Set<string> {
  const source = readFileSync(path.join(here, 'project-component-runner.ts'), 'utf8')
  const block = /const FALLBACK_SPECIFIERS = new Set\(\[([\s\S]*?)\]\)/.exec(source)?.[1] ?? ''
  return new Set([...block.matchAll(/'(three(?:\/[^']*)?)'/g)].flatMap((match) => (match[1] ? [match[1]] : [])))
}

describe('the three specifiers a project component can import', () => {
  it('finds the specifiers the engine imports (the scan sees the engine)', () => {
    expect(engineThreeSpecifiers()).toContain('three/webgpu')
  })

  it('has every specifier the engine imports in the fallback list', () => {
    for (const specifier of engineThreeSpecifiers()) expect(THREE_SPECIFIERS, specifier).toContain(specifier)
  })

  it('has every specifier the engine imports in the runner list', () => {
    const runner = runnerThreeSpecifiers()
    expect(runner.size).toBeGreaterThan(0)
    for (const specifier of engineThreeSpecifiers()) expect(runner, specifier).toContain(specifier)
  })

  it('keeps the fallback list and the runner list equal', () => {
    expect([...runnerThreeSpecifiers()].sort()).toEqual([...THREE_SPECIFIERS].sort())
  })
})
