import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defined, match } from '../../engine/src/test-support'

describe('@waica/archetype-isometric package contract', () => {
  it('publishes dual built entries and bundled assets at the lockstep version', () => {
    const pkg: unknown = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    )
    // Read, never hardcoded: a literal here breaks on every release bump, and
    // the lockstep across all eight manifests is gated by cli/src/package.test.ts.
    const engine: unknown = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../engine/package.json', import.meta.url)),
        'utf8',
      ),
    )
    expect(engine).toMatchObject({ version: match.any(String) })
    const engineVersion: unknown = Reflect.get(defined(engine), 'version')
    expect(pkg).toMatchObject({
      name: '@waica/archetype-isometric',
      version: engineVersion,
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
