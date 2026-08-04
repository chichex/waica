import { describe, expect, it } from 'vitest'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const packageRoot = path.resolve(import.meta.dirname, '..')

describe('@waica/mcp package contract', () => {
  it('has the exact public pure-bin shape and runtime dependencies', async () => {
    const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(pkg).toMatchObject({
      name: '@waica/mcp',
      version: '0.1.0',
      type: 'module',
      bin: { 'waica-mcp': 'dist/cli.js' },
      files: ['dist'],
      engines: { node: '>=20.19' },
      scripts: { build: 'tsc -p tsconfig.build.json && node bundle-template.mjs' },
      dependencies: {
        '@modelcontextprotocol/sdk': expect.stringMatching(/^\^1\./),
        '@waica/engine': 'workspace:^',
        '@waica/behaviors': 'workspace:^',
        '@waica/archetype-platformer': 'workspace:^',
      },
      devDependencies: { '@waica/editor': 'workspace:^' },
    })
    expect(pkg).not.toHaveProperty('exports')
    expect(Object.keys(pkg.dependencies as object).sort()).toEqual([
      '@modelcontextprotocol/sdk',
      '@waica/archetype-platformer',
      '@waica/behaviors',
      '@waica/engine',
    ])
    await access(path.join(packageRoot, 'bundle-template.mjs'))
  })
})
