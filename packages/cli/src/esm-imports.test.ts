import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const BUILT_PACKAGE_SOURCES = [
  'packages/engine/src',
  'packages/behaviors/src',
  'packages/archetype-platformer/src',
]

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return productionTypeScriptFiles(path)
    if (
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.test.ts') ||
      entry.name.endsWith('.d.ts')
    ) {
      return []
    }
    return [path]
  })
}

describe('published ESM import specifiers', () => {
  it('gives every production relative import an explicit extension', () => {
    const missingExtensions: string[] = []

    for (const directory of BUILT_PACKAGE_SOURCES) {
      for (const file of productionTypeScriptFiles(directory)) {
        const source = readFileSync(file, 'utf8')
        const specifiers = source.matchAll(
          /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.{1,2}\/[^"']+)["']/g,
        )
        for (const match of specifiers) {
          const specifier = match[1] as string
          const path = specifier.split(/[?#]/, 1)[0] as string
          if (!extname(path)) missingExtensions.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(missingExtensions).toEqual([])
  })
})
