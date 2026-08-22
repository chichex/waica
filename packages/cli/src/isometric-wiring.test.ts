import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const read = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8')

describe('isometric release and example wiring', () => {
  it('joins the published-library list and packed distribution gate', () => {
    expect(read('scripts/published-manifest.mjs')).toMatch(
      /PUBLISHED_LIBRARIES[\s\S]*['"]archetype-isometric['"]/,
    )
    const dist = read('scripts/test-dist.mjs')
    expect(dist).toContain("name: '@waica/archetype-isometric'")
    expect(dist).toContain("await import('@waica/archetype-isometric/manifest')")
    expect(dist).toContain('waica-iso-hero.png')
  })

  it('exposes a synced isometric example and root dev command', () => {
    const rootPackage = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    expect(rootPackage.scripts['dev:isometric']).toBe(
      'pnpm --filter @waica/example-isometric dev',
    )
    const examplePackage = JSON.parse(read('examples/isometric/package.json')) as {
      name: string
      dependencies: Record<string, string>
    }
    expect(examplePackage).toMatchObject({
      name: '@waica/example-isometric',
      dependencies: { '@waica/archetype-isometric': 'workspace:*' },
    })
    expect(read('examples/isometric/src/main.ts')).toContain(
      "import { ARCHETYPE } from '@waica/archetype-isometric'",
    )
    expect(read('scripts/sync-scene.mjs')).toContain(
      "join(root, 'examples', 'isometric', 'src')",
    )
  })

  it('includes only the new archetype in the requested ESM import audit expansion', () => {
    const audit = read('packages/cli/src/esm-imports.test.ts')
    expect(audit).toContain("'packages/archetype-isometric/src'")
  })
})
