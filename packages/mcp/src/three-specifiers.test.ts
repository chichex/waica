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

/** The one engine module allowed to name Rapier (ADR 0028): its types, and the dynamic import() that loads it. */
const RAPIER_MODULE = path.join(ENGINE_SRC, 'physics-3d/rapier-module.ts')

/** Every engine source that names the Rapier package in a static import, export or side-effect import. */
function staticRapierImports(): string[] {
  return engineSources(ENGINE_SRC).filter((file) => /(?:\bfrom\s+|\bimport\s+)['"]@dimforge\//.test(readFileSync(file, 'utf8')))
}

describe('the Rapier package is loaded by a 3D scene only (issue #159 CA-7)', () => {
  it('is named statically by no engine source but the one loader module', () => {
    expect(staticRapierImports().map((file) => path.relative(ENGINE_SRC, file))).toEqual(['physics-3d/rapier-module.ts'])
  })

  it('is imported dynamically, and only there', () => {
    const importing = engineSources(ENGINE_SRC).filter((file) => /\bimport\s*\(\s*['"]@dimforge\//.test(readFileSync(file, 'utf8')))
    expect(importing).toEqual([RAPIER_MODULE])
  })

  it('needs no entry in the MCP fallback list or the runner list, because no scene is loaded there', () => {
    expect(THREE_SPECIFIERS.filter((specifier) => specifier.startsWith('@dimforge'))).toEqual([])
    expect(readFileSync(path.join(here, 'project-component-runner.ts'), 'utf8')).not.toContain('@dimforge')
  })
})
