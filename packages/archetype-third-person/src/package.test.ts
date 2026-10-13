import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { defined, match } from '../../engine/src/test-support'

// Issue #181 CA-23, CA-28: the package's published shape, at the lockstep version.

it('publishes dual built entries and bundled assets at the lockstep version', () => {
  const read = (path: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'))
  const pkg = read('../package.json')
  // Read, never hardcoded: the lockstep across every manifest is gated by cli/src/package.test.ts.
  const engine = read('../../engine/package.json')
  expect(engine).toMatchObject({ version: match.any(String) })
  const engineVersion: unknown = Reflect.get(defined(engine), 'version')
  expect(pkg).toMatchObject({
    name: '@waica/archetype-third-person',
    version: engineVersion,
    type: 'module',
    files: ['dist', 'assets'],
    exports: { '.': './src/index.ts', './manifest': './src/manifest.ts' },
    publishConfig: {
      exports: {
        '.': { types: './dist/index.d.ts', default: './dist/index.js' },
        './manifest': { types: './dist/manifest.d.ts', default: './dist/manifest.js' },
      },
    },
    dependencies: { '@waica/behaviors': 'workspace:^', '@waica/engine': 'workspace:^' },
  })
})
