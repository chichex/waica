import { describe, expect, it } from 'vitest'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const packageRoot = path.resolve(import.meta.dirname, '..')

describe('@chichex/waica package contract', () => {
  it('publishes both the editor and the MCP server from one bin set', async () => {
    const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(pkg).toMatchObject({
      name: '@chichex/waica',
      type: 'module',
      bin: { waica: 'dist/cli.js', 'waica-mcp': 'dist/mcp/cli.js' },
      files: ['dist'],
      // Matches the MCP server's floor: it is the same process.
      engines: { node: '>=20.19' },
      publishConfig: { access: 'public' },
      scripts: {
        build: 'tsc -p tsconfig.build.json && node bundle-editor.mjs && node bundle-mcp.mjs',
      },
      dependencies: {
        '@modelcontextprotocol/sdk': expect.stringMatching(/^\^1\./),
        three: expect.stringMatching(/^\^0\./),
      },
      devDependencies: {
        '@waica/editor': 'workspace:^',
        '@waica/mcp': 'workspace:^',
      },
    })
    expect(pkg).not.toHaveProperty('exports')
    expect(Object.keys(pkg.dependencies as object).sort()).toEqual([
      '@modelcontextprotocol/sdk',
      'three',
    ])
    await access(path.join(packageRoot, 'bundle-mcp.mjs'))
  })

  // One release, one number. The CLI vendors the three libraries and the
  // generated project asks npm for them by version, so a package left behind
  // publishes a CLI whose bundled copies disagree with the registry. The git
  // tag is checked against every one of these in .github/workflows/publish.yml.
  it('keeps every published package on the same version', async () => {
    const packages = ['cli', 'engine', 'behaviors', 'archetype-platformer']
    const versions = await Promise.all(
      packages.map(async (directory) => {
        const manifest = JSON.parse(
          await readFile(path.resolve(packageRoot, '..', directory, 'package.json'), 'utf8'),
        ) as { version: string }
        return [directory, manifest.version] as const
      }),
    )
    const [, release] = versions[0]!
    expect(Object.fromEntries(versions)).toEqual(
      Object.fromEntries(packages.map((directory) => [directory, release])),
    )
    expect(release).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
