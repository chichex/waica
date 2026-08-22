import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('@waica/archetype-isometric package contract', () => {
  it('publishes dual built entries and bundled assets at the lockstep version', () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    )
    // Read, never hardcoded: a literal here breaks on every release bump, and
    // the lockstep across all eight manifests is gated by cli/src/package.test.ts.
    const engine = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../engine/package.json', import.meta.url)),
        'utf8',
      ),
    )
    expect(pkg).toMatchObject({
      name: '@waica/archetype-isometric',
      version: engine.version,
      type: 'module',
      files: ['dist', 'assets'],
      exports: { '.': './src/index.ts', './manifest': './src/manifest.ts' },
      publishConfig: {
        exports: {
          '.': { types: './dist/index.d.ts', default: './dist/index.js' },
          './manifest': {
            types: './dist/manifest.d.ts',
            default: './dist/manifest.js',
          },
        },
      },
      dependencies: {
        '@waica/behaviors': 'workspace:^',
        '@waica/engine': 'workspace:^',
      },
    })
  })
})
