import { describe, expect, it } from 'vitest'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const packageRoot = path.resolve(import.meta.dirname, '..')

async function manifest(...segments: string[]): Promise<Record<string, unknown>> {
  const raw = await readFile(path.join(packageRoot, '..', ...segments, 'package.json'), 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

describe('@waica/mcp package contract', () => {
  it('is a workspace-only package that ships inside the waica CLI', async () => {
    const pkg = await manifest('mcp')
    expect(pkg).toMatchObject({
      name: '@waica/mcp',
      private: true,
      type: 'module',
      bin: { 'waica-mcp': 'dist/cli.js' },
      engines: { node: '>=22.18' },
      scripts: {
        build:
          'node ../../scripts/clean-dist.mjs && tsc -p tsconfig.build.json && node bundle-template.mjs',
      },
      dependencies: {
        '@modelcontextprotocol/sdk': expect.stringMatching(/^\^1\./),
        'playwright-core': expect.stringMatching(/^\^1\./),
        '@waica/engine': 'workspace:^',
        '@waica/behaviors': 'workspace:^',
        '@waica/archetype-isometric': 'workspace:^',
        '@waica/archetype-platformer': 'workspace:^',
        '@waica/archetype-topdown': 'workspace:^',
      },
      devDependencies: { '@waica/editor': 'workspace:^' },
    })
    expect(pkg).not.toHaveProperty('exports')
    // @waica/cli is the only published entry point, so this package must
    // never be picked up by `pnpm -r publish`.
    expect(pkg).not.toHaveProperty('publishConfig')
    expect(Object.keys(pkg.dependencies as object).sort()).toEqual([
      '@modelcontextprotocol/sdk',
      '@waica/archetype-isometric',
      '@waica/archetype-platformer',
      '@waica/archetype-topdown',
      '@waica/behaviors',
      '@waica/engine',
      'playwright-core',
    ])
    await access(path.join(packageRoot, 'bundle-template.mjs'))
    await access(path.join(packageRoot, 'src/project-component-runner.ts'))
    await expect(access(path.join(packageRoot, 'src/native-import.cjs'))).rejects.toThrow()
  })

  it('has its runtime dependencies provided by the CLI that bundles it', async () => {
    // The bundled server resolves these from the published CLI's own
    // node_modules, so a bump on either side has to be mirrored.
    const [mcp, cli, engine] = await Promise.all([
      manifest('mcp'),
      manifest('cli'),
      manifest('engine'),
    ])
    const dependencies = (pkg: Record<string, unknown>): Record<string, string> =>
      pkg.dependencies as Record<string, string>

    expect(dependencies(cli)['@modelcontextprotocol/sdk']).toBe(
      dependencies(mcp)['@modelcontextprotocol/sdk'],
    )
    expect(dependencies(cli)['three']).toBe(dependencies(engine)['three'])
    expect(dependencies(cli)['playwright-core']).toBe(dependencies(mcp)['playwright-core'])
    expect(dependencies(mcp)).not.toHaveProperty('playwright')
    expect(dependencies(mcp)).not.toHaveProperty('puppeteer')
  })
})
