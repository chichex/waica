import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('@waica/archetype-isometric package contract', () => {
  it('publishes dual built entries and bundled assets at version 0.7.0', () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    )
    expect(pkg).toMatchObject({
      name: '@waica/archetype-isometric',
      version: '0.7.0',
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
